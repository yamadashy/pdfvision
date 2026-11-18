import {
  type DisplayFrame,
  type Matrix6,
  multiplyMatrix,
  normalizeRotation,
  pageDisplayFrame,
} from './displayFrame.js';

/**
 * Pick the frame a page is read and rendered in.
 *
 * Normally that is the displayed frame: the page turned by its `/Rotate`,
 * as a viewer shows it. One case keeps the stored orientation instead: a
 * page whose text is upright as stored and turned sideways (or upside
 * down) by `/Rotate`. A viewer shows that text sideways, a reader turns
 * their head, and rebuilding lines along the displayed axes would scramble
 * every line — so pdfvision reads, reports and renders that page unrotated,
 * and says so with a `rotated_page_read_unrotated` warning.
 *
 * Unrotated pages never fetch text here and always get the stored frame.
 */

interface PageLike {
  view: number[];
  rotate: number;
  getTextContent(params?: { includeMarkedContent?: boolean }): Promise<{ items: unknown[] }>;
}

const frames = new WeakMap<object, Promise<DisplayFrame>>();

export function resolvePageFrame(page: PageLike, content?: Promise<{ items: unknown[] }>): Promise<DisplayFrame> {
  const rotation = normalizeRotation(page.rotate);
  if (rotation === 0) return Promise.resolve(pageDisplayFrame(page.view, 0));
  let frame = frames.get(page);
  if (!frame) {
    frame = (content ?? page.getTextContent()).then((text) => chooseReadingFrame(page.view, rotation, text.items));
    frames.set(page, frame);
  }
  return frame;
}

/**
 * The displayed frame, unless the page's text reads upright only when
 * stored: then the stored (unrotated) frame, flagged by `rotation: 0`.
 */
export function chooseReadingFrame(view: readonly number[], rotation: number, items: readonly unknown[]): DisplayFrame {
  const displayed = pageDisplayFrame(view, rotation);
  if (!displayed.transform) return displayed;
  const stored = pageDisplayFrame(view, 0);
  const displayedUpright = uprightShare(items, displayed.transform);
  const storedUpright = uprightShare(items, undefined);
  if (storedUpright === undefined || displayedUpright === undefined) return displayed;
  if (!(storedUpright >= 0.5 && displayedUpright < 0.5)) return displayed;
  return displayedUpright > 0 ? { ...stored, sidewaysTextShare: displayedUpright } : stored;
}

// tan(~11°): a baseline within this slope of left-to-right counts as upright.
const UPRIGHT_SLOPE = 0.2;

/** Share of non-blank characters whose baseline runs left to right in the frame. */
function uprightShare(items: readonly unknown[], frameTransform: Matrix6 | undefined): number | undefined {
  let upright = 0;
  let total = 0;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const { str, transform } = item as { str?: unknown; transform?: unknown };
    if (typeof str !== 'string' || !isMatrix(transform)) continue;
    const weight = str.replace(/\s+/g, '').length;
    if (weight === 0) continue;
    const [a, b] = frameTransform ? multiplyMatrix(frameTransform, transform) : transform;
    total += weight;
    if (a > 0 && Math.abs(b) <= a * UPRIGHT_SLOPE) upright += weight;
  }
  return total > 0 ? upright / total : undefined;
}

function isMatrix(value: unknown): value is number[] {
  return Array.isArray(value) && value.length >= 6 && value.every((n) => typeof n === 'number' && Number.isFinite(n));
}
