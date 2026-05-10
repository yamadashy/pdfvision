import { join } from 'node:path';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PageOcr } from '../types/index.js';
import { ensurePrivateDir, getCacheRoot } from './cache.js';
import { renderPageToBuffer } from './renderer.js';

/**
 * One OCR worker, reusable across many pages. Created once per
 * `processDocument` call so the heavy traineddata load (~15-20MB per
 * language) doesn't repeat per page. Caller is responsible for
 * `terminate()` in a `finally` so the worker is released even if a
 * page throws.
 */
export interface OcrSession {
  recognize(png: Buffer): Promise<{ text: string; confidence: number }>;
  terminate(): Promise<void>;
}

/** Lower bound of "this looks like a usable lang code" — letters only, 1+ chars. */
const LANG_TOKEN = /^[A-Za-z_]+$/;

/**
 * Parse a tesseract-style language string ("eng" / "eng+jpn" / "jpn+chi_sim")
 * into the array tesseract.js expects. Rejects empty / malformed input
 * up front so the caller gets a clear error before the worker boots.
 */
export function parseOcrLang(lang: string): string[] {
  const tokens = lang
    .split('+')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) {
    throw new Error(`Invalid --ocr-lang "${lang}": expected one or more language codes (e.g. "eng", "eng+jpn")`);
  }
  for (const token of tokens) {
    if (!LANG_TOKEN.test(token)) {
      throw new Error(`Invalid --ocr-lang token "${token}": expected letters/underscore only`);
    }
  }
  return tokens;
}

/**
 * Boot a tesseract.js worker for the requested languages. tesseract.js
 * is an `optionalDependencies` install — when it isn't present we throw
 * with an actionable message instead of crashing inside the import.
 *
 * The traineddata cache is parked under our own cache root so a
 * `pdfvision --clear-cache` wipes OCR state in the same step as
 * extraction state, and so the data lands under `0700` perms instead
 * of an arbitrary cwd.
 */
export async function createOcrSession(lang: string): Promise<OcrSession> {
  const langs = parseOcrLang(lang);

  // biome-ignore lint/suspicious/noExplicitAny: tesseract.js is an optional dep, types only available when installed
  let tesseract: any;
  try {
    tesseract = await import('tesseract.js');
  } catch (error) {
    // Only ERR_MODULE_NOT_FOUND means the package is genuinely missing.
    // Anything else (broken native binding, syntax error in a transitive
    // dep, ...) should surface the real cause instead of being mis-
    // attributed to an install miss — otherwise the user wastes time
    // re-running `npm install tesseract.js` against a different problem.
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') {
      throw new Error(
        '--ocr requires the optional dependency "tesseract.js" (not installed). Install it with: npm install tesseract.js',
      );
    }
    throw error;
  }

  // Harden the cache root before touching ocr-data so a planted
  // `<tmp>/pdfvision -> /elsewhere` symlink can't redirect traineddata
  // writes outside the cache hierarchy. Mirrors the posture getCacheDir
  // already enforces for result caches.
  ensurePrivateDir(getCacheRoot());
  const ocrDataDir = join(getCacheRoot(), 'ocr-data');
  ensurePrivateDir(ocrDataDir);

  const worker = await tesseract.createWorker(langs, undefined, {
    cachePath: ocrDataDir,
    cacheMethod: 'readWrite',
    // Tesseract's default logger writes a status line per progress tick;
    // silence it so it doesn't pollute stdout/stderr in the CLI.
    logger: () => {},
  });

  return {
    async recognize(png: Buffer) {
      const { data } = await worker.recognize(png);
      // tesseract reports confidence as 0..100; normalise to 0..1 so it
      // matches the existing `textCoverage` convention. Round to 3dp.
      const conf = typeof data?.confidence === 'number' ? data.confidence / 100 : 0;
      return {
        text: typeof data?.text === 'string' ? data.text.trim() : '',
        confidence: Math.round(Math.max(0, Math.min(1, conf)) * 1000) / 1000,
      };
    },
    async terminate() {
      await worker.terminate();
    },
  };
}

/**
 * Run OCR over the requested pages, mutating the matching entries in
 * `pages` to attach the resulting `ocr` field. We don't touch
 * `pages[].text` — the pdfjs-derived text stays as the primary signal so
 * an agent can compare native text vs OCR for scanned/flattened pages.
 */
export async function attachOcr(
  doc: PDFDocumentProxy,
  pageNumbers: number[],
  pages: { ocr?: PageOcr }[],
  lang: string,
): Promise<void> {
  // Canonicalise whitespace / stray separators so ` eng + jpn ` and
  // `eng+jpn` end up with the same echoed `ocr.lang`. Order is preserved
  // — tesseract treats the first language as primary, so `eng+jpn` and
  // `jpn+eng` are intentionally different recognisers and must not share
  // a normalised key.
  const normalisedLang = parseOcrLang(lang).join('+');
  const session = await createOcrSession(lang);
  try {
    for (let i = 0; i < pageNumbers.length; i++) {
      const png = await renderPageToBuffer(doc, pageNumbers[i]);
      const result = await session.recognize(png);
      pages[i].ocr = { text: result.text, confidence: result.confidence, lang: normalisedLang };
    }
  } finally {
    await session.terminate();
  }
}
