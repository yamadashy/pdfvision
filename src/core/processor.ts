import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { formatJson } from '../output/json.js';
import { formatMarkdown } from '../output/markdown.js';
import { formatXml } from '../output/xml.js';
import type {
  DocumentResult,
  ImageBox,
  LayoutBlock,
  LayoutLine,
  PageLayout,
  PageResult,
  ProcessDocumentOptions,
  ProcessOptions,
  TextSpan,
} from '../types/index.js';
import { dropCached, ensurePrivateDir, getCacheDir, getCached, setCache } from './cache.js';
import { parsePageRange } from './pageRange.js';

/** Inputs that determine which cached entry a request maps to. */
interface CacheKeyInput {
  pages?: string;
  render?: boolean;
  renderOutput?: string;
  normalize?: boolean;
  geometry?: boolean;
  layout?: boolean;
  imageBoxes?: boolean;
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
    format: 'structured-v6',
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
 * Join the spans of a single layout line into a readable string. pdfjs
 * emits whitespace as separate items (already filtered) but for CJK it
 * also splits adjacent characters into per-glyph spans. A naive ' '
 * join produces `背景・ 目 的` for what is really `背景・目的`. Use the
 * visual gap between consecutive spans as a proxy: if it's at least a
 * quarter of the font size we treat them as different words and insert
 * a single space, otherwise we concatenate.
 */
function joinLineSpans(xSorted: TextSpan[]): string {
  if (xSorted.length === 0) return '';
  let out = xSorted[0].text;
  for (let i = 1; i < xSorted.length; i++) {
    const prev = xSorted[i - 1];
    const cur = xSorted[i];
    const gap = cur.x - (prev.x + prev.width);
    const threshold = cur.fontSize * 0.25;
    out += gap > threshold ? ` ${cur.text}` : cur.text;
  }
  return out;
}

/** Most common value in `nums` — used for the dominant font size of a line. */
function mode(nums: number[]): number {
  const counts = new Map<number, number>();
  let best = nums[0];
  let bestCount = 0;
  for (const n of nums) {
    const c = (counts.get(n) ?? 0) + 1;
    counts.set(n, c);
    if (c > bestCount) {
      best = n;
      bestCount = c;
    }
  }
  return best;
}

/**
 * Group `spans` into lines (by y proximity) and lines into blocks (by
 * vertical-gap and font-size similarity). Pure function — produces no
 * side effects beyond the returned structure.
 *
 * Heuristics, tuned against the colopl / golf / repomix-OSS fixtures:
 *   - Same line: |y_a - y_b| < 0.5 × span height
 *   - New block: gap > 1.0 × prev line height OR fontSize ratio > 1.3
 * Multi-column reading order is NOT detected here; the block array is in
 * naive top-down order, which matches single-column documents but mis-
 * orders multi-column papers. That is left to a future `--layout=v2`.
 */
function buildLayout(spans: TextSpan[]): PageLayout {
  if (spans.length === 0) return { blocks: [] };

  // Stable sort: primarily by y (top to bottom), then by x within a row.
  const sorted = [...spans].sort((a, b) => a.y - b.y || a.x - b.x);

  // Cluster spans into lines.
  const lineGroups: TextSpan[][] = [];
  for (const s of sorted) {
    const last = lineGroups[lineGroups.length - 1];
    const tolerance = Math.max(s.height, 1) * 0.5;
    if (last && Math.abs(s.y - last[last.length - 1].y) < tolerance) {
      last.push(s);
    } else {
      lineGroups.push([s]);
    }
  }

  const lines: LayoutLine[] = lineGroups.map((group) => {
    const xSorted = [...group].sort((a, b) => a.x - b.x);
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const s of xSorted) {
      if (s.x < minX) minX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.x + s.width > maxX) maxX = s.x + s.width;
      if (s.y + s.height > maxY) maxY = s.y + s.height;
    }
    return {
      text: joinLineSpans(xSorted),
      x: round2(minX),
      y: round2(minY),
      width: round2(maxX - minX),
      height: round2(maxY - minY),
      fontSize: round2(mode(xSorted.map((s) => s.fontSize))),
    };
  });

  // Cluster lines into blocks.
  const blockGroups: LayoutLine[][] = [];
  for (const line of lines) {
    const last = blockGroups[blockGroups.length - 1];
    if (last) {
      const prev = last[last.length - 1];
      const gap = line.y - (prev.y + prev.height);
      const sizeRatio =
        Math.max(line.fontSize, prev.fontSize) / Math.max(Math.min(line.fontSize, prev.fontSize), 0.001);
      if (gap > prev.height * 1.0 || sizeRatio > 1.3) {
        blockGroups.push([line]);
      } else {
        last.push(line);
      }
    } else {
      blockGroups.push([line]);
    }
  }

  const blocks: LayoutBlock[] = blockGroups.map((group) => {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const l of group) {
      if (l.x < minX) minX = l.x;
      if (l.y < minY) minY = l.y;
      if (l.x + l.width > maxX) maxX = l.x + l.width;
      if (l.y + l.height > maxY) maxY = l.y + l.height;
    }
    return {
      text: group.map((l) => l.text).join('\n'),
      x: round2(minX),
      y: round2(minY),
      width: round2(maxX - minX),
      height: round2(maxY - minY),
      lines: group,
    };
  });

  return { blocks };
}

interface PageData {
  text: string;
  rawText?: string;
  charCount: number;
  imageCount: number;
  textCoverage: number;
  width: number;
  height: number;
  spans?: TextSpan[];
  layout?: PageLayout;
  imageBoxes?: ImageBox[];
}

interface PageOps {
  save: number;
  restore: number;
  transform: number;
  imageOps: Set<number>;
}

interface PageFlags {
  normalize: boolean;
  geometry: boolean;
  layout: boolean;
  imageBoxes: boolean;
}

/**
 * Walk the page's operator list with a graphics-state stack, capturing the
 * bbox of every image draw. PDF unit square (0,0)-(1,1) is what each image
 * XObject is drawn into; the current transformation matrix (CTM) maps that
 * square onto the page. Multiplication convention follows pdf.js: each
 * `transform` op right-multiplies its argument into the running CTM.
 */
/**
 * Cross-page pass: flag blocks that look like running headers / footers /
 * page numbers / watermarks. Two blocks across different pages are
 * considered the "same" when their normalized text matches and their top y
 * sits in the same 5-pt bin (page chrome rarely shifts more than that
 * between pages, while body text reflows).
 *
 * A block is marked `repeated: true` when it occurs on at least 2 pages
 * AND on at least half of the pages that have a layout. With the default
 * threshold a 3-page run with the same footer marks all three; a one-off
 * line that happens to coincide with one other page does not.
 *
 * Mutates the layout in place.
 */
function markRepeatedBlocks(pages: PageResult[]): void {
  const pagesWithLayout = pages.filter((p) => p.layout && p.layout.blocks.length > 0);
  if (pagesWithLayout.length < 2) return;

  type BlockRef = { pageIndex: number; blockIndex: number };
  const groups = new Map<string, BlockRef[]>();
  for (let pi = 0; pi < pagesWithLayout.length; pi++) {
    const page = pagesWithLayout[pi];
    const blocks = page.layout?.blocks ?? [];
    for (let bi = 0; bi < blocks.length; bi++) {
      const b = blocks[bi];
      const text = b.text.replace(/\s+/g, ' ').trim();
      if (text.length === 0) continue;
      const key = `${Math.round(b.y / 5) * 5}\t${text}`;
      const list = groups.get(key);
      if (list) list.push({ pageIndex: pi, blockIndex: bi });
      else groups.set(key, [{ pageIndex: pi, blockIndex: bi }]);
    }
  }

  const minOccurrences = Math.max(2, Math.ceil(pagesWithLayout.length / 2));
  for (const refs of groups.values()) {
    if (refs.length < minOccurrences) continue;
    const seenPages = new Set(refs.map((r) => r.pageIndex));
    if (seenPages.size < minOccurrences) continue;
    for (const ref of refs) {
      const block = pagesWithLayout[ref.pageIndex].layout?.blocks[ref.blockIndex];
      if (block) block.repeated = true;
    }
  }
}

function buildImageBoxes(
  fnArray: number[],
  argsArray: unknown[][],
  ops: PageOps,
  pageHeight: number,
  viewMinX: number,
  viewMinY: number,
): ImageBox[] {
  const boxes: ImageBox[] = [];
  let ctm: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
  const stack: (typeof ctm)[] = [];

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    if (fn === ops.save) {
      stack.push([...ctm] as typeof ctm);
    } else if (fn === ops.restore) {
      const popped = stack.pop();
      if (popped) ctm = popped;
    } else if (fn === ops.transform) {
      const m = argsArray[i] as number[];
      // CTM_new = CTM_old × m. The 6-element form encodes
      //   [ a b 0 ]
      //   [ c d 0 ]   (columns: x', y', 1)
      //   [ e f 1 ]
      const a = ctm[0] * m[0] + ctm[2] * m[1];
      const b = ctm[1] * m[0] + ctm[3] * m[1];
      const c = ctm[0] * m[2] + ctm[2] * m[3];
      const d = ctm[1] * m[2] + ctm[3] * m[3];
      const e = ctm[0] * m[4] + ctm[2] * m[5] + ctm[4];
      const f = ctm[1] * m[4] + ctm[3] * m[5] + ctm[5];
      ctm = [a, b, c, d, e, f];
    } else if (ops.imageOps.has(fn)) {
      const [a, b, c, d, e, f] = ctm;
      // Four corners of the unit square under CTM.
      const xs = [e, a + e, c + e, a + c + e];
      const ys = [f, b + f, d + f, b + d + f];
      const xMinPdf = Math.min(...xs);
      const xMaxPdf = Math.max(...xs);
      const yMinPdf = Math.min(...ys);
      const yMaxPdf = Math.max(...ys);
      // Convert PDF (origin bottom-left) → top-down (origin top-left).
      boxes.push({
        x: round2(xMinPdf - viewMinX),
        y: round2(pageHeight - (yMaxPdf - viewMinY)),
        width: round2(xMaxPdf - xMinPdf),
        height: round2(yMaxPdf - yMinPdf),
      });
    }
  }
  return boxes;
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
  ops: PageOps,
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

  const parts: string[] = [];
  let textArea = 0;
  const spans: TextSpan[] = [];
  for (const item of content.items) {
    if (!('str' in item)) continue;
    parts.push(item.str);
    if (item.hasEOL) parts.push('\n');
    const w = typeof item.width === 'number' ? item.width : 0;
    // pdfjs reports item.height as 0 for many PDFs (e.g. those produced by
    // certain Office exporters); fall back to the vertical scale from the
    // text matrix, which is effectively the glyph height in user units.
    const reportedH = typeof item.height === 'number' ? item.height : 0;
    const transform = item.transform;
    const h = reportedH > 0 ? reportedH : Math.abs(transform?.[3] ?? 0);
    textArea += Math.abs(w * h);

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
  const rawText = parts.join('').trimEnd();
  // charCount must reflect the string the caller actually receives, so
  // measure after normalization.
  const text = flags.normalize ? normalizeText(rawText) : rawText;
  // Only surface rawText when normalization actually changed the string —
  // exposing it unconditionally would double JSON size for the common
  // case of already-canonical PDFs.
  const preservedRaw = flags.normalize && rawText !== text ? rawText : undefined;

  const opList = await page.getOperatorList();
  let imageCount = 0;
  for (const fn of opList.fnArray) {
    if (ops.imageOps.has(fn)) imageCount++;
  }
  const imageBoxes = flags.imageBoxes
    ? buildImageBoxes(opList.fnArray, opList.argsArray as unknown[][], ops, height, view[0], yMin)
    : undefined;

  const pageArea = width * height;
  const rawCoverage = pageArea > 0 ? textArea / pageArea : 0;
  const textCoverage = Math.max(0, Math.min(1, rawCoverage));

  // Build layout last so it always sees the final span list (post normalize).
  const layout = flags.layout ? buildLayout(spans) : undefined;

  return {
    text,
    rawText: preservedRaw,
    charCount: text.length,
    imageCount,
    textCoverage: Math.round(textCoverage * 1000) / 1000,
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

    const flags: PageFlags = {
      normalize: options.normalize !== false,
      geometry: !!options.geometry,
      layout: !!options.layout,
      imageBoxes: !!options.imageBoxes,
    };
    const pageOps: PageOps = {
      save: OPS.save,
      restore: OPS.restore,
      transform: OPS.transform,
      imageOps,
    };
    const pages: PageResult[] = [];
    for (let i = 0; i < pageNumbers.length; i++) {
      const data = await extractPageData(doc, pageNumbers[i], pageOps, flags);
      pages.push({
        page: pageNumbers[i],
        text: data.text,
        ...(data.rawText !== undefined && { rawText: data.rawText }),
        image: imagePaths?.[i],
        charCount: data.charCount,
        imageCount: data.imageCount,
        textCoverage: data.textCoverage,
        width: data.width,
        height: data.height,
        ...(data.spans !== undefined && { spans: data.spans }),
        ...(data.layout !== undefined && { layout: data.layout }),
        ...(data.imageBoxes !== undefined && { imageBoxes: data.imageBoxes }),
      });
    }

    // Repeated-chrome detection has to wait until every selected page is
    // populated, since a single page can't tell its own chrome from its
    // body. Skipped when --layout was off (nothing to flag).
    if (flags.layout) markRepeatedBlocks(pages);

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
  });
  return render(result, options.format);
}
