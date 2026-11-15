import type { LayoutLine } from '../../types/index.js';

/** How many open blocks back a woven continuation is looked for. Two
 *  side-by-side runs need one; a third run beside them needs two. */
const MAX_LOOKBACK_GROUPS = 4;
const MIN_PROSE_CHARS = 12;
const MIN_PROSE_WORDS = 3;
const MAX_FONT_RATIO = 1.05;
const MIN_OVERLAP_RATIO = 0.5;
const EDGE_TOLERANCE_PT = 0.5;

/**
 * The open block that `line` continues when the lines of two side-by-side
 * runs of prose arrive interleaved (top-down order alternates between a
 * sidebar and the abstract beside it). Only the most recent block is
 * checked by the normal block clustering, so each line of either run would
 * otherwise open a block of its own and the runs would be read one line
 * from each in turn.
 *
 * A line continues an earlier block when it is prose, sits within one
 * line of leading below that block's last line (also prose, same font
 * size, sharing most of its width), and every block opened since lies
 * entirely beside the two — none of it is between them — without a
 * clause number or marker on the new line's baseline.
 */
export function findWovenContinuation(groups: readonly LayoutLine[][], line: LayoutLine): LayoutLine[] | undefined {
  if (!isProseLine(line)) return undefined;
  const first = Math.max(0, groups.length - 1 - MAX_LOOKBACK_GROUPS);
  for (let gi = groups.length - 2; gi >= first; gi--) {
    const group = groups[gi];
    const prev = group[group.length - 1];
    if (!continues(prev, line)) continue;
    const between = groups.slice(gi + 1).flat();
    if (between.some((other) => !isBeside(other, prev) || !isBeside(other, line))) continue;
    // A clause number or list marker on the new line's own baseline opens
    // a paragraph of its own; it is not the other half of a weave.
    if (between.some((other) => !isProseLine(other) && sharesRow(other, line))) continue;
    return group;
  }
  return undefined;
}

function continues(prev: LayoutLine, line: LayoutLine): boolean {
  if (!isProseLine(prev)) return false;
  const gap = line.y - (prev.y + prev.height);
  if (gap < -EDGE_TOLERANCE_PT || gap > prev.height) return false;
  const fontRatio = Math.max(line.fontSize, prev.fontSize) / Math.max(Math.min(line.fontSize, prev.fontSize), 0.001);
  if (fontRatio > MAX_FONT_RATIO) return false;
  const overlap = Math.min(prev.x + prev.width, line.x + line.width) - Math.max(prev.x, line.x);
  return overlap >= Math.min(prev.width, line.width) * MIN_OVERLAP_RATIO;
}

function sharesRow(a: LayoutLine, b: LayoutLine): boolean {
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlap >= Math.min(a.height, b.height) * MIN_OVERLAP_RATIO;
}

function isBeside(a: LayoutLine, b: LayoutLine): boolean {
  return a.x + a.width <= b.x + EDGE_TOLERANCE_PT || b.x + b.width <= a.x + EDGE_TOLERANCE_PT;
}

function isProseLine(line: LayoutLine): boolean {
  const text = line.text.replace(/\s+/gu, ' ').trim();
  if (text.length < MIN_PROSE_CHARS) return false;
  return text.split(' ').filter((word) => /\p{L}/u.test(word)).length >= MIN_PROSE_WORDS;
}
