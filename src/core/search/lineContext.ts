import type { LayoutLine, PageLayout, SearchMatch } from '../../types/index.js';

/**
 * The line a native match sits on, as the body text renders it.
 *
 * A search hit's `context` is offered as a quotable preview, so it has to
 * agree with what `read_pdf` prints for the same sentence. The search
 * haystack is a raw span join built for matching, and on RTL text the two
 * diverge visibly: layout reconstruction restores the inter-word spaces
 * pdf.js emits as separate whitespace items and un-mirrors bracket glyphs,
 * while the search join does neither — the same Arabic sentence comes back
 * spaced and correctly bracketed from one tool and run together with
 * reversed parentheses from the other. Same reconstruction for both is the
 * fix; the haystack stays as it is, because changing it would change what
 * matches.
 *
 * Layout is already computed on every searched page (form-field labels and
 * link text need it), so this costs a lookup, not a second pass.
 */
export function reconstructedLines(layout: PageLayout | undefined): LayoutLine[] {
  if (!layout) return [];
  return layout.blocks.flatMap((block) => block.lines);
}

/**
 * The reconstructed line covering `box`, or undefined when none does.
 *
 * Two guards keep the preview honest. The match box must sit mostly
 * inside the line — a hit stitched across a line break, or one whose
 * glyphs layout assigned elsewhere, has no single line to quote. And the
 * line must actually contain the matched string: a reconstruction that
 * spaces or re-orders the text differently enough to lose the match is
 * not a preview of that match, whatever else it is. Both fall back to the
 * caller's haystack, which is what the context has always been.
 */
export function reconstructedLineContext(
  lines: readonly LayoutLine[],
  box: SearchMatch['bbox'],
  text: string,
): string | undefined {
  if (lines.length === 0) return undefined;
  const boxArea = Math.max(0, box.width) * Math.max(0, box.height);
  if (boxArea <= 0) return undefined;

  let best: LayoutLine | undefined;
  let bestOverlap = 0;
  for (const line of lines) {
    const overlap = intersectionArea(line, box);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = line;
    }
  }
  if (!best || bestOverlap / boxArea < MIN_LINE_COVERAGE) return undefined;
  return best.text.includes(text) ? best.text : undefined;
}

/** Fraction of the match box that the line must cover to be its line. */
const MIN_LINE_COVERAGE = 0.5;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function intersectionArea(a: Box, b: Box): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return Math.max(0, width) * Math.max(0, height);
}
