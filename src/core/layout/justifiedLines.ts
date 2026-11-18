import type { TextSpan } from '../../types/index.js';
import { isCjkLeading } from '../text/cjkJoin.js';

/**
 * A justified line stretched so far that its word spaces look like column
 * gutters: the first line of a poster paragraph set in a wide measure with
 * few words (`The   drone   flagged   87%   of   the`). Split at every gap,
 * its words come out one per line.
 *
 * The evidence is the paragraph around it: a line just above or below,
 * read as ordinary prose with word-sized gaps, fills the same measure —
 * same left edge, same right edge — and the stretched gaps are even, as
 * justification makes them, between pieces of a word or two each. A table
 * row lines up with its neighbours too, but they are split into cells
 * themselves, so none of them reads as a prose line; a heading beside a
 * column has no paragraph line under it spanning the same width; the
 * first lines of text columns under a full-width paragraph are long runs,
 * not stretched words.
 */

const MIN_WORDS = 3;
/** Stretched gaps stay this even (largest over smallest). */
const MAX_GAP_RATIO = 1.8;
const MAX_GAP_EM = 4;
const EDGE_TOLERANCE_EM = 0.35;
/** The paragraph line is at most this many line heights away (two stretched lines can stand together). */
const NEIGHBOUR_MAX_DISTANCE_LINES = 4.5;
/** A piece between stretched spaces is a word or two. */
const PIECE_MAX_WORDS = 3;
const PIECE_MAX_CHARS = 30;
const NEIGHBOUR_MIN_CHARS = 12;
const SIZE_TOLERANCE = 0.15;

export interface LineExtent {
  left: number;
  right: number;
  top: number;
  height: number;
  fontSize: number;
  chars: number;
  /** Every gap in the group is a word space. */
  prose: boolean;
}

/** A word space is narrower than this; table cells sit further apart. */
const WORD_GAP_EM = 0.6;

export function lineExtent(group: readonly TextSpan[]): LineExtent {
  const sorted = [...group].sort((a, b) => a.x - b.x);
  let prose = true;
  for (let i = 1; i < sorted.length; i++) {
    const size = sorted[i].fontSize || sorted[i].height;
    if (sorted[i].x - (sorted[i - 1].x + sorted[i - 1].width) > WORD_GAP_EM * size) prose = false;
  }
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return {
    left: first.x,
    right: last.x + last.width,
    top: Math.min(...sorted.map((span) => span.y)),
    height: Math.max(...sorted.map((span) => span.height)),
    fontSize: first.fontSize || first.height,
    chars: sorted.reduce((sum, span) => sum + span.text.trim().length, 0),
    prose,
  };
}

const BUCKET_PT = 4;

/** Line extents keyed by their left edge, for the paragraph-line lookup. */
export type ExtentIndex = ReadonlyMap<number, readonly LineExtent[]>;

export function indexExtents(extents: readonly LineExtent[]): ExtentIndex {
  const index = new Map<number, LineExtent[]>();
  for (const extent of extents) {
    if (!extent.prose || extent.chars < NEIGHBOUR_MIN_CHARS) continue;
    const key = Math.floor(extent.left / BUCKET_PT);
    const list = index.get(key);
    if (list) list.push(extent);
    else index.set(key, [extent]);
  }
  return index;
}

/** Whether `sorted` (one row's spans, x-sorted) is a justified line of a paragraph among `index`. */
export function isJustifiedLine(sorted: readonly TextSpan[], index: ExtentIndex): boolean {
  if (sorted.length < MIN_WORDS) return false;
  if (sorted.some((span) => isCjkLeading(span.text.trim()))) return false;
  const long = (span: TextSpan) => {
    const text = span.text.trim();
    return text.length > PIECE_MAX_CHARS || text.split(/\s+/u).length > PIECE_MAX_WORDS;
  };
  if (sorted.some(long)) return false;
  const size = sorted[0].fontSize || sorted[0].height;
  if (size <= 0) return false;
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].x - (sorted[i - 1].x + sorted[i - 1].width);
    if (gap <= 0 || gap > MAX_GAP_EM * size) return false;
    gaps.push(gap);
  }
  if (Math.max(...gaps) > Math.min(...gaps) * MAX_GAP_RATIO) return false;
  const self = lineExtent(sorted);
  const tolerance = EDGE_TOLERANCE_EM * size;
  const candidates: LineExtent[] = [];
  const firstKey = Math.floor((self.left - tolerance) / BUCKET_PT);
  const lastKey = Math.floor((self.left + tolerance) / BUCKET_PT);
  for (let key = firstKey; key <= lastKey; key++) candidates.push(...(index.get(key) ?? []));
  return candidates.some(
    (other) =>
      Math.abs(other.fontSize - size) <= size * SIZE_TOLERANCE &&
      Math.abs(other.top - self.top) <= NEIGHBOUR_MAX_DISTANCE_LINES * self.height &&
      Math.abs(other.top - self.top) >= self.height * 0.5 &&
      Math.abs(other.left - self.left) <= tolerance &&
      Math.abs(other.right - self.right) <= tolerance,
  );
}
