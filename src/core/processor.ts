import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { formatJson } from '../output/json.js';
import { formatMarkdown } from '../output/markdown.js';
import { formatText } from '../output/text.js';
import type { DocumentResult, PageResult, ProcessDocumentOptions, ProcessOptions } from '../types/index.js';
import { dropCached, ensurePrivateDir, getCacheDir, getCached, setCache } from './cache.js';
import { parsePageRange } from './pageRange.js';

/** Inputs that determine which cached entry a request maps to. */
interface CacheKeyInput {
  pages?: string;
  render?: boolean;
  renderOutput?: string;
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
    // Bump when the on-disk DocumentResult shape changes so older entries
    // (missing newly-added page fields) are not handed out as fresh results.
    format: 'structured-v3',
    render: !!input.render,
    // Including the resolved render-output dir keeps two invocations with
    // different `--render-output` targets from sharing image paths.
    renderOutput: input.renderOutput ? resolve(input.renderOutput) : null,
  });
  const hash = createHash('sha256').update(payload).digest('hex').slice(0, 16);
  return `result_${hash}.json`;
}

interface PageData {
  text: string;
  charCount: number;
  imageCount: number;
  textCoverage: number;
}

/**
 * Extract a page's text plus rough density metadata.
 *
 * `imageCount` and `textCoverage` let agents detect "looks fine but the
 * real content is rasterised" pages (common in Google Slides exports)
 * and decide whether to re-run with `--render`.
 */
async function extractPageData(doc: PDFDocumentProxy, pageNum: number, imageOps: Set<number>): Promise<PageData> {
  const page = await doc.getPage(pageNum);
  const content = await page.getTextContent();

  const parts: string[] = [];
  let textArea = 0;
  for (const item of content.items) {
    if (!('str' in item)) continue;
    parts.push(item.str);
    if (item.hasEOL) parts.push('\n');
    const w = typeof item.width === 'number' ? item.width : 0;
    // pdfjs reports item.height as 0 for many PDFs (e.g. those produced by
    // certain Office exporters); fall back to the vertical scale from the
    // text matrix, which is effectively the glyph height in user units.
    const reportedH = typeof item.height === 'number' ? item.height : 0;
    const h = reportedH > 0 ? reportedH : Math.abs(item.transform?.[3] ?? 0);
    textArea += Math.abs(w * h);
  }
  const text = parts.join('').trimEnd();

  const opList = await page.getOperatorList();
  let imageCount = 0;
  for (const fn of opList.fnArray) {
    if (imageOps.has(fn)) imageCount++;
  }

  const view = page.view;
  // MediaBox is normally [minX, minY, maxX, maxY] but the spec allows the
  // pairs in either order; use abs so a flipped box still yields a sensible
  // area instead of falling through to 0 coverage.
  const pageArea = Math.abs((view[2] - view[0]) * (view[3] - view[1]));
  const rawCoverage = pageArea > 0 ? textArea / pageArea : 0;
  const textCoverage = Math.max(0, Math.min(1, rawCoverage));

  return {
    text,
    charCount: text.length,
    imageCount,
    textCoverage: Math.round(textCoverage * 1000) / 1000,
  };
}

/** Render a structured DocumentResult into the caller-requested string format. */
function render(result: DocumentResult, format: ProcessOptions['format']): string {
  if (format === 'json') return formatJson(result);
  if (format === 'markdown') return formatMarkdown(result);
  return formatText(result);
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
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // Opcodes that draw raster images. paintImageXObject covers ordinary
  // embedded images; the mask/inline variants catch the cases pdf.js
  // splits out for transparency or inline streams. The Repeat/Group
  // variants are emitted when pdf.js collapses several draws of the
  // same image into one optimised op — without them, slides that tile
  // a hero image (very common in Google Slides exports) read as
  // imageCount = 0.
  const imageOps = new Set<number>([
    OPS.paintImageXObject,
    OPS.paintImageXObjectRepeat,
    OPS.paintImageMaskXObject,
    OPS.paintImageMaskXObjectGroup,
    OPS.paintImageMaskXObjectRepeat,
    OPS.paintInlineImageXObject,
    OPS.paintInlineImageXObjectGroup,
  ]);
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
      if (options.renderOutput) {
        // User-supplied path: don't enforce 0o700 here — the caller owns
        // their output directory and may need it readable for downstream
        // consumers. We do create it if missing.
        imagesDir = resolve(options.renderOutput);
        mkdirSync(imagesDir, { recursive: true });
      } else if (cacheDir) {
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
      const data = await extractPageData(doc, pageNumbers[i], imageOps);
      pages.push({
        page: pageNumbers[i],
        text: data.text,
        image: imagePaths?.[i],
        charCount: data.charCount,
        imageCount: data.imageCount,
        textCoverage: data.textCoverage,
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
    renderOutput: options.renderOutput,
  });
  return render(result, options.format);
}
