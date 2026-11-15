// Shared setup for a case's `assets.mjs`, which draws the raster images a
// case embeds (a scanned page, a slide screenshot) and writes them under
// `cases/<name>/assets/`. The assets are committed; build.mjs only reads
// them, so `node --run playground` never depends on canvas output being
// byte-stable across versions. Re-run a case's assets.mjs only when its
// image content should change.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { NOTO_SANS_JP, NOTO_SANS_JP_BOLD } from './pdf.mjs';

// Registered explicitly so the raster never depends on system fonts.
GlobalFonts.registerFromPath(NOTO_SANS_JP, 'Noto Sans JP');
GlobalFonts.registerFromPath(NOTO_SANS_JP_BOLD, 'Noto Sans JP Bold');

export const SANS = 'Noto Sans JP';
export const SANS_BOLD = 'Noto Sans JP Bold';

export function newCanvas(width, height) {
  const canvas = createCanvas(width, height);
  return { canvas, ctx: canvas.getContext('2d') };
}

/** Deterministic PRNG (mulberry32), for noise that must not change between runs. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Encode and write `canvas` to `<case>/assets/<name>`; the format follows the extension. */
export async function writeAsset(assetsScriptUrl, name, canvas, { quality = 70 } = {}) {
  const dir = join(dirname(fileURLToPath(assetsScriptUrl)), 'assets');
  mkdirSync(dir, { recursive: true });
  const bytes = name.endsWith('.jpg') ? await canvas.encode('jpeg', quality) : await canvas.encode('png');
  writeFileSync(join(dir, name), bytes);
  console.log(`wrote ${name} (${bytes.byteLength} bytes)`);
}
