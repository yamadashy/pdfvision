import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RenderRegion } from '../../types/index.js';
import { pngFilename } from '../renderer/pngFilename.js';

/**
 * Resolve the flat on-disk PNG paths for an explicit `--render-output`
 * directory, disambiguating filename collisions.
 *
 * Flat output writes `<dir>/page-N.png` with no per-PDF hash subdir, so a
 * name can already be taken by an earlier render of a *different* PDF into
 * the same dir. When that happens we don't overwrite it — we bump a
 * numeric suffix (`page-1.png` → `page-1-2.png` → `page-1-3.png`) and emit
 * a one-line note so the user knows a rename happened. A `reserved` set
 * keeps the pages of a single run from colliding with each other's picks.
 *
 * @param onNote optional sink for the per-rename note (wired to stderr by
 *   the CLI). Not called when no collision occurs.
 */
export function resolveFlatRenderPaths(
  dir: string,
  pageNumbers: number[],
  region: RenderRegion | undefined,
  onNote?: (message: string) => void,
): string[] {
  const reserved = new Set<string>();
  return pageNumbers.map((pageNum) => {
    const base = pngFilename(pageNum, region);
    const taken = (name: string) => reserved.has(name) || existsSync(join(dir, name));
    let chosen = base;
    if (taken(chosen)) {
      const dot = base.lastIndexOf('.');
      const stem = base.slice(0, dot);
      const ext = base.slice(dot);
      let n = 2;
      do {
        chosen = `${stem}-${n}${ext}`;
        n += 1;
      } while (taken(chosen));
      onNote?.(`--render-output: wrote ${chosen} instead of ${base} (a file named ${base} already exists in ${dir})`);
    }
    reserved.add(chosen);
    return join(dir, chosen);
  });
}
