import { existsSync, lstatSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { atomicWrite } from './cache.js';
import { runParallel } from './parallel.js';

const DEFAULT_SCALE = 2;

/**
 * Alpha threshold below which a pixel counts as transparent. Some PDFs
 * render with translucent overlays whose alpha is very small but nonzero;
 * < 16 is a safe "effectively invisible" cutoff.
 */
const ALPHA_THRESHOLD = 16;
/**
 * Luminance histogram bucket size used by {@link computeContentRatio}.
 * 256 luminance levels / 16 = 16 buckets. Coarse enough that JPEG noise
 * around a uniform background falls into the same bucket; fine enough
 * that real text against that background lands in a different one.
 */
const LUM_BUCKET_SIZE = 16;
/**
 * How far a pixel's luminance must sit from the dominant-background
 * bucket to count as content. Two full buckets apart keeps anti-aliasing
 * fringes (which sit one bucket off) out of the count without losing
 * real ink (which is many buckets darker / lighter).
 */
const CONTENT_LUM_DELTA = LUM_BUCKET_SIZE * 2;

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
 * Fraction of pixels in `rgba` that look like real content. Returns
 * 0..1 rounded to 6dp; values close to zero are the signal we care
 * about, so coarser rounding would lose discrimination between
 * "0.0001 blank" and "0.005 sparse marks".
 *
 * "Content" is defined relative to the page's own dominant luminance
 * (the *background*) rather than a fixed near-white threshold. White
 * paper, beige scans and dark book covers all converge on the same
 * "near-zero = blank" semantic — without this, an Internet-Archive
 * scan of a dark cover (dominant luminance ~50) reads as
 * `renderContentRatio = 1` even though there is no ink on the page.
 *
 * Algorithm: build a coarse luminance histogram (16 buckets), call the
 * heaviest bucket the background, count the non-transparent pixels
 * whose luminance differs from the background bucket by at least
 * {@link CONTENT_LUM_DELTA}. Luminance uses the perceptual ITU-R
 * BT.601 weights (R*.299 + G*.587 + B*.114) so coloured backgrounds
 * are weighted the way agents see them.
 *
 * 0.001 is still a useful "effectively blank" cutoff. Threshold
 * guidance lives in the skill doc; pdfvision exposes the ratio and
 * the agent decides what to do.
 */
export function computeContentRatio(rgba: Uint8ClampedArray): number {
  const totalPx = rgba.length / 4;
  if (totalPx === 0) return 0;

  // Pass 1: luminance histogram of non-transparent pixels.
  const bucketCount = Math.ceil(256 / LUM_BUCKET_SIZE);
  const hist = new Uint32Array(bucketCount);
  let opaque = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < ALPHA_THRESHOLD) continue;
    // BT.601 luma; integer math keeps the hot loop branch-free.
    const lum = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
    hist[Math.min(bucketCount - 1, lum / LUM_BUCKET_SIZE) | 0]++;
    opaque++;
  }
  if (opaque === 0) return 0;

  // Pick the heaviest bucket as background.
  let bgBucket = 0;
  let bgCount = hist[0];
  for (let b = 1; b < bucketCount; b++) {
    if (hist[b] > bgCount) {
      bgCount = hist[b];
      bgBucket = b;
    }
  }
  const bgLum = bgBucket * LUM_BUCKET_SIZE + LUM_BUCKET_SIZE / 2;

  // Pass 2: count pixels whose luminance is at least
  // CONTENT_LUM_DELTA away from background. Operating on totalPx (not
  // opaque) keeps blank transparent canvases at 0 instead of NaN.
  let content = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < ALPHA_THRESHOLD) continue;
    const lum = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
    if (Math.abs(lum - bgLum) >= CONTENT_LUM_DELTA) content++;
  }
  return Math.round((content / totalPx) * 1_000_000) / 1_000_000;
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
 * Decode a previously-rendered PNG and run the same content-ratio scan
 * the rasteriser does. Used on the PNG-cache-hit path so the higher
 * level JSON result still gets a populated `renderContentRatio` after
 * an invalidation that wiped the result cache but left the PNG dir
 * intact (e.g. a cache-key bump like v10 → v11). Costs one PNG decode
 * per page, which is much cheaper than re-rastering through pdf.js.
 */
async function computeContentRatioFromPng(path: string): Promise<number> {
  const img = await loadImage(path);
  const canvas = createCanvas(img.width, img.height);
  const context = canvas.getContext('2d');
  context.drawImage(img, 0, 0);
  const rgba = context.getImageData(0, 0, img.width, img.height).data;
  return computeContentRatio(rgba);
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
): Promise<{ path: string; contentRatio: number }> {
  const outputPath = join(outputDir, `page-${pageNum}.png`);
  if (isReusableImage(outputPath)) {
    try {
      const contentRatio = await computeContentRatioFromPng(outputPath);
      return { path: outputPath, contentRatio };
    } catch {
      // Corrupt or partially-written cached PNG (e.g. disk error mid-write
      // that still produced a non-zero file). Fall through to a fresh
      // raster instead of failing the whole extraction over an unusable
      // cache entry; atomicWrite below replaces the bad file.
    }
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
): Promise<{ path: string; contentRatio: number }[]> {
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
