import { lstatSync, mkdirSync, mkdtempSync, realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename as pathBasename, dirname as pathDirname, resolve } from 'node:path';
import type { RenderRegion } from '../../types/index.js';
import { ensurePrivateDir } from '../cache.js';

/** Default rasterisation multiplier — must match renderer.ts DEFAULT_SCALE. */
export const DEFAULT_RENDER_SCALE = 2;
/** Hard cap: 4× a letter page is 2448×3168px, ~7.7Mpx. Higher invites OOM. */
const MAX_RENDER_SCALE = 4;

/**
 * Validate and canonicalise a user-supplied `renderScale`. Rejects
 * non-finite values, ≤ 0 scales, and scales above {@link MAX_RENDER_SCALE},
 * then rounds to 2dp so the same value flows through cache keys, render
 * calls, and path composition. Without the rounding step `1.23` and
 * `1.234` would hash to different cache slots but collapse onto the
 * same `s1.23` PNG subdir, and the renderer would hand back the first
 * call's bytes for the second.
 */
export function validateRenderScale(scale: number | undefined): number | undefined {
  if (scale === undefined) return undefined;
  // Gate against the upper bound on the raw value — otherwise `4.004`
  // would round to `4` and slip past the cap, contradicting both the
  // JSDoc contract and the CLI's pre-round rejection.
  if (!Number.isFinite(scale) || scale > MAX_RENDER_SCALE) {
    throw new Error(`Invalid renderScale ${scale}: expected a finite number in (0, ${MAX_RENDER_SCALE}]`);
  }
  const rounded = Math.round(scale * 100) / 100;
  // Gate against the lower bound on the rounded value — `0.004` would
  // otherwise pass `> 0`, round to `0`, and ship `scale: 0` to the
  // renderer. Both gates together pin the rounded result to (0, MAX].
  if (rounded <= 0) {
    throw new Error(`Invalid renderScale ${scale}: expected a finite number in (0, ${MAX_RENDER_SCALE}]`);
  }
  return rounded;
}

/**
 * Format the scale for use as a filesystem path component. Assumes the
 * input is already rounded to 2dp via {@link validateRenderScale};
 * `Number.toString()` then drops trailing zeros so `2` → `s2` and
 * `1.5` → `s1.5`.
 */
function scaleDirSuffix(scale: number): string {
  return `s${scale.toString()}`;
}

interface RenderImagesDirInput {
  renderOutput?: string;
  cacheDir: string | null;
  fingerprint: string | null;
  renderScale?: number;
}

function assertSafeRenderDir(dir: string): void {
  const stat = lstatSync(dir);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to render into ${dir}: path is a symlink`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Refusing to render into ${dir}: path exists but is not a directory`);
  }
}

function assertRenderAncestorDir(dir: string): void {
  if (!statSync(dir).isDirectory()) {
    throw new Error(`Refusing to render into ${dir}: path exists but is not a directory`);
  }
}

function ensureSafeRenderRoot(dir: string): void {
  const resolved = resolve(dir);
  const missing: string[] = [];
  let current = resolved;

  while (true) {
    try {
      if (current === resolved) assertSafeRenderDir(current);
      else assertRenderAncestorDir(current);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      missing.push(current);
      const parent = pathDirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }

  let createUnder = realpathSync(current);
  for (const missingDir of missing.reverse()) {
    createUnder = join(createUnder, pathBasename(missingDir));
    mkdirSync(createUnder);
    assertSafeRenderDir(createUnder);
  }

  try {
    assertSafeRenderDir(resolved);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && missing.length > 0) {
      throw new Error(`Refusing to render into ${resolved}: path could not be created`);
    }
    throw error;
  }
}

function ensureSafeRenderChildDir(dir: string): void {
  try {
    assertSafeRenderDir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    mkdirSync(dir);
    assertSafeRenderDir(dir);
  }
}

export function prepareRenderImagesDir(input: RenderImagesDirInput): string {
  const effectiveScale = input.renderScale ?? DEFAULT_RENDER_SCALE;
  const scaleSubdir = effectiveScale === DEFAULT_RENDER_SCALE ? null : scaleDirSuffix(effectiveScale);
  if (input.renderOutput) {
    if (!input.fingerprint) {
      throw new Error('renderOutput requires a PDF fingerprint');
    }
    const outputRoot = resolve(input.renderOutput);
    ensureSafeRenderRoot(outputRoot);
    const fingerprintDir = join(outputRoot, input.fingerprint);
    ensureSafeRenderChildDir(fingerprintDir);
    if (!scaleSubdir) return fingerprintDir;

    const scaledDir = join(fingerprintDir, scaleSubdir);
    ensureSafeRenderChildDir(scaledDir);
    return scaledDir;
  }

  if (input.cacheDir) {
    const baseImagesDir = join(input.cacheDir, 'images');
    ensurePrivateDir(baseImagesDir);
    if (!scaleSubdir) return baseImagesDir;

    const scaledDir = join(baseImagesDir, scaleSubdir);
    ensurePrivateDir(scaledDir);
    return scaledDir;
  }

  return mkdtempSync(join(tmpdir(), 'pdfvision-render-'));
}

/**
 * Validate and canonicalise the user-supplied `renderRegion`. Surface
 * shape errors (non-finite, negative, zero-area) before any page is
 * loaded so a typo in a script fails fast rather than burning the
 * extraction budget on an unusable region.
 *
 * Page-bounds and single-page checks happen later — they need the page
 * list and viewport, which aren't available at this point.
 */
export function validateRenderRegion(region: RenderRegion | undefined): RenderRegion | undefined {
  if (region === undefined) return undefined;
  const { x, y, width, height } = region;
  for (const [name, value] of [
    ['x', x],
    ['y', y],
    ['width', width],
    ['height', height],
  ] as const) {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid renderRegion.${name} ${value}: expected a finite number`);
    }
  }
  if (x < 0 || y < 0) {
    throw new Error(`Invalid renderRegion: x and y must be >= 0 (got x=${x}, y=${y})`);
  }
  // Canonicalise to 2dp BEFORE the positive-size gate so a raw value
  // like 0.004 (which would otherwise pass `> 0`, round to 0, and ship
  // `width: 0` to the filename / echo while the renderer silently
  // clamped the canvas to 1px) is rejected up front. Matches the
  // round-then-validate posture used by validateRenderScale.
  const rounded = { x: round2(x), y: round2(y), width: round2(width), height: round2(height) };
  if (rounded.width <= 0 || rounded.height <= 0) {
    throw new Error(`Invalid renderRegion: width and height must be > 0 (got width=${width}, height=${height})`);
  }
  return rounded;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
