import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { OcrWord, PageOcr } from '../types/index.js';
import { ensurePrivateDir, getCacheRoot } from './cache.js';
import { type RenderRegion, renderPageToBuffer, type ViewportCrop, viewportCropForRegion } from './renderer.js';

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
const DEFAULT_RENDER_SCALE = 2;

interface OcrWordTransform {
  scale: number;
  region?: RenderRegion;
  crop?: ViewportCrop;
  pageView?: readonly number[];
  viewport?: PageViewportLike;
}

interface PageViewportLike {
  convertToPdfPoint(x: number, y: number): number[];
}

interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RawOcrBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface RawOcrWord {
  text?: unknown;
  confidence?: unknown;
  bbox?: RawOcrBbox;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function normaliseConfidence(value: unknown): number {
  const raw = typeof value === 'number' ? value : 0;
  return round3(Math.max(0, Math.min(1, raw / 100)));
}

function isUsableRawBbox(bbox: RawOcrBbox | undefined): bbox is RawOcrBbox {
  return (
    bbox !== undefined &&
    Number.isFinite(bbox.x0) &&
    Number.isFinite(bbox.y0) &&
    Number.isFinite(bbox.x1) &&
    Number.isFinite(bbox.y1) &&
    bbox.x1 > bbox.x0 &&
    bbox.y1 > bbox.y0
  );
}

function isUsablePageView(value: readonly number[] | undefined): value is readonly [number, number, number, number] {
  return Array.isArray(value) && value.length >= 4 && value.slice(0, 4).every((item) => Number.isFinite(item));
}

function isUsablePdfPoint(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

function arrayProperty(value: unknown, key: string): unknown[] {
  if (typeof value !== 'object' || value === null) return [];
  const property = (value as Record<string, unknown>)[key];
  return Array.isArray(property) ? property : [];
}

function collectRawWords(page: { blocks?: unknown }): RawOcrWord[] {
  const out: RawOcrWord[] = [];
  const blocks = arrayProperty(page, 'blocks');
  for (const block of blocks) {
    const paragraphs = arrayProperty(block, 'paragraphs');
    for (const paragraph of paragraphs) {
      const lines = arrayProperty(paragraph, 'lines');
      for (const line of lines) {
        const words = arrayProperty(line, 'words');
        for (const word of words) out.push(word as RawOcrWord);
      }
    }
  }
  return out;
}

function ocrBboxToPageBox(bbox: RawOcrBbox, transform: OcrWordTransform): PageBox | undefined {
  const scale = transform.scale > 0 ? transform.scale : DEFAULT_RENDER_SCALE;
  const pageView = isUsablePageView(transform.pageView) ? transform.pageView : undefined;
  const viewport = transform.viewport;
  if (!viewport || !pageView) {
    const offsetX = transform.region?.x ?? 0;
    const offsetY = transform.region?.y ?? 0;
    return {
      x: round2(offsetX + bbox.x0 / scale),
      y: round2(offsetY + bbox.y0 / scale),
      width: round2((bbox.x1 - bbox.x0) / scale),
      height: round2((bbox.y1 - bbox.y0) / scale),
    };
  }

  const cropX = transform.crop?.x ?? 0;
  const cropY = transform.crop?.y ?? 0;
  const viewMinX = Math.min(pageView[0], pageView[2]);
  const viewMaxY = Math.max(pageView[1], pageView[3]);
  const corners = [
    [bbox.x0, bbox.y0],
    [bbox.x1, bbox.y0],
    [bbox.x0, bbox.y1],
    [bbox.x1, bbox.y1],
  ];
  const points = corners.map(([x, y]) => {
    const pdfPoint = viewport.convertToPdfPoint(cropX + x, cropY + y);
    if (!isUsablePdfPoint(pdfPoint)) return undefined;
    const [pdfX, pdfY] = pdfPoint;
    return {
      x: pdfX - viewMinX,
      y: viewMaxY - pdfY,
    };
  });
  if (points.some((point) => point === undefined)) return undefined;
  const usablePoints = points as { x: number; y: number }[];
  const minX = Math.min(...usablePoints.map((point) => point.x));
  const maxX = Math.max(...usablePoints.map((point) => point.x));
  const minY = Math.min(...usablePoints.map((point) => point.y));
  const maxY = Math.max(...usablePoints.map((point) => point.y));
  return {
    x: round2(minX),
    y: round2(minY),
    width: round2(maxX - minX),
    height: round2(maxY - minY),
  };
}

function transformOcrWords(page: { blocks?: unknown }, transform: OcrWordTransform): OcrWord[] {
  const words: OcrWord[] = [];
  for (const raw of collectRawWords(page)) {
    const text = typeof raw.text === 'string' ? raw.text.trim() : '';
    if (text.length === 0 || !isUsableRawBbox(raw.bbox)) continue;
    const box = ocrBboxToPageBox(raw.bbox, transform);
    if (!box) continue;
    words.push({
      text,
      confidence: normaliseConfidence(raw.confidence),
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    });
  }
  return words;
}

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
      const ocrScale = scale ?? DEFAULT_RENDER_SCALE;
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
