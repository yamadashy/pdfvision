import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname as pathDirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { formatJson } from '../output/json.js';
import { formatMarkdown } from '../output/markdown.js';
import { formatToon } from '../output/toon.js';
import { formatXml } from '../output/xml.js';
import type {
  DocumentResult,
  ImageBox,
  PageLayout,
  PageQuality,
  PageResult,
  ProcessDocumentOptions,
  ProcessOptions,
  RenderRegion,
  TextSpan,
} from '../types/index.js';
import { dropCached, ensurePrivateDir, getCacheDir, getCached, pdfFingerprint, setCache } from './cache.js';
import { type JoinItem, joinPageText } from './cjkJoin.js';
import { buildImageBoxes, type ImageOps } from './imageBoxes.js';
import { buildLayout, markRepeatedBlocks } from './layout.js';
import { nonPrintableStats } from './nonPrintable.js';
import { parsePageRangeWithSkipped } from './pageRange.js';
import { runParallel } from './parallel.js';
import { type CompiledSearch, compileSearch, searchPage } from './search.js';
import { countVectorPaintOps } from './vectorOps.js';
import { detectPageWarnings } from './warnings.js';

/** Inputs that determine which cached entry a request maps to. */
interface CacheKeyInput {
  pages?: string;
  render?: boolean;
  renderOutput?: string;
  renderScale?: number;
  renderRegion?: RenderRegion;
  normalize?: boolean;
  geometry?: boolean;
  layout?: boolean;
  imageBoxes?: boolean;
  ocr?: boolean;
  ocrLang?: string;
  search?: string | string[];
  searchRegex?: boolean;
  searchCaseSensitive?: boolean;
}

/** Default rasterisation multiplier — must match renderer.ts DEFAULT_SCALE. */
const DEFAULT_RENDER_SCALE = 2;
/** Hard cap: 4× a letter page is 2448×3168px, ~7.7Mpx. Higher invites OOM. */
const MAX_RENDER_SCALE = 4;

/**
 * Validate and canonicalise a user-supplied `renderScale`. Rejects
 * non-finite values, ≤ 0 scales, and scales above {@link MAX_RENDER_SCALE},
 * then rounds to 2dp so the same value flows through cache keys, render
 * calls, and path composition. Without the rounding step `1.23` and
 * `1.234` would hash to different cache slots but collapse onto the
 * same `s1.23` PNG subdir, and the renderer would hand back the first
 * call's bytes for the second.
 */
function validateRenderScale(scale: number | undefined): number | undefined {
  if (scale === undefined) return undefined;
  // Gate against the upper bound on the raw value — otherwise `4.004`
  // would round to `4` and slip past the cap, contradicting both the
  // JSDoc contract and the CLI's pre-round rejection.
  if (!Number.isFinite(scale) || scale > MAX_RENDER_SCALE) {
    throw new Error(`Invalid renderScale ${scale}: expected a finite number in (0, ${MAX_RENDER_SCALE}]`);
  }
  const rounded = Math.round(scale * 100) / 100;
  // Gate against the lower bound on the rounded value — `0.004` would
  // otherwise pass `> 0`, round to `0`, and ship `scale: 0` to the
  // renderer. Both gates together pin the rounded result to (0, MAX].
  if (rounded <= 0) {
    throw new Error(`Invalid renderScale ${scale}: expected a finite number in (0, ${MAX_RENDER_SCALE}]`);
  }
  return rounded;
}

/**
 * Format the scale for use as a filesystem path component. Assumes the
 * input is already rounded to 2dp via {@link validateRenderScale};
 * `Number.toString()` then drops trailing zeros so `2` → `s2` and
 * `1.5` → `s1.5`.
 */
function scaleDirSuffix(scale: number): string {
  return `s${scale.toString()}`;
}

/**
 * Validate and canonicalise the user-supplied `renderRegion`. Surface
 * shape errors (non-finite, negative, zero-area) before any page is
 * loaded so a typo in a script fails fast rather than burning the
 * extraction budget on an unusable region.
 *
 * Page-bounds and single-page checks happen later — they need the page
 * list and viewport, which aren't available at this point.
 */
function validateRenderRegion(region: RenderRegion | undefined): RenderRegion | undefined {
  if (region === undefined) return undefined;
  const { x, y, width, height } = region;
  for (const [name, value] of [
    ['x', x],
    ['y', y],
    ['width', width],
    ['height', height],
  ] as const) {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid renderRegion.${name} ${value}: expected a finite number`);
    }
  }
  if (x < 0 || y < 0) {
    throw new Error(`Invalid renderRegion: x and y must be >= 0 (got x=${x}, y=${y})`);
  }
  // Canonicalise to 2dp BEFORE the positive-size gate so a raw value
  // like 0.004 (which would otherwise pass `> 0`, round to 0, and ship
  // `width: 0` to the filename / echo while the renderer silently
  // clamped the canvas to 1px) is rejected up front. Matches the
  // round-then-validate posture used by validateRenderScale.
  const rounded = { x: round2(x), y: round2(y), width: round2(width), height: round2(height) };
  if (rounded.width <= 0 || rounded.height <= 0) {
    throw new Error(`Invalid renderRegion: width and height must be > 0 (got width=${width}, height=${height})`);
  }
  return rounded;
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
    format: 'structured-v24',
    render: !!input.render,
    // Including the resolved render-output dir keeps two invocations with
    // different `--render-output` targets from sharing image paths.
    renderOutput: input.renderOutput ? resolve(input.renderOutput) : null,
    // Different `renderScale` values change `pages[].image` content and
    // `renderContentRatio` (anti-aliasing shifts the histogram); key
    // separately so a 1.5× run doesn't return a cached 2.0× payload.
    // `null` for the off path so non-render extractions still hit a
    // shared slot regardless of the value the caller passed.
    renderScale: input.render || input.ocr ? (input.renderScale ?? DEFAULT_RENDER_SCALE) : null,
    // `renderRegion` changes both the PNG content and `renderContentRatio`
    // (cropped pixels → different histogram). Key on the xywh tuple so
    // two regions on the same page get distinct cache entries.
    renderRegion:
      (input.render || input.ocr) && input.renderRegion
        ? `${input.renderRegion.x},${input.renderRegion.y},${input.renderRegion.width},${input.renderRegion.height}`
        : null,
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
    // Search results change the structured payload (pages[].matches),
    // so the query list and flags are part of the key. Multi-query
    // order matters (queryIndex on each match is index-stable), so we
    // preserve array order in the key.
    search: input.search !== undefined ? (Array.isArray(input.search) ? input.search : [input.search]) : null,
    searchRegex: !!input.searchRegex,
    searchCaseSensitive: !!input.searchCaseSensitive,
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
  rasterBackedTextLayer: boolean;
  vectorCount: number;
  textCoverage: number;
  nonPrintableRatio: number;
  nonPrintableCount: number;
  width: number;
  height: number;
  spans?: TextSpan[];
  /** Spans built internally (independent of `flags.geometry`) for
   *  downstream search bbox computation. Mirrors `spans` when both
   *  are present; lives separately so the public PageResult.spans
   *  gating stays the simple "geometry on / off" rule. */
  _internalSpans?: TextSpan[];
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
const SPARSE_VISUAL_TEXT_COVERAGE_THRESHOLD = 0.02;
const SPARSE_VISUAL_TEXT_CHAR_THRESHOLD = 200;
const RASTER_BACKED_TEXT_COVERAGE_THRESHOLD = 0.1;
const FULL_PAGE_RASTER_COVERAGE_THRESHOLD = 0.9;

function hasFullPageRasterBackdrop(imageBoxes: readonly ImageBox[], pageWidth: number, pageHeight: number): boolean {
  const pageArea = pageWidth * pageHeight;
  if (pageArea <= 0) return false;
  return imageBoxes.some((box) => {
    const x1 = Math.max(0, box.x);
    const y1 = Math.max(0, box.y);
    const x2 = Math.min(pageWidth, box.x + box.width);
    const y2 = Math.min(pageHeight, box.y + box.height);
    const overlap = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    return overlap / pageArea >= FULL_PAGE_RASTER_COVERAGE_THRESHOLD;
  });
}

/**
 * Derive {@link PageQuality} from the already-extracted signals.
 * Pure function of the raw fields — invoked once per page after OCR
 * has had a chance to attach its own `renderContentRatio`.
 */
function derivePageQuality(p: PageResult): PageQuality {
  const hasVisualRender = p.renderContentRatio !== undefined && p.renderContentRatio > BLANK_RENDER_THRESHOLD;
  const hasNonTextVisualContent = p.imageCount > 0 || p.vectorCount > 0;
  const hasVisualContent = hasNonTextVisualContent || hasVisualRender;
  let nativeTextStatus: PageQuality['nativeTextStatus'];
  if (p.nonPrintableRatio >= UNUSABLE_NPR_THRESHOLD) {
    nativeTextStatus = 'unusable_glyph_indices';
  } else if (p.charCount > 0) {
    nativeTextStatus =
      hasNonTextVisualContent &&
      p.charCount <= SPARSE_VISUAL_TEXT_CHAR_THRESHOLD &&
      p.textCoverage < SPARSE_VISUAL_TEXT_COVERAGE_THRESHOLD
        ? 'sparse_text_with_visual_content'
        : 'ok';
  } else if (hasVisualContent) {
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
  /** Build spans internally even when neither `geometry` nor `layout`
   *  was requested. Search needs them for per-match bbox; the public
   *  `pages[].spans` payload still requires `geometry`. */
  needSpansForSearch: boolean;
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

  // Spans are the input to layout reconstruction AND to search bbox
  // computation, so we build them whenever any of those needs is set —
  // even though we may only expose them on PageResult when `geometry`
  // is on.
  const wantSpans = flags.geometry || flags.layout || flags.needSpansForSearch;

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
  const vectorCount = countVectorPaintOps(opList.fnArray, opList.argsArray as unknown[][], ops);

  const pageArea = width * height;
  const rawCoverage = pageArea > 0 ? textArea / pageArea : 0;
  const textCoverage = Math.max(0, Math.min(1, rawCoverage));
  const rasterBackedTextLayer =
    imageCount > 0 &&
    vectorCount === 0 &&
    textCoverage >= RASTER_BACKED_TEXT_COVERAGE_THRESHOLD &&
    hasFullPageRasterBackdrop(allBoxes, width, height);

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
    rasterBackedTextLayer,
    vectorCount,
    textCoverage: Math.round(textCoverage * 1000) / 1000,
    nonPrintableRatio: npStats.ratio,
    nonPrintableCount: npStats.count,
    // Round to 2dp; PDF dimensions are nominally integers (Letter 612×792,
    // A4 595×842) but encrypted/cropped PDFs can carry sub-point fractions.
    width: round2(width),
    height: round2(height),
    // Spans are only exposed publicly when --geometry is on; layout /
    // imageBoxes each have their own opt-in flags and are independent
    // of `geometry`. `_internalSpans` only rides along when search
    // actually needs them — `--layout` alone already consumed the
    // span list during `buildLayout` above, so re-emitting them on
    // PageData would waste memory on the typical extraction.
    ...(flags.geometry && { spans }),
    ...(flags.needSpansForSearch && { _internalSpans: spans }),
    ...(layout !== undefined && { layout }),
    ...(imageBoxes !== undefined && { imageBoxes }),
  };
}

/** Render a structured DocumentResult into the caller-requested string format. */
function render(result: DocumentResult, options: ProcessOptions): string {
  const { format } = options;
  switch (format) {
    case 'json':
      return formatJson(result);
    case 'xml':
      return formatXml(result);
    case 'toon':
      return formatToon(result);
    default:
      return formatMarkdown(result, { stripRepeated: options.stripRepeated });
  }
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
  // Reject malformed renderScale up front — before fingerprint hashing
  // or pdfjs load — so callers see the error fast even when --render
  // isn't on (the validation is cheap and a leftover flag in a script
  // shouldn't be quietly ignored).
  const renderScale = validateRenderScale(options.renderScale);
  // Same posture for renderRegion: shape (positive width/height, no
  // negatives, finite numbers) gets validated synchronously; the
  // single-page + within-bounds + non-rotated-page checks come after
  // page resolution and pdfjs load below.
  const renderRegion = validateRenderRegion(options.renderRegion);
  // Compile search queries up front so a bad regex or empty query
  // surfaces immediately rather than after the extraction budget
  // is partly spent. `compileSearch` returns undefined when search
  // isn't requested — the per-page loop below skips on undefined.
  const compiledSearch: CompiledSearch | undefined = compileSearch(options.search, {
    regex: options.searchRegex,
    caseSensitive: options.searchCaseSensitive,
    normalize: options.normalize,
  });
  // renderRegion only makes sense when rasterisation actually runs.
  // The CLI already enforces this, but library callers can bypass it
  // and we'd then hit two real bugs: (1) the result cache slot is
  // shared with text-only extractions (renderRegion isn't part of the
  // text-only cache key), so back-to-back calls with different regions
  // would return stale `renderRegion` echoes; (2) the single-page +
  // bounds checks below sit inside the `options.render || options.ocr`
  // branch, so they'd silently no-op. Fail loud at the boundary instead.
  if (renderRegion && !options.render && !options.ocr) {
    throw new Error('renderRegion requires render: true or ocr: true');
  }
  // Compute the per-PDF fingerprint up front when any code path below
  // needs it (caching, or render output isolation). Hashing the file is
  // the most expensive sync step in this function, so do it once and
  // share — the cache layer accepts a precomputed fingerprint to avoid
  // re-reading the same file.
  const needFingerprint = !options.noCache || !!(options.render && options.renderOutput);
  const fingerprint = needFingerprint ? pdfFingerprint(filePath) : null;
  const cacheDir = options.noCache ? null : getCacheDir(filePath, fingerprint ?? undefined);

  const cacheKey = buildCacheKey({ ...options, renderScale, renderRegion });
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
  const pathPaintOps = new Set<number>([
    OPS.stroke,
    OPS.closeStroke,
    OPS.fill,
    OPS.eoFill,
    OPS.fillStroke,
    OPS.eoFillStroke,
    OPS.closeFillStroke,
    OPS.closeEOFillStroke,
  ]);
  const vectorPaintOps = new Set<number>([...pathPaintOps, OPS.shadingFill, OPS.rawFillPath]);
  // Hand pdf.js the bundled OpenJPEG (JPX / JPEG2000) + JBIG2 wasm decoders,
  // predefined CJK CMap pack, and standard font data.
  //   - `wasmUrl` lets pdf.js decode JPX image streams (Internet Archive
  //     scans). Without it those pages render as solid blanks.
  //   - `cMapUrl` + `cMapPacked: true` lets pdf.js resolve CJK glyphs that
  //     reference predefined CMaps like `Adobe-Japan1-UCS2`. Without it
  //     SpeakerDeck / Office Japanese exports come back with `text: ""`
  //     and the agent has no way to tell native-text-empty from
  //     image-only.
  //   - `standardFontDataUrl` prevents pdf.js from falling back when a PDF
  //     references one of the built-in Type1 fonts without embedding it.
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
    docOptions.standardFontDataUrl = `${join(pdfjsPkgDir, 'standard_fonts')}/`;
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

    // renderRegion is V1-strict: exactly one page selected. The use case
    // is "zoom into THIS region of THIS page"; applying the same xywh
    // to many pages (potentially with different sizes) needs a different
    // surface (e.g. per-page region map) we deliberately don't ship yet.
    if (renderRegion && pageNumbers.length !== 1) {
      throw new Error(
        `renderRegion requires exactly 1 page (resolved ${pageNumbers.length} from pages selector ${options.pages ? `"${options.pages}"` : '(all pages)'})`,
      );
    }
    // Bounds + rotation guards. V1 rejects pages with `page.rotate !== 0`
    // because pdfvision's existing geometry (spans / imageBoxes /
    // layout.blocks) is in unrotated MediaBox-derived coordinates, while
    // pdf.js's render viewport applies rotation. The two coord systems
    // disagree for /Rotate 90/180/270, so a user pulling a bbox from
    // `imageBoxes` and feeding it as `renderRegion` would crop the
    // wrong area on rotated pages. Fixing the underlying inconsistency
    // is a multi-file refactor (renderer + spans + imageBoxes + layout);
    // out of V1 scope. Reject loudly so the agent doesn't get a silently
    // wrong PNG.
    if (renderRegion && (options.render || options.ocr)) {
      const probePage = await doc.getPage(pageNumbers[0]);
      if (probePage.rotate !== 0) {
        throw new Error(
          `renderRegion is not supported on rotated pages (page ${pageNumbers[0]} has rotate=${probePage.rotate}); the region coord system would not match imageBoxes / layout.blocks. V1 limitation.`,
        );
      }
      // Bounds against the page MediaBox dimensions — matches the
      // coordinate system pdfvision exposes via spans / imageBoxes
      // / layout.blocks, not the post-rotation viewport.
      const view = probePage.view;
      const pageW = Math.abs(view[2] - view[0]);
      const pageH = Math.abs(view[3] - view[1]);
      const right = renderRegion.x + renderRegion.width;
      const bottom = renderRegion.y + renderRegion.height;
      if (right > pageW || bottom > pageH) {
        throw new Error(
          `renderRegion ${right}×${bottom} (right×bottom) falls outside page ${pageNumbers[0]} bounds ${pageW}×${pageH} (width×height, PDF points)`,
        );
      }
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
      // Non-default scales sit in their own subdir so different scales
      // don't share `page-N.png` filenames and stomp each other's bytes.
      // Keeping the default (2.0) on the legacy path preserves existing
      // user paths under `--render-output ./images/<fp>/page-N.png`.
      const effectiveScale = renderScale ?? DEFAULT_RENDER_SCALE;
      const scaleSubdir = effectiveScale === DEFAULT_RENDER_SCALE ? null : scaleDirSuffix(effectiveScale);
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
        // `needFingerprint` above forces a hash whenever
        // `render && renderOutput`, so `fingerprint` is non-null on
        // this branch — assert rather than re-hash.
        // The fingerprint subdir name is deterministic (same PDF →
        // same name) and now sits inside a user-controlled directory
        // we explicitly do NOT lock down to 0700. In a shared writable
        // parent (CI runners, multi-user hosts) another process could
        // pre-create that subdir as a symlink to elsewhere; mkdir
        // -p would silently accept it and the renderer would then
        // write `page-N.png` through the redirect. Refuse to keep
        // going if the path is a symlink or somehow not a directory,
        // matching the same posture `ensurePrivateDir` enforces for
        // the cache hierarchy.
        //
        // When `scaleSubdir` is set we also have to check the
        // *intermediate* fingerprint dir: a planted symlink there
        // would otherwise be followed by `mkdirSync({recursive:true})`
        // for the scale subdir, leaving the final lstat on a real
        // directory at the symlink's target and bypassing the check.
        // So: assert the fingerprint dir first, then create + assert
        // the scale subdir on top.
        const fingerprintDir = join(baseDir, fingerprint as string);
        // `recursive: true` creates baseDir too if missing, so the
        // separate `mkdirSync(baseDir)` would be redundant.
        mkdirSync(fingerprintDir, { recursive: true });
        const assertSafeDir = (dir: string): void => {
          const stat = lstatSync(dir);
          if (stat.isSymbolicLink()) {
            throw new Error(`Refusing to render into ${dir}: path is a symlink`);
          }
          if (!stat.isDirectory()) {
            throw new Error(`Refusing to render into ${dir}: path exists but is not a directory`);
          }
        };
        assertSafeDir(fingerprintDir);
        if (scaleSubdir) {
          imagesDir = join(fingerprintDir, scaleSubdir);
          mkdirSync(imagesDir, { recursive: true });
          assertSafeDir(imagesDir);
        } else {
          imagesDir = fingerprintDir;
        }
      } else if (cacheDir) {
        // Lock down the intermediate `images/` first, then the scale
        // subdir (when present), matching the per-level pattern in
        // ocr.ts. mkdirSync({recursive:true}) only applies the
        // requested mode to the leaf — without an explicit
        // ensurePrivateDir on the parent the `images/` perms would
        // fall back to umask defaults (0755) even though the rest of
        // the cache hierarchy is 0700.
        const baseImagesDir = join(cacheDir, 'images');
        ensurePrivateDir(baseImagesDir);
        if (scaleSubdir) {
          imagesDir = join(baseImagesDir, scaleSubdir);
          ensurePrivateDir(imagesDir);
        } else {
          imagesDir = baseImagesDir;
        }
      } else {
        // mkdtemp creates with 0o700 by default and never reuses an existing
        // path, so it sidesteps the symlink/ownership concerns for the
        // no-cache fallback.
        imagesDir = mkdtempSync(join(tmpdir(), 'pdfvision-render-'));
      }
      // renderer pulls in @napi-rs/canvas (native binding); only load it
      // when --render is requested.
      const { renderPagesWithStats } = await import('./renderer.js');
      const rendered = await renderPagesWithStats(doc, pageNumbers, imagesDir, renderScale, renderRegion);
      imagePaths = rendered.map((r) => r.path);
      renderRatios = rendered.map((r) => r.contentRatio);
    }

    const flags: PageFlags = {
      normalize: options.normalize !== false,
      geometry: !!options.geometry,
      layout: !!options.layout,
      imageBoxes: !!options.imageBoxes,
      // Search needs span-level bbox to populate `matches[*].bbox`;
      // build spans internally even if the caller didn't ask for the
      // full `pages[].spans` payload via --geometry.
      needSpansForSearch: compiledSearch !== undefined,
    };
    const ocrEnabled = !!options.ocr;
    const ocrLang = options.ocrLang ?? 'eng';
    const rasterBackedTextLayerByPage = new Map<number, boolean>();
    const imageOps: ImageOps = {
      save: OPS.save,
      restore: OPS.restore,
      transform: OPS.transform,
      formBegin: OPS.paintFormXObjectBegin,
      formEnd: OPS.paintFormXObjectEnd,
      singleImageOps,
      constructPath: OPS.constructPath,
      pathPaintOps,
      vectorPaintOps,
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
      rasterBackedTextLayerByPage.set(pageNum, data.rasterBackedTextLayer);
      const renderRatio = renderRatios[i];
      const page: PageResult = {
        page: pageNum,
        ...(renderRegion !== undefined && { renderRegion }),
        text: data.text,
        ...(data.rawText !== undefined && { rawText: data.rawText }),
        image: imagePaths?.[i],
        charCount: data.charCount,
        imageCount: data.imageCount,
        vectorCount: data.vectorCount,
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
      // Run the native (span-based) search pass here while the internal
      // spans are still in scope. OCR-based matches are appended
      // post-OCR below — both produce the same SearchMatch shape, so
      // consumers iterate `pages[].matches` uniformly.
      if (compiledSearch) {
        const nativeMatches = searchPage(
          data._internalSpans,
          undefined,
          pageNum,
          data.width,
          data.height,
          compiledSearch,
          options.onWarning,
        );
        page.matches = nativeMatches;
      }
      return page;
    });

    // Repeated-chrome detection has to wait until every selected page is
    // populated, since a single page can't tell its own chrome from its
    // body. Skipped when --layout was off (nothing to flag).
    if (flags.layout) {
      markRepeatedBlocks(pages);
      // Warning detection runs strictly after `markRepeatedBlocks` so
      // every rule can route on `block.repeated`. Cheap (post-pass over
      // already-built blocks) so it's always on when layout is — gating
      // it behind another flag would add a config knob with no
      // meaningful cost saving. Empty arrays are omitted to keep the
      // common "no warnings" page from carrying an empty field in JSON.
      //
      // `chromeDetectionReliable` tells the detector whether the
      // upstream cross-page pass had enough material to produce
      // meaningful `repeated` flags. On a single-page extraction
      // (or one where every page came back with empty layout) every
      // block stays unflagged-as-chrome, so rules that distinguish
      // body from chrome on the `repeated` axis (`near_bottom_edge`)
      // would mis-fire on what's really a running footer.
      const pagesWithLayout = pages.filter((p) => p.layout && p.layout.blocks.length > 0).length;
      const chromeDetectionReliable = pagesWithLayout >= 2;
      for (const p of pages) {
        const warnings = detectPageWarnings(p, {
          chromeDetectionReliable,
          rasterBackedTextLayer: rasterBackedTextLayerByPage.get(p.page),
        });
        if (warnings.length > 0) p.warnings = warnings;
      }
    }

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
      await attachOcr(doc, pageNumbers, pages, ocrLang, imagePaths ?? undefined, renderScale, renderRegion);
    }

    // Compute the derived `quality` field *after* OCR so the OCR-only
    // path's renderContentRatio is included in the empty_but_visual_content
    // decision.
    for (const p of pages) {
      p.quality = derivePageQuality(p);
    }

    // OCR search pass. The native pass ran in the per-page loop above
    // (spans were in scope); OCR results only exist after attachOcr,
    // so this second pass adds OCR-source matches at the end of each
    // page's `matches[]`. Skipped when OCR wasn't enabled — no
    // ocr.text to search.
    if (compiledSearch && ocrEnabled) {
      for (const p of pages) {
        if (!p.ocr) continue;
        const ocrMatches = searchPage(undefined, p.ocr, p.page, p.width, p.height, compiledSearch, options.onWarning);
        p.matches = (p.matches ?? []).concat(ocrMatches);
      }
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
            vectorCount: p.vectorCount,
            textCoverage: p.textCoverage,
            nonPrintableRatio: p.nonPrintableRatio,
            nonPrintableCount: p.nonPrintableCount,
            // Mirror the per-page renderContentRatio onto the overview row
            // so an agent can spot blank-rendered pages from the top-level
            // summary alone. Stays optional when neither --render nor --ocr
            // produced a raster.
            ...(p.renderContentRatio !== undefined && { renderContentRatio: p.renderContentRatio }),
            quality: p.quality,
            // Mirror the warnings count from each page so the top-level
            // table flags problem pages at a glance. Omitted when no
            // warnings fired (or when --layout was off so no detection
            // ran), matching the PageResult.warnings field's optional
            // shape.
            ...(p.warnings && p.warnings.length > 0 && { warningCount: p.warnings.length }),
            // Search hits per page. Present-with-`0` is meaningful
            // ("search ran, no hits on this page"); omitted when
            // `search` wasn't requested at all so the overview stays
            // clean for the default extraction.
            ...(compiledSearch !== undefined && { matchCount: p.matches?.length ?? 0 }),
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
  // Validate format-specific options up front so the caller doesn't pay
  // the extraction cost (potentially seconds of pdf.js / OCR work) only
  // to hit a render-time mismatch. `stripRepeated` depends on the
  // layout pass having tagged blocks with `repeated: true`, which only
  // happens when `layout: true` is requested.
  if (options.stripRepeated && !options.layout) {
    throw new Error('stripRepeated requires layout: true');
  }
  if (options.stripRepeated && options.format !== 'markdown') {
    // JSON / XML already expose `repeated: true` on each layout block,
    // so passing `stripRepeated` with those formats is a misconfigured
    // call (the flag would silently no-op against the formatter).
    // Match the CLI's posture and fail loudly so library users notice
    // the flag had no effect.
    throw new Error(`stripRepeated only applies to markdown output (got format: ${options.format})`);
  }
  const result = await processDocument(filePath, {
    pages: options.pages,
    render: options.render,
    noCache: options.noCache,
    renderOutput: options.renderOutput,
    renderScale: options.renderScale,
    renderRegion: options.renderRegion,
    search: options.search,
    searchRegex: options.searchRegex,
    searchCaseSensitive: options.searchCaseSensitive,
    normalize: options.normalize,
    geometry: options.geometry,
    layout: options.layout,
    imageBoxes: options.imageBoxes,
    ocr: options.ocr,
    ocrLang: options.ocrLang,
    onWarning: options.onWarning,
  });
  return render(result, options);
}
