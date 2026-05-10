import { existsSync, lstatSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { atomicWrite } from './cache.js';
import { runParallel } from './parallel.js';

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
 * Render a single page to a PNG buffer in memory. Used by `renderPage`
 * (which then atomic-writes the buffer to disk) and by the OCR pipeline,
 * which needs the raster bytes but no filesystem side effect.
 */
export async function renderPageToBuffer(
  doc: PDFDocumentProxy,
  pageNum: number,
  scale = DEFAULT_SCALE,
): Promise<Buffer> {
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext('2d');

  await page.render({
    // @ts-expect-error -- pdfjs-dist expects CanvasRenderingContext2D but @napi-rs/canvas is compatible
    canvasContext: context,
    viewport,
  }).promise;

  return canvas.toBuffer('image/png');
}

export async function renderPage(
  doc: PDFDocumentProxy,
  pageNum: number,
  outputDir: string,
  scale = DEFAULT_SCALE,
): Promise<string> {
  const outputPath = join(outputDir, `page-${pageNum}.png`);
  if (isReusableImage(outputPath)) return outputPath;

  const buffer = await renderPageToBuffer(doc, pageNum, scale);
  atomicWrite(outputPath, buffer);
  return outputPath;
}

export async function renderPages(
  doc: PDFDocumentProxy,
  pageNumbers: number[],
  outputDir: string,
  scale?: number,
): Promise<string[]> {
  // Parallelise rasterisation — each page builds its own canvas, so
  // the only shared state is `doc` (pdfjs concurrency-safe) and the
  // output dir (atomic-rename in `atomicWrite` handles the writeback).
  // Output order matches `pageNumbers` so callers can index by pos.
  return runParallel(pageNumbers, (pageNum) => renderPage(doc, pageNum, outputDir, scale));
}
