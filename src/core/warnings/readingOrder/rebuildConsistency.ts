import type { LayoutBlock, LayoutLine, PageWarning } from '../../../types/index.js';
import { horizontalOverlap } from '../../warningTextOverlap/index.js';
import { shortTextSample } from '../textSamples.js';
import { READING_ORDER_REMEDY, READING_ORDER_UNRESOLVED_REMEDY } from './remedy.js';

/** Five blocks alternating P Q P Q P: one or two side-by-side switches
 *  happen wherever a margin note or label sits beside a paragraph; four
 *  in a row of prose lines is two text blocks read line by line. */
const WOVEN_MIN_SWITCHES = 4;
/** How far apart two side-by-side blocks may sit vertically, in multiples
 *  of the shorter one's height, and still be beside each other. */
const WOVEN_BESIDE_MAX_GAP_RATIO = 1.5;
const PROSE_MIN_CHARS = 12;
const PROSE_MIN_WORDS = 2;
const FUSED_PROSE_MIN_WORDS = 3;
const EDGE_TOLERANCE_PT = 0.5;

/**
 * Rewrite the remedy of `reading_order_divergence` warnings emitted from
 * `from` onward when the layout order they recommend is itself broken.
 *
 * Every reading-order detector compares native order against the layout
 * pass's order and recommends the latter, and the Markdown surface goes
 * further and says it already rebuilt the body that way. Both claims are
 * only as good as the layout order. Where side-by-side text blocks share
 * baselines, the layout pass can read them line by line, alternating
 * between the two, or join a line of one onto a line of the other; the
 * rebuilt body is then as interleaved as the stream was. Recommending it
 * there sends the reader to output that is wrong in a way it has no
 * reason to check, so the remedy names the evidence and the page render
 * instead.
 *
 * The superscript/inline-math variant ends with a different clause and
 * is left alone: it is about characters inside one block, which the
 * layout pass has in the right order regardless of what happens elsewhere
 * on the page.
 */
export function qualifyUnreliableLayoutOrder(blocks: readonly LayoutBlock[], out: PageWarning[], from: number): void {
  let evidence: string | null | undefined;
  for (let i = from; i < out.length; i++) {
    const warning = out[i];
    if (warning.code !== 'reading_order_divergence' || !warning.message.endsWith(READING_ORDER_REMEDY)) continue;
    if (evidence === undefined) evidence = describeInconsistentLayoutOrder(blocks) ?? null;
    if (evidence === null) return;
    const lead = warning.message.slice(0, -READING_ORDER_REMEDY.length);
    out[i] = {
      ...warning,
      message: `${lead}the layout-rebuilt order is unreliable here too — ${evidence}; ${READING_ORDER_UNRESOLVED_REMEDY}`,
    };
  }
}

/** Why the layout order is not a reading order, or undefined when nothing
 *  shows it is wrong. Exported for unit tests. */
export function describeInconsistentLayoutOrder(blocks: readonly LayoutBlock[]): string | undefined {
  // Vertical columns and turned regions are laid out along their own axes; these page-frame checks do not apply.
  const body = blocks.filter(
    (block) => !block.repeated && block.writingMode !== 'vertical' && block.rotation === undefined,
  );
  return describeWovenBlocks(body) ?? describeFusedColumnBlock(body);
}

/**
 * Two runs of prose read alternately, one line from each: the layout
 * order goes P → Q → P → Q → P where P and Q sit side by side, and each
 * P block starts within one line of leading below the previous P block —
 * close enough that, without Q's line between them, they would have been
 * one paragraph. A table read row by row alternates too, which is why
 * both sides must be prose and each side must continue at line spacing.
 */
function describeWovenBlocks(blocks: readonly LayoutBlock[]): string | undefined {
  let switches = 0;
  let start = 0;
  for (let i = 1; i < blocks.length; i++) {
    const previous = blocks[i - 1];
    const current = blocks[i];
    if (!isBesideSwitch(previous, current)) {
      switches = 0;
      continue;
    }
    const continuesWeave = switches > 0 && continuesSameSide(blocks[i - 2], current);
    if (!continuesWeave) {
      start = i - 1;
      switches = 0;
    }
    switches++;
    if (switches >= WOVEN_MIN_SWITCHES) {
      return `side-by-side blocks "${shortTextSample(blocks[start].text)}" and "${shortTextSample(blocks[start + 1].text)}" are interleaved line by line`;
    }
  }
  return undefined;
}

function isBesideSwitch(a: LayoutBlock, b: LayoutBlock): boolean {
  if (!isProse(a.text, PROSE_MIN_WORDS) || !isProse(b.text, PROSE_MIN_WORDS)) return false;
  if (!horizontallyDisjoint(a, b)) return false;
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  const minHeight = Math.max(Math.min(a.height, b.height), 1);
  return overlap > -minHeight * WOVEN_BESIDE_MAX_GAP_RATIO;
}

function continuesSameSide(earlier: LayoutBlock, later: LayoutBlock): boolean {
  if (!horizontalOverlap(earlier, later)) return false;
  const gap = later.y - (earlier.y + earlier.height);
  return gap >= -EDGE_TOLERANCE_PT && gap <= lastLineHeight(earlier);
}

function lastLineHeight(block: LayoutBlock): number {
  const last = block.lines.at(-1);
  return last ? last.height : block.height;
}

/**
 * A block is a stack of lines read top to bottom, so any two of its prose
 * lines share some horizontal extent. Two that share none mean the block
 * ran on from one column into the one beside it.
 */
function describeFusedColumnBlock(blocks: readonly LayoutBlock[]): string | undefined {
  for (const block of blocks) {
    const prose = block.lines.filter((line) => isProse(line.text, FUSED_PROSE_MIN_WORDS));
    const pair = firstDisjointPair(prose);
    if (pair) {
      return `one block runs from "${shortTextSample(pair[0].text)}" into "${shortTextSample(pair[1].text)}" in a side-by-side column`;
    }
  }
  return undefined;
}

function firstDisjointPair(lines: readonly LayoutLine[]): [LayoutLine, LayoutLine] | undefined {
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      if (horizontallyDisjoint(lines[i], lines[j])) return [lines[i], lines[j]];
    }
  }
  return undefined;
}

function horizontallyDisjoint(a: { x: number; width: number }, b: { x: number; width: number }): boolean {
  return a.x + a.width <= b.x + EDGE_TOLERANCE_PT || b.x + b.width <= a.x + EDGE_TOLERANCE_PT;
}

function isProse(text: string, minWords: number): boolean {
  const collapsed = text.replace(/\s+/gu, ' ').trim();
  if (collapsed.length < PROSE_MIN_CHARS) return false;
  const words = collapsed.split(' ').filter((word) => /\p{L}/u.test(word));
  return words.length >= minWords;
}
