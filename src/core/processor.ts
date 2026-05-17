import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname as pathDirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { formatJson } from '../output/json.js';
import { formatMarkdown } from '../output/markdown.js';
import { formatXml } from '../output/xml.js';
import type {
  DocumentResult,
  ImageBox,
  PageLayout,
  PageQuality,
  PageResult,
  ProcessDocumentOptions,
  ProcessOptions,
  TextSpan,
} from '../types/index.js';
import { dropCached, ensurePrivateDir, getCacheDir, getCached, pdfFingerprint, setCache } from './cache.js';
import { type JoinItem, joinPageText } from './cjkJoin.js';
import { buildImageBoxes, type ImageOps } from './imageBoxes.js';
import { buildLayout, markRepeatedBlocks } from './layout.js';
import { nonPrintableStats } from './nonPrintable.js';
import { parsePageRangeWithSkipped } from './pageRange.js';
import { runParallel } from './parallel.js';

/** Inputs that determine which cached entry a request maps to. */
interface CacheKeyInput {
  pages?: string;
  render?: boolean;
  renderOutput?: string;
  normalize?: boolean;
  geometry?: boolean;
  layout?: boolean;
  imageBoxes?: boolean;
  ocr?: boolean;
  ocrLang?: string;
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
    format: 'structured-v13',
    render: !!input.render,
    // Including the resolved render-output dir keeps two invocations with
    // different `--render-output` targets from sharing image paths.
    renderOutput: input.renderOutput ? resolve(input.renderOutput) : null,
    // Normalized vs raw text are different payloads; key them separately so
    // toggling the flag doesn't return stale text.
    normalize: input.normalize !== false,
    geometry: !!input.geometry,
    layout: !!input.layout,
    imageBoxes: !!input.imageBoxes,
    // OCR is expensive (tens of seconds for a multi-page scan); always cache
    // it. The lang string is part of the key (whitespace-normalised, order
    // preserved — tesseract treats the first language as primary) so that
    // `eng` and `eng+jpn` don't share a slot, but ` eng + jpn ` and
    // `eng+jpn` do.
    ocr: !!input.ocr,
    ocrLang: input.ocr ? canonicalOcrLang(input.ocrLang) : null,
  });
  const hash = createHash('sha256').update(payload).digest('hex').slice(0, 16);
  return `result_${hash}.json`;
}

/**
 * Apply Unicode NFKC normalization. PDFs commonly embed compatibility
 * codepoints (e.g. CJK Compatibility Forms `⽬` U+2F6C, halfwidth/fullwidth
 * variants, ligatures `ﬁ`) that break grep / diff / structured extraction
 * for downstream agents. NFKC folds them to the canonical form.
 */
function normalizeText(s: string): string {
  return s.normalize('NFKC');
}

/** Round to 2 decimal places — keeps span coordinates compact in JSON. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Whitespace-normalise (and drop empty separators from) the OCR language
 * string used for cache keying. Order is preserved on purpose —
 * tesseract treats the first language as primary, so `eng+jpn` and
 * `jpn+eng` are intentionally different recognisers. Falls back to
 * `'eng'` when the input is missing or trims to nothing, matching the
 * `--ocr-lang` default in the CLI.
 *
 * Inlined here (instead of importing `parseOcrLang` from `core/ocr.ts`)
 * so building the cache key doesn't load the renderer / @napi-rs/canvas
 * graph that `ocr.ts` indirectly pulls in.
 */
function canonicalOcrLang(lang: string | undefined): string {
  if (!lang) return 'eng';
  const tokens = lang
    .split('+')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return tokens.length > 0 ? tokens.join('+') : 'eng';
}

interface PageData {
  text: string;
  rawText?: string;
  charCount: number;
  imageCount: number;
  textCoverage: number;
  nonPrintableRatio: number;
  nonPrintableCount: number;
  width: number;
  height: number;
  spans?: TextSpan[];
  layout?: PageLayout;
  imageBoxes?: ImageBox[];
}

/**
 * Threshold above which `nonPrintableRatio` is taken to mean "pdf.js
 * returned raw glyph codes" rather than "occasional control char in
 * otherwise clean text". Matches the skill-doc guidance.
 */
const UNUSABLE_NPR_THRESHOLD = 0.05;
/** Same blank threshold the skill doc publishes for `renderContentRatio`. */
const BLANK_RENDER_THRESHOLD = 0.001;

/**
 * Derive {@link PageQuality} from the already-extracted signals.
 * Pure function of the raw fields — invoked once per page after OCR
 * has had a chance to attach its own `renderContentRatio`.
 */
function derivePageQuality(p: PageResult): PageQuality {
  const hasVisualRender = p.renderContentRatio !== undefined && p.renderContentRatio > BLANK_RENDER_THRESHOLD;
  let nativeTextStatus: PageQuality['nativeTextStatus'];
  if (p.nonPrintableRatio >= UNUSABLE_NPR_THRESHOLD) {
    nativeTextStatus = 'unusable_glyph_indices';
  } else if (p.charCount > 0) {
    nativeTextStatus = 'ok';
  } else if (p.imageCount > 0 || hasVisualRender) {
    nativeTextStatus = 'empty_but_visual_content';
  } else {
    nativeTextStatus = 'empty';
  }
  const quality: PageQuality = { nativeTextStatus };
  if (p.renderContentRatio !== undefined) {
    quality.visualStatus = p.renderContentRatio > BLANK_RENDER_THRESHOLD ? 'ok' : 'blank';
  }
  return quality;
}

interface PageFlags {
  normalize: boolean;
  geometry: boolean;
  layout: boolean;
  imageBoxes: boolean;
}

/**
 * Extract a page's text plus rough density metadata.
 *
 * `imageCount` and `textCoverage` let agents detect "looks fine but the
 * real content is rasterised" pages (common in Google Slides exports)
 * and decide whether to re-run with `--render`.
 */
async function extractPageData(
  doc: PDFDocumentProxy,
  pageNum: number,
  ops: ImageOps,
  flags: PageFlags,
): Promise<PageData> {
  const page = await doc.getPage(pageNum);
  const content = await page.getTextContent();

  const view = page.view;
  // MediaBox is normally [minX, minY, maxX, maxY] but the spec allows the
  // pairs in either order; use abs so a flipped box still yields a sensible
  // area instead of falling through to 0 coverage.
  const width = Math.abs(view[2] - view[0]);
  const height = Math.abs(view[3] - view[1]);
  const yMin = Math.min(view[1], view[3]);

  // Spans are also the input to layout reconstruction, so we build them
  // whenever either flag is set — even though we may only expose them on
  // PageResult when `geometry` is on.
  const wantSpans = flags.geometry || flags.layout;

  // Collect typed items for the CJK-aware page-text joiner. We can't
  // build the final string in this loop because the join decision for
  // a whitespace item depends on its neighbours' positions, which we
  // only know after the walk.
  const joinItems: JoinItem[] = [];
  let textArea = 0;
  const spans: TextSpan[] = [];
  for (const item of content.items) {
    if (!('str' in item)) continue;
    const w = typeof item.width === 'number' ? item.width : 0;
    // pdfjs reports item.height as 0 for many PDFs (e.g. those produced by
    // certain Office exporters); fall back to the vertical scale from the
    // text matrix, which is effectively the glyph height in user units.
    const reportedH = typeof item.height === 'number' ? item.height : 0;
    const transform = item.transform;
    const h = reportedH > 0 ? reportedH : Math.abs(transform?.[3] ?? 0);
    textArea += Math.abs(w * h);

    // Feed the page-text joiner. x/fontSize default to 0 when the
    // item lacks a transform (pdf.js does this for synthetic-EOL
    // items); the joiner already handles zero fontSize by falling back
    // to a neighbour.
    const itemX = transform ? transform[4] : 0;
    const itemFontSize = transform ? Math.max(Math.abs(transform[0]), Math.abs(transform[3])) : h;
    joinItems.push({
      str: item.str,
      x: itemX,
      width: w,
      fontSize: itemFontSize,
      hasEOL: !!item.hasEOL,
    });

    // Skip whitespace-only items in spans output — pdf.js emits a span
    // for every positioned space, which can double the array length and
    // sometimes carries a synthetic width that exceeds the page width.
    // The aggregate `text` already preserves the spaces, so layout
    // analysis loses nothing; downstream agents get a cleaner signal.
    if (wantSpans && item.str.trim().length > 0 && transform) {
      // pdfjs transform = [a, b, c, d, e, f]; (e, f) is the baseline origin
      // of the glyph run in PDF user-space (origin: bottom-left). Convert
      // to a top-down bbox so callers can overlay spans on the rendered
      // PNG without flipping y.
      const xPdf = transform[4];
      const yBaselinePdf = transform[5];
      // Top-edge in PDF coords sits one glyph-height above the baseline,
      // and the page's bottom-left can sit at a non-zero MediaBox minY.
      const yTopDown = height - (yBaselinePdf + h - yMin);
      const fontSize = Math.max(Math.abs(transform[0]), Math.abs(transform[3]));
      spans.push({
        text: flags.normalize ? normalizeText(item.str) : item.str,
        x: round2(xPdf - view[0]),
        y: round2(yTopDown),
        width: round2(w),
        height: round2(h),
        fontSize: round2(fontSize),
        ...(typeof item.fontName === 'string' && { fontName: item.fontName }),
      });
    }
  }
  const rawText = joinPageText(joinItems).trimEnd();
  // charCount must reflect the string the caller actually receives, so
  // measure after normalization.
  const text = flags.normalize ? normalizeText(rawText) : rawText;
  // Only surface rawText when normalization actually changed the string —
  // exposing it unconditionally would double JSON size for the common
  // case of already-canonical PDFs.
  const preservedRaw = flags.normalize && rawText !== text ? rawText : undefined;

  // Always expand image-bbox per instance — counting ops would under-
  // report when pdf.js's QueueOptimizer collapses N draws of the same
  // XObject into a single Repeat / Group op. Expanded boxes serve as
  // both the public `imageBoxes` payload (when requested) and the source
  // of `imageCount`, which keeps the two trivially consistent.
  const opList = await page.getOperatorList();
  const allBoxes = buildImageBoxes(opList.fnArray, opList.argsArray as unknown[][], ops, height, view[0], yMin);
  const imageCount = allBoxes.length;
  const imageBoxes = flags.imageBoxes ? allBoxes : undefined;

  const pageArea = width * height;
  const rawCoverage = pageArea > 0 ? textArea / pageArea : 0;
  const textCoverage = Math.max(0, Math.min(1, rawCoverage));

  // Build layout last so it always sees the final span list (post normalize).
  const layout = flags.layout ? buildLayout(spans, round2(width)) : undefined;

  // Measured on the text we actually return (post-normalize) so the
  // count + ratio match what an agent sees in `text`. Cheap (one
  // string walk), so always on — this is the primary signal for
  // catching ToUnicode-CMap-less PDFs that look 100% covered but emit
  // raw glyph indices. Surfacing the raw count alongside the ratio
  // keeps sparse occurrences (a handful of control chars in a long
  // body page) discriminable from "zero" when the 3dp ratio rounds
  // them down.
  const npStats = nonPrintableStats(text);

  return {
    text,
    rawText: preservedRaw,
    charCount: text.length,
    imageCount,
    textCoverage: Math.round(textCoverage * 1000) / 1000,
    nonPrintableRatio: npStats.ratio,
    nonPrintableCount: npStats.count,
    // Round to 2dp; PDF dimensions are nominally integers (Letter 612×792,
    // A4 595×842) but encrypted/cropped PDFs can carry sub-point fractions.
    width: round2(width),
    height: round2(height),
    // Spans are only exposed when --geometry is on; layout / imageBoxes
    // each have their own opt-in flags and are independent of `geometry`.
    ...(flags.geometry && { spans }),
    ...(layout !== undefined && { layout }),
    ...(imageBoxes !== undefined && { imageBoxes }),
  };
}

/** Render a structured DocumentResult into the caller-requested string format. */
function render(result: DocumentResult, format: ProcessOptions['format']): string {
  if (format === 'json') return formatJson(result);
  if (format === 'xml') return formatXml(result);
  return formatMarkdown(result);
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
  // Compute the per-PDF fingerprint up front when any code path below
  // needs it (caching, or render output isolation). Hashing the file is
  // the most expensive sync step in this function, so do it once and
  // share — the cache layer accepts a precomputed fingerprint to avoid
  // re-reading the same file.
  const needFingerprint = !options.noCache || !!(options.render && options.renderOutput);
  const fingerprint = needFingerprint ? pdfFingerprint(filePath) : null;
  const cacheDir = options.noCache ? null : getCacheDir(filePath, fingerprint ?? undefined);

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
  // Single-instance image draw opcodes — one image per occurrence.
  // Repeat / Group / inline-Group variants are dispatched separately
  // because their args carry per-instance positions or transforms.
  const singleImageOps = new Set<number>([
    OPS.paintImageXObject,
    OPS.paintImageMaskXObject,
    OPS.paintInlineImageXObject,
  ]);
  // Hand pdf.js the bundled OpenJPEG (JPX / JPEG2000) + JBIG2 wasm decoders
  // AND the predefined CJK CMap pack.
  //   - `wasmUrl` lets pdf.js decode JPX image streams (Internet Archive
  //     scans). Without it those pages render as solid blanks.
  //   - `cMapUrl` + `cMapPacked: true` lets pdf.js resolve CJK glyphs that
  //     reference predefined CMaps like `Adobe-Japan1-UCS2`. Without it
  //     SpeakerDeck / Office Japanese exports come back with `text: ""`
  //     and the agent has no way to tell native-text-empty from
  //     image-only.
  // We pass *plain filesystem paths* (no `file://` prefix). pdf.js's Node
  // factory calls `fs.readFile(url)` directly, which silently fails on
  // `file://` *strings* (only `URL` objects are accepted by fs); plain
  // paths sidestep that mismatch entirely. pdf.js validates only the
  // trailing slash, not the URL scheme.
  // We intentionally do NOT set `iccUrl`: turning on ICC color management
  // subtly shifts rendered pixel values on Linux, which makes tesseract
  // misread otherwise clean glyphs (observed: `hello pdfvision` → `helb
  // pdfvisdn` on ubuntu CI). JPX decoding does not require ICC.
  // Best-effort: if pdfjs-dist resolution fails, fall back to pre-asset
  // behaviour rather than failing the whole extraction.
  const docOptions: Record<string, unknown> = { url: filePath };
  try {
    // `import.meta.resolve` is sync since Node 20.6 and returns a file://
    // URL for an installed package; convert to a plain directory path so
    // the resulting wasm/cmap dirs work with fs.readFile in Node.
    const pdfjsPkgPath = fileURLToPath(import.meta.resolve('pdfjs-dist/package.json'));
    const pdfjsPkgDir = pathDirname(pdfjsPkgPath);
    // Trailing slash matters: pdf.js appends the filename to this value
    // without an extra separator. pdf.js's `getFactoryUrlProp` only
    // accepts strings ending in `/`, so even on Windows we need to
    // append `/` (not `path.sep`). Inside the path we use `path.join`
    // for platform safety, then concatenate the literal forward slash
    // to satisfy pdf.js's URL contract — Node's `fs.readFile` accepts
    // mixed separators on Windows so this remains portable.
    docOptions.wasmUrl = `${join(pdfjsPkgDir, 'wasm')}/`;
    docOptions.cMapUrl = `${join(pdfjsPkgDir, 'cmaps')}/`;
    docOptions.cMapPacked = true;
  } catch {
    // Best-effort: keep going without the wasm/cmap asset URLs rather
    // than fail the whole extraction over a missing optional asset.
  }
  const doc = await getDocument(docOptions).promise;
  try {
    const totalPages = doc.numPages;
    let pageNumbers: number[];
    if (options.pages) {
      const parsed = parsePageRangeWithSkipped(options.pages, totalPages);
      pageNumbers = parsed.pages;
      // Warn (not throw) when the request named pages past the end. A
      // hard error would over-rotate on the common case `--pages 1-50`
      // for a 30-page doc; a silent drop lost real data (codex flagged
      // this on the apple-10-k sample). The middle path lets the
      // extraction succeed for the in-range pages while still telling
      // the caller something got skipped.
      // Library code must not write to stderr unsolicited; route the
      // notice through the caller-supplied `onWarning` callback if any
      // (the CLI passes one that prints to stderr).
      if (parsed.skipped.length > 0 && options.onWarning) {
        const more = parsed.skippedTruncated ? ` (+ more, truncated)` : '';
        options.onWarning(
          `--pages "${options.pages}" included page(s) past the end of the document (totalPages=${totalPages}); skipped: ${parsed.skipped.join(', ')}${more}`,
        );
      }
    } else {
      pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const metadata = await doc.getMetadata();
    const info = metadata.info as Record<string, unknown> | null;

    let imagePaths: string[] | null = null;
    // Parallel array to imagePaths: renderContentRatio for each rendered
    // page (or undefined slots when --render is off). Surfaced on the
    // PageResult so an agent can spot blank-rendered pages directly from
    // the structured output instead of inferring from "OCR confidence 0".
    let renderRatios: (number | undefined)[] = [];
    if (options.render) {
      let imagesDir: string;
      if (options.renderOutput) {
        // User-supplied path: don't enforce 0o700 here — the caller owns
        // their output directory and may need it readable for downstream
        // consumers. We do create it if missing.
        //
        // Always namespace by the PDF fingerprint: two different PDFs
        // sharing the same `--render-output ./images` used to overwrite
        // each other's `page-N.png` and the renderer's PNG-reuse check
        // happily handed the survivor back as both documents' image.
        // A per-fingerprint subdir makes collisions structurally
        // impossible while keeping the inner filename (`page-N.png`)
        // stable for downstream consumers.
        const baseDir = resolve(options.renderOutput);
        mkdirSync(baseDir, { recursive: true });
        imagesDir = join(baseDir, fingerprint ?? pdfFingerprint(filePath));
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
      const { renderPagesWithStats } = await import('./renderer.js');
      const rendered = await renderPagesWithStats(doc, pageNumbers, imagesDir);
      imagePaths = rendered.map((r) => r.path);
      renderRatios = rendered.map((r) => r.contentRatio);
    }

    const flags: PageFlags = {
      normalize: options.normalize !== false,
      geometry: !!options.geometry,
      layout: !!options.layout,
      imageBoxes: !!options.imageBoxes,
    };
    const ocrEnabled = !!options.ocr;
    const ocrLang = options.ocrLang ?? 'eng';
    const imageOps: ImageOps = {
      save: OPS.save,
      restore: OPS.restore,
      transform: OPS.transform,
      formBegin: OPS.paintFormXObjectBegin,
      formEnd: OPS.paintFormXObjectEnd,
      singleImageOps,
      paintImageXObjectRepeat: OPS.paintImageXObjectRepeat,
      paintImageMaskXObjectRepeat: OPS.paintImageMaskXObjectRepeat,
      paintImageMaskXObjectGroup: OPS.paintImageMaskXObjectGroup,
      paintInlineImageXObjectGroup: OPS.paintInlineImageXObjectGroup,
    };
    // Parallelise per-page extraction. pdfjs's PDFDocumentProxy is safe
    // to call concurrently — each `getPage` resolves through its own
    // worker queue — and runParallel preserves input order so the output
    // pages[] still reads top-to-bottom of the selected range. The cap
    // (defaultConcurrency) keeps memory bounded on large multi-page
    // docs where every concurrent page builds its own canvas / op list.
    const pages: PageResult[] = await runParallel(pageNumbers, async (pageNum, i) => {
      const data = await extractPageData(doc, pageNum, imageOps, flags);
      const renderRatio = renderRatios[i];
      const page: PageResult = {
        page: pageNum,
        text: data.text,
        ...(data.rawText !== undefined && { rawText: data.rawText }),
        image: imagePaths?.[i],
        charCount: data.charCount,
        imageCount: data.imageCount,
        textCoverage: data.textCoverage,
        nonPrintableRatio: data.nonPrintableRatio,
        nonPrintableCount: data.nonPrintableCount,
        ...(renderRatio !== undefined && { renderContentRatio: renderRatio }),
        width: data.width,
        height: data.height,
        ...(data.spans !== undefined && { spans: data.spans }),
        ...(data.layout !== undefined && { layout: data.layout }),
        ...(data.imageBoxes !== undefined && { imageBoxes: data.imageBoxes }),
        // Initial classification using whatever signals we have so far.
        // OCR may attach a renderContentRatio below; the post-OCR pass
        // overwrites this with the final classification.
        quality: { nativeTextStatus: 'empty' },
      };
      page.quality = derivePageQuality(page);
      return page;
    });

    // Repeated-chrome detection has to wait until every selected page is
    // populated, since a single page can't tell its own chrome from its
    // body. Skipped when --layout was off (nothing to flag).
    if (flags.layout) markRepeatedBlocks(pages);

    // OCR runs after the main pass so it can attach to already-built
    // PageResults. The pdfjs-derived `text` stays untouched — agents that
    // care about the difference can compare `text` vs `ocr.text` directly.
    if (ocrEnabled) {
      const { attachOcr } = await import('./ocr.js');
      // Hand the already-rendered PNG paths to attachOcr so we don't
      // re-rasterise the same pages a second time when both `--render`
      // and `--ocr` are on. attachOcr falls back to its own pdf.js
      // raster for any slot where the path is missing (no `--render`,
      // or a cache-hit slot that returned `contentRatio: undefined`).
      await attachOcr(doc, pageNumbers, pages, ocrLang, imagePaths ?? undefined);
    }

    // Compute the derived `quality` field *after* OCR so the OCR-only
    // path's renderContentRatio is included in the empty_but_visual_content
    // decision.
    for (const p of pages) {
      p.quality = derivePageQuality(p);
    }

    const metaString = (raw: unknown): string | null => {
      if (typeof raw !== 'string') return null;
      return flags.normalize ? normalizeText(raw) : raw;
    };

    // Surface a top-level density summary when the result spans more than
    // one page. Same fields the Markdown formatter renders as a table, so
    // JSON consumers and Markdown readers can both scan outliers from the
    // top of the output without re-deriving anything from `pages[]`.
    const overview =
      pages.length > 1
        ? pages.map((p) => ({
            page: p.page,
            charCount: p.charCount,
            imageCount: p.imageCount,
            textCoverage: p.textCoverage,
            nonPrintableRatio: p.nonPrintableRatio,
            nonPrintableCount: p.nonPrintableCount,
            // Mirror the per-page renderContentRatio onto the overview row
            // so an agent can spot blank-rendered pages from the top-level
            // summary alone. Stays optional when neither --render nor --ocr
            // produced a raster.
            ...(p.renderContentRatio !== undefined && { renderContentRatio: p.renderContentRatio }),
            quality: p.quality,
            width: p.width,
            height: p.height,
          }))
        : undefined;

    const result: DocumentResult = {
      file: filePath,
      totalPages,
      metadata: {
        title: metaString(info?.Title),
        author: metaString(info?.Author),
        subject: metaString(info?.Subject),
        creator: metaString(info?.Creator),
      },
      ...(overview && { overview }),
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
    normalize: options.normalize,
    geometry: options.geometry,
    layout: options.layout,
    imageBoxes: options.imageBoxes,
    ocr: options.ocr,
    ocrLang: options.ocrLang,
    onWarning: options.onWarning,
  });
  return render(result, options.format);
}
