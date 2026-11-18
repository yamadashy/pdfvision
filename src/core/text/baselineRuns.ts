import { isRawTextItem, isWhitespaceItem, type RawTextItem } from './textItems.js';

/**
 * Join text set along a rotated or curved baseline into one item.
 *
 * Map labels, seals, badges and chart annotations are often drawn one glyph
 * (or one word) per text object, each turned to the local direction of the
 * line it follows. pdf.js reports every piece as its own item, and every
 * later pass groups items by axis-aligned rows, so a curved name comes back
 * as spaced fragments interleaved with other labels and a search for it
 * finds nothing.
 *
 * A run is a sequence of consecutive items (in content order) in one font
 * and size where each item starts where the previous one's advance ends,
 * along a direction that turns by at most a few degrees per step. That is
 * the shape of a line being written; unrelated single glyphs — scatter-plot
 * markers, form digit cells, vertical CJK stacks — are upright and do not
 * start at their neighbour's advance end, so they never form one. Only runs
 * that are actually turned are joined: upright text has its own passes.
 *
 * The joined item keeps the first glyph's direction when the run is
 * straight. A curved run gets a chord frame instead — first glyph to last —
 * with its origin and height grown so the rectangle covers every glyph box,
 * so the reported bbox stays sound.
 */

// A run is joined only if one of its items is turned at least this far from upright.
const MIN_TURN_DEG = 2;
const MAX_STEP_TURN_DEG = 25;
const STRAIGHT_RUN_DEG = 0.5;
const SAME_SIZE_RATIO = 0.15;
const MAX_LATERAL_EM = 0.3;
const MAX_OVERLAP_EM = 0.3;
const MAX_GAP_EM = 1.5;
const WORD_GAP_EM = 0.1;
const GLYPH_WORD_GAP_EM = 0.2;
const GLYPH_WORD_GAP_RATIO = 1.8;
const ORTHOGONAL_TOLERANCE = 0.05;

interface Piece {
  index: number;
  item: RawTextItem;
  ox: number;
  oy: number;
  ux: number;
  uy: number;
  angle: number;
  size: number;
  width: number;
  height: number;
}

interface Link {
  piece: Piece;
  /** Whitespace pdf.js emitted between this piece and the previous one. */
  spaced: boolean;
  /** Distance from the previous piece's advance end to this piece's origin, along the run. */
  gap: number;
}

export function joinBaselineRuns(items: readonly unknown[]): unknown[] {
  const runs = findRuns(items);
  if (runs.length === 0) return [...items];
  const replace = new Map<number, RawTextItem>();
  const drop = new Set<number>();
  for (const run of runs) {
    const first = run[0].piece.index;
    const last = run[run.length - 1].piece.index;
    replace.set(first, mergeRun(run));
    for (let index = first + 1; index <= last; index++) drop.add(index);
  }
  return items.flatMap((item, index) => {
    const replacement = replace.get(index);
    if (replacement) return [replacement];
    return drop.has(index) ? [] : [item];
  });
}

function findRuns(items: readonly unknown[]): Link[][] {
  const runs: Link[][] = [];
  let run: Link[] = [];
  let spaced = false;
  const flush = () => {
    if (run.length >= 2 && run.some((link) => Math.abs(link.piece.angle) >= MIN_TURN_DEG)) runs.push(run);
    run = [];
  };
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!isRawTextItem(item)) continue;
    // Separators pdf.js inserts between glyphs carry no geometry worth reading.
    if (item.str.length === 0) continue;
    if (isWhitespaceItem(item)) {
      spaced = true;
      continue;
    }
    const piece = pieceOf(index, item);
    if (!piece) {
      flush();
      spaced = false;
      continue;
    }
    const prev = run.at(-1)?.piece;
    const gap = prev ? continuation(prev, piece) : undefined;
    if (prev && gap === undefined) flush();
    run.push({ piece, spaced: run.length > 0 && spaced, gap: gap ?? 0 });
    spaced = false;
  }
  flush();
  return runs;
}

function pieceOf(index: number, item: RawTextItem): Piece | undefined {
  const t = item.transform;
  if (!t || t.length < 6 || item.dir === 'ttb') return undefined;
  const [a, b, c, d, e, f] = t;
  if (![a, b, c, d, e, f].every(Number.isFinite)) return undefined;
  const size = Math.hypot(a, b);
  const across = Math.hypot(c, d);
  if (size <= 1e-6 || across <= 1e-6) return undefined;
  const ux = a / size;
  const uy = b / size;
  // Mirrored or skewed text is not a line being written along a path.
  if (a * d - b * c <= 0 || Math.abs(ux * c + uy * d) > across * ORTHOGONAL_TOLERANCE) return undefined;
  const width = typeof item.width === 'number' && Number.isFinite(item.width) ? item.width : Number.NaN;
  if (!(width > 0)) return undefined;
  const height =
    typeof item.height === 'number' && Number.isFinite(item.height) && item.height > 0 ? item.height : size;
  return {
    index,
    item,
    ox: e,
    oy: f,
    ux,
    uy,
    angle: (Math.atan2(uy, ux) * 180) / Math.PI,
    size,
    width,
    height,
  };
}

/** The gap along the run from `prev`'s advance end to `cur`, or undefined when `cur` does not continue it. */
function continuation(prev: Piece, cur: Piece): number | undefined {
  if (cur.item.fontName !== prev.item.fontName) return undefined;
  if (Math.abs(cur.size - prev.size) > prev.size * SAME_SIZE_RATIO) return undefined;
  if (Math.abs(angleDelta(cur.angle, prev.angle)) > MAX_STEP_TURN_DEG) return undefined;
  const mx = prev.ux + cur.ux;
  const my = prev.uy + cur.uy;
  const m = Math.hypot(mx, my);
  if (m <= 1e-6) return undefined;
  const dx = cur.ox - (prev.ox + prev.ux * prev.width);
  const dy = cur.oy - (prev.oy + prev.uy * prev.width);
  const along = (dx * mx + dy * my) / m;
  const lateral = (dy * mx - dx * my) / m;
  const em = prev.size;
  if (Math.abs(lateral) > em * MAX_LATERAL_EM) return undefined;
  if (along < -em * MAX_OVERLAP_EM || along > em * MAX_GAP_EM) return undefined;
  return along;
}

function mergeRun(run: readonly Link[]): RawTextItem {
  const first = run[0].piece;
  const last = run[run.length - 1].piece;
  const glyphGaps = run
    .slice(1)
    .filter((link, i) => !link.spaced && (isGlyph(link.piece) || isGlyph(run[i].piece)))
    .map((link) => link.gap)
    .sort((x, y) => x - y);
  const glyphGap = glyphGaps.length > 0 ? glyphGaps[Math.floor(glyphGaps.length / 2)] : 0;
  let str = first.item.str;
  for (let i = 1; i < run.length; i++) {
    const link = run[i];
    const prev = run[i - 1].piece;
    const next = link.piece.item.str;
    if (/\s$/.test(str) || /^\s/.test(next)) {
      str += next;
      continue;
    }
    const em = prev.size;
    const words = !isGlyph(prev) && !isGlyph(link.piece);
    const wordGap = words
      ? link.gap > em * WORD_GAP_EM
      : link.gap > em * GLYPH_WORD_GAP_EM && link.gap > glyphGap * GLYPH_WORD_GAP_RATIO;
    str += link.spaced || wordGap ? ` ${next}` : next;
  }
  const size = median(run.map((link) => link.piece.size));
  const straight = run.every((link) => Math.abs(angleDelta(link.piece.angle, first.angle)) <= STRAIGHT_RUN_DEG);
  const base = { ...first.item, str, hasEOL: !!last.item.hasEOL };
  if (straight) {
    const endX = last.ox + last.ux * last.width - first.ox;
    const endY = last.oy + last.uy * last.width - first.oy;
    const width = Math.max(0, endX * first.ux + endY * first.uy);
    const height = Math.max(...run.map((link) => link.piece.height));
    const t = first.item.transform as readonly number[];
    return { ...base, width, height, transform: [t[0], t[1], t[2], t[3], t[4], t[5]] };
  }
  // Chord frame: first origin to last advance end, grown to cover every glyph box.
  const cx = last.ox + last.ux * last.width - first.ox;
  const cy = last.oy + last.uy * last.width - first.oy;
  const chord = Math.hypot(cx, cy) || 1;
  const ux = cx / chord;
  const uy = cy / chord;
  let minAlong = Number.POSITIVE_INFINITY;
  let maxAlong = Number.NEGATIVE_INFINITY;
  let minAcross = Number.POSITIVE_INFINITY;
  let maxAcross = Number.NEGATIVE_INFINITY;
  for (const { piece } of run) {
    const nx = -piece.uy;
    const ny = piece.ux;
    for (const [along, up] of [
      [0, 0],
      [piece.width, 0],
      [0, piece.height],
      [piece.width, piece.height],
    ]) {
      const px = piece.ox + piece.ux * along + nx * up - first.ox;
      const py = piece.oy + piece.uy * along + ny * up - first.oy;
      const s = px * ux + py * uy;
      const n = py * ux - px * uy;
      minAlong = Math.min(minAlong, s);
      maxAlong = Math.max(maxAlong, s);
      minAcross = Math.min(minAcross, n);
      maxAcross = Math.max(maxAcross, n);
    }
  }
  const ox = first.ox + ux * minAlong - uy * minAcross;
  const oy = first.oy + uy * minAlong + ux * minAcross;
  return {
    ...base,
    width: maxAlong - minAlong,
    height: maxAcross - minAcross,
    transform: [size * ux, size * uy, -size * uy, size * ux, ox, oy],
  };
}

function isGlyph(piece: Piece): boolean {
  return [...piece.item.str.trim()].length <= 1;
}

function angleDelta(a: number, b: number): number {
  return ((((a - b + 180) % 360) + 360) % 360) - 180;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.floor(sorted.length / 2)];
}
