import { existsSync, lstatSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { atomicWrite } from './cache.js';
import { runParallel } from './parallel.js';

const DEFAULT_SCALE = 2;

/**
 * RGB threshold above which a pixel counts as "near-white" (canvas
 * background or pure paper). Picked at 250 rather than 255 so faint
 * anti-aliasing on otherwise-blank pages doesn't flip the bucket.
 */
const NEAR_WHITE_THRESHOLD = 250;
/**
 * Alpha threshold below which a pixel counts as transparent. Some PDFs
 * render with translucent overlays whose alpha is very small but nonzero;
 * < 16 is a safe "effectively invisible" cutoff.
 */
const ALPHA_THRESHOLD = 16;

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
 * Fraction of pixels in `rgba` that look like real content — alpha at
 * least {@link ALPHA_THRESHOLD} AND at least one of R/G/B below
 * {@link NEAR_WHITE_THRESHOLD}. Returns 0..1 rounded to 6dp; values
 * close to zero are the signal we care about, so coarser rounding would
 * lose discrimination between "0.0001 blank" and "0.005 sparse marks".
 *
 * 0.001 has been a useful "effectively blank" cutoff against JPEG2000
 * scans (renders to pure white) and CMap-less PDFs (renders to pure
 * white because no glyphs can be drawn). Threshold guidance lives in
 * the skill doc rather than this signal — pdfvision exposes the ratio
 * and the agent decides what to do.
 */
export function computeContentRatio(rgba: Uint8ClampedArray): number {
  const total = rgba.length / 4;
  if (total === 0) return 0;
  let content = 0;
  // Hot inner loop — keep destructured-pixel access pattern but avoid
  // creating throwaway objects so a 5M-pixel page stays under ~20ms.
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a < ALPHA_THRESHOLD) continue;
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    if (r < NEAR_WHITE_THRESHOLD || g < NEAR_WHITE_THRESHOLD || b < NEAR_WHITE_THRESHOLD) {
      content++;
    }
  }
  return Math.round((content / total) * 1_000_000) / 1_000_000;
}

/**
 * Internal raster primitive. Returns the encoded PNG buffer AND the
 * content-ratio computed from the pre-encode RGBA pixels — measuring
 * after PNG encode would require decoding back, which is wasteful.
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
): Promise<{ buffer: Buffer; contentRatio: number }> {
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext('2d');

  await page.render({
    // @ts-expect-error -- pdfjs-dist expects CanvasRenderingContext2D but @napi-rs/canvas is compatible
    canvasContext: context,
    viewport,
  }).promise;

  // Read the RGBA buffer BEFORE PNG encode — the post-encode round trip
  // would otherwise re-decode the PNG just to count pixels.
  const imageData = context.getImageData(0, 0, viewport.width, viewport.height);
  const contentRatio = computeContentRatio(imageData.data);
  const buffer = canvas.toBuffer('image/png');
  return { buffer, contentRatio };
}

/**
 * Render a page to disk and (when actually rasterising) report the
 * content ratio computed from the freshly-drawn canvas. Cached PNGs are
 * reused without re-rasterising — in that case `contentRatio` is
 * `undefined`, because reading pixels back from the cached PNG would
 * defeat the cache's speed benefit AND the higher-level JSON result
 * cache already stores the ratio from the original run.
 *
 * The simpler {@link renderPage} wrapper exists for callers that don't
 * need the ratio (preserves the legacy `Promise<string>` signature).
 */
export async function renderPageWithStats(
  doc: PDFDocumentProxy,
  pageNum: number,
  outputDir: string,
  scale = DEFAULT_SCALE,
): Promise<{ path: string; contentRatio?: number }> {
  const outputPath = join(outputDir, `page-${pageNum}.png`);
  if (isReusableImage(outputPath)) {
    return { path: outputPath };
  }
  const { buffer, contentRatio } = await renderPageToBuffer(doc, pageNum, scale);
  atomicWrite(outputPath, buffer);
  return { path: outputPath, contentRatio };
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
): Promise<{ path: string; contentRatio?: number }[]> {
  return runParallel(pageNumbers, (pageNum) => renderPageWithStats(doc, pageNum, outputDir, scale));
}

export async function renderPages(
  doc: PDFDocumentProxy,
  pageNumbers: number[],
  outputDir: string,
  scale?: number,
): Promise<string[]> {
  const results = await renderPagesWithStats(doc, pageNumbers, outputDir, scale);
  return results.map((r) => r.path);
}
