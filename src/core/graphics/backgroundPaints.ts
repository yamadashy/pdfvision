import type { Rgb } from './paintColor.js';
import { PAGE_WHITE } from './paintColor.js';
import type { PageBox } from './textGlyphs.js';

/**
 * Paint history used to answer "what colour is behind this glyph?".
 *
 * Only an opaque, unclipped, axis-aligned rectangle of a known device
 * colour counts as a known background. Every other paint (complex paths,
 * strokes, translucent or clipped fills, shadings, fills inside groups or
 * optional content) is recorded as a region of unknown colour, and a glyph
 * whose most recent overlapping paint is unknown has no answer. Where
 * nothing was painted the page itself shows, which viewers render white.
 * Raster images are not in this history; callers rule them out with the
 * page's image boxes.
 */
export interface BackgroundPaint extends PageBox {
  color?: Rgb;
}

export interface BackgroundHistory {
  paints: BackgroundPaint[];
  /** Overlap checks left before the history stops answering. */
  remainingChecks: number;
  exhausted: boolean;
}

const MAX_BACKGROUND_PAINTS = 4_096;
const MAX_BACKGROUND_CHECKS = 2_000_000;
const UNBOUNDED = 1e9;

export function createBackgroundHistory(): BackgroundHistory {
  return { paints: [], remainingChecks: MAX_BACKGROUND_CHECKS, exhausted: false };
}

export function recordPaint(history: BackgroundHistory, box: PageBox, color?: Rgb): void {
  if (history.exhausted) return;
  if (history.paints.length >= MAX_BACKGROUND_PAINTS) {
    history.exhausted = true;
    return;
  }
  history.paints.push(color ? { ...box, color } : { ...box });
}

/** A paint that can reach anywhere on the page (shadings, raw fill paths, unbounded paths). */
export function recordUnboundedPaint(history: BackgroundHistory): void {
  recordPaint(history, { x: -UNBOUNDED, y: -UNBOUNDED, width: 2 * UNBOUNDED, height: 2 * UNBOUNDED });
}

/** Known colour behind `target`, or undefined when it cannot be established. */
export function backgroundColorAt(history: BackgroundHistory, target: PageBox): Rgb | undefined {
  if (history.exhausted) return undefined;
  for (let i = history.paints.length - 1; i >= 0; i--) {
    if (--history.remainingChecks < 0) {
      history.exhausted = true;
      return undefined;
    }
    const paint = history.paints[i];
    if (!overlaps(paint, target)) continue;
    return paint.color && contains(paint, target) ? paint.color : undefined;
  }
  return PAGE_WHITE;
}

/** True when some known background colour, or the page, could match `color`. */
export function hasCandidateBackground(history: BackgroundHistory, matches: (background: Rgb) => boolean): boolean {
  if (matches(PAGE_WHITE)) return true;
  return history.paints.some((paint) => paint.color !== undefined && matches(paint.color));
}

function overlaps(a: PageBox, b: PageBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function contains(outer: PageBox, inner: PageBox): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.width >= inner.x + inner.width &&
    outer.y + outer.height >= inner.y + inner.height
  );
}
