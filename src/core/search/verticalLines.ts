import type { TextSpan } from '../../types/index.js';
import { isVerticalSearchOwner } from './boxes.js';
import type { SearchLine, SearchOwner } from './types.js';

const FONT_SIZE_FALLBACK_PT = 12;
const VERTICAL_SEARCH_COLUMN_X_TOLERANCE_PT = 4;
const VERTICAL_SEARCH_MAX_COLUMN_GAP_PT = 36;
const VERTICAL_SEARCH_MAX_COLUMN_GAP_RATIO = 3;
const VERTICAL_SEARCH_MIN_SPAN_HEIGHT_RATIO = 2;
const LATIN_OR_NUMBER_END_RE = /[\p{Script=Latin}\p{M}\p{N}]$/u;
const LATIN_OR_NUMBER_START_RE = /^[\p{Script=Latin}\p{M}\p{N}]/u;
const LOWERCASE_START_RE = /^\p{Ll}/u;

interface VerticalSearchColumn {
  centerX: number;
  fontSize: number;
  spans: TextSpan[];
}

export function buildVerticalSearchLines(spans: readonly TextSpan[]): SearchLine[] {
  const verticalSpans = spans.filter(isVerticalSearchSpan);
  if (verticalSpans.length < 2) return [];

  const columns = groupVerticalSearchColumns(verticalSpans).sort((a, b) => b.centerX - a.centerX);
  const lines: SearchLine[] = [];
  let run: VerticalSearchColumn[] = [];
  const flush = () => {
    const line = verticalSearchLineFromColumns(run);
    if (line) lines.push(line);
    run = [];
  };

  for (const column of columns) {
    const previous = run.at(-1);
    if (previous && !canContinueVerticalSearchColumn(previous, column)) flush();
    run.push(column);
  }
  flush();
  return lines;
}

function isVerticalSearchSpan(span: TextSpan): boolean {
  if (span.text.trim().length === 0) return false;
  if (!isVerticalSearchOwner(span)) return false;
  const fontSize = span.fontSize || FONT_SIZE_FALLBACK_PT;
  return span.height >= fontSize * VERTICAL_SEARCH_MIN_SPAN_HEIGHT_RATIO;
}

function groupVerticalSearchColumns(spans: readonly TextSpan[]): VerticalSearchColumn[] {
  const columns: VerticalSearchColumn[] = [];
  const sorted = [...spans].sort((a, b) => centerX(b) - centerX(a) || a.y - b.y);
  for (const span of sorted) {
    const x = centerX(span);
    const column = columns.find((item) => Math.abs(item.centerX - x) <= VERTICAL_SEARCH_COLUMN_X_TOLERANCE_PT);
    if (column) {
      column.spans.push(span);
      column.centerX = column.spans.reduce((sum, item) => sum + centerX(item), 0) / Math.max(column.spans.length, 1);
      column.fontSize = median(column.spans.map((item) => item.fontSize || FONT_SIZE_FALLBACK_PT));
    } else {
      columns.push({
        centerX: x,
        fontSize: span.fontSize || FONT_SIZE_FALLBACK_PT,
        spans: [span],
      });
    }
  }
  for (const column of columns) {
    column.spans.sort((a, b) => a.y - b.y || b.x - a.x);
  }
  return columns;
}

function canContinueVerticalSearchColumn(prev: VerticalSearchColumn, cur: VerticalSearchColumn): boolean {
  const gap = prev.centerX - cur.centerX;
  if (gap < 0) return false;
  const fontSize = Math.max(prev.fontSize, cur.fontSize, FONT_SIZE_FALLBACK_PT);
  if (gap > Math.max(fontSize * VERTICAL_SEARCH_MAX_COLUMN_GAP_RATIO, VERTICAL_SEARCH_MAX_COLUMN_GAP_PT)) {
    return false;
  }
  const overlap = Math.min(columnBottom(prev), columnBottom(cur)) - Math.max(columnTop(prev), columnTop(cur));
  return overlap > 0;
}

function verticalSearchLineFromColumns(columns: readonly VerticalSearchColumn[]): SearchLine | undefined {
  if (columns.length < 2) return undefined;
  let text = '';
  const owners: (SearchOwner | undefined)[] = [];
  let previousSpan: TextSpan | undefined;

  for (const column of columns) {
    for (const span of column.spans) {
      const spanText = span.text;
      if (spanText.length === 0) continue;
      const delimiter = previousSpan ? verticalSearchDelimiter(previousSpan, span) : '';
      if (delimiter.length > 0 && !/\s$/.test(text) && !/^\s/.test(spanText)) {
        text += delimiter;
        owners.push(undefined);
      }
      text += spanText;
      for (let index = 0; index < spanText.length; index++) owners.push(span);
      previousSpan = span;
    }
  }

  return text.length > 0 ? { text, owners, syntheticVertical: true } : undefined;
}

function verticalSearchDelimiter(prev: TextSpan, cur: TextSpan): string {
  const prevText = prev.text.trimEnd();
  const curText = cur.text.trimStart();
  if (!LATIN_OR_NUMBER_END_RE.test(prevText) || !LATIN_OR_NUMBER_START_RE.test(curText)) return '';
  if (LOWERCASE_START_RE.test(curText)) return '';
  return ' ';
}

function centerX(span: TextSpan): number {
  return span.x + span.width / 2;
}

function columnTop(column: VerticalSearchColumn): number {
  return Math.min(...column.spans.map((span) => span.y));
}

function columnBottom(column: VerticalSearchColumn): number {
  return Math.max(...column.spans.map((span) => span.y + span.height));
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
