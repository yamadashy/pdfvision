import { createHash } from 'node:crypto';
import { lstatSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { formatJson } from '../output/json.js';
import { formatText } from '../output/text.js';
import type { DocumentResult, PageResult, ProcessDocumentOptions, ProcessOptions } from '../types/index.js';
import { dropCached, ensurePrivateDir, getCacheDir, getCached, setCache } from './cache.js';
import { parsePageRange } from './pageRange.js';

/** Inputs that determine which cached entry a request maps to. */
interface CacheKeyInput {
  pages?: string;
  render?: boolean;
}

/**
 * Build a deterministic, hashed cache key for the given options.
 *
 * The hash hides the raw `pages` string so user-controlled input cannot
 * traverse outside the cache directory when the key is used as a file
 * name. Format is intentionally a constant ("structured") so text-only
 * vs json-only callers reuse the same cached payload.
 */
function buildCacheKey(input: CacheKeyInput): string {
  const payload = JSON.stringify({
    pages: input.pages ?? 'all',
    format: 'structured',
    render: !!input.render,
  });
  const hash = createHash('sha256').update(payload).digest('hex').slice(0, 16);
  return `result_${hash}.json`;
}

/**
 * Extract the text of a single page, joining glyph runs and inserting
 * line breaks where pdfjs reports an end-of-line marker.
 */
async function extractText(doc: PDFDocumentProxy, pageNum: number): Promise<string> {
  const page = await doc.getPage(pageNum);
  const content = await page.getTextContent();
  const parts: string[] = [];
  for (const item of content.items) {
    if (!('str' in item)) continue;
    parts.push(item.str);
    if (item.hasEOL) parts.push('\n');
  }
  return parts.join('').trimEnd();
}

/** Render a structured DocumentResult into the caller-requested string format. */
function render(result: DocumentResult, format: ProcessOptions['format']): string {
  return format === 'json' ? formatJson(result) : formatText(result);
}

/**
 * Check whether a cached image path still points at a regular,
 * non-empty file. Symlinks, missing files, and zero-byte placeholders
 * (e.g. crashed mid-write) are treated as unusable so the caller can
 * decide to re-render instead of handing out stale paths.
 */
function isUsableImage(path: string | undefined): boolean {
  if (!path) return false;
  try {
    const lstat = lstatSync(path);
    if (lstat.isSymbolicLink() || !lstat.isFile()) return false;
    return statSync(path).size > 0;
  } catch {
    return false;
  }
}

/**
 * Drop a cache entry without ever throwing. Cache eviction failures
 * (permissions, race with another process, etc.) must not abort the
 * surrounding extraction — we can always re-extract from source.
 */
function dropCachedSafe(cacheDir: string, cacheKey: string): void {
  try {
    dropCached(cacheDir, cacheKey);
  } catch {
    // Best-effort: leave the entry in place and fall through to fresh extraction.
  }
}

/**
 * Extract a structured representation of a PDF.
 *
 * Returns a `DocumentResult` so library callers can consume metadata /
 * pages / image paths directly with full type information, without
 * formatting + re-parsing through JSON.
 *
 * For the formatted (string) variant used by the CLI, see {@link processFile}.
 */
export async function processDocument(filePath: string, options: ProcessDocumentOptions = {}): Promise<DocumentResult> {
  const cacheDir = options.noCache ? null : getCacheDir(filePath);

  const cacheKey = buildCacheKey(options);
  if (cacheDir) {
    const cached = getCached(cacheDir, cacheKey);
    if (cached) {
      try {
        const result = JSON.parse(cached) as DocumentResult;
        // For --render, ensure each referenced PNG is a regular non-empty
        // file (not a symlink, not a partial write left from a crash).
        const imagesUsable = !options.render || result.pages.every((p) => isUsableImage(p.image));
        if (imagesUsable) {
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
    }
  }

  // pdfjs-dist is multiple MB and dominates startup time; only pull it in
  // once we've confirmed there's no cache hit and we actually need to parse.
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument(filePath).promise;
  try {
    const totalPages = doc.numPages;
    const pageNumbers = options.pages
      ? parsePageRange(options.pages, totalPages)
      : Array.from({ length: totalPages }, (_, i) => i + 1);

    const metadata = await doc.getMetadata();
    const info = metadata.info as Record<string, unknown> | null;

    let imagePaths: string[] | null = null;
    if (options.render) {
      let imagesDir: string;
      if (cacheDir) {
        imagesDir = join(cacheDir, 'images');
        ensurePrivateDir(imagesDir);
      } else {
        // mkdtemp creates with 0o700 by default and never reuses an existing
        // path, so it sidesteps the symlink/ownership concerns for the
        // no-cache fallback.
        imagesDir = mkdtempSync(join(tmpdir(), 'pdfvision-render-'));
      }
      // renderer pulls in @napi-rs/canvas (native binding); only load it
      // when --render is requested.
      const { renderPages } = await import('./renderer.js');
      imagePaths = await renderPages(doc, pageNumbers, imagesDir);
    }

    const pages: PageResult[] = [];
    for (let i = 0; i < pageNumbers.length; i++) {
      const text = await extractText(doc, pageNumbers[i]);
      pages.push({
        page: pageNumbers[i],
        text,
        image: imagePaths?.[i],
      });
    }

    const result: DocumentResult = {
      file: filePath,
      totalPages,
      metadata: {
        title: (info?.Title as string) ?? null,
        author: (info?.Author as string) ?? null,
        subject: (info?.Subject as string) ?? null,
        creator: (info?.Creator as string) ?? null,
      },
      pages,
    };

    if (cacheDir) {
      setCache(cacheDir, cacheKey, JSON.stringify(result));
    }

    return result;
  } finally {
    await doc.destroy();
  }
}

/**
 * Format-applied variant of {@link processDocument}. Used by the CLI.
 *
 * Returns the formatted string ("text" or "json"). Library callers
 * usually want `processDocument()` instead.
 */
export async function processFile(filePath: string, options: ProcessOptions): Promise<string> {
  const result = await processDocument(filePath, {
    pages: options.pages,
    render: options.render,
    noCache: options.noCache,
  });
  return render(result, options.format);
}
