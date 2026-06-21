import { lstatSync, statSync } from 'node:fs';
import { isAbsolute as pathIsAbsolute, relative, resolve, sep } from 'node:path';
import type { DocumentAttachment, DocumentResult } from '../../types/index.js';
import { dropCached } from '../io/cache.js';

/**
 * Check whether a cached image path still points at a regular,
 * non-empty file. Symlinks, missing files, and zero-byte placeholders
 * (e.g. crashed mid-write) are treated as unusable so the caller can
 * decide to re-render instead of handing out stale paths.
 */
export function isUsableImage(path: string | undefined): boolean {
  if (!path) return false;
  try {
    const lstat = lstatSync(path);
    if (lstat.isSymbolicLink() || !lstat.isFile()) return false;
    return statSync(path).size > 0;
  } catch {
    return false;
  }
}

export function areUsableVisualRegionImages(result: DocumentResult): boolean {
  return result.pages.every((page) => (page.visualRegions ?? []).every((region) => isUsableImage(region.image)));
}

export function areUsableAttachments(
  attachments: DocumentAttachment[] | undefined,
  outputDir: string | undefined,
): boolean {
  if (!outputDir) return true;
  if (!attachments) return false;
  return attachments.every((attachment) => isUsableAttachment(attachment, outputDir));
}

function isUsableAttachment(attachment: DocumentAttachment, outputDir: string): boolean {
  if (!attachment.path) return false;
  const resolvedPath = resolve(attachment.path);
  if (!isPathInsideDir(resolvedPath, outputDir)) return false;
  try {
    const lstat = lstatSync(resolvedPath);
    if (lstat.isSymbolicLink() || !lstat.isFile()) return false;
    return statSync(resolvedPath).size === attachment.size;
  } catch {
    return false;
  }
}

function isPathInsideDir(path: string, dir: string): boolean {
  const rel = relative(resolve(dir), resolve(path));
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !pathIsAbsolute(rel);
}

/**
 * Drop a cache entry without ever throwing. Cache eviction failures
 * (permissions, race with another process, etc.) must not abort the
 * surrounding extraction — we can always re-extract from source.
 */
export function dropCachedSafe(cacheDir: string, cacheKey: string): void {
  try {
    dropCached(cacheDir, cacheKey);
  } catch {
    // Best-effort: leave the entry in place and fall through to fresh extraction.
  }
}
