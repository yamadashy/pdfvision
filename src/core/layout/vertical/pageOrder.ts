import type { LayoutBlock } from '../../../types/index.js';
import { unionBox } from '../geometry.js';
import { FONT_SIZE_FALLBACK_PT } from './shared.js';

/**
 * Reading order for a page set in vertical writing (縦組み).
 *
 * The horizontal page model (lines top to bottom, columns left to right,
 * regions as units) has no notion of a page whose columns run right to
 * left, so on a vertical page it sorts short columns, column-head numbers
 * and labels by whichever horizontal rule they happen to fit. Here the
 * page is cut the way it is read: into tiers (段) top to bottom wherever no
 * column crosses a horizontal gap, a tier into blocks right to left at a
 * gap clearly wider than the column pitch (the gutter of a two-page spread,
 * the space between a title column and the text), and what remains is read
 * column by column, right to left. Neighbouring columns of one tier are
 * then joined into one block again.
 */

/** A page reads vertically when most of its text is in vertical columns. */
const MIN_VERTICAL_TEXT_SHARE = 0.5;
const MIN_VERTICAL_COLUMNS = 2;
/** A tier break needs a horizontal gap no column crosses. */
const MIN_TIER_GAP_EM = 0.1;
/** A gap this many ems (and twice the usual gap between columns) separates blocks of columns. */
const MIN_BLOCK_GAP_EM = 2;
const MIN_BLOCK_GAP_PITCH_RATIO = 2;
const MAX_JOIN_GAP_EM = 3;
const MAX_JOIN_GAP_PT = 36;
const MIN_JOIN_Y_OVERLAP_RATIO = 0.05;
const MAX_JOIN_FONT_RATIO = 1.25;

export function isVerticalPage(blocks: readonly LayoutBlock[]): boolean {
  let vertical = 0;
  let total = 0;
  let columns = 0;
  for (const block of blocks) {
    const chars = block.text.replace(/\s/gu, '').length;
    total += chars;
    if (block.writingMode !== 'vertical') continue;
    vertical += chars;
    columns += block.lines.length;
  }
  return columns >= MIN_VERTICAL_COLUMNS && total > 0 && vertical / total >= MIN_VERTICAL_TEXT_SHARE;
}

export function orderVerticalPage(blocks: readonly LayoutBlock[]): LayoutBlock[] {
  const source = new Map<LayoutBlock, LayoutBlock>();
  const units = attachColumnHeads(
    blocks.flatMap((block) => columnUnits(block, source)),
    source,
  );
  const em = medianFontSize(units);
  return joinColumns(cutOrder(units, em), source);
}

/**
 * Something standing directly above a column's first glyph, at most this
 * many ems away: one blank em box plus slack, as inside a glyph-by-glyph
 * column. Tiers of a page stand further apart.
 */
const MAX_HEAD_GAP_EM = 1.35;
const MAX_HEAD_CHARS = 4;
/** `第八条の二`, `第四条及び第五条`: an article label set as its own run. */
const MAX_VERTICAL_HEAD_CHARS = 8;
const MIN_HEAD_X_OVERLAP = 0.5;

/**
 * A column whose text arrives as tall runs rather than glyph by glyph can
 * come apart at its blank em box: the column-head number (`2`, `ヘ`) as a
 * separate horizontal item set slightly off the column's axis, or an
 * article label (`第八条の二`) as a run of its own above the text. Both
 * read as the start of the column below them, not as columns of their own;
 * sorted by their own x they land before or after the wrong column.
 */
function attachColumnHeads(units: readonly LayoutBlock[], source: Map<LayoutBlock, LayoutBlock>): LayoutBlock[] {
  const columns = units.filter((unit) => unit.writingMode === 'vertical' && unit.lines.length === 1);
  if (columns.length === 0) return [...units];
  // Each column takes the nearest head above it; a head can itself have one.
  const headOf = new Map<LayoutBlock, { head: LayoutBlock; gap: number }>();
  for (const head of units) {
    const found = columnBelow(head, columns);
    if (!found) continue;
    const existing = headOf.get(found.column);
    if (!existing || found.gap < existing.gap) headOf.set(found.column, { head, gap: found.gap });
  }
  if (headOf.size === 0) return [...units];

  const heads = new Set([...headOf.values()].map((entry) => entry.head));
  const out: LayoutBlock[] = [];
  for (const unit of units) {
    if (heads.has(unit)) continue;
    const chain = [unit];
    const seen = new Set(chain);
    for (let head = headOf.get(unit)?.head; head && !seen.has(head); head = headOf.get(head)?.head) {
      chain.unshift(head);
      seen.add(head);
    }
    if (chain.length === 1) {
      out.push(unit);
      continue;
    }
    const box = unionBox(chain);
    const text = chain.map((item) => item.text.trim()).join(' ');
    const merged: LayoutBlock = { ...unit, text, ...box, lines: [{ ...unit.lines[0], text, ...box }] };
    const from = source.get(unit);
    if (from) source.set(merged, from);
    out.push(merged);
  }
  return out;
}

function columnBelow(
  head: LayoutBlock,
  columns: readonly LayoutBlock[],
): { column: LayoutBlock; gap: number } | undefined {
  if (head.lines.length !== 1) return undefined;
  const text = head.text.trim();
  if (text.length === 0) return undefined;
  const isVertical = head.writingMode === 'vertical';
  // Labels only: a full column ending just above the next tier is not the head of that tier's column.
  if ([...text].length > (isVertical ? MAX_VERTICAL_HEAD_CHARS : MAX_HEAD_CHARS)) return undefined;
  let best: LayoutBlock | undefined;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const column of columns) {
    if (column === head) continue;
    const fontSize = column.lines[0].fontSize || FONT_SIZE_FALLBACK_PT;
    if (isVertical && !similarFont(head.lines[0].fontSize, fontSize)) continue;
    const gap = column.y - (head.y + head.height);
    if (gap < -fontSize * 0.25 || gap > fontSize * MAX_HEAD_GAP_EM || gap >= bestGap) continue;
    const overlap = Math.min(head.x + head.width, column.x + column.width) - Math.max(head.x, column.x);
    if (overlap < Math.min(head.width, column.width) * MIN_HEAD_X_OVERLAP) continue;
    best = column;
    bestGap = gap;
  }
  return best ? { column: best, gap: bestGap } : undefined;
}

function similarFont(a: number, b: number): boolean {
  const fa = a || FONT_SIZE_FALLBACK_PT;
  const fb = b || FONT_SIZE_FALLBACK_PT;
  return Math.max(fa, fb) / Math.max(Math.min(fa, fb), 0.001) <= MAX_JOIN_FONT_RATIO;
}

/** One unit per column, so a tier boundary or a gutter can fall between two columns of one block. */
function columnUnits(block: LayoutBlock, source: Map<LayoutBlock, LayoutBlock>): LayoutBlock[] {
  if (block.writingMode !== 'vertical' || block.lines.length <= 1) return [block];
  const units = block.lines.map((line) => ({
    text: line.text,
    x: line.x,
    y: line.y,
    width: line.width,
    height: line.height,
    lines: [line],
    writingMode: 'vertical' as const,
  }));
  for (const unit of units) source.set(unit, block);
  return units;
}

function cutOrder(items: readonly LayoutBlock[], em: number): LayoutBlock[] {
  if (items.length <= 1) return [...items];
  const tiers = splitTiers(items, em);
  if (tiers.length > 1) return tiers.flatMap((tier) => cutOrder(tier, em));
  const blocks = splitColumnBlocks(items, em);
  if (blocks.length > 1) return blocks.flatMap((block) => cutOrder(block, em));
  return [...items].sort((a, b) => b.x + b.width / 2 - (a.x + a.width / 2) || a.y - b.y);
}

function splitTiers(items: readonly LayoutBlock[], em: number): LayoutBlock[][] {
  const sorted = [...items].sort((a, b) => a.y - b.y || b.x - a.x);
  const tiers: LayoutBlock[][] = [];
  let current: LayoutBlock[] = [];
  let bottom = Number.NEGATIVE_INFINITY;
  for (const item of sorted) {
    if (current.length > 0 && item.y > bottom + em * MIN_TIER_GAP_EM) {
      tiers.push(current);
      current = [];
    }
    current.push(item);
    bottom = Math.max(bottom, item.y + item.height);
  }
  if (current.length > 0) tiers.push(current);
  return tiers;
}

function splitColumnBlocks(items: readonly LayoutBlock[], em: number): LayoutBlock[][] {
  const sorted = [...items].sort((a, b) => b.x + b.width - (a.x + a.width) || a.y - b.y);
  const strips: LayoutBlock[][] = [];
  const gaps: number[] = [];
  let current: LayoutBlock[] = [];
  let left = Number.POSITIVE_INFINITY;
  for (const item of sorted) {
    const right = item.x + item.width;
    if (current.length > 0 && right < left) {
      gaps.push(left - right);
      strips.push(current);
      current = [];
    }
    current.push(item);
    left = Math.min(left, item.x);
  }
  if (current.length > 0) strips.push(current);
  if (strips.length <= 1) return strips;

  const threshold = Math.max(em * MIN_BLOCK_GAP_EM, median(gaps) * MIN_BLOCK_GAP_PITCH_RATIO);
  const blocks: LayoutBlock[][] = [strips[0]];
  for (let index = 1; index < strips.length; index++) {
    if (gaps[index - 1] >= threshold) blocks.push([...strips[index]]);
    else blocks[blocks.length - 1].push(...strips[index]);
  }
  return blocks;
}

/**
 * Columns are joined back only within the block the column pass built, so
 * a heading column or a separately set title stays its own block.
 */
function joinColumns(ordered: readonly LayoutBlock[], source: ReadonlyMap<LayoutBlock, LayoutBlock>): LayoutBlock[] {
  const out: LayoutBlock[] = [];
  let previousUnit: LayoutBlock | undefined;
  for (const item of ordered) {
    const previous = out.at(-1);
    const sameSource = previousUnit !== undefined && source.has(item) && source.get(previousUnit) === source.get(item);
    previousUnit = item;
    if (previous && sameSource && canJoinColumns(previous, item)) {
      const lines = [...previous.lines, ...item.lines];
      out[out.length - 1] = {
        ...previous,
        text: lines.map((line) => line.text).join('\n'),
        ...unionBox(lines),
        lines,
      };
      continue;
    }
    out.push(item);
  }
  return out;
}

function canJoinColumns(previous: LayoutBlock, next: LayoutBlock): boolean {
  if (previous.writingMode !== 'vertical' || next.writingMode !== 'vertical') return false;
  if (previous.role !== undefined || next.role !== undefined) return false;
  const last = previous.lines.at(-1);
  const first = next.lines[0];
  if (!last || !first) return false;
  const lastFont = last.fontSize || FONT_SIZE_FALLBACK_PT;
  const firstFont = first.fontSize || FONT_SIZE_FALLBACK_PT;
  if (Math.max(lastFont, firstFont) / Math.max(Math.min(lastFont, firstFont), 0.001) > MAX_JOIN_FONT_RATIO)
    return false;
  const pitch = last.x + last.width / 2 - (first.x + first.width / 2);
  const fontSize = Math.max(lastFont, firstFont);
  if (pitch <= 0 || pitch > Math.max(fontSize * MAX_JOIN_GAP_EM, MAX_JOIN_GAP_PT)) return false;
  const overlap = Math.min(last.y + last.height, first.y + first.height) - Math.max(last.y, first.y);
  const minHeight = Math.max(Math.min(last.height, first.height), 1);
  return overlap / minHeight >= MIN_JOIN_Y_OVERLAP_RATIO;
}

function medianFontSize(units: readonly LayoutBlock[]): number {
  const sizes = units
    .filter((unit) => unit.writingMode === 'vertical')
    .flatMap((unit) => unit.lines.map((line) => line.fontSize || FONT_SIZE_FALLBACK_PT));
  return sizes.length > 0 ? median(sizes) : FONT_SIZE_FALLBACK_PT;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
