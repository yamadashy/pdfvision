import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RenderRegion } from '../../types/index.js';
import { pngFilename } from '../renderer/pngFilename.js';

/**
 * Pick the first free filename, bumping a numeric suffix past collisions:
 * `page-1.png` → `page-1-2.png` → `page-1-3.png`. Defensive on names
 * without an extension (suffix goes at the end). Exported for tests.
 */
export function nextAvailableName(base: string, taken: (name: string) => boolean): string {
  if (!taken(base)) return base;
  const dot = base.lastIndexOf('.');
  const stem = dot === -1 ? base : base.slice(0, dot);
  const ext = dot === -1 ? '' : base.slice(dot);
  let n = 2;
  let chosen: string;
  do {
    chosen = `${stem}-${n}${ext}`;
    n += 1;
  } while (taken(chosen));
  return chosen;
}

/**
 * Create a resolver that hands out collision-free flat PNG paths inside an
 * explicit `--render-output` directory.
 *
 * Flat output writes `<dir>/page-N.png` (or the coordinate-suffixed region
 * name) with no per-PDF hash subdir, so a name can already be taken by an
 * earlier render of a *different* PDF into the same dir. When that happens
 * we don't overwrite it — we bump a numeric suffix and emit a one-line
 * note so the user knows a rename happened. The resolver's internal
 * `reserved` set keeps the picks of a single pass (page renders or
 * visual-region crops) from colliding with each other.
 *
 * @param onNote optional sink for the per-rename note (wired to stderr by
 *   the CLI). Not called when no collision occurs.
 */
export function createFlatRenderPathResolver(
  dir: string,
  onNote?: (message: string) => void,
): (pageNum: number, region: RenderRegion | undefined) => string {
  const reserved = new Set<string>();
  return (pageNum, region) => {
    const base = pngFilename(pageNum, region);
    const chosen = nextAvailableName(base, (name) => reserved.has(name) || existsSync(join(dir, name)));
    if (chosen !== base) {
      onNote?.(`--render-output: wrote ${chosen} instead of ${base} (a file named ${base} already exists in ${dir})`);
    }
    reserved.add(chosen);
    return join(dir, chosen);
  };
}

/**
 * Resolve the flat on-disk PNG paths for a full-page render batch into an
 * explicit `--render-output` directory. See
 * {@link createFlatRenderPathResolver} for the collision semantics.
 */
export function resolveFlatRenderPaths(
  dir: string,
  pageNumbers: number[],
  region: RenderRegion | undefined,
  onNote?: (message: string) => void,
): string[] {
  const resolvePath = createFlatRenderPathResolver(dir, onNote);
  return pageNumbers.map((pageNum) => resolvePath(pageNum, region));
}
