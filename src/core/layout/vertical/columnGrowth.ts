import type { TextSpan } from '../../../types/index.js';
import {
  BODY_VERTICAL_CJK_GLYPH_RE,
  BODY_VERTICAL_LEADER_GLYPH_RE,
  bodyVerticalCjkXTolerance,
  CJK_SCRIPT_RE,
  centerX,
  FONT_SIZE_FALLBACK_PT,
  toVerticalGlyphRun,
  type VerticalCjkRun,
} from './shared.js';

/**
 * Grow the long body columns of a vertical page into every column of it.
 *
 * The long-run pass only trusts five or more tightly stacked CJK glyphs,
 * which is what keeps a horizontal page's aligned glyphs from reading as
 * columns. Inside a vertical page that bar cuts real columns apart: a
 * 縦中横 number (`11`), a vertical dash (`――`), an NFKC-normalised bracket
 * (`（略）` → `(略)`), or a blank em box between a column-head number and
 * its text (`第一条` + blank + `（略）`, `２` + blank + `協議会の…`) each end the run, and the
 * short pieces fall back to horizontal lines that interleave neighbouring
 * columns glyph by glyph (#261).
 *
 * Here the long runs are the evidence that the page is vertical. Every
 * glyph that can stand in a vertical column joins the x-column it is
 * centred on, a column is split only at a gap wider than one blank em box
 * (or at a change of font size), and a column is accepted when it holds a
 * long run or sits beside an accepted column — so short columns chain off
 * each other the way a page's columns follow one another.
 */

/** Gap (in ems of the column) a column may skip without ending: one blank em box plus slack. */
const MAX_COLUMN_BLANK_EM = 1.35;
const TIGHT_STEP_MAX_GAP_EM = 0.45;
const MIN_COLUMN_OVERLAP_EM = -0.5;
const MIN_FONT_RATIO = 0.75;
const MAX_FONT_RATIO = 1.25;
const MAX_COLUMN_GLYPH_SIZE_RATIO = 1.8;
const MAX_NEIGHBOUR_COLUMN_GAP_RATIO = 3;
const MAX_NEIGHBOUR_COLUMN_GAP_PT = 36;
const MIN_NEIGHBOUR_Y_OVERLAP_RATIO = 0.05;
/** Horizontal text sets its glyphs closer than this; neighbouring vertical columns stand further apart. */
const HORIZONTAL_NEIGHBOUR_MAX_GAP_EM = 0.3;
const HORIZONTAL_NEIGHBOUR_MIN_Y_OVERLAP = 0.5;
const ROW_BUCKET_PT = 8;
const MIN_SEEDED_TEXT_SHARE = 0.25;

/** 縦中横 (two to four Latin or digit characters set across one em box) and single inline Latin. */
const INLINE_COLUMN_TEXT_RE = /^[0-9A-Za-z!?%#&+=()]{1,4}$/u;
/** Dashes and wave dashes set along the column; NFKC keeps these as they are. */
const COLUMN_DASH_RE = /^[‐-―−─━〜～~-]$/u;
const COLUMN_LEADER_RE = /^(?:\.{2,3}|‥|⋯)$/u;

export function isVerticalColumnGlyph(span: TextSpan): boolean {
  const text = span.text.trim();
  if (text.length === 0) return false;
  if (
    !BODY_VERTICAL_CJK_GLYPH_RE.test(text) &&
    !BODY_VERTICAL_LEADER_GLYPH_RE.test(text) &&
    !INLINE_COLUMN_TEXT_RE.test(text) &&
    !COLUMN_DASH_RE.test(text) &&
    !COLUMN_LEADER_RE.test(text)
  ) {
    return false;
  }
  const fontSize = span.fontSize || span.height || FONT_SIZE_FALLBACK_PT;
  return span.width <= fontSize * MAX_COLUMN_GLYPH_SIZE_RATIO && span.height <= fontSize * MAX_COLUMN_GLYPH_SIZE_RATIO;
}

function spanFontSize(span: TextSpan): number {
  return span.fontSize || span.height || FONT_SIZE_FALLBACK_PT;
}

function compatibleFont(a: number, b: number): boolean {
  const ratio = a / Math.max(b, 0.001);
  return ratio >= MIN_FONT_RATIO && ratio <= MAX_FONT_RATIO;
}

interface ColumnSegment {
  spans: TextSpan[];
  /** Font size of the CJK glyphs (縦中横 digits are set smaller than the column). */
  fontSize: number;
  seeded: boolean;
}

export function growVerticalColumns(
  spans: readonly TextSpan[],
  seeds: readonly VerticalCjkRun[],
  excludedSpans: ReadonlySet<TextSpan>,
): VerticalCjkRun[] {
  if (seeds.length === 0) return [...seeds];
  const seedSpans = new Set<TextSpan>();
  for (const seed of seeds) for (const span of seed.spans) seedSpans.add(span);

  const pool = spans.filter((span) => seedSpans.has(span) || (!excludedSpans.has(span) && isVerticalColumnGlyph(span)));
  const segments = splitColumns(groupByColumnAxis(pool), seedSpans);
  const accepted = new Set<ColumnSegment>(segments.filter((segment) => segment.seeded));
  if (accepted.size === segments.length || !isMostlyVertical(spans, seedSpans)) {
    return toRuns(segments.filter((segment) => accepted.has(segment)));
  }

  const rows = indexRows(spans.filter((span) => !excludedSpans.has(span)));
  const pending = segments.filter((segment) => !accepted.has(segment) && isPlausibleColumn(segment));
  let grew = true;
  while (grew && pending.length > 0) {
    grew = false;
    for (let index = pending.length - 1; index >= 0; index--) {
      const segment = pending[index];
      if (!hasAcceptedNeighbour(segment, accepted)) continue;
      pending.splice(index, 1);
      if (hasHorizontalNeighbour(segment, rows)) continue;
      accepted.add(segment);
      grew = true;
    }
  }
  return toRuns(segments.filter((segment) => accepted.has(segment)));
}

/**
 * Short columns are taken on the strength of their neighbours only where the
 * long columns carry a good share of the page's text. A form or a table with
 * a few vertical labels has single glyphs beside them (`雑`, `業`) that are
 * the ends of horizontal labels, not columns.
 */
export function hasVerticalPageContext(spans: readonly TextSpan[], seeds: readonly VerticalCjkRun[]): boolean {
  return isMostlyVertical(spans, new Set(seeds.flatMap((seed) => seed.spans)));
}

function isMostlyVertical(spans: readonly TextSpan[], seedSpans: ReadonlySet<TextSpan>): boolean {
  let seeded = 0;
  let total = 0;
  for (const span of spans) {
    const chars = span.text.replace(/\s/gu, '').length;
    total += chars;
    if (seedSpans.has(span)) seeded += chars;
  }
  return total > 0 && seeded / total >= MIN_SEEDED_TEXT_SHARE;
}

function toRuns(segments: readonly ColumnSegment[]): VerticalCjkRun[] {
  const runs: VerticalCjkRun[] = [];
  for (const segment of segments) {
    const run = toVerticalGlyphRun(segment.spans, 1);
    if (run) runs.push({ ...run, fontSize: segment.fontSize });
  }
  return runs;
}

function groupByColumnAxis(pool: readonly TextSpan[]): TextSpan[][] {
  const sorted = [...pool].sort((a, b) => centerX(b) - centerX(a) || a.y - b.y);
  const columns: TextSpan[][] = [];
  let current: TextSpan[] = [];
  let anchor: TextSpan | undefined;
  for (const span of sorted) {
    if (
      anchor &&
      Math.abs(centerX(anchor) - centerX(span)) <=
        Math.max(bodyVerticalCjkXTolerance(anchor), bodyVerticalCjkXTolerance(span))
    ) {
      current.push(span);
      continue;
    }
    if (current.length > 0) columns.push(current);
    current = [span];
    anchor = span;
  }
  if (current.length > 0) columns.push(current);
  return columns;
}

function splitColumns(columns: readonly TextSpan[][], seedSpans: ReadonlySet<TextSpan>): ColumnSegment[] {
  const segments: ColumnSegment[] = [];
  for (const column of columns) {
    const sorted = [...column].sort((a, b) => a.y - b.y || a.x - b.x);
    let run: TextSpan[] = [];
    let runFont = 0;
    const flush = () => {
      if (run.some((span) => CJK_SCRIPT_RE.test(span.text))) {
        segments.push({ spans: run, fontSize: runFont, seeded: run.some((span) => seedSpans.has(span)) });
      }
      run = [];
      runFont = 0;
    };
    for (const span of sorted) {
      const prev = run.at(-1);
      const font = isCjkColumnGlyph(span) ? spanFontSize(span) : 0;
      if (prev && !canExtendColumn(prev, span, runFont, font)) flush();
      run.push(span);
      if (font > 0 && runFont === 0) runFont = font;
    }
    flush();
  }
  // A segment of only Latin or digits has no column font of its own.
  return segments.map((segment) =>
    segment.fontSize > 0 ? segment : { ...segment, fontSize: spanFontSize(segment.spans[0]) },
  );
}

function isCjkColumnGlyph(span: TextSpan): boolean {
  return CJK_SCRIPT_RE.test(span.text) || BODY_VERTICAL_CJK_GLYPH_RE.test(span.text.trim());
}

function canExtendColumn(prev: TextSpan, cur: TextSpan, runFont: number, curFont: number): boolean {
  if (runFont > 0 && curFont > 0 && !compatibleFont(curFont, runFont)) return false;
  const em = runFont || curFont || Math.max(spanFontSize(prev), spanFontSize(cur));
  const gap = cur.y - (prev.y + prev.height);
  return gap >= em * MIN_COLUMN_OVERLAP_EM && gap <= em * MAX_COLUMN_BLANK_EM;
}

/**
 * Blank em boxes stand between a column-head number and its text, not
 * between every glyph: a stack that only ever steps by gaps is the first
 * glyph of each line of a horizontal grid, not a column.
 */
function isPlausibleColumn(segment: ColumnSegment): boolean {
  let tight = 0;
  let blank = 0;
  for (let index = 1; index < segment.spans.length; index++) {
    const prev = segment.spans[index - 1];
    const gap = segment.spans[index].y - (prev.y + prev.height);
    if (gap > segment.fontSize * TIGHT_STEP_MAX_GAP_EM) blank++;
    else tight++;
  }
  return blank <= tight + 1;
}

/**
 * A column beside an accepted one, or a short label column standing in the
 * gap between two accepted columns' segments (the `改正後` / `改正前` strip
 * of a comparison table, level with neither half's text).
 */
function hasAcceptedNeighbour(segment: ColumnSegment, accepted: ReadonlySet<ColumnSegment>): boolean {
  const top = segmentTop(segment);
  const bottom = segmentBottom(segment);
  const x = axis(segment);
  let above = false;
  let below = false;
  let right = false;
  let left = false;
  for (const column of accepted) {
    if (!withinColumnReach(column, segment)) continue;
    const overlap = Math.min(segmentBottom(column), bottom) - Math.max(segmentTop(column), top);
    const minHeight = Math.max(Math.min(segmentBottom(column) - segmentTop(column), bottom - top), 1);
    if (overlap > 0 && overlap / minHeight >= MIN_NEIGHBOUR_Y_OVERLAP_RATIO) {
      if (axis(column) > x) right = true;
      else left = true;
    }
    if (segmentBottom(column) <= top) above = true;
    if (segmentTop(column) >= bottom) below = true;
  }
  // A lone glyph beside one column is as likely a table's row label; a
  // one-glyph column of a vertical page has columns on both sides.
  if (segment.spans.length === 1) return right && left;
  return right || left || (above && below);
}

function withinColumnReach(a: ColumnSegment, b: ColumnSegment): boolean {
  if (!compatibleFont(a.fontSize, b.fontSize)) return false;
  const gap = Math.abs(axis(a) - axis(b));
  const fontSize = Math.max(a.fontSize, b.fontSize, FONT_SIZE_FALLBACK_PT);
  return gap > 0 && gap <= Math.max(fontSize * MAX_NEIGHBOUR_COLUMN_GAP_RATIO, MAX_NEIGHBOUR_COLUMN_GAP_PT);
}

function segmentTop(segment: ColumnSegment): number {
  return segment.spans[0].y;
}

function segmentBottom(segment: ColumnSegment): number {
  return Math.max(...segment.spans.map((span) => span.y + span.height));
}

function axis(segment: ColumnSegment): number {
  return segment.spans.reduce((sum, span) => sum + centerX(span), 0) / segment.spans.length;
}

type RowIndex = Map<number, TextSpan[]>;

function indexRows(spans: readonly TextSpan[]): RowIndex {
  const rows: RowIndex = new Map();
  for (const span of spans) {
    const first = Math.floor(span.y / ROW_BUCKET_PT);
    const last = Math.floor((span.y + span.height) / ROW_BUCKET_PT);
    for (let bucket = first; bucket <= last; bucket++) {
      const row = rows.get(bucket);
      if (row) row.push(span);
      else rows.set(bucket, [span]);
    }
  }
  return rows;
}

/** A glyph set flush against another on its own line belongs to horizontal text. */
function hasHorizontalNeighbour(segment: ColumnSegment, rows: RowIndex): boolean {
  const members = new Set(segment.spans);
  const maxGap = segment.fontSize * HORIZONTAL_NEIGHBOUR_MAX_GAP_EM;
  for (const span of segment.spans) {
    const bucket = Math.floor((span.y + span.height / 2) / ROW_BUCKET_PT);
    for (const other of rows.get(bucket) ?? []) {
      if (members.has(other) || other.text.trim().length === 0) continue;
      const overlap = Math.min(span.y + span.height, other.y + other.height) - Math.max(span.y, other.y);
      if (overlap < Math.min(span.height, other.height) * HORIZONTAL_NEIGHBOUR_MIN_Y_OVERLAP) continue;
      const gap = Math.max(other.x - (span.x + span.width), span.x - (other.x + other.width));
      if (gap < maxGap) return true;
    }
  }
  return false;
}
