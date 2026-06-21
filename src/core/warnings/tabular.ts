import type { LayoutBlock, LayoutLine, PageResult, PageWarning } from '../../types/index.js';

const TABULAR_NUMERIC_MIN_LINES = 12;
const TABULAR_NUMERIC_MIN_LINE_RATIO = 0.25;
const TABULAR_NUMERIC_MIN_ALIGNED_COLUMNS = 2;
const TABULAR_NUMERIC_MIN_LINES_PER_COLUMN = 3;
const TABULAR_NUMERIC_COLUMN_TOLERANCE_PT = 10;
const TABULAR_NUMERIC_ROW_TOLERANCE_PT = 4;
const TABULAR_NUMERIC_MIN_SHARED_ROWS = 3;
const TABULAR_NUMERIC_ROW_CADENCE_MIN_MATCH_RATIO = 0.65;
const TABULAR_NUMERIC_ROW_CADENCE_TOLERANCE_RATIO = 0.25;
const TABULAR_NUMERIC_ROW_CADENCE_MIN_TOLERANCE_PT = 2;
const TABULAR_NUMERIC_RECURRING_COLUMN_MIN_ROWS = 4;
const TABULAR_NUMERIC_RECURRING_COLUMN_MIN_COLUMNS = 3;
const TABULAR_NUMERIC_RECURRING_COLUMN_MIN_ROW_RATIO = 0.6;
const DOT_LEADER_NOISE_MIN_LINES = 8;
const DOT_LEADER_NOISE_MIN_DOTS = 80;

export function detectTabularNumericLayout(blocks: LayoutBlock[], out: PageWarning[]): void {
  const allLines = blocks.flatMap((block) => block.lines);
  if (allLines.length === 0) return;

  const numericLines = allLines.filter(isTabularNumericLine);
  if (numericLines.length < TABULAR_NUMERIC_MIN_LINES) return;
  if (numericLines.length / allLines.length < TABULAR_NUMERIC_MIN_LINE_RATIO) return;

  const alignedColumns = clusterNumericLines(numericLines).filter(
    (cluster) => cluster.lines.length >= TABULAR_NUMERIC_MIN_LINES_PER_COLUMN,
  );
  if (alignedColumns.length < TABULAR_NUMERIC_MIN_ALIGNED_COLUMNS) return;
  const sharedRowCenters = sharedNumericRowCenters(alignedColumns);
  const sharedRows = sharedRowCenters.length;
  if (sharedRows < TABULAR_NUMERIC_MIN_SHARED_ROWS) return;
  if (
    !hasRegularNumericRowCadence(sharedRowCenters) &&
    !hasRecurringNumericColumns(allLines, alignedColumns, sharedRows)
  ) {
    return;
  }

  out.push({
    code: 'tabular_numeric_layout',
    severity: 'warning',
    message: `page contains ${numericLines.length} short numeric lines in ${alignedColumns.length} aligned columns and ${sharedRows} shared numeric rows — table rows/columns may be flattened in native text; inspect the render or geometry when values matter`,
  });
}

export function detectDotLeaderNoise(page: PageResult, out: PageWarning[]): void {
  const sources = [
    page.layout?.blocks.flatMap((block) =>
      block.lines.length > 0 ? block.lines.map((line) => line.text) : [block.text],
    ) ?? [],
    page.spans?.map((span) => span.text) ?? [],
    page.text.split(/\n+/u),
  ];
  const stats = sources
    .map(dotLeaderStats)
    .find((item) => item.lineCount >= DOT_LEADER_NOISE_MIN_LINES && item.dotCount >= DOT_LEADER_NOISE_MIN_DOTS);
  if (!stats) return;

  out.push({
    code: 'dot_leader_noise',
    severity: 'warning',
    message: `page contains ${stats.lineCount} standalone dotted leader/noise lines (${stats.dotCount} dot marks) — table-of-contents leaders, map stipple, or decorative dot patterns may have been represented as native text; inspect layout or render before trusting dotted text or row associations`,
  });
}

function dotLeaderStats(lines: readonly string[]): { lineCount: number; dotCount: number } {
  return lines.reduce(
    (stats, text) => {
      const token = dotLeaderToken(text);
      if (isStandaloneDotLeaderToken(token)) {
        stats.lineCount++;
        stats.dotCount += token.length;
      }
      return stats;
    },
    { lineCount: 0, dotCount: 0 },
  );
}

function isStandaloneDotLeaderToken(token: string): boolean {
  if (token.length < 3) return false;
  return /^[.\u00b7\u2022\u2024\u2025\u2026]+$/u.test(token);
}

function dotLeaderToken(text: string): string {
  return text.replace(/\s+/gu, '');
}

function hasRegularNumericRowCadence(rowCenters: number[]): boolean {
  const sortedCenters = [...rowCenters].sort((a, b) => a - b);
  const gaps = sortedCenters
    .slice(1)
    .map((center, index) => center - sortedCenters[index])
    .filter((gap) => gap > 0.5);
  if (gaps.length < 2) return true;

  const median = medianNumber(gaps);
  const tolerance = Math.max(
    TABULAR_NUMERIC_ROW_CADENCE_MIN_TOLERANCE_PT,
    median * TABULAR_NUMERIC_ROW_CADENCE_TOLERANCE_RATIO,
  );
  const matchRatio = gaps.filter((gap) => Math.abs(gap - median) <= tolerance).length / gaps.length;
  return matchRatio >= TABULAR_NUMERIC_ROW_CADENCE_MIN_MATCH_RATIO;
}

function medianNumber(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function hasRecurringNumericColumns(
  lines: LayoutLine[],
  columns: { right: number; lines: LayoutLine[] }[],
  sharedRows: number,
): boolean {
  const minRows = Math.max(
    TABULAR_NUMERIC_RECURRING_COLUMN_MIN_ROWS,
    Math.ceil(sharedRows * TABULAR_NUMERIC_RECURRING_COLUMN_MIN_ROW_RATIO),
  );
  if (tableRowsWithLabels(lines) < minRows) return false;
  return (
    columns.filter((column) => distinctRowCenters(column.lines).length >= minRows).length >=
    TABULAR_NUMERIC_RECURRING_COLUMN_MIN_COLUMNS
  );
}

function tableRowsWithLabels(lines: LayoutLine[]): number {
  return groupWarningTableRows(lines).filter(
    (row) =>
      row.length >= 3 &&
      row.filter(isTabularNumericLine).length >= TABULAR_NUMERIC_MIN_ALIGNED_COLUMNS &&
      row.some((line) => !isTabularNumericLine(line) && /[\p{L}]/u.test(line.text)),
  ).length;
}

function groupWarningTableRows(lines: LayoutLine[]): LayoutLine[][] {
  const rows: LayoutLine[][] = [];
  for (const line of [...lines].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find((candidate) => canShareWarningTableRow(line, candidate[0]));
    if (row) row.push(line);
    else rows.push([line]);
  }
  return rows;
}

function canShareWarningTableRow(a: LayoutLine, b: LayoutLine): boolean {
  const minHeight = Math.max(Math.min(a.height, b.height), 1);
  if (Math.abs(a.y - b.y) < minHeight * 0.5) return true;
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlap >= minHeight * 0.35;
}

function distinctRowCenters(lines: LayoutLine[]): number[] {
  const centers: number[] = [];
  for (const line of lines) {
    const center = line.y + line.height / 2;
    if (!centers.some((existing) => Math.abs(existing - center) <= TABULAR_NUMERIC_ROW_TOLERANCE_PT)) {
      centers.push(center);
    }
  }
  return centers;
}

function isTabularNumericLine(line: LayoutLine): boolean {
  const text = line.text.trim();
  if (text.length === 0 || text.length > 80) return false;
  if (!/\d/u.test(text)) return false;
  const nonNumeric = text.replace(/[0-9.,()%$¥€£+\-\s]/gu, '');
  return nonNumeric.length === 0;
}

function clusterNumericLines(lines: LayoutLine[]): { right: number; lines: LayoutLine[] }[] {
  const clusters: { right: number; lines: LayoutLine[] }[] = [];
  const sorted = [...lines].sort((a, b) => a.x + a.width - (b.x + b.width));
  for (const line of sorted) {
    const right = line.x + line.width;
    const cluster = clusters.find(
      (candidate) => Math.abs(candidate.right - right) <= TABULAR_NUMERIC_COLUMN_TOLERANCE_PT,
    );
    if (cluster) {
      cluster.lines.push(line);
      cluster.right = (cluster.right * (cluster.lines.length - 1) + right) / cluster.lines.length;
    } else {
      clusters.push({ right, lines: [line] });
    }
  }
  return clusters;
}

function sharedNumericRowCenters(columns: { right: number; lines: LayoutLine[] }[]): number[] {
  const rowClusters: { center: number; sampleCount: number; columnIndexes: Set<number> }[] = [];
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
    for (const line of columns[columnIndex].lines) {
      const center = line.y + line.height / 2;
      const cluster = rowClusters.find(
        (candidate) => Math.abs(candidate.center - center) <= TABULAR_NUMERIC_ROW_TOLERANCE_PT,
      );
      if (cluster) {
        cluster.columnIndexes.add(columnIndex);
        cluster.center = (cluster.center * cluster.sampleCount + center) / (cluster.sampleCount + 1);
        cluster.sampleCount += 1;
      } else {
        rowClusters.push({ center, sampleCount: 1, columnIndexes: new Set([columnIndex]) });
      }
    }
  }
  return rowClusters
    .filter((cluster) => cluster.columnIndexes.size >= TABULAR_NUMERIC_MIN_ALIGNED_COLUMNS)
    .map((cluster) => cluster.center)
    .sort((a, b) => a - b);
}
