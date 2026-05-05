import { createHash } from 'node:crypto';
import { lstatSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { formatJson } from '../output/json.js';
import { formatText } from '../output/text.js';
import type { DocumentResult, PageResult, ProcessOptions } from '../types/index.js';
import { dropCached, ensurePrivateDir, getCacheDir, getCached, setCache } from './cache.js';
import { parsePageRange } from './pageRange.js';

function buildCacheKey(options: ProcessOptions): string {
  // hashed so user-controlled `pages` cannot be used to traverse outside the cache dir
  const payload = JSON.stringify({
    pages: options.pages ?? 'all',
    format: 'structured',
    render: !!options.render,
  });
  const hash = createHash('sha256').update(payload).digest('hex').slice(0, 16);
  return `result_${hash}.json`;
}

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

function render(result: DocumentResult, format: ProcessOptions['format']): string {
  return format === 'json' ? formatJson(result) : formatText(result);
}

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

export async function processFile(filePath: string, options: ProcessOptions): Promise<string> {
  const cacheDir = options.noCache ? null : getCacheDir(filePath);

  const cacheKey = buildCacheKey(options);
  if (cacheDir) {
    const cached = getCached(cacheDir, cacheKey);
    if (cached) {
      try {
        // The cached payload is keyed by content hash, so the same bytes at a
        // different path would otherwise return the original `file` value.
        // Patch in the current invocation's path before formatting.
        const result = JSON.parse(cached) as DocumentResult;
        // For --render, ensure each referenced PNG is a regular non-empty
        // file (not a symlink, not a partial write left from a crash).
        // If anything looks wrong, drop the entry and re-render rather
        // than handing the caller stale or attacker-controlled paths.
        const imagesUsable = !options.render || result.pages.every((p) => isUsableImage(p.image));
        if (imagesUsable) {
          result.file = filePath;
          return render(result, options.format);
        }
        dropCached(cacheDir, cacheKey);
      } catch {
        // Cache file is corrupted (e.g. partial write, format change between
        // versions). Drop it and fall through to a fresh extraction.
        dropCached(cacheDir, cacheKey);
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

    return render(result, options.format);
  } finally {
    await doc.destroy();
  }
}
