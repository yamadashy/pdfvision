import type { DocumentResult } from '../../types/index.js';
import { getCached, setCache } from '../io/cache.js';
import { areUsableAttachments, areUsableVisualRegionImages, dropCachedSafe, isUsableImage } from './cacheValidation.js';

interface ReadCachedResultOptions {
  cacheDir: string | null;
  cacheKey: string;
  filePath: string;
  render: boolean;
  renderVisualRegions: boolean;
  attachmentOutputDir?: string;
}

export function readCachedResult({
  cacheDir,
  cacheKey,
  filePath,
  render,
  renderVisualRegions,
  attachmentOutputDir,
}: ReadCachedResultOptions): DocumentResult | null {
  if (!cacheDir) return null;
  const cached = getCached(cacheDir, cacheKey);
  if (!cached) return null;

  try {
    const result = JSON.parse(cached) as DocumentResult;
    // For --render, ensure each referenced PNG is a regular non-empty
    // file (not a symlink, not a partial write left from a crash).
    const imagesUsable =
      (!render || result.pages.every((p) => isUsableImage(p.image))) &&
      (!renderVisualRegions || areUsableVisualRegionImages(result));
    // For --attachment-output, ensure each referenced file is still
    // present and matches the embedded-file byte length before returning
    // a cached path instead of re-saving the attachment bytes.
    const attachmentsUsable = areUsableAttachments(result.attachments, attachmentOutputDir);
    if (imagesUsable && attachmentsUsable) {
      // The cached payload is keyed by content hash, so the same bytes
      // at a different path would otherwise return the original `file`
      // value. Patch in the current invocation's path before returning.
      result.file = filePath;
      return result;
    }
    dropCachedSafe(cacheDir, cacheKey);
  } catch {
    // Cache file is corrupted (e.g. partial write, format change between
    // versions). Drop it and fall through to a fresh extraction.
    dropCachedSafe(cacheDir, cacheKey);
  }
  return null;
}

export function writeCachedResult(cacheDir: string | null, cacheKey: string, result: DocumentResult): void {
  if (!cacheDir) return;
  setCache(cacheDir, cacheKey, JSON.stringify(result));
}
