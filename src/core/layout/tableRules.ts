import type { BBox } from './geometry.js';

/** A painted horizontal or vertical rule: a thin, long vector box. */
export interface TableRule {
  /** Centre line across the rule: y for a horizontal rule, x for a vertical one. */
  at: number;
  /** Extent along the rule. */
  start: number;
  end: number;
}

export interface TableRules {
  horizontal: TableRule[];
  vertical: TableRule[];
}

const RULE_MAX_THICKNESS_PT = 2.5;
const RULE_MAX_HEAVY_THICKNESS_PT = 6;
const RULE_HEAVY_THICKNESS_RATIO = 0.01;
const RULE_MIN_LENGTH_PT = 6;
/** Pages with more boxes than this are maps or dense drawings; their rules say nothing reliable about tables. */
const MAX_RULE_SOURCE_BOXES = 4000;
const MERGE_TOLERANCE_PT = 0.75;
const CELL_BOX_MIN_SIDE_PT = 6;
const EDGE_SHARE_TOLERANCE_PT = 1;
const EDGE_SHARE_MIN_OVERLAP_RATIO = 0.5;

/**
 * The thin horizontal and vertical boxes among a page's vector boxes. A
 * rule drawn twice (once under a tinted band, once over it) or as touching
 * segments on one line is kept once.
 */
export function tableRules(boxes: readonly BBox[] | undefined): TableRules {
  const empty: TableRules = { horizontal: [], vertical: [] };
  if (!boxes || boxes.length === 0 || boxes.length > MAX_RULE_SOURCE_BOXES) return empty;
  const horizontal: TableRule[] = [];
  const vertical: TableRule[] = [];
  const cells: BBox[] = [];
  for (const box of boxes) {
    if (![box.x, box.y, box.width, box.height].every(Number.isFinite)) continue;
    if (box.height <= ruleThickness(box.width) && box.width >= RULE_MIN_LENGTH_PT) {
      horizontal.push({ at: box.y + box.height / 2, start: box.x, end: box.x + box.width });
    } else if (box.width <= ruleThickness(box.height) && box.height >= RULE_MIN_LENGTH_PT) {
      vertical.push({ at: box.x + box.width / 2, start: box.y, end: box.y + box.height });
    } else if (box.width >= CELL_BOX_MIN_SIDE_PT && box.height >= CELL_BOX_MIN_SIDE_PT) {
      cells.push(box);
    }
  }
  // Cells drawn as one rectangle each: their edges are the grid's rules.
  for (const box of tiledBoxes(cells)) {
    horizontal.push({ at: box.y, start: box.x, end: box.x + box.width });
    horizontal.push({ at: box.y + box.height, start: box.x, end: box.x + box.width });
    vertical.push({ at: box.x, start: box.y, end: box.y + box.height });
    vertical.push({ at: box.x + box.width, start: box.y, end: box.y + box.height });
  }
  return { horizontal: mergeRules(horizontal), vertical: mergeRules(vertical) };
}

/**
 * Boxes that share an edge with another box beside them and one above or
 * below them: rectangles tiling a grid, as a table drawn cell by cell is.
 * A lone frame, a tinted band or a row of bars shares edges in one
 * direction at most.
 */
function tiledBoxes(boxes: readonly BBox[]): BBox[] {
  if (boxes.length < 4) return [];
  const sideBySide = new Set<BBox>();
  const stacked = new Set<BBox>();
  const sorted = [...boxes].sort((a, b) => a.x - b.x);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (b.x > a.x + a.width + EDGE_SHARE_TOLERANCE_PT) break;
      if (a === b || sameBox(a, b)) continue;
      if (sharesVerticalEdge(a, b)) {
        sideBySide.add(a);
        sideBySide.add(b);
      }
      if (sharesHorizontalEdge(a, b)) {
        stacked.add(a);
        stacked.add(b);
      }
    }
  }
  return boxes.filter((box) => sideBySide.has(box) && stacked.has(box));
}

function sameBox(a: BBox, b: BBox): boolean {
  return (
    Math.abs(a.x - b.x) <= EDGE_SHARE_TOLERANCE_PT &&
    Math.abs(a.y - b.y) <= EDGE_SHARE_TOLERANCE_PT &&
    Math.abs(a.width - b.width) <= EDGE_SHARE_TOLERANCE_PT &&
    Math.abs(a.height - b.height) <= EDGE_SHARE_TOLERANCE_PT
  );
}

function sharesVerticalEdge(a: BBox, b: BBox): boolean {
  const touching =
    Math.abs(a.x + a.width - b.x) <= EDGE_SHARE_TOLERANCE_PT ||
    Math.abs(b.x + b.width - a.x) <= EDGE_SHARE_TOLERANCE_PT;
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return touching && overlap >= Math.min(a.height, b.height) * EDGE_SHARE_MIN_OVERLAP_RATIO;
}

function sharesHorizontalEdge(a: BBox, b: BBox): boolean {
  const touching =
    Math.abs(a.y + a.height - b.y) <= EDGE_SHARE_TOLERANCE_PT ||
    Math.abs(b.y + b.height - a.y) <= EDGE_SHARE_TOLERANCE_PT;
  const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  return touching && overlap >= Math.min(a.width, b.width) * EDGE_SHARE_MIN_OVERLAP_RATIO;
}

/** The thickest box of this length that still reads as a rule: heavier rules on large-format pages. */
function ruleThickness(length: number): number {
  return Math.min(RULE_MAX_HEAVY_THICKNESS_PT, Math.max(RULE_MAX_THICKNESS_PT, length * RULE_HEAVY_THICKNESS_RATIO));
}

function mergeRules(rules: TableRule[]): TableRule[] {
  const sorted = [...rules].sort((a, b) => a.at - b.at || a.start - b.start);
  const merged: TableRule[] = [];
  for (const rule of sorted) {
    const same = merged.find(
      (other) =>
        Math.abs(other.at - rule.at) <= MERGE_TOLERANCE_PT &&
        rule.start <= other.end + MERGE_TOLERANCE_PT &&
        rule.end >= other.start - MERGE_TOLERANCE_PT,
    );
    if (same) {
      same.start = Math.min(same.start, rule.start);
      same.end = Math.max(same.end, rule.end);
    } else {
      merged.push({ ...rule });
    }
  }
  return merged;
}

/**
 * Whether a vertical rule runs through the gap between two spans on one
 * line: a ruled cell boundary, which text never runs across.
 */
export function ruleBetween(
  rules: readonly TableRule[],
  left: BBox & { text: string },
  right: BBox & { text: string },
): boolean {
  if (rules.length === 0) return false;
  // One character per drawn box (a comb field's digits) is one entry, read as before.
  if (isSingleCharacter(left.text) && isSingleCharacter(right.text)) return false;
  const from = left.x + left.width - MERGE_TOLERANCE_PT;
  const to = right.x + MERGE_TOLERANCE_PT;
  const middle = (Math.max(left.y, right.y) + Math.min(left.y + left.height, right.y + right.height)) / 2;
  return rules.some((rule) => rule.at > from && rule.at < to && rule.start <= middle && rule.end >= middle);
}

function isSingleCharacter(text: string): boolean {
  return [...text.trim()].length === 1;
}
