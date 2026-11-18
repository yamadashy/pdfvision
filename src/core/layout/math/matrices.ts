import type { TextSpan, VectorBox } from '../../../types/index.js';
import type { BBox } from '../geometry.js';
import { joinLineSpans } from '../lineText.js';
import { type Assembled, axisNeighbour, baseline, boxOf, em, hasCjk, right, termOnLine } from './shared.js';

/** A bracket stroke: a tall narrow path, wider than a plain rule by its serifs. */
const BRACKET_MIN_WIDTH_PT = 1.2;
const BRACKET_MAX_WIDTH_PT = 8;
const BRACKET_MIN_HEIGHT_PT = 14;
const BRACKET_MIN_ASPECT = 3;
const MAX_BRACKETS = 60;
const PAIR_EDGE_TOLERANCE_PT = 1.5;
const ROW_BASELINE_EM = 0.3;
/** Cells of a matrix row are set apart by at least this much. */
const CELL_GAP_EM = 0.8;
/** The brackets hug their rows. */
const BRACKET_MAX_SLACK_EM = 1.6;
const AXIS_NEIGHBOUR_MAX_GAP_EM = 1.5;
const MAX_ROWS = 12;
const MATH_NEIGHBOUR_RE = /[=<>≤≥≈≡∼≃≅∝≠+−±∓×·∗∘]/u;

export function bracketBoxes(boxes: readonly VectorBox[] | undefined): BBox[] {
  if (!boxes || boxes.length === 0) return [];
  const brackets = boxes.filter(
    (box) =>
      box.width >= BRACKET_MIN_WIDTH_PT &&
      box.width <= BRACKET_MAX_WIDTH_PT &&
      box.height >= BRACKET_MIN_HEIGHT_PT &&
      box.height >= box.width * BRACKET_MIN_ASPECT,
  );
  return brackets.length > MAX_BRACKETS ? [] : brackets.sort((a, b) => a.x - b.x);
}

export interface MatrixReading {
  /** Present when the rows linearise; absent when the region could not be read soundly. */
  assembled?: Assembled;
  region: BBox;
}

/**
 * Matrices between a pair of vector brackets of one height, with text
 * beside them on their middle line (`Σ =`): `[[0.042, −0.013], [−0.013,
 * 0.027]]`. Rows are the baselines inside the brackets, cells the runs a
 * column gap apart; every row must have the same number of cells, or the
 * region is reported unread.
 */
export function matrixBrackets(
  brackets: readonly BBox[],
  pool: readonly TextSpan[],
  rules: readonly BBox[] = [],
): MatrixReading[] {
  const out: MatrixReading[] = [];
  const used = new Set<BBox>();
  for (let i = 0; i < brackets.length; i++) {
    const open = brackets[i];
    if (used.has(open)) continue;
    for (let j = i + 1; j < brackets.length; j++) {
      const close = brackets[j];
      if (used.has(close) || close.x <= right(open)) continue;
      if (Math.abs(close.y - open.y) > PAIR_EDGE_TOLERANCE_PT) continue;
      if (Math.abs(close.y + close.height - (open.y + open.height)) > PAIR_EDGE_TOLERANCE_PT) continue;
      if (closedByRule(open, close, rules)) continue;
      const reading = readMatrix(open, close, pool);
      if (!reading) continue;
      used.add(open);
      used.add(close);
      out.push(reading);
      break;
    }
  }
  return out;
}

function readMatrix(open: BBox, close: BBox, pool: readonly TextSpan[]): MatrixReading | undefined {
  const top = Math.min(open.y, close.y);
  const bottom = Math.max(open.y + open.height, close.y + close.height);
  const inside: TextSpan[] = [];
  for (const span of pool) {
    const centreY = span.y + span.height / 2;
    const overlapsY = span.y < bottom && span.y + span.height > top;
    if (!overlapsY) continue;
    const overlapsX = span.x < right(close) && right(span) > open.x;
    if (!overlapsX) continue;
    // Text across a bracket, or half in and half out of the band: these are rules of something else.
    if (span.x < right(open) - 0.5 || right(span) > close.x + 0.5) return undefined;
    if (centreY < top || centreY > bottom) return undefined;
    inside.push(span);
  }
  if (inside.length < 2) return undefined;
  if (inside.some((span) => hasCjk(span.text))) return undefined;
  const size = Math.max(...inside.map(em));
  const rows = rowsOf(inside);
  if (rows.length < 2 || rows.length > MAX_ROWS) return undefined;
  const content = boxOf(inside);
  if (bottom - top - content.height > BRACKET_MAX_SLACK_EM * size) return undefined;
  if (content.x - right(open) > BRACKET_MAX_SLACK_EM * size || close.x - right(content) > BRACKET_MAX_SLACK_EM * size)
    return undefined;

  const region = boxOf([open, close, ...inside]);
  const axis = (top + bottom) / 2;
  // `Σ =` before it, `= b` after it: a table between two rules has no relation beside it.
  const exclude = new Set(inside);
  let neighbour = axisNeighbour(pool, region, axis, exclude, AXIS_NEIGHBOUR_MAX_GAP_EM);
  if (neighbour && !MATH_NEIGHBOUR_RE.test(neighbour.text)) {
    // The nearest may be the full stop after it; the relation is on the other side.
    exclude.add(neighbour);
    const other = axisNeighbour(pool, region, axis, exclude, AXIS_NEIGHBOUR_MAX_GAP_EM);
    neighbour = other && MATH_NEIGHBOUR_RE.test(other.text) ? other : undefined;
  }
  if (!neighbour) return undefined;

  const cells = rows.map((row) => cellsOf(row));
  const width = cells[0].length;
  if (cells.some((row) => row.length !== width)) return { region };
  const text = `[${cells.map((row) => `[${row.join(', ')}]`).join(', ')}]`;
  return { assembled: { parts: inside, span: termOnLine(text, region.x, right(region), neighbour) }, region };
}

/** A rule from one stroke to the other at their top or foot: the strokes are a table's sides, not brackets. */
function closedByRule(open: BBox, close: BBox, rules: readonly BBox[]): boolean {
  return rules.some((rule) =>
    [open.y, open.y + open.height].some(
      (edge) =>
        Math.abs(rule.y + rule.height / 2 - edge) <= PAIR_EDGE_TOLERANCE_PT &&
        rule.x <= right(open) + PAIR_EDGE_TOLERANCE_PT &&
        right(rule) >= close.x - PAIR_EDGE_TOLERANCE_PT &&
        rule.width > close.x - right(open),
    ),
  );
}

function rowsOf(spans: readonly TextSpan[]): TextSpan[][] {
  const sorted = [...spans].sort((a, b) => baseline(a) - baseline(b));
  const rows: TextSpan[][] = [];
  for (const span of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(baseline(span) - baseline(row[0])) <= ROW_BASELINE_EM * em(span)) row.push(span);
    else rows.push([span]);
  }
  return rows;
}

function cellsOf(row: readonly TextSpan[]): string[] {
  const sorted = [...row].sort((a, b) => a.x - b.x);
  const cells: TextSpan[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].x - right(sorted[i - 1]);
    if (gap > CELL_GAP_EM * em(sorted[i])) cells.push([sorted[i]]);
    else cells[cells.length - 1].push(sorted[i]);
  }
  return cells.map((cell) => joinLineSpans(cell));
}
