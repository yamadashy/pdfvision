import type { LayoutLine } from '../../../types/index.js';
import type { BBox } from '../geometry.js';

/** Lines that share one baseline, left to right. */
export interface Row {
  cells: LayoutLine[];
  top: number;
  bottom: number;
  /** The shortest cell's height. */
  height: number;
}

export interface Interval {
  left: number;
  right: number;
}

/** A run of rows found on the page, before it is checked against the blocks it covers. */
export interface RowRun {
  rows: Row[];
  left: number;
  right: number;
  /** Gaps clear in every row of the run, with a cell on each side of them. */
  gaps: Interval[];
}

export const MIN_RUN_ROWS = 3;
export const ALIGN_TOLERANCE_PT = 2;
export const CELL_OVERLAP_TOLERANCE_PT = 0.5;

export function center(box: BBox): number {
  return box.y + box.height / 2;
}

export function emOf(line: LayoutLine): number {
  return line.fontSize > 0 ? line.fontSize : Math.max(line.height, 1);
}
