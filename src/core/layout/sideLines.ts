import type { LayoutBlock, LayoutLine, LayoutMarkedText, TextSpan } from '../../types/index.js';
import type { BBox } from './geometry.js';
import { round2 } from './geometry.js';
import { hasVerticalTextShape } from './verticalText.js';

/**
 * Passages of vertical text marked by a side line (傍線): a thin vector
 * rule drawn just right of a column's glyphs for part of its length. In a
 * 新旧対照表 that line is the only sign of what an amendment changed; the
 * text carries no marker, so the marked passages are reported as content.
 *
 * The line is the column's own: it hugs the column's glyph edge, much
 * nearer to it than to the next column, and runs no further than the
 * columns of its tier. A rule centred between two columns (a vertical
 * table's cell border) or a frame around the whole sheet fails one of
 * those tests.
 */

const RULE_MAX_WIDTH_PT = 1.2;
const RULE_MIN_LENGTH_PT = 5;
/** The line sits this close to the glyph edge it marks, in ems. */
const OWN_EDGE_MAX_EM = 0.3;
/** …and at most this share of the distance to the next column's glyphs. */
const OWN_EDGE_MAX_SHARE = 0.5;
/** It runs no further than the longest column of its tier, give or take. */
const TIER_SLACK_EM = 0.6;
/** A column this long against the usual column of its tier runs to the foot: its text wraps on. */
const FULL_COLUMN_SHARE = 0.85;
/** An empty em box between glyphs of one column. */
const BLANK_BOX_EM = 0.8;
const NEXT_COLUMN_MAX_EM = 3;
const MAX_RULES = 2000;
const MIN_PASSAGE_GLYPHS = 2;
/** One blank em box may sit inside a marked passage (`第三条の二　法第八条`); wider gaps are cell spacing. */
const MAX_PASSAGE_GAP_EM = 1.5;

interface Glyph {
  char: string;
  top: number;
  bottom: number;
}

interface Column {
  line: LayoutLine;
  size: number;
  glyphs: Glyph[];
  /** The glyphs' right and left edges. */
  right: number;
  left: number;
}

export function sideLineMarks(
  blocks: readonly LayoutBlock[],
  spans: readonly TextSpan[],
  vectorBoxes: readonly BBox[] | undefined,
): LayoutMarkedText[] {
  if (!vectorBoxes || vectorBoxes.length === 0) return [];
  const rules = vectorBoxes.filter(
    (box) => box.width <= RULE_MAX_WIDTH_PT && box.height >= RULE_MIN_LENGTH_PT && box.height > box.width * 4,
  );
  if (rules.length === 0 || rules.length > MAX_RULES) return [];
  const lines = blocks.filter((block) => block.writingMode === 'vertical').flatMap((block) => block.lines);
  const inside = lines.map((line) => spansIn(line, spans));
  // pdf.js boxes a vertical-font run from the glyphs' centre line; glyphs
  // set upright one by one are boxed where they are drawn.
  const fromCentre = inside.some((list) => list.some(hasVerticalTextShape));
  const columns = lines
    .map((line, i) => columnOf(line, inside[i], fromCentre))
    .filter((column): column is Column => column !== undefined);
  if (columns.length === 0) return [];

  const marked = new Map<Column, Set<number>>();
  for (const rule of rules) {
    const x = rule.x + rule.width / 2;
    const top = rule.y;
    const bottom = rule.y + rule.height;
    const column = ownColumn(x, top, bottom, columns);
    if (!column || !withinTier(column, top, bottom, columns)) continue;
    const covered: number[] = [];
    column.glyphs.forEach((glyph, index) => {
      const centre = (glyph.top + glyph.bottom) / 2;
      if (centre >= top && centre <= bottom) covered.push(index);
    });
    if (!isPassage(column, covered)) continue;
    const set = marked.get(column) ?? new Set<number>();
    for (const index of covered) set.add(index);
    marked.set(column, set);
  }
  return runsOf(columns, marked);
}

/**
 * A side line marks a run of text: two glyphs or more, set close. A rule
 * beside one glyph, or beside a stack of glyphs spaced like table cells
 * (one label per row read as a column), marks no passage.
 */
function isPassage(column: Column, covered: readonly number[]): boolean {
  if (covered.length < MIN_PASSAGE_GLYPHS) return false;
  for (let i = 1; i < covered.length; i++) {
    const gap = column.glyphs[covered[i]].top - column.glyphs[covered[i - 1]].bottom;
    if (gap > MAX_PASSAGE_GAP_EM * column.size) return false;
  }
  return true;
}

function spansIn(line: LayoutLine, spans: readonly TextSpan[]): TextSpan[] {
  return spans
    .filter(
      (span) =>
        span.x < line.x + line.width &&
        span.x + span.width > line.x &&
        span.y >= line.y - 0.5 &&
        span.y + span.height <= line.y + line.height + 0.5,
    )
    .sort((a, b) => a.y - b.y);
}

function columnOf(line: LayoutLine, inside: readonly TextSpan[], fromCentre: boolean): Column | undefined {
  const size = line.fontSize || line.width;
  if (size <= 0 || inside.length === 0) return undefined;
  const glyphs: Glyph[] = [];
  for (const span of inside) {
    const chars = Array.from(span.text);
    const pitch = span.height / chars.length;
    chars.forEach((char, i) => {
      if (char.trim().length > 0) glyphs.push({ char, top: span.y + i * pitch, bottom: span.y + (i + 1) * pitch });
    });
  }
  if (glyphs.length === 0) return undefined;
  const half = fromCentre ? line.width / 2 : 0;
  return { line, size, glyphs, right: line.x + line.width - half, left: line.x - half };
}

/** The column whose glyph edge the rule hugs, much nearer it than any other column's. */
function ownColumn(x: number, top: number, bottom: number, columns: readonly Column[]): Column | undefined {
  let best: { column: Column; distance: number } | undefined;
  for (const column of columns) {
    const { line } = column;
    if (top > line.y + line.height || bottom < line.y) continue;
    const distance = Math.abs(x - column.right);
    if (distance > OWN_EDGE_MAX_EM * column.size) continue;
    if (!best || distance < best.distance) best = { column, distance };
  }
  if (!best) return undefined;
  const own = best;
  // The next column to the right, on the rule's side.
  let other = Number.POSITIVE_INFINITY;
  for (const column of columns) {
    if (column === own.column) continue;
    const { line } = column;
    if (top > line.y + line.height || bottom < line.y) continue;
    if (line.x + line.width <= own.column.line.x + own.column.line.width) continue;
    const distance = Math.abs(column.left - x);
    if (distance > NEXT_COLUMN_MAX_EM * own.column.size) continue;
    other = Math.min(other, distance);
  }
  return own.distance <= other * OWN_EDGE_MAX_SHARE ? own.column : undefined;
}

/** The rule runs within the columns beside it: it does not reach past the tier of text it marks. */
function withinTier(column: Column, top: number, bottom: number, columns: readonly Column[]): boolean {
  const slack = TIER_SLACK_EM * column.size;
  const tier = tierOf(column, columns);
  const tierTop = Math.min(...tier.map((other) => other.line.y));
  return top >= tierTop - slack && bottom <= tierBottom(column, columns) + slack;
}

function tierOf(column: Column, columns: readonly Column[]): Column[] {
  const columnBottom = column.line.y + column.line.height;
  return columns.filter((other) => other.line.y < columnBottom && other.line.y + other.line.height > column.line.y);
}

function tierBottom(column: Column, columns: readonly Column[]): number {
  return Math.max(...tierOf(column, columns).map((other) => other.line.y + other.line.height));
}

/**
 * Marked glyphs as passages in reading order. A passage that runs to the
 * end of a full-length column continues at the next column's head, as
 * wrapped text does; one in a short column (a caption) ends there. A blank
 * em box between marked glyphs reads as a space.
 */
function runsOf(columns: readonly Column[], marked: ReadonlyMap<Column, Set<number>>): LayoutMarkedText[] {
  const out: LayoutMarkedText[] = [];
  let open: { text: string; boxes: BBox[]; endsColumn: boolean } | undefined;
  const close = () => {
    if (open && open.text.length > 0) {
      const x = Math.min(...open.boxes.map((b) => b.x));
      const y = Math.min(...open.boxes.map((b) => b.y));
      const r = Math.max(...open.boxes.map((b) => b.x + b.width));
      const bt = Math.max(...open.boxes.map((b) => b.y + b.height));
      out.push({
        mark: 'side_line',
        text: open.text,
        x: round2(x),
        y: round2(y),
        width: round2(r - x),
        height: round2(bt - y),
      });
    }
    open = undefined;
  };
  for (const column of columns) {
    const set = marked.get(column);
    if (!set) {
      close();
      continue;
    }
    const { glyphs, line } = column;
    const full = line.height >= fullLength(tierOf(column, columns)) * FULL_COLUMN_SHARE;
    for (let i = 0; i < glyphs.length; i++) {
      if (!set.has(i)) {
        close();
        continue;
      }
      // A passage carries over only from the last glyph of one column to the first of the next.
      if (open && i === 0 && !open.endsColumn) close();
      if (!open) open = { text: '', boxes: [], endsColumn: false };
      else if (i > 0 && glyphs[i].top - glyphs[i - 1].bottom >= column.size * BLANK_BOX_EM) open.text += ' ';
      open.text += glyphs[i].char;
      open.boxes.push({ x: line.x, y: glyphs[i].top, width: line.width, height: glyphs[i].bottom - glyphs[i].top });
      open.endsColumn = i === glyphs.length - 1 && full;
    }
    if (open && !open.endsColumn) close();
  }
  close();
  return out;
}

/** The length most full columns of a tier reach: high in the spread, past short (略) lines, below one long title. */
function fullLength(tier: readonly Column[]): number {
  const heights = tier.map((column) => column.line.height).sort((a, b) => a - b);
  return heights[Math.min(heights.length - 1, Math.floor(heights.length * 0.8))] ?? 0;
}
