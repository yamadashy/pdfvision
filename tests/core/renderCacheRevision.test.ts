import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareRenderImagesDir, RENDER_CACHE_REVISION } from '../../src/core/processor/renderOptions.js';

describe('render cache revision', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it.each([undefined, 1])('never hands back a PNG cached before the revision (renderScale %s)', (renderScale) => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'pdfvision-render-rev-'));
    dirs.push(cacheDir);
    // A PNG left by an install from before rotated pages rendered in the
    // displayed frame, under the same filename a new render would use.
    const legacyDir = renderScale === undefined ? join(cacheDir, 'images') : join(cacheDir, 'images', 's1');
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(join(legacyDir, 'page-1_x0_y0_w100_h100.png'), 'stale');

    const imagesDir = prepareRenderImagesDir({ cacheDir, renderScale });

    expect(imagesDir.startsWith(join(cacheDir, `images-r${RENDER_CACHE_REVISION}`))).toBe(true);
    expect(existsSync(join(imagesDir, 'page-1_x0_y0_w100_h100.png'))).toBe(false);
    expect(readdirSync(imagesDir)).toEqual([]);
  });
});
