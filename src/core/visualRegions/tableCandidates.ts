import type { PageLayout } from '../../types/index.js';
import { isUsableBox } from './predicates.js';
import type { BoxLike, Candidate } from './types.js';

const SHALLOW_TABLE_HINT_MAX_ROWS = 2;
const SHALLOW_TABLE_HINT_MAX_HEIGHT_RATIO = 0.1;
const SHALLOW_TABLE_HINT_MIN_WIDTH_RATIO = 0.65;
const OCR_FRAGMENT_TABLE_HINT_MIN_COLUMNS = 20;

export function addTableCandidates(
  layout: PageLayout | undefined,
  candidates: Candidate[],
  pageWidth: number,
  pageHeight: number,
): void {
  for (const [index, table] of (layout?.tables ?? []).entries()) {
    if (!isUsableBox(table)) continue;
    if (isLowConfidenceVisualTableHint(table, pageWidth, pageHeight)) continue;
    candidates.push({
      x: table.x,
      y: table.y,
      width: table.width,
      height: table.height,
      kind: 'table',
      priority: 3,
      reason: `layout table hint with ${table.rowCount} rows and ${table.columnCount} columns`,
      sources: [{ type: 'layoutTable', index }],
    });
  }
}

function isLowConfidenceVisualTableHint(
  table: BoxLike & { rowCount: number; columnCount: number },
  pageWidth: number,
  pageHeight: number,
): boolean {
  if (pageWidth <= 0 || pageHeight <= 0) return false;
  if (table.rowCount <= SHALLOW_TABLE_HINT_MAX_ROWS && table.columnCount >= OCR_FRAGMENT_TABLE_HINT_MIN_COLUMNS) {
    return true;
  }
  return (
    table.rowCount <= SHALLOW_TABLE_HINT_MAX_ROWS &&
    table.width >= pageWidth * SHALLOW_TABLE_HINT_MIN_WIDTH_RATIO &&
    table.height <= pageHeight * SHALLOW_TABLE_HINT_MAX_HEIGHT_RATIO
  );
}
