import { existsSync, lstatSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { RenderedContentBox, RenderRegion } from '../../types/index.js';
import { atomicWrite } from '../io/atomicWrite.js';
import { runParallel } from '../runtime/parallel.js';
import { contentBoxFromViewportPixels } from './contentBox.js';
import { computeContentStats, type RenderStats } from './contentStats.js';
import { type ViewportCrop, viewportCropForRegion } from './crop.js';

export { computeContentRatio } from './contentStats.js';
export { viewportCropForRegion } from './crop.js';
// Re-export so render-domain callers can import the render types from the
// same entrypoint. The canonical declaration lives in `src/types/index.ts`.
export type { RenderRegion, ViewportCrop };

const DEFAULT_SCALE = 2;

function isReusableImage(path: string): boolean {
  if (!existsSync(path)) return false;
  // lstat-then-stat would catch a symlink even if the target is a regular
  // file; for cached PNG reuse we want neither symlinks nor odd file types.
  const lstat = lstatSync(path);
  if (lstat.isSymbolicLink()) {
    throw new Error(`Refusing to reuse rendered image at ${path}: path is a symlink`);
  }
  if (!lstat.isFile()) return false;
  // A zero-byte cached PNG indicates a previous run that crashed mid-write
  // (pre atomic-rename), so treat it as missing and re-render.
  return statSync(path).size > 0;
}

/**
 * Internal raster primitive. Returns the encoded PNG buffer AND the
 * content-ratio computed from the pre-encode RGBA pixels — measuring
 * after PNG encode would require decoding back, which is wasteful.
 *
 * When `region` is set, pdfvision converts its MediaBox top-left bbox
 * through pdf.js's viewport first. That keeps callers on the same
 * coordinate system as `imageBoxes` / `layout.blocks`, while crop pixels
 * still follow the human-visible page rotation. The pdf.js render call
 * then gets a translation transform that shifts the requested viewport
 * rectangle so its top-left corner lands at canvas (0, 0). pdf.js still
 * walks the full operator list — the
 * speedup comes from skipping pixel work outside the canvas, not from
 * skipping draw calls. For region-extraction workloads (agent zooming
 * into a flagged block) that's the right trade.
 *
 * Shared by `renderPageWithStats` (writes the buffer to disk) and the
 * OCR pipeline (feeds the buffer to tesseract.js without filesystem
 * side effect). Both need the same stats, so co-locating the
 * canvas-RGBA scan with the PNG encode keeps the raster work paid for
 * exactly once per page.
 */
export async function renderPageToBuffer(
  doc: PDFDocumentProxy,
  pageNum: number,
  scale = DEFAULT_SCALE,
  region?: RenderRegion,
): Promise<{ buffer: Buffer; contentRatio: number; renderedContentBox?: RenderedContentBox }> {
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const crop = region ? viewportCropForRegion(page, viewport, region) : undefined;

  // With a region, the canvas captures only the sub-rectangle; without
  // it, we render the full viewport. `Math.round` matches the rounding
  // pdf.js uses on the full viewport so cropped + full pixel grids
  // align at integer pt × integer scale. `Math.max(1, ...)` keeps
  // sub-pixel regions (e.g. 0.4pt × scale 1 → 0.4px) from collapsing
  // the canvas to a 0-dim allocation that @napi-rs/canvas refuses with
  // an opaque error.
  const canvasW = crop ? Math.max(1, Math.round(crop.width)) : viewport.width;
  const canvasH = crop ? Math.max(1, Math.round(crop.height)) : viewport.height;
  const canvas = createCanvas(canvasW, canvasH);
  const context = canvas.getContext('2d');

  await page.render({
    // @ts-expect-error -- pdfjs-dist expects CanvasRenderingContext2D but @napi-rs/canvas is compatible
    canvasContext: context,
    viewport,
    // Translation matrix applied *after* the viewport transform — shifts
    // pixel output so the requested crop lands at canvas (0, 0). When
    // `region` is undefined, omit the option so pdf.js takes the identity
    // path it always has.
    ...(crop ? { transform: [1, 0, 0, 1, -crop.x, -crop.y] } : {}),
  }).promise;

  // Read the RGBA buffer BEFORE PNG encode — the post-encode round trip
  // would otherwise re-decode the PNG just to count pixels.
  const imageData = context.getImageData(0, 0, canvasW, canvasH);
  const stats = computeContentStats(imageData.data, canvasW, canvasH);
  const buffer = canvas.toBuffer('image/png');
  return {
    buffer,
    contentRatio: stats.contentRatio,
    ...(stats.contentBoxPx && {
      renderedContentBox: contentBoxFromViewportPixels(page, viewport, crop, stats.contentBoxPx, region),
    }),
  };
}

/**
 * Decode a previously-rendered PNG and run the same content-ratio scan
 * the rasteriser does. Used on the PNG-cache-hit path so the higher
 * level JSON result still gets a populated `renderContentRatio` after
 * an invalidation that wiped the result cache but left the PNG dir
 * intact (e.g. a cache-key bump like v10 → v11). Costs one PNG decode
 * per page, which is much cheaper than re-rastering through pdf.js.
 */
async function computeContentStatsFromPng(path: string): Promise<RenderStats> {
  const img = await loadImage(path);
  const canvas = createCanvas(img.width, img.height);
  const context = canvas.getContext('2d');
  context.drawImage(img, 0, 0);
  const rgba = context.getImageData(0, 0, img.width, img.height).data;
  return computeContentStats(rgba, img.width, img.height);
}

/**
 * Build the on-disk filename for a rendered page. Region-bearing renders
 * encode the bbox in the filename so multiple regions per page can
 * coexist on disk: `page-3_x50_y100_w400_h300.png`. Without a region the
 * legacy `page-N.png` shape is preserved so existing consumers don't
 * have to learn a new pattern. Numbers are normalised through `String`
 * which drops trailing zeros (`50.5` stays `50.5`, `50.0` becomes `50`).
 */
function pngFilename(pageNum: number, region: RenderRegion | undefined): string {
  if (!region) return `page-${pageNum}.png`;
  return `page-${pageNum}_x${region.x}_y${region.y}_w${region.width}_h${region.height}.png`;
}

/**
 * Render a page to disk and report the content ratio. On a PNG cache
 * hit we decode the cached PNG instead of re-rastering through pdf.js,
 * so the ratio is still populated after a result-cache invalidation
 * that left the on-disk PNGs intact. The decode is ~10× cheaper than
 * the pdf.js raster path so the cache speedup is preserved.
 *
 * The simpler {@link renderPage} wrapper exists for callers that don't
 * need the ratio (preserves the legacy `Promise<string>` signature).
 */
export async function renderPageWithStats(
  doc: PDFDocumentProxy,
  pageNum: number,
  outputDir: string,
  scale = DEFAULT_SCALE,
  region?: RenderRegion,
): Promise<{ path: string; contentRatio: number; renderedContentBox?: RenderedContentBox }> {
  const outputPath = join(outputDir, pngFilename(pageNum, region));
  if (isReusableImage(outputPath)) {
    try {
      const stats = await computeContentStatsFromPng(outputPath);
      if (!stats.contentBoxPx) return { path: outputPath, contentRatio: stats.contentRatio };
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const crop = region ? viewportCropForRegion(page, viewport, region) : undefined;
      return {
        path: outputPath,
        contentRatio: stats.contentRatio,
        renderedContentBox: contentBoxFromViewportPixels(page, viewport, crop, stats.contentBoxPx, region),
      };
    } catch {
      // Corrupt or partially-written cached PNG (e.g. disk error mid-write
      // that still produced a non-zero file). Fall through to a fresh
      // raster instead of failing the whole extraction over an unusable
      // cache entry; atomicWrite below replaces the bad file.
    }
  }
  const { buffer, contentRatio, renderedContentBox } = await renderPageToBuffer(doc, pageNum, scale, region);
  atomicWrite(outputPath, buffer);
  return { path: outputPath, contentRatio, ...(renderedContentBox && { renderedContentBox }) };
}

/**
 * Backward-compatible wrapper that drops the stats — preserved so the
 * public `Promise<string>` return type doesn't churn on every caller.
 */
export async function renderPage(
  doc: PDFDocumentProxy,
  pageNum: number,
  outputDir: string,
  scale = DEFAULT_SCALE,
): Promise<string> {
  const { path } = await renderPageWithStats(doc, pageNum, outputDir, scale);
  return path;
}

export async function renderPagesWithStats(
  doc: PDFDocumentProxy,
  pageNumbers: number[],
  outputDir: string,
  scale?: number,
  region?: RenderRegion,
): Promise<{ path: string; contentRatio: number; renderedContentBox?: RenderedContentBox }[]> {
  return runParallel(pageNumbers, (pageNum) => renderPageWithStats(doc, pageNum, outputDir, scale, region));
}

export async function renderPages(
  doc: PDFDocumentProxy,
  pageNumbers: number[],
  outputDir: string,
  scale?: number,
  region?: RenderRegion,
): Promise<string[]> {
  const results = await renderPagesWithStats(doc, pageNumbers, outputDir, scale, region);
  return results.map((r) => r.path);
}
