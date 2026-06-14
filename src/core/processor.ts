import { createHash } from 'node:crypto';
import {
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  join,
  basename as pathBasename,
  dirname as pathDirname,
  isAbsolute as pathIsAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { formatJson } from '../output/json.js';
import { formatMarkdown } from '../output/markdown.js';
import { formatToon } from '../output/toon.js';
import { formatXml } from '../output/xml.js';
import type {
  DocumentAttachment,
  DocumentLayers,
  DocumentOutlineItem,
  DocumentResult,
  DocumentViewerState,
  FormField,
  ImageBox,
  PageAnnotation,
  PageLayout,
  PageLink,
  PageResult,
  PageStructureNode,
  ProcessDocumentOptions,
  ProcessOptions,
  RenderRegion,
  TextSpan,
  VectorBox,
} from '../types/index.js';
import { buildAnnotations, hasVisibleAnnotationAppearance } from './annotations.js';
import { buildAttachments } from './attachments.js';
import { dropCached, ensurePrivateDir, getCacheDir, getCached, pdfFingerprint, setCache } from './cache.js';
import { type JoinItem, joinPageText } from './cjkJoin.js';
import { resolveDestinationPage } from './destinations.js';
import { buildFormFields } from './formFields.js';
import { buildImageBoxes, type ImageOps } from './imageBoxes.js';
import { buildLayers } from './layers.js';
import { buildLayout, markRepeatedBlocks } from './layout.js';
import { buildLinks } from './links.js';
import { nonPrintableStats } from './nonPrintable.js';
import { buildOutline } from './outline.js';
import { derivePageQuality } from './pageQuality.js';
import { parsePageRangeWithSkipped } from './pageRange.js';
import { runParallel } from './parallel.js';
import { isRasterBackedTextLayer } from './rasterBackedTextLayer.js';
import { type CompiledSearch, compileSearch, searchPage, suppressDuplicateOcrMatches } from './search.js';
import { buildPageStructure, countStructureNodes } from './structure.js';
import { textMatrixFontSize, textRunGeometryFromTransform } from './textGeometry.js';
import { buildVectorBoxes } from './vectorBoxes.js';
import { countVectorPaintOps } from './vectorOps.js';
import { buildViewerState, normalizeJavaScriptActions } from './viewer.js';
import { type BuildVisualRegionsInput, buildVisualRegions } from './visualRegions.js';
import { detectPageWarnings } from './warnings.js';

/** Inputs that determine which cached entry a request maps to. */
interface CacheKeyInput {
  pages?: string;
  password?: string;
  render?: boolean;
  renderOutput?: string;
  renderScale?: number;
  renderRegion?: RenderRegion;
  renderVisualRegions?: boolean;
  normalize?: boolean;
  geometry?: boolean;
  layout?: boolean;
  imageBoxes?: boolean;
  vectorBoxes?: boolean;
  visualRegions?: boolean;
  formFields?: boolean;
  links?: boolean;
  annotations?: boolean;
  structure?: boolean;
  pageLabels?: boolean;
  attachments?: boolean;
  attachmentOutput?: string;
  outline?: boolean;
  viewer?: boolean;
  layers?: boolean;
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

interface RenderImagesDirInput {
  renderOutput?: string;
  cacheDir: string | null;
  fingerprint: string | null;
  renderScale?: number;
}

function assertSafeRenderDir(dir: string): void {
  const stat = lstatSync(dir);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to render into ${dir}: path is a symlink`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Refusing to render into ${dir}: path exists but is not a directory`);
  }
}

function assertRenderAncestorDir(dir: string): void {
  if (!statSync(dir).isDirectory()) {
    throw new Error(`Refusing to render into ${dir}: path exists but is not a directory`);
  }
}

function ensureSafeRenderRoot(dir: string): void {
  const resolved = resolve(dir);
  const missing: string[] = [];
  let current = resolved;

  while (true) {
    try {
      if (current === resolved) assertSafeRenderDir(current);
      else assertRenderAncestorDir(current);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      missing.push(current);
      const parent = pathDirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }

  let createUnder = realpathSync(current);
  for (const missingDir of missing.reverse()) {
    createUnder = join(createUnder, pathBasename(missingDir));
    mkdirSync(createUnder);
    assertSafeRenderDir(createUnder);
  }

  try {
    assertSafeRenderDir(resolved);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && missing.length > 0) {
      throw new Error(`Refusing to render into ${resolved}: path could not be created`);
    }
    throw error;
  }
}

function ensureSafeRenderChildDir(dir: string): void {
  try {
    assertSafeRenderDir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    mkdirSync(dir);
    assertSafeRenderDir(dir);
  }
}

function prepareRenderImagesDir(input: RenderImagesDirInput): string {
  const effectiveScale = input.renderScale ?? DEFAULT_RENDER_SCALE;
  const scaleSubdir = effectiveScale === DEFAULT_RENDER_SCALE ? null : scaleDirSuffix(effectiveScale);
  if (input.renderOutput) {
    if (!input.fingerprint) {
      throw new Error('renderOutput requires a PDF fingerprint');
    }
    const outputRoot = resolve(input.renderOutput);
    ensureSafeRenderRoot(outputRoot);
    const fingerprintDir = join(outputRoot, input.fingerprint);
    ensureSafeRenderChildDir(fingerprintDir);
    if (!scaleSubdir) return fingerprintDir;

    const scaledDir = join(fingerprintDir, scaleSubdir);
    ensureSafeRenderChildDir(scaledDir);
    return scaledDir;
  }

  if (input.cacheDir) {
    const baseImagesDir = join(input.cacheDir, 'images');
    ensurePrivateDir(baseImagesDir);
    if (!scaleSubdir) return baseImagesDir;

    const scaledDir = join(baseImagesDir, scaleSubdir);
    ensurePrivateDir(scaledDir);
    return scaledDir;
  }

  return mkdtempSync(join(tmpdir(), 'pdfvision-render-'));
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
  const rasterizes = !!input.render || !!input.ocr || !!input.renderVisualRegions;
  const payload = JSON.stringify({
    pages: input.pages ?? 'all',
    // Bump when the on-disk DocumentResult shape changes so older entries
    // (missing newly-added page fields) are not handed out as fresh results.
    format: 'structured-v100',
    passwordHash:
      input.password !== undefined ? createHash('sha256').update(input.password).digest('hex').slice(0, 16) : null,
    render: !!input.render,
    // Including the resolved render-output dir keeps two invocations with
    // different `--render-output` targets from sharing image paths.
    renderOutput: input.renderOutput ? resolve(input.renderOutput) : null,
    // Different `renderScale` values change `pages[].image` content and
    // `renderContentRatio` (anti-aliasing shifts the histogram); key
    // separately so a 1.5× run doesn't return a cached 2.0× payload.
    // `null` for the off path so non-render extractions still hit a
    // shared slot regardless of the value the caller passed.
    renderScale: rasterizes ? (input.renderScale ?? DEFAULT_RENDER_SCALE) : null,
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
    vectorBoxes: !!input.vectorBoxes,
    visualRegions: !!input.visualRegions || !!input.renderVisualRegions,
    renderVisualRegions: !!input.renderVisualRegions,
    formFields: !!input.formFields,
    links: !!input.links,
    annotations: !!input.annotations,
    structure: !!input.structure,
    pageLabels: !!input.pageLabels,
    attachments: !!input.attachments,
    attachmentOutput: input.attachmentOutput ? resolve(input.attachmentOutput) : null,
    outline: !!input.outline,
    viewer: !!input.viewer,
    layers: !!input.layers,
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

function textItemDedupeKey(
  text: string,
  width: number,
  height: number,
  transform: readonly number[] | undefined,
  fontName: unknown,
): string {
  const geometry = transform ? transform.map((value) => Math.round(value * 1000) / 1000).join(',') : 'no-transform';
  const font = typeof fontName === 'string' ? fontName : '';
  return JSON.stringify([text, round3(width), round3(height), geometry, font]);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
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
  _warningImageBoxes?: ImageBox[];
  vectorBoxes?: VectorBox[];
  _visualRegionInput?: BuildVisualRegionsInput;
  hasVisibleAnnotationAppearance?: boolean;
  formFields?: FormField[];
  links?: PageLink[];
  annotations?: PageAnnotation[];
  structure?: PageStructureNode | null;
  jsActions?: Record<string, string[]>;
}

interface PageFlags {
  normalize: boolean;
  geometry: boolean;
  layout: boolean;
  imageBoxes: boolean;
  vectorBoxes: boolean;
  visualRegions: boolean;
  formFields: boolean;
  links: boolean;
  annotations: boolean;
  annotationAppearanceHints: boolean;
  structure: boolean;
  viewer: boolean;
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
  const xMin = Math.min(view[0], view[2]);
  const yMin = Math.min(view[1], view[3]);

  // Spans are the input to layout reconstruction AND to search bbox
  // computation, so we build them whenever any of those needs is set —
  // even though we may only expose them on PageResult when `geometry`
  // is on.
  const wantSpans =
    flags.geometry || flags.layout || flags.visualRegions || flags.formFields || flags.needSpansForSearch;

  // Collect typed items for the CJK-aware page-text joiner. We can't
  // build the final string in this loop because the join decision for
  // a whitespace item depends on its neighbours' positions, which we
  // only know after the walk.
  const joinItems: JoinItem[] = [];
  let textArea = 0;
  const spans: TextSpan[] = [];
  const seenTextItems = new Set<string>();
  for (const item of content.items) {
    if (!('str' in item)) continue;
    const w = typeof item.width === 'number' ? item.width : 0;
    // pdfjs reports item.height as 0 for many PDFs (e.g. those produced by
    // certain Office exporters); fall back to the vertical scale from the
    // text matrix, which is effectively the glyph height in user units.
    const reportedH = typeof item.height === 'number' ? item.height : 0;
    const transform = item.transform;
    const h = reportedH > 0 ? reportedH : transform ? textMatrixFontSize(transform) : 0;
    const itemKey = textItemDedupeKey(item.str, w, h, transform, item.fontName);
    if (seenTextItems.has(itemKey)) continue;
    seenTextItems.add(itemKey);
    textArea += Math.abs(w * h);

    // Feed the page-text joiner. x/fontSize default to 0 when the
    // item lacks a transform (pdf.js does this for synthetic-EOL
    // items); the joiner already handles zero fontSize by falling back
    // to a neighbour.
    const itemX = transform ? transform[4] : 0;
    const itemFontSize = transform ? textMatrixFontSize(transform, h) : h;
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
      const geometry = textRunGeometryFromTransform({
        transform,
        width: w,
        height: h,
        pageHeight: height,
        viewMinX: xMin,
        viewMinY: yMin,
        dir: typeof item.dir === 'string' ? item.dir : undefined,
      });
      spans.push({
        text: flags.normalize ? normalizeText(item.str) : item.str,
        ...geometry,
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
  const vectorCount = countVectorPaintOps(
    opList.fnArray,
    opList.argsArray as unknown[][],
    ops,
    width,
    height,
    xMin,
    yMin,
  );
  const allVectorBoxes =
    flags.vectorBoxes || flags.visualRegions
      ? buildVectorBoxes(opList.fnArray, opList.argsArray as unknown[][], ops, width, height, xMin, yMin)
      : undefined;
  const vectorBoxes = flags.vectorBoxes ? allVectorBoxes : undefined;
  // Build layout internally for form-field labels and visual-region table
  // hints, but only expose pages[].layout when --layout is explicitly on.
  const internalLayout =
    flags.layout || flags.visualRegions || flags.formFields
      ? buildLayout(spans, round2(width), round2(height))
      : undefined;
  const layout = flags.layout ? internalLayout : undefined;
  const needsAnnotations =
    flags.formFields || flags.links || flags.annotations || flags.visualRegions || flags.annotationAppearanceHints;
  const annotations = needsAnnotations ? await page.getAnnotations({ intent: 'display' }) : undefined;
  const visibleAnnotationAppearance = annotations ? hasVisibleAnnotationAppearance(annotations) : false;
  const allFormFields =
    flags.formFields || flags.visualRegions
      ? buildFormFields(
          annotations ?? [],
          height,
          xMin,
          yMin,
          flags.formFields || flags.visualRegions
            ? [
                ...(internalLayout?.blocks.flatMap((block) =>
                  (block.lines.length > 0 ? block.lines : [block]).map((item) => ({
                    text: item.text,
                    x: item.x,
                    y: item.y,
                    width: item.width,
                    height: item.height,
                    ...('fontSize' in item && item.fontSize !== undefined && { fontSize: item.fontSize }),
                  })),
                ) ?? []),
                ...spans.map((span) => ({
                  text: span.text,
                  x: span.x,
                  y: span.y,
                  width: span.width,
                  height: span.height,
                  fontSize: span.fontSize,
                })),
              ]
            : [],
        )
      : undefined;
  const formFields = flags.formFields ? allFormFields : undefined;
  const links = flags.links
    ? await buildLinks(annotations ?? [], height, xMin, yMin, {
        resolveDestinationPage: (target) => resolveDestinationPage(doc, target),
      })
    : undefined;
  const allPageAnnotations =
    flags.annotations || flags.visualRegions
      ? buildAnnotations(annotations ?? [], height, xMin, yMin, {
          normalizeText: flags.normalize ? normalizeText : undefined,
        })
      : undefined;
  const pageAnnotations = flags.annotations ? allPageAnnotations : undefined;
  const structure = flags.structure
    ? buildPageStructure(await page.getStructTree(), {
        normalizeText: flags.normalize ? normalizeText : undefined,
      })
    : undefined;
  const jsActions = flags.viewer
    ? normalizeJavaScriptActions(await page.getJSActions(), {
        normalizeText: flags.normalize ? normalizeText : undefined,
      })
    : undefined;

  const pageArea = width * height;
  const rawCoverage = pageArea > 0 ? textArea / pageArea : 0;
  const textCoverage = Math.max(0, Math.min(1, rawCoverage));
  const rasterBackedTextLayer = isRasterBackedTextLayer({
    imageCount,
    vectorCount,
    textCoverage,
    charCount: text.length,
    imageBoxes: allBoxes,
    pageWidth: width,
    pageHeight: height,
  });

  const visualRegionInput = flags.visualRegions
    ? {
        pageWidth: round2(width),
        pageHeight: round2(height),
        imageBoxes: allBoxes,
        vectorBoxes: allVectorBoxes,
        layout: internalLayout,
        formFields: allFormFields,
        annotations: allPageAnnotations,
      }
    : undefined;

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
    _warningImageBoxes: allBoxes,
    ...(vectorBoxes !== undefined && { vectorBoxes }),
    ...(visualRegionInput !== undefined && { _visualRegionInput: visualRegionInput }),
    ...(visibleAnnotationAppearance && { hasVisibleAnnotationAppearance: true }),
    ...(formFields !== undefined && { formFields }),
    ...(links !== undefined && { links }),
    ...(pageAnnotations !== undefined && { annotations: pageAnnotations }),
    ...(structure !== undefined && { structure }),
    ...(jsActions !== undefined && { jsActions }),
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

function areUsableVisualRegionImages(result: DocumentResult): boolean {
  return result.pages.every((page) => (page.visualRegions ?? []).every((region) => isUsableImage(region.image)));
}

function areUsableAttachments(attachments: DocumentAttachment[] | undefined, outputDir: string | undefined): boolean {
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
function dropCachedSafe(cacheDir: string, cacheKey: string): void {
  try {
    dropCached(cacheDir, cacheKey);
  } catch {
    // Best-effort: leave the entry in place and fall through to fresh extraction.
  }
}

function fingerprintData(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex').slice(0, 16);
}

/** Bytes scanned at the end of the file for the `%%EOF` marker. The PDF
 *  spec requires the trailer within the last 1024 bytes; doubled for
 *  slack (trailing whitespace, sloppy producers). */
const EOF_SCAN_WINDOW_BYTES = 2048;

/**
 * When pdf.js fails to parse a document, check whether the underlying
 * bytes even end in a `%%EOF` trailer. A missing trailer almost always
 * means the file is truncated (an interrupted download is the common
 * case — observed with a 128KB partial of the 1.6MB NIST SP 800-63-3),
 * and pdf.js's own message for that ("Invalid Root reference") gives a
 * caller no way to tell a broken PDF from a broken download. The probe
 * is best-effort: any inspection failure returns the original error.
 */
function withTruncationHint(error: unknown, pdfData: Uint8Array | undefined, filePath: string): unknown {
  if (!(error instanceof Error)) return error;
  let tail: Uint8Array;
  try {
    if (pdfData) {
      tail = pdfData.subarray(Math.max(0, pdfData.length - EOF_SCAN_WINDOW_BYTES));
    } else {
      const fd = openSync(filePath, 'r');
      try {
        const size = fstatSync(fd).size;
        const length = Math.min(EOF_SCAN_WINDOW_BYTES, size);
        const buffer = Buffer.alloc(length);
        readSync(fd, buffer, 0, length, size - length);
        tail = buffer;
      } finally {
        closeSync(fd);
      }
    }
  } catch {
    return error;
  }
  if (Buffer.from(tail).includes('%%EOF')) return error;
  error.message +=
    ' (no %%EOF trailer in the final bytes — the file is likely truncated, e.g. an incomplete download; re-download it and compare byte sizes before retrying)';
  return error;
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
  const { sourceData, ...cacheRelevantOptions } = options;
  const pdfData = sourceData ? new Uint8Array(sourceData) : undefined;
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
  const renderVisualRegions = !!options.renderVisualRegions;
  const wantsVisualRegions = !!options.visualRegions || renderVisualRegions;
  // Compute the per-PDF fingerprint up front when any code path below
  // needs it (caching, or render output isolation). Hashing the file is
  // the most expensive sync step in this function, so do it once and
  // share — the cache layer accepts a precomputed fingerprint to avoid
  // re-reading the same file.
  const needFingerprint =
    !options.noCache ||
    !!(options.render && options.renderOutput) ||
    !!(renderVisualRegions && options.renderOutput) ||
    !!(options.attachments && options.attachmentOutput);
  const fingerprint = needFingerprint ? (pdfData ? fingerprintData(pdfData) : pdfFingerprint(filePath)) : null;
  const cacheDir = options.noCache ? null : getCacheDir(filePath, fingerprint ?? undefined);
  const attachmentOutputDir =
    options.attachments && options.attachmentOutput
      ? join(resolve(options.attachmentOutput), fingerprint as string)
      : undefined;

  const cacheKey = buildCacheKey({ ...cacheRelevantOptions, renderScale, renderRegion });
  if (cacheDir) {
    const cached = getCached(cacheDir, cacheKey);
    if (cached) {
      try {
        const result = JSON.parse(cached) as DocumentResult;
        // For --render, ensure each referenced PNG is a regular non-empty
        // file (not a symlink, not a partial write left from a crash).
        const imagesUsable =
          (!options.render || result.pages.every((p) => isUsableImage(p.image))) &&
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
  const pathFillOps = new Set<number>([
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
  const docOptions: Record<string, unknown> = pdfData ? { data: pdfData } : { url: filePath };
  if (options.password !== undefined) {
    docOptions.password = options.password;
  }
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
  const loadingTask = getDocument(docOptions);
  let doc: PDFDocumentProxy;
  try {
    doc = await loadingTask.promise;
  } catch (error) {
    try {
      await loadingTask.destroy();
    } catch {
      // Preserve the original parse failure; cleanup here is best-effort.
    }
    throw withTruncationHint(error, pdfData, filePath);
  }
  const pdfJsWarnings: string[] = [];
  const restorePdfJsWarningCapture = capturePdfJsWarnings(pdfJsWarnings);
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
    // Bounds are checked against the MediaBox coordinate system exposed
    // by spans / imageBoxes / layout.blocks. The renderer maps that
    // region through pdf.js's viewport, so rotated pages still crop the
    // human-visible rotated page while callers keep one coordinate system.
    if (renderRegion && (options.render || options.ocr)) {
      const probePage = await doc.getPage(pageNumbers[0]);
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
    const rawPageLabels = options.pageLabels ? await doc.getPageLabels() : undefined;
    const pageLabels =
      rawPageLabels === undefined
        ? undefined
        : (rawPageLabels ?? []).map((label) => (options.normalize !== false ? normalizeText(label) : label));
    const attachments: DocumentAttachment[] | undefined = options.attachments
      ? buildAttachments(await doc.getAttachments(), {
          normalizeText: options.normalize !== false ? normalizeText : undefined,
          outputDir: attachmentOutputDir,
        })
      : undefined;
    const outline: DocumentOutlineItem[] | undefined = options.outline
      ? await buildOutline(await doc.getOutline(), doc, {
          normalizeText: options.normalize !== false ? normalizeText : undefined,
        })
      : undefined;
    const viewer: DocumentViewerState | undefined = options.viewer
      ? await buildViewerState(doc, {
          normalizeText: options.normalize !== false ? normalizeText : undefined,
        })
      : undefined;
    const layers: DocumentLayers | undefined = options.layers
      ? await buildLayers(doc, {
          normalizeText: options.normalize !== false ? normalizeText : undefined,
        })
      : undefined;

    let imagePaths: string[] | null = null;
    // Parallel array to imagePaths: renderContentRatio for each rendered
    // page (or undefined slots when --render is off). Surfaced on the
    // PageResult so an agent can spot blank-rendered pages directly from
    // the structured output instead of inferring from "OCR confidence 0".
    let renderRatios: (number | undefined)[] = [];
    const imagesDir =
      options.render || renderVisualRegions
        ? prepareRenderImagesDir({
            renderOutput: options.renderOutput,
            cacheDir,
            fingerprint,
            renderScale,
          })
        : null;
    if (options.render) {
      // renderer pulls in @napi-rs/canvas (native binding); only load it
      // when --render is requested.
      const { renderPagesWithStats } = await import('./renderer.js');
      const rendered = await renderPagesWithStats(doc, pageNumbers, imagesDir as string, renderScale, renderRegion);
      imagePaths = rendered.map((r) => r.path);
      renderRatios = rendered.map((r) => r.contentRatio);
    }

    const flags: PageFlags = {
      normalize: options.normalize !== false,
      geometry: !!options.geometry,
      layout: !!options.layout,
      imageBoxes: !!options.imageBoxes,
      vectorBoxes: !!options.vectorBoxes,
      visualRegions: wantsVisualRegions,
      formFields: !!options.formFields,
      links: !!options.links,
      annotations: !!options.annotations,
      annotationAppearanceHints: !!options.render || !!options.ocr,
      structure: !!options.structure,
      viewer: !!options.viewer,
      // Search needs span-level bbox to populate `matches[*].bbox`;
      // build spans internally even if the caller didn't ask for the
      // full `pages[].spans` payload via --geometry.
      needSpansForSearch: compiledSearch !== undefined,
    };
    const ocrEnabled = !!options.ocr;
    const ocrLang = options.ocrLang ?? 'eng';
    const rasterBackedTextLayerByPage = new Map<number, boolean>();
    const warningImageBoxesByPage = new Map<number, ImageBox[]>();
    const visualRegionInputsByPage = new Map<number, BuildVisualRegionsInput>();
    const annotationAppearanceByPage = new Map<number, boolean>();
    const imageOps: ImageOps = {
      save: OPS.save,
      restore: OPS.restore,
      transform: OPS.transform,
      formBegin: OPS.paintFormXObjectBegin,
      formEnd: OPS.paintFormXObjectEnd,
      setFillColorN: OPS.setFillColorN,
      fillColorOps: new Set<number>([
        OPS.setFillColor,
        OPS.setFillColorN,
        OPS.setFillRGBColor,
        OPS.setFillCMYKColor,
        OPS.setFillColorSpace,
      ]),
      singleImageOps,
      constructPath: OPS.constructPath,
      pathPaintOps,
      pathFillOps,
      vectorPaintOps,
      shadingFill: OPS.shadingFill,
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
      warningImageBoxesByPage.set(pageNum, data._warningImageBoxes ?? []);
      if (data._visualRegionInput) visualRegionInputsByPage.set(pageNum, data._visualRegionInput);
      if (data.hasVisibleAnnotationAppearance) annotationAppearanceByPage.set(pageNum, true);
      const renderRatio = renderRatios[i];
      const page: PageResult = {
        page: pageNum,
        ...(pageLabels?.[pageNum - 1] !== undefined && { pageLabel: pageLabels[pageNum - 1] }),
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
        ...(data.vectorBoxes !== undefined && { vectorBoxes: data.vectorBoxes }),
        ...(data.formFields !== undefined && { formFields: data.formFields }),
        ...(data.links !== undefined && { links: data.links }),
        ...(data.annotations !== undefined && { annotations: data.annotations }),
        ...(data.structure !== undefined && { structure: data.structure }),
        ...(data.jsActions !== undefined && { jsActions: data.jsActions }),
        // Initial classification using whatever signals we have so far.
        // OCR may attach a renderContentRatio below; the post-OCR pass
        // overwrites this with the final classification.
        quality: { nativeTextStatus: 'empty' },
      };
      page.quality = derivePageQuality(page, {
        hasVisibleAnnotationAppearance: annotationAppearanceByPage.get(pageNum) ?? false,
      });
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
    // body. Run it on public layout when --layout is on and on the
    // internal layout used by visualRegions otherwise, so
    // caption association can suppress repeated header/footer text
    // without exposing pages[].layout.
    if (flags.layout || flags.visualRegions) {
      const pagesForRepeated = pages.map((page) => {
        const layout = page.layout ?? visualRegionInputsByPage.get(page.page)?.layout;
        return layout ? { ...page, layout } : page;
      });
      markRepeatedBlocks(pagesForRepeated);
    }

    if (flags.visualRegions) {
      for (const page of pages) {
        const input = visualRegionInputsByPage.get(page.page);
        page.visualRegions = input
          ? buildVisualRegions({ ...input, visualStatus: page.quality.visualStatus }).map((region, index) => ({
              ...region,
              id: `p${page.page}-vr${index}`,
            }))
          : [];
      }
    }

    if (renderVisualRegions) {
      const jobs = pages.flatMap((page) => (page.visualRegions ?? []).map((region) => ({ page, region })));
      if (jobs.length > 0) {
        const { renderPageWithStats } = await import('./renderer.js');
        await runParallel(jobs, async ({ page, region }) => {
          const rendered = await renderPageWithStats(doc, page.page, imagesDir as string, renderScale, region);
          region.image = rendered.path;
          region.renderContentRatio = rendered.contentRatio;
        });
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
    // path's renderContentRatio participates in visual-status decisions.
    for (const p of pages) {
      p.quality = derivePageQuality(p, {
        hasVisibleAnnotationAppearance: annotationAppearanceByPage.get(p.page) ?? false,
      });
    }

    // Warning detection runs after `markRepeatedBlocks` so geometry
    // rules can route on `block.repeated`, and after OCR/quality so
    // OCR-confidence rules see the final page signals. Empty arrays are
    // omitted to keep the common "no warnings" page from carrying an
    // empty field in JSON.
    //
    // `chromeDetectionReliable` tells the detector whether the upstream
    // cross-page pass had enough material to produce meaningful `repeated`
    // flags. On a single-page extraction (or one where every page came
    // back with empty layout) every block stays unflagged-as-chrome, so
    // rules that distinguish body from chrome on the `repeated` axis
    // (`near_bottom_edge`) would mis-fire on what's really a running footer.
    const pagesWithLayout = pages.filter((p) => p.layout && p.layout.blocks.length > 0).length;
    const chromeDetectionReliable = pagesWithLayout >= 2;
    for (const p of pages) {
      const warnings = detectPageWarnings(p, {
        chromeDetectionReliable,
        rasterBackedTextLayer: rasterBackedTextLayerByPage.get(p.page),
        imageBoxes: warningImageBoxesByPage.get(p.page),
        pdfJsWarnings,
      });
      if (warnings.length > 0) p.warnings = warnings;
      else delete p.warnings;
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
        p.matches = (p.matches ?? []).concat(suppressDuplicateOcrMatches(p.matches, ocrMatches, compiledSearch));
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
            ...(p.pageLabel !== undefined && { pageLabel: p.pageLabel }),
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
            // warnings fired, matching the PageResult.warnings field's
            // optional shape.
            ...(p.warnings && p.warnings.length > 0 && { warningCount: p.warnings.length }),
            // Search hits per page. Present-with-`0` is meaningful
            // ("search ran, no hits on this page"); omitted when
            // `search` wasn't requested at all so the overview stays
            // clean for the default extraction.
            ...(compiledSearch !== undefined && { matchCount: p.matches?.length ?? 0 }),
            ...(p.vectorBoxes !== undefined && { vectorBoxCount: p.vectorBoxes.length }),
            ...(p.visualRegions !== undefined && { visualRegionCount: p.visualRegions.length }),
            ...(p.formFields !== undefined && { formFieldCount: p.formFields.length }),
            ...(p.links !== undefined && { linkCount: p.links.length }),
            ...(p.annotations !== undefined && { annotationCount: p.annotations.length }),
            ...(p.structure !== undefined && { structureNodeCount: countStructureNodes(p.structure) }),
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
      ...(pageLabels !== undefined && { pageLabels }),
      ...(attachments !== undefined && { attachments }),
      ...(outline !== undefined && { outline }),
      ...(viewer !== undefined && { viewer }),
      ...(layers !== undefined && { layers }),
      ...(overview && { overview }),
      pages,
    };

    if (cacheDir) {
      setCache(cacheDir, cacheKey, JSON.stringify(result));
    }

    return result;
  } finally {
    restorePdfJsWarningCapture();
    await loadingTask.destroy();
  }
}

function capturePdfJsWarnings(out: string[]): () => void {
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const msg = args.map(String).join(' ');
    if (msg.startsWith('Warning:')) out.push(msg);
    originalWarn(...args);
  };
  return () => {
    console.warn = originalWarn;
  };
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
    sourceData: options.sourceData,
    password: options.password,
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
    vectorBoxes: options.vectorBoxes,
    visualRegions: options.visualRegions,
    renderVisualRegions: options.renderVisualRegions,
    formFields: options.formFields,
    links: options.links,
    annotations: options.annotations,
    structure: options.structure,
    pageLabels: options.pageLabels,
    attachments: options.attachments,
    attachmentOutput: options.attachmentOutput,
    outline: options.outline,
    viewer: options.viewer,
    layers: options.layers,
    ocr: options.ocr,
    ocrLang: options.ocrLang,
    onWarning: options.onWarning,
  });
  return render(result, options);
}
