import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import PDFDocument from 'pdfkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPdfJsDocumentOptions } from '../../src/core/processor/pdfJsSetup.js';
import { renderPage, renderPageToBuffer } from '../../src/core/renderer/index.js';
import type { RenderRegion } from '../../src/types/index.js';

// A real (tiny) PNG buffer — the cache-hit path now decodes the file to
// recompute `renderContentRatio` from the cached pixels, so the fixture
// must be a valid PNG rather than a stub header.
const TINY_PNG: Buffer = (() => {
  const canvas = createCanvas(1, 1);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, 1, 1);
  return canvas.toBuffer('image/png');
})();

// Stand in for a real PDFDocumentProxy: renderPage only reaches the doc
// object on the cache-miss path, so for the cache-hit / symlink defence
// tests it never gets called.
const NEVER_CALLED_DOC = new Proxy(
  {},
  {
    get() {
      throw new Error('PDFDocumentProxy should not be touched on the cache-hit / defence path');
    },
  },
);

async function buildPdfWithEdgeInk(region: RenderRegion): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: [612, 792], margin: 0 });
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolveDone) => doc.on('end', resolveDone));

  doc.rect(0, 0, 612, 792).fill('white');
  doc.rect(region.x + region.width - 18.35, region.y + region.height - 22.46, 18.35, 22.46).fill('black');
  doc.end();

  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

async function buildPdfWithFractionalPageInk(): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: [360.5, 202.25], margin: 0 });
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolveDone) => doc.on('end', resolveDone));

  doc.rect(0, 0, 360.5, 202.25).fill('white');
  doc.rect(118, 88, 70, 18).fill('black');
  doc.end();

  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

describe('renderer.isReusableImage (via renderPage cache-hit path)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pdfvision-renderer-test-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reuses a regular non-empty PNG without touching the document', async () => {
    const path = join(dir, 'page-1.png');
    writeFileSync(path, TINY_PNG);
    // biome-ignore lint/suspicious/noExplicitAny: NEVER_CALLED_DOC stands in for PDFDocumentProxy
    const out = await renderPage(NEVER_CALLED_DOC as any, 1, dir);
    expect(out).toBe(path);
  });

  // symlink perms differ on Windows — skip there so the runner reports it as
  // skipped rather than misleadingly green.
  it.skipIf(process.platform === 'win32')('refuses to reuse a symlink at the rendered-image path', async () => {
    const target = join(dir, 'real.png');
    writeFileSync(target, 'data');
    const link = join(dir, 'page-1.png');
    symlinkSync(target, link);
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: same as above
      renderPage(NEVER_CALLED_DOC as any, 1, dir),
    ).rejects.toThrow(/symlink/);
  });

  it('skips an empty file (treated as crashed-mid-write) and would re-render', async () => {
    const path = join(dir, 'page-1.png');
    writeFileSync(path, '');
    // Cache-miss path is taken because size === 0; doc proxy throws to prove that.
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: same as above
      renderPage(NEVER_CALLED_DOC as any, 1, dir),
    ).rejects.toThrow(/should not be touched/);
  });

  it('skips a non-regular file (e.g. directory at the path) and would re-render', async () => {
    // A directory shaped like a file name is unusual but possible; isReusableImage
    // must return false rather than handing the directory back as a "PNG".
    mkdirSync(join(dir, 'page-1.png'));
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: same as above
      renderPage(NEVER_CALLED_DOC as any, 1, dir),
    ).rejects.toThrow(/should not be touched/);
  });
});

describe('renderer renderedContentBox', () => {
  it('reports content boxes for fractional full-page viewports', async () => {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = getDocument(
      buildPdfJsDocumentOptions({
        pdfData: await buildPdfWithFractionalPageInk(),
        filePath: 'memory://fractional-page-ink.pdf',
      }),
    );
    const doc = await loadingTask.promise;

    try {
      const rendered = await renderPageToBuffer(doc, 1, 1);
      const box = rendered.renderedContentBox;

      expect(box).toBeDefined();
      if (!box) return;
      expect(box.width).toBeGreaterThan(60);
      expect(box.height).toBeGreaterThan(10);
      expect(box.x).toBeGreaterThanOrEqual(118);
      expect(box.x + box.width).toBeLessThanOrEqual(188.5);
      expect(box.y).toBeGreaterThanOrEqual(88);
      expect(box.y + box.height).toBeLessThanOrEqual(106.5);
    } finally {
      await loadingTask.destroy();
    }
  });

  it('clamps content boxes to the requested fractional crop region', async () => {
    const region = { x: 28.3, y: 123.25, width: 477.35, height: 98.46 };
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = getDocument(
      buildPdfJsDocumentOptions({
        pdfData: await buildPdfWithEdgeInk(region),
        filePath: 'memory://fractional-edge-ink.pdf',
      }),
    );
    const doc = await loadingTask.promise;

    try {
      const rendered = await renderPageToBuffer(doc, 1, 2, region);
      const box = rendered.renderedContentBox;

      expect(box).toBeDefined();
      if (!box) return;
      expect(box.x).toBeGreaterThanOrEqual(region.x);
      expect(box.y).toBeGreaterThanOrEqual(region.y);
      expect(box.x + box.width).toBeLessThanOrEqual(region.x + region.width + 0.001);
      expect(box.y + box.height).toBeLessThanOrEqual(region.y + region.height + 0.001);
    } finally {
      await loadingTask.destroy();
    }
  });
});
