import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderPage } from '../../src/core/renderer.js';

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
