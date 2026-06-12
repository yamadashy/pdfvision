import type { LayoutBlock, LayoutLine, PageResult, PageWarning } from '../types/index.js';
import { detectTextOverlap, horizontalOverlap } from './warningTextOverlap.js';

/** Context flags the orchestrator passes to the detector so the
 *  rules can route on facts that the page alone doesn't know. */
export interface PageWarningContext {
  /** True when the cross-page repeated-chrome pass had enough pages
   *  (≥ 2 with layout) to produce meaningful `block.repeated` flags.
   *  Defaults to `true` so unit tests that hand-build pages with
   *  explicit `repeated: true` flags don't have to thread the field
   *  through their helpers. */
  chromeDetectionReliable?: boolean;
  /** True when a full-page raster scan backs a dense text layer. In
   *  that case layout bboxes describe hidden OCR text, not the pixels a
   *  human sees, so geometry-driven warnings are more noise than signal. */
  rasterBackedTextLayer?: boolean;
}

/**
 * Detect geometry-driven layout anomalies on a single page.
 *
 * Runs after `markRepeatedBlocks` so the cross-page chrome detection
 * has already flagged running headers / footers / page numbers — body
 * vs chrome distinctions are routed through `block.repeated`. All
 * rules are pure functions of `page.layout` (+ `page.width`,
 * `page.height`), so the detector can be tested without a real PDF.
 *
 * The rule catalog is intentionally narrow for v1 — the goal is to
 * catch the high-signal cases (the colopl page-13 footer-overlap kind
 * of thing) without firing on every benign layout. New rules should
 * cite a real-world failure mode before being added.
 *
 * Returns an empty array (rather than `undefined`) so callers can
 * uniformly `for (...)` over it. `processor.ts` is responsible for
 * omitting the field from the public output when the array is empty.
 */
export function detectPageWarnings(page: PageResult, context: PageWarningContext = {}): PageWarning[] {
  const warnings: PageWarning[] = [];

  detectLocalizedGlyphNoise(page, warnings);
  detectRasterBackedTextLayer(page, context, warnings);
  detectLowConfidenceOcr(page, context, warnings);
  detectDenseVectorGraphics(page, warnings);
  detectLargeRasterLowTextOverlap(page, warnings);

  if (!page.layout || page.layout.blocks.length === 0 || context.rasterBackedTextLayer) {
    sortWarnings(warnings);
    return warnings;
  }
  const blocks = page.layout.blocks;
  // Default true: keep the unit tests' hand-built pages (which set
  // `repeated: true` directly on blocks) free to exercise rules
  // without threading the context through every helper.
  const chromeDetectionReliable = context.chromeDetectionReliable !== false;

  detectOffPage(blocks, page.width, page.height, warnings);
  detectTextOverlap(blocks, warnings);
  detectTabularNumericLayout(blocks, warnings);
  // `near_bottom_edge` only distinguishes body from chrome via the
  // `repeated` flag, which is meaningless when chrome detection
  // didn't run reliably (single-page extraction, or every layout
  // page deselected). Suppress to avoid false positives where a
  // running footer reads as "body crowded against the bottom".
  if (chromeDetectionReliable) {
    detectNearBottomEdge(blocks, page.height, warnings);
  }
  detectBodyNearRepeatedChrome(blocks, warnings);

  sortWarnings(warnings);
  return warnings;
}

const LOCALIZED_GLYPH_NOISE_RATIO_THRESHOLD = 0.05;
const LOCALIZED_GLYPH_NOISE_COUNT_THRESHOLD = 2;
const REPLACEMENT_CHARACTER = '\uFFFD';
const CJK_MOJIBAKE_MIN_CJK_COUNT = 50;
const CJK_MOJIBAKE_COUNT_THRESHOLD = 5;
const CJK_MOJIBAKE_RATIO_THRESHOLD = 0.05;
const DENSE_VECTOR_GRAPHICS_COUNT_THRESHOLD = 250;
const LARGE_RASTER_AREA_RATIO_THRESHOLD = 0.2;
const LARGE_RASTER_TEXT_OVERLAP_RATIO_THRESHOLD = 0.01;
const LOW_CONFIDENCE_OCR_THRESHOLD = 0.5;
const TABULAR_NUMERIC_MIN_LINES = 12;
const TABULAR_NUMERIC_MIN_LINE_RATIO = 0.25;
const TABULAR_NUMERIC_MIN_ALIGNED_COLUMNS = 2;
const TABULAR_NUMERIC_MIN_LINES_PER_COLUMN = 3;
const TABULAR_NUMERIC_COLUMN_TOLERANCE_PT = 10;
const TABULAR_NUMERIC_ROW_TOLERANCE_PT = 4;
const TABULAR_NUMERIC_MIN_SHARED_ROWS = 3;
const TABULAR_NUMERIC_ROW_CADENCE_MIN_MATCH_RATIO = 0.65;
const TABULAR_NUMERIC_ROW_CADENCE_TOLERANCE_RATIO = 0.25;
const TABULAR_NUMERIC_ROW_CADENCE_MIN_TOLERANCE_PT = 2;
const TABULAR_NUMERIC_RECURRING_COLUMN_MIN_ROWS = 4;
const TABULAR_NUMERIC_RECURRING_COLUMN_MIN_COLUMNS = 3;
const TABULAR_NUMERIC_RECURRING_COLUMN_MIN_ROW_RATIO = 0.6;

function sortWarnings(warnings: PageWarning[]): void {
  // Stable sort by (severity error first, then code, then blockIndex)
  // so the rendered output is deterministic across runs and easy to
  // diff in tests / golden files.
  warnings.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    const ai = a.blockIndex ?? -1;
    const bi = b.blockIndex ?? -1;
    if (ai !== bi) return ai - bi;
    const aImage = a.imageBoxIndex ?? -1;
    const bImage = b.imageBoxIndex ?? -1;
    return aImage - bImage;
  });
}

function detectLocalizedGlyphNoise(page: PageResult, out: PageWarning[]): void {
  const replacementCount = countReplacementCharacters(page.text);
  if (
    replacementCount > 0 &&
    page.quality.nativeTextStatus !== 'mixed_glyph_indices' &&
    page.quality.nativeTextStatus !== 'unusable_glyph_indices'
  ) {
    out.push({
      code: 'localized_glyph_noise',
      severity: 'warning',
      message: `native text contains ${replacementCount} Unicode replacement character${replacementCount === 1 ? '' : 's'} (U+FFFD) — at least one visible glyph could not be decoded; inspect the render if exact symbols or punctuation matter`,
    });
  }

  if (
    page.nonPrintableCount >= LOCALIZED_GLYPH_NOISE_COUNT_THRESHOLD &&
    page.nonPrintableRatio < LOCALIZED_GLYPH_NOISE_RATIO_THRESHOLD
  ) {
    out.push({
      code: 'localized_glyph_noise',
      severity: 'warning',
      message: `native text contains ${page.nonPrintableCount} non-printable code points below the glyph-garbage ratio threshold — likely localized glyph noise such as formulas, bullets, or symbols; inspect the render if exact text matters`,
    });
  }

  const cjkMojibake = detectCjkMojibakeGlyphNoise(page.text);
  if (cjkMojibake) {
    out.push({
      code: 'localized_glyph_noise',
      severity: 'warning',
      message: `native text contains ${cjkMojibake.count} isolated Latin-extended glyphs inside CJK text (e.g. ${cjkMojibake.samples.map((s) => JSON.stringify(s)).join(', ')}) — likely localized character-map noise such as leader dots or symbols; inspect the render if exact text matters`,
    });
  }
}

function countReplacementCharacters(text: string): number {
  let count = 0;
  for (const ch of text) {
    if (ch === REPLACEMENT_CHARACTER) count++;
  }
  return count;
}

function detectCjkMojibakeGlyphNoise(text: string): { count: number; samples: string[] } | undefined {
  const chars = Array.from(text);
  const cjkCount = chars.filter(isCjkTextChar).length;
  if (cjkCount < CJK_MOJIBAKE_MIN_CJK_COUNT) return undefined;

  const suspicious: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (!isLatinExtendedChar(ch)) continue;
    if (isLatinTextChar(chars[i - 1]) || isLatinTextChar(chars[i + 1])) continue;
    suspicious.push(ch);
  }
  const ratio = chars.length > 0 ? suspicious.length / chars.length : 0;
  if (suspicious.length < CJK_MOJIBAKE_COUNT_THRESHOLD) return undefined;
  if (ratio >= CJK_MOJIBAKE_RATIO_THRESHOLD) return undefined;
  return { count: suspicious.length, samples: [...new Set(suspicious)].slice(0, 3) };
}

function isCjkTextChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(ch);
}

function isLatinTextChar(ch: string | undefined): boolean {
  return ch !== undefined && /\p{Script=Latin}/u.test(ch);
}

function isLatinExtendedChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\u0100-\u024f\u1e00-\u1eff]/u.test(ch);
}

function detectRasterBackedTextLayer(page: PageResult, context: PageWarningContext, out: PageWarning[]): void {
  if (!context.rasterBackedTextLayer) return;
  out.push({
    code: 'raster_backed_text_layer',
    severity: 'warning',
    message: `native text appears to be an OCR/text layer over a full-page raster image (textCoverage ${(page.textCoverage * 100).toFixed(1)}%, imageCount ${page.imageCount}) — text may be useful, but may contain OCR recognition errors, and bboxes/layout can drift from the pixels a human sees`,
  });
}

function detectLowConfidenceOcr(page: PageResult, context: PageWarningContext, out: PageWarning[]): void {
  if (!page.ocr) return;
  if (page.ocr.confidence >= LOW_CONFIDENCE_OCR_THRESHOLD) return;
  if (page.quality.visualStatus === 'blank') return;
  const nativeNeedsOcr = nativeExtractionNeedsOcr(page.quality.nativeTextStatus);
  if (!nativeNeedsOcr && !context.rasterBackedTextLayer) return;

  const nativeContext = nativeNeedsOcr
    ? `while native text is ${page.quality.nativeTextStatus}`
    : 'on a raster-backed text layer';

  out.push({
    code: 'ocr_low_confidence',
    severity: 'warning',
    message: `OCR confidence is ${(page.ocr.confidence * 100).toFixed(1)}% ${nativeContext} — compare against the render before trusting recognized text or form labels`,
  });
}

function nativeExtractionNeedsOcr(status: PageResult['quality']['nativeTextStatus']): boolean {
  return (
    status === 'empty_but_visual_content' ||
    status === 'sparse_text_with_visual_content' ||
    status === 'mixed_glyph_indices' ||
    status === 'unusable_glyph_indices'
  );
}

function detectDenseVectorGraphics(page: PageResult, out: PageWarning[]): void {
  if (page.vectorCount < DENSE_VECTOR_GRAPHICS_COUNT_THRESHOLD) return;
  out.push({
    code: 'dense_vector_graphics',
    severity: 'warning',
    message: `page contains ${page.vectorCount} vector drawing operations — form fields, table rules, chart paths, or diagrams may not be represented in native text; inspect the render if visual structure matters`,
  });
}

function detectLargeRasterLowTextOverlap(page: PageResult, out: PageWarning[]): void {
  if (!page.imageBoxes || page.imageBoxes.length === 0) return;
  if (!canCompareNativeTextAgainstRaster(page.quality.nativeTextStatus)) return;
  const pageArea = page.width * page.height;
  if (pageArea <= 0) return;

  const textBoxes = page.layout?.blocks ?? page.spans ?? [];
  if (textBoxes.length === 0) return;
  const warnedImages: BoxLike[] = [];
  for (let i = 0; i < page.imageBoxes.length; i++) {
    const image = page.imageBoxes[i];
    if (warnedImages.some((warned) => overlapRatio(image, warned) >= 0.95)) continue;
    const imageArea = clippedArea(image, { x: 0, y: 0, width: page.width, height: page.height });
    const imageAreaRatio = imageArea / pageArea;
    if (imageAreaRatio < LARGE_RASTER_AREA_RATIO_THRESHOLD) continue;

    const textOverlap = textBoxes.reduce((sum, box) => sum + clippedArea(box, image), 0);
    const textOverlapRatio = imageArea > 0 ? textOverlap / imageArea : 0;
    if (textOverlapRatio >= LARGE_RASTER_TEXT_OVERLAP_RATIO_THRESHOLD) continue;

    out.push({
      code: 'large_raster_low_text_overlap',
      severity: 'warning',
      message: `large raster image covers ${(imageAreaRatio * 100).toFixed(1)}% of the page with little native-text overlap (${(textOverlapRatio * 100).toFixed(2)}%) — labels, chart text, or map text inside the image will not appear in native text`,
      imageBoxIndex: i,
    });
    warnedImages.push(image);
  }
}

function detectTabularNumericLayout(blocks: LayoutBlock[], out: PageWarning[]): void {
  const allLines = blocks.flatMap((block) => block.lines);
  if (allLines.length === 0) return;

  const numericLines = allLines.filter(isTabularNumericLine);
  if (numericLines.length < TABULAR_NUMERIC_MIN_LINES) return;
  if (numericLines.length / allLines.length < TABULAR_NUMERIC_MIN_LINE_RATIO) return;

  const alignedColumns = clusterNumericLines(numericLines).filter(
    (cluster) => cluster.lines.length >= TABULAR_NUMERIC_MIN_LINES_PER_COLUMN,
  );
  if (alignedColumns.length < TABULAR_NUMERIC_MIN_ALIGNED_COLUMNS) return;
  const sharedRowCenters = sharedNumericRowCenters(alignedColumns);
  const sharedRows = sharedRowCenters.length;
  if (sharedRows < TABULAR_NUMERIC_MIN_SHARED_ROWS) return;
  if (
    !hasRegularNumericRowCadence(sharedRowCenters) &&
    !hasRecurringNumericColumns(allLines, alignedColumns, sharedRows)
  ) {
    return;
  }

  out.push({
    code: 'tabular_numeric_layout',
    severity: 'warning',
    message: `page contains ${numericLines.length} short numeric lines in ${alignedColumns.length} aligned columns and ${sharedRows} shared numeric rows — table rows/columns may be flattened in native text; inspect the render or geometry when values matter`,
  });
}

function hasRegularNumericRowCadence(rowCenters: number[]): boolean {
  const sortedCenters = [...rowCenters].sort((a, b) => a - b);
  const gaps = sortedCenters
    .slice(1)
    .map((center, index) => center - sortedCenters[index])
    .filter((gap) => gap > 0.5);
  if (gaps.length < 2) return true;

  const median = medianNumber(gaps);
  const tolerance = Math.max(
    TABULAR_NUMERIC_ROW_CADENCE_MIN_TOLERANCE_PT,
    median * TABULAR_NUMERIC_ROW_CADENCE_TOLERANCE_RATIO,
  );
  const matchRatio = gaps.filter((gap) => Math.abs(gap - median) <= tolerance).length / gaps.length;
  return matchRatio >= TABULAR_NUMERIC_ROW_CADENCE_MIN_MATCH_RATIO;
}

function medianNumber(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function hasRecurringNumericColumns(
  lines: LayoutLine[],
  columns: { right: number; lines: LayoutLine[] }[],
  sharedRows: number,
): boolean {
  const minRows = Math.max(
    TABULAR_NUMERIC_RECURRING_COLUMN_MIN_ROWS,
    Math.ceil(sharedRows * TABULAR_NUMERIC_RECURRING_COLUMN_MIN_ROW_RATIO),
  );
  if (tableRowsWithLabels(lines) < minRows) return false;
  return (
    columns.filter((column) => distinctRowCenters(column.lines).length >= minRows).length >=
    TABULAR_NUMERIC_RECURRING_COLUMN_MIN_COLUMNS
  );
}

function tableRowsWithLabels(lines: LayoutLine[]): number {
  return groupWarningTableRows(lines).filter(
    (row) =>
      row.length >= 3 &&
      row.filter(isTabularNumericLine).length >= TABULAR_NUMERIC_MIN_ALIGNED_COLUMNS &&
      row.some((line) => !isTabularNumericLine(line) && /[\p{L}]/u.test(line.text)),
  ).length;
}

function groupWarningTableRows(lines: LayoutLine[]): LayoutLine[][] {
  const rows: LayoutLine[][] = [];
  for (const line of [...lines].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find((candidate) => canShareWarningTableRow(line, candidate[0]));
    if (row) row.push(line);
    else rows.push([line]);
  }
  return rows;
}

function canShareWarningTableRow(a: LayoutLine, b: LayoutLine): boolean {
  const minHeight = Math.max(Math.min(a.height, b.height), 1);
  if (Math.abs(a.y - b.y) < minHeight * 0.5) return true;
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlap >= minHeight * 0.35;
}

function distinctRowCenters(lines: LayoutLine[]): number[] {
  const centers: number[] = [];
  for (const line of lines) {
    const center = line.y + line.height / 2;
    if (!centers.some((existing) => Math.abs(existing - center) <= TABULAR_NUMERIC_ROW_TOLERANCE_PT)) {
      centers.push(center);
    }
  }
  return centers;
}

function isTabularNumericLine(line: LayoutLine): boolean {
  const text = line.text.trim();
  if (text.length === 0 || text.length > 80) return false;
  if (!/\d/u.test(text)) return false;
  const nonNumeric = text.replace(/[0-9.,()%$¥€£+\-\s]/gu, '');
  return nonNumeric.length === 0;
}

function clusterNumericLines(lines: LayoutLine[]): { right: number; lines: LayoutLine[] }[] {
  const clusters: { right: number; lines: LayoutLine[] }[] = [];
  const sorted = [...lines].sort((a, b) => a.x + a.width - (b.x + b.width));
  for (const line of sorted) {
    const right = line.x + line.width;
    const cluster = clusters.find(
      (candidate) => Math.abs(candidate.right - right) <= TABULAR_NUMERIC_COLUMN_TOLERANCE_PT,
    );
    if (cluster) {
      cluster.lines.push(line);
      cluster.right = (cluster.right * (cluster.lines.length - 1) + right) / cluster.lines.length;
    } else {
      clusters.push({ right, lines: [line] });
    }
  }
  return clusters;
}

function sharedNumericRowCenters(columns: { right: number; lines: LayoutLine[] }[]): number[] {
  const rowClusters: { center: number; sampleCount: number; columnIndexes: Set<number> }[] = [];
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
    for (const line of columns[columnIndex].lines) {
      const center = line.y + line.height / 2;
      const cluster = rowClusters.find(
        (candidate) => Math.abs(candidate.center - center) <= TABULAR_NUMERIC_ROW_TOLERANCE_PT,
      );
      if (cluster) {
        cluster.columnIndexes.add(columnIndex);
        cluster.center = (cluster.center * cluster.sampleCount + center) / (cluster.sampleCount + 1);
        cluster.sampleCount += 1;
      } else {
        rowClusters.push({ center, sampleCount: 1, columnIndexes: new Set([columnIndex]) });
      }
    }
  }
  return rowClusters
    .filter((cluster) => cluster.columnIndexes.size >= TABULAR_NUMERIC_MIN_ALIGNED_COLUMNS)
    .map((cluster) => cluster.center)
    .sort((a, b) => a - b);
}

function canCompareNativeTextAgainstRaster(status: PageResult['quality']['nativeTextStatus']): boolean {
  return status === 'ok' || status === 'sparse_text_with_visual_content';
}

interface BoxLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clippedArea(a: BoxLike, b: BoxLike): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function overlapRatio(a: BoxLike, b: BoxLike): number {
  const areaA = Math.max(0, a.width) * Math.max(0, a.height);
  const areaB = Math.max(0, b.width) * Math.max(0, b.height);
  const denominator = Math.min(areaA, areaB);
  if (denominator <= 0) return 0;
  return clippedArea(a, b) / denominator;
}

/** Tolerance for off-page detection. PDFs commonly have sub-point
 *  fractional coordinates from cropping / rounding; treating anything
 *  inside this slack as on-page avoids false positives on otherwise
 *  pristine pages. */
const OFF_PAGE_TOLERANCE_PT = 1;

/** Bottom-edge threshold. The smaller of `EDGE_NEAR_BOTTOM_ABS` and
 *  `EDGE_NEAR_BOTTOM_REL × pageHeight` — so a tiny page (a slide
 *  thumbnail, a stamp) doesn't trigger on what would be a normal
 *  margin for a US Letter page. 18pt = 0.25 inch; typical body
 *  bottom margins are ≥ 36pt. */
const EDGE_NEAR_BOTTOM_ABS = 18;
const EDGE_NEAR_BOTTOM_REL = 0.025;

/** Max vertical gap (in PDF points) between a non-repeated body
 *  block's bottom and a repeated block's top before we consider the
 *  two visually mashed together. 6pt is roughly half a body line — at
 *  this distance the LLM-rendered Markdown joins the lines into one
 *  paragraph and the footer reads as body text. */
const CHROME_TOO_CLOSE_GAP_PT = 6;

const OFF_PAGE_REL_TOLERANCE = 0.006;
const OFF_PAGE_MAX_TOLERANCE_PT = 6;
const MINOR_TOP_BLEED_BLOCK_RATIO = 0.1;
const MINOR_TOP_BLEED_MAX_PT = 12;
/** A full-width CJK glyph's advance is one em, but closing punctuation
 *  (）」。、 …) only inks the left ~40% of the box. A line that ends
 *  flush with the page edge can therefore report up to ~0.65em of
 *  advance past the edge with zero visible ink (observed on 総務省
 *  white-paper citations). 0.7 em keeps a little slack for fonts whose
 *  side bearings differ. */
const TRAILING_FULLWIDTH_ADVANCE_BLEED_EM = 0.7;

function detectOffPage(blocks: LayoutBlock[], pageWidth: number, pageHeight: number, out: PageWarning[]): void {
  // pageWidth / pageHeight come from the MediaBox; cropbox / trim
  // boxes might be inside that, but for "is this likely a broken
  // render" the outer MediaBox is the right yardstick.
  const tolerance = offPageTolerance(pageWidth, pageHeight);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const left = b.x;
    const top = b.y;
    const right = b.x + b.width;
    const bottom = b.y + b.height;
    const offLeft = left < -tolerance;
    const offTop = top < -tolerance && !isMinorFontMetricTopBleed(b, tolerance);
    const offRight = right > pageWidth + tolerance && !isTrailingFullWidthAdvanceBleed(b, pageWidth);
    const offBottom = bottom > pageHeight + tolerance;
    if (!offLeft && !offTop && !offRight && !offBottom) continue;
    const sides: string[] = [];
    if (offLeft) sides.push('left');
    if (offTop) sides.push('top');
    if (offRight) sides.push('right');
    if (offBottom) sides.push('bottom');
    out.push({
      code: 'off_page',
      severity: 'error',
      message: `block bbox extends past the page ${sides.join('/')} edge (page ${pageWidth.toFixed(0)}×${pageHeight.toFixed(0)}pt, block ${left.toFixed(1)},${top.toFixed(1)}→${right.toFixed(1)},${bottom.toFixed(1)})`,
      blockIndex: i,
    });
  }
}

/** CJK closing punctuation whose ink sits in the left half of the
 *  full-width advance box, plus the ASCII forms NFKC normalization
 *  folds them into (）→ ), ］→ ], ｝→ }, ．→ ., ，→ ,). The ASCII
 *  forms only count when the line itself contains CJK text — a Latin
 *  line ending in ")" has a narrow advance and can't explain a
 *  half-em overhang. */
const TRAILING_CLOSING_PUNCT = /[）」』】〕〉》｝］〙〗。、，．)\]},.]$/u;
const CONTAINS_CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}！-｠]/u;

/** True when a block's right-edge overhang is explained by the trailing
 *  advance of full-width closing punctuation on its rightmost line —
 *  the glyph's ink ends on the page even though its advance does not.
 *  Real-world case: 総務省白書 title slide whose 34.5pt title ends in
 *  「（概要）」 flush against the right edge, reporting a 15pt phantom
 *  overhang. */
function isTrailingFullWidthAdvanceBleed(block: LayoutBlock, pageWidth: number): boolean {
  const overflow = block.x + block.width - pageWidth;
  if (overflow <= 0) return false;
  let rightmost: LayoutLine | undefined;
  for (const line of block.lines) {
    if (!rightmost || line.x + line.width > rightmost.x + rightmost.width) rightmost = line;
  }
  if (!rightmost) return false;
  // Only the rightmost line's advance can explain the block overhang.
  if (rightmost.x + rightmost.width < block.x + block.width - 0.5) return false;
  const text = rightmost.text.trimEnd();
  if (!TRAILING_CLOSING_PUNCT.test(text)) return false;
  if (!CONTAINS_CJK.test(text)) return false;
  const em = rightmost.fontSize ?? rightmost.height;
  if (em <= 0) return false;
  return overflow <= em * TRAILING_FULLWIDTH_ADVANCE_BLEED_EM;
}

function isMinorFontMetricTopBleed(block: LayoutBlock, tolerance: number): boolean {
  const bleed = -block.y;
  if (bleed <= tolerance) return true;
  if (block.height <= 0) return false;
  const allowed = Math.max(tolerance, Math.min(MINOR_TOP_BLEED_MAX_PT, block.height * MINOR_TOP_BLEED_BLOCK_RATIO));
  return bleed <= allowed;
}

function detectNearBottomEdge(blocks: LayoutBlock[], pageHeight: number, out: PageWarning[]): void {
  // Only non-repeated body blocks — a footer at the bottom edge is
  // by definition "near the bottom edge" and that's not a finding.
  const threshold = Math.min(EDGE_NEAR_BOTTOM_ABS, pageHeight * EDGE_NEAR_BOTTOM_REL);
  const bodyFontSize = dominantPageFontSize(blocks);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.repeated) continue;
    if (isBottomReference(b)) continue;
    if (isSourceFootnoteCaption(b)) continue;
    if (isTinyFontCaption(b, bodyFontSize)) continue;
    const distance = pageHeight - (b.y + b.height);
    if (distance < 0) continue; // off_page handles this case
    if (distance >= threshold) continue;
    out.push({
      code: 'near_bottom_edge',
      severity: 'warning',
      message: `body block ends ${distance.toFixed(1)}pt above the page bottom (threshold ${threshold.toFixed(1)}pt) — text may be crowded against the lower margin`,
      blockIndex: i,
    });
  }
}

function isBottomReference(block: LayoutBlock): boolean {
  const text = block.text.trim();
  if (text.length === 0 || text.length > 160) return false;
  if (block.width <= 40 && /^\d{1,4}$/u.test(text)) return true;
  if (block.width <= 40 && isRomanNumeralPageLabel(text)) return true;
  if (block.width <= 100 && /^page\s+\d{1,4}(?:\s+of\s+\d{1,4})?$/iu.test(text)) return true;
  if (block.width <= 180 && /^(?:[\w:.-]+\s+)?(?:lecture|slide)\s+\d+\s*[-–]\s*\d{1,4}$/iu.test(text)) {
    return true;
  }
  if (block.width <= 120 && isShortDateFooter(text)) return true;
  return /\b(?:https?:\/\/|www\.|doi:|arxiv:)/i.test(text);
}

/** Caption-vs-body font ratio. A block set at ≤ 70% of the page's
 *  dominant font size near the bottom edge reads as a footnote or
 *  source caption, not as body text crowding the margin. */
const TINY_FONT_CAPTION_RATIO = 0.7;
const TINY_FONT_CAPTION_MAX_CHARS = 300;

/** Char-weighted median font size across every layout line on the
 *  page — the size a human would call "the body text". Returns 0 when
 *  no block carries line data (hand-built layouts in unit tests),
 *  which disables the tiny-font caption rule. */
function dominantPageFontSize(blocks: LayoutBlock[]): number {
  const weighted: { fontSize: number; weight: number }[] = [];
  let total = 0;
  for (const block of blocks) {
    for (const line of block.lines) {
      const weight = line.text.trim().length;
      if (weight === 0 || line.fontSize <= 0) continue;
      weighted.push({ fontSize: line.fontSize, weight });
      total += weight;
    }
  }
  if (total === 0) return 0;
  weighted.sort((a, b) => a.fontSize - b.fontSize);
  let cumulative = 0;
  for (const entry of weighted) {
    cumulative += entry.weight;
    if (cumulative >= total / 2) return entry.fontSize;
  }
  return weighted[weighted.length - 1].fontSize;
}

/** True for short blocks set well below the page's body font size —
 *  e.g. a 6.5pt wrapped citation tail (「(第1回)事務局資料」) at the
 *  bottom of a 9.6pt-body slide. Tiny type at the bottom edge is
 *  always intentional caption/footnote design. */
function isTinyFontCaption(block: LayoutBlock, bodyFontSize: number): boolean {
  if (bodyFontSize <= 0) return false;
  if (block.text.trim().length > TINY_FONT_CAPTION_MAX_CHARS) return false;
  let maxFontSize = 0;
  let hasLine = false;
  for (const line of block.lines) {
    if (line.text.trim().length === 0) continue;
    hasLine = true;
    if (line.fontSize > maxFontSize) maxFontSize = line.fontSize;
  }
  if (!hasLine) return false;
  return maxFontSize <= bodyFontSize * TINY_FONT_CAPTION_RATIO;
}

/** Max length for a source/footnote caption. Longer than the generic
 *  isBottomReference cap (160) because Japanese statistical footnotes
 *  (※…) routinely run two dense lines. */
const SOURCE_FOOTNOTE_CAPTION_MAX_CHARS = 300;

/** Source attributions and footnotes sit at the bottom edge of chart
 *  slides and report pages by design — 「(出典)…」「※…」「…を基に作成」,
 *  "Source: …". Flagging them as crowded body text is pure noise
 *  (govt white-paper decks fire it on almost every page). Markers are
 *  matched against the NFKC-normalized text the layout pass carries,
 *  so full-width parens appear here in their ASCII form. */
const SOURCE_FOOTNOTE_PREFIX = /^[（(〔[［]?(?:出典|出所|資料|注\d*)[）)〕\]］：:.．]/u;
const SOURCE_FOOTNOTE_SUFFIX = /(?:を(?:基|もと)に(?:筆者)?(?:作成|加工|編集)|より(?:筆者)?(?:作成|引用|抜粋|転載))[。.]?$/u;

function isSourceFootnoteCaption(block: LayoutBlock): boolean {
  const text = block.text.trim();
  if (text.length === 0 || text.length > SOURCE_FOOTNOTE_CAPTION_MAX_CHARS) return false;
  if (text.startsWith('※')) return true;
  if (SOURCE_FOOTNOTE_PREFIX.test(text)) return true;
  if (SOURCE_FOOTNOTE_SUFFIX.test(text)) return true;
  // Bare citation shape: organization + quoted publication title,
  // e.g. 総務省「情報通信メディアの利用時間と情報行動に関する調査」.
  if (text.length <= 100 && /^[^「」]{0,30}「[^「」]+」$/u.test(text)) return true;
  return /^(?:sources?|notes?)\s*[:：]/iu.test(text);
}

function isRomanNumeralPageLabel(text: string): boolean {
  const normalized = text.toLowerCase();
  if (!/^[ivxlcdm]{1,12}$/u.test(normalized)) return false;
  return /^m{0,4}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/u.test(normalized);
}

function isShortDateFooter(text: string): boolean {
  return /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2},?(?:\s+\d{4})?$/iu.test(
    text,
  );
}

function offPageTolerance(pageWidth: number, pageHeight: number): number {
  const relative = Math.min(pageWidth, pageHeight) * OFF_PAGE_REL_TOLERANCE;
  return Math.min(OFF_PAGE_MAX_TOLERANCE_PT, Math.max(OFF_PAGE_TOLERANCE_PT, relative));
}

function detectBodyNearRepeatedChrome(blocks: LayoutBlock[], out: PageWarning[]): void {
  // For each non-repeated body block, look at every repeated chrome
  // block on the page and pick the worst geometric relationship to
  // report:
  //
  //   - **Overlap**: the bboxes vertically intersect. Magnitude is
  //     the true intersection depth (`min(bodyBottom, chromeBottom)
  //     - max(bodyTop, chrome.y)`), not `-gap`. The naive `-gap`
  //     would be wildly off when chrome encroaches on the body's
  //     top edge from above — e.g. a 40pt header sitting at y=80
  //     with body at y=100,h=600 overlaps by 20pt, but `-gap`
  //     (`-(80 - 700) = 620`) would report a 620pt overlap and let
  //     that header outrank a footer that's barely touching the
  //     body's bottom.
  //
  //   - **Gap**: chrome sits strictly below the body bottom with a
  //     vertical gap < CHROME_TOO_CLOSE_GAP_PT.
  //
  // Overlap always wins over gap (it's a worse readability problem
  // for an LLM reader), and within each category the worst case
  // wins — deepest overlap, or smallest gap.
  for (let i = 0; i < blocks.length; i++) {
    const body = blocks[i];
    if (body.repeated) continue;
    const bodyTop = body.y;
    const bodyBottom = body.y + body.height;
    let worstOverlap: { depth: number; index: number } | null = null;
    let worstGap: { gap: number; index: number } | null = null;
    for (let j = 0; j < blocks.length; j++) {
      if (i === j) continue;
      const chrome = blocks[j];
      if (!chrome.repeated) continue;
      // Chrome that lives entirely above the body (a running header
      // above the first body block) is a different geometric
      // relationship and isn't what this rule is meant to catch.
      // Comparing chrome-bottom against body-top lets a header that
      // dips into the body's top STILL fire (overlap case).
      const chromeBottom = chrome.y + chrome.height;
      if (chromeBottom <= bodyTop) continue;
      if (!horizontalOverlap(body, chrome)) continue;
      const overlapDepth = Math.min(bodyBottom, chromeBottom) - Math.max(bodyTop, chrome.y);
      if (overlapDepth > 0) {
        if (worstOverlap === null || overlapDepth > worstOverlap.depth) {
          worstOverlap = { depth: overlapDepth, index: j };
        }
      } else {
        const gap = chrome.y - bodyBottom;
        if (gap >= 0 && gap < CHROME_TOO_CLOSE_GAP_PT) {
          if (worstGap === null || gap < worstGap.gap) {
            worstGap = { gap, index: j };
          }
        }
      }
    }
    if (worstOverlap !== null) {
      out.push({
        code: 'body_near_repeated_chrome',
        severity: 'warning',
        message: `body block overlaps a repeated chrome block by ${worstOverlap.depth.toFixed(1)}pt — body text and footer/header are visually colliding`,
        blockIndex: i,
        otherBlockIndex: worstOverlap.index,
      });
    } else if (worstGap !== null) {
      out.push({
        code: 'body_near_repeated_chrome',
        severity: 'warning',
        message: `body block ends ${worstGap.gap.toFixed(1)}pt above a repeated chrome block (threshold ${CHROME_TOO_CLOSE_GAP_PT}pt) — body text and footer/header may run together for LLM readers`,
        blockIndex: i,
        otherBlockIndex: worstGap.index,
      });
    }
  }
}
