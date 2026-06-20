import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { OcrWord, PageOcr } from '../types/index.js';
import { ensurePrivateDir, getCacheRoot } from './cache.js';
import {
  DEFAULT_OCR_RENDER_SCALE,
  normaliseConfidence,
  type OcrWordTransform,
  transformOcrWords,
} from './ocr/words.js';
import { ensureQuietTesseractWorker } from './ocr/worker.js';
import { type RenderRegion, renderPageToBuffer, viewportCropForRegion } from './renderer.js';

export { buildQuietTesseractWorkerScript } from './ocr/worker.js';

/**
 * One OCR worker, reusable across many pages. Created once per
 * `processDocument` call so the heavy traineddata load (~15-20MB per
 * language) doesn't repeat per page. Caller is responsible for
 * `terminate()` in a `finally` so the worker is released even if a
 * page throws.
 */
export interface OcrSession {
  recognize(png: Buffer, transform: OcrWordTransform): Promise<{ text: string; confidence: number; words?: OcrWord[] }>;
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
  const cacheRoot = getCacheRoot();
  ensurePrivateDir(cacheRoot);
  const ocrDataDir = join(cacheRoot, 'ocr-data');
  ensurePrivateDir(ocrDataDir);
  const workerPath = await ensureQuietTesseractWorker(cacheRoot);

  const worker = await tesseract.createWorker(langs, undefined, {
    workerPath,
    cachePath: ocrDataDir,
    cacheMethod: 'readWrite',
    // Tesseract's default logger writes a status line per progress tick;
    // silence it so it doesn't pollute stdout/stderr in the CLI.
    logger: () => {},
  });

  return {
    async recognize(png: Buffer, transform: OcrWordTransform) {
      const { data } = await worker.recognize(png, {}, { text: true, blocks: true });
      // tesseract reports confidence as 0..100; normalise to 0..1 so it
      // matches the existing `textCoverage` convention. Round to 3dp.
      const words = transformOcrWords(data ?? {}, transform);
      return {
        text: typeof data?.text === 'string' ? data.text.trim() : '',
        confidence: normaliseConfidence(data?.confidence),
        ...(words.length > 0 && { words }),
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
 *
 * Also attaches `renderContentRatio` on each page from the same raster
 * the OCR ingested. This lets the agent distinguish "OCR ran on a real
 * page and found nothing" from "OCR ran on a blank raster" — the latter
 * is a render-pipeline failure (e.g. pdf.js can't decode the page's JPX
 * image stream), not an OCR failure. Doesn't overwrite a pre-existing
 * `renderContentRatio` set by the `--render` pipeline.
 */
export async function attachOcr(
  doc: PDFDocumentProxy,
  pageNumbers: number[],
  pages: { ocr?: PageOcr; renderContentRatio?: number }[],
  lang: string,
  imagePaths?: (string | undefined)[],
  scale?: number,
  region?: RenderRegion,
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
      // When `--render` already wrote a PNG for this page, read it back
      // instead of re-rasterising through pdf.js. pdf.js rasterisation
      // dominates the per-page cost (full glyph + image decode), while
      // reading + decoding a cached PNG is comparatively cheap — so
      // `--render --ocr` together no longer pays the raster cost twice.
      // contentRatio is already set on the page from the render pass in
      // that case, so we skip recomputing it.
      const cachedImage = imagePaths?.[i];
      let png: Buffer;
      let contentRatio: number | undefined;
      const page = await doc.getPage(pageNumbers[i]);
      const ocrScale = scale ?? DEFAULT_OCR_RENDER_SCALE;
      const viewport = page.getViewport({ scale: ocrScale });
      const transform: OcrWordTransform = {
        scale: ocrScale,
        ...(region && { region, crop: viewportCropForRegion(page, viewport, region) }),
        pageView: page.view,
        viewport,
      };
      if (cachedImage) {
        png = await readFile(cachedImage);
      } else {
        const rasterised = await renderPageToBuffer(doc, pageNumbers[i], scale, region);
        png = rasterised.buffer;
        contentRatio = rasterised.contentRatio;
      }
      const result = await session.recognize(png, transform);
      pages[i].ocr = {
        text: result.text,
        confidence: result.confidence,
        lang: normalisedLang,
        ...(result.words !== undefined && { words: result.words }),
      };
      // `--render` may have already populated this from its own raster;
      // don't clobber that. When both flags are on the values match
      // anyway (same scale, same pdfjs raster), but skipping the
      // assignment keeps cache invalidation simpler.
      if (pages[i].renderContentRatio === undefined && contentRatio !== undefined) {
        pages[i].renderContentRatio = contentRatio;
      }
    }
  } finally {
    await session.terminate();
  }
}
