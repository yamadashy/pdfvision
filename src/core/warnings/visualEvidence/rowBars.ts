import type { LayoutLine, PageResult, PageWarning, VectorBox } from '../../../types/index.js';
import { cellLines } from '../../layout/rows/index.js';
import { shortTextSample } from '../textSamples.js';
import { type BoxLike, clippedArea } from './types.js';

const BAR_MIN_HEIGHT_PT = 3;
const BAR_MAX_HEIGHT_PT = 24;
const BAR_MIN_ASPECT = 1.5;
const BAR_MAX_PAGE_WIDTH_RATIO = 0.6;
const BAR_MAX_TEXT_OVERLAP = 0.1;
const MIN_BAR_ROWS = 4;
const POSITION_BIN_PT = 4;
const MIN_DISTINCT_VALUES = 3;
const BAR_CHART_MIN_DISTINCT_WIDTHS = 4;
const BAR_CHART_SHARED_START_RATIO = 0.75;
const SAME_HEIGHT_TOLERANCE_PT = 1.5;
const RUN_MAX_GAP_HEIGHTS = 6;
const RUN_MAX_GAP_PT = 60;
const EDGE_SLACK_PT = 12;
const MAX_CANDIDATES = 1_000;
const SCALE_MAX_DISTANCE_PT = 60;
const REGION_PADDING_PT = 4;

interface RowBar {
  bar: VectorBox;
  label: LayoutLine;
}

/**
 * Coloured bars that encode a value by where they start and how long they
 * are — a Gantt chart's task bars, a horizontal bar chart — read as nothing
 * but their row labels. The evidence is deliberately narrow so ordinary
 * pages stay quiet: filled (not stroked) boxes in a visible colour, too
 * thick to be rules or underlines, with no text inside them, each on the
 * row of a text label to its left, on at least four rows, and varying in
 * start and length (a timeline) or in length from a shared start (a bar
 * chart). Zebra striping and shaded table cells hold text or repeat one
 * width; empty form boxes are stroked, not filled.
 */
export function detectTextRowVectorBars(
  page: PageResult,
  context: { colouredFills?: VectorBox[] },
  out: PageWarning[],
): void {
  const fills = context.colouredFills;
  if (!fills || fills.length < MIN_BAR_ROWS) return;
  if (out.some((warning) => warning.code === 'dense_vector_graphics')) return;
  const lines = cellLines(page.layout?.blocks ?? []).filter((line) => line.text.trim().length > 0);
  if (lines.length === 0) return;

  const textRight = Math.max(...lines.map((line) => line.x + line.width));
  const candidates: RowBar[] = [];
  for (const bar of fills) {
    if (!isBarShape(bar, page)) continue;
    // Bars past all text or bleeding off the page edge are decoration, not a chart.
    if (bar.x + bar.width > Math.min(textRight + EDGE_SLACK_PT, page.width - EDGE_SLACK_PT)) continue;
    if (lines.some((line) => clippedArea(line, bar) > BAR_MAX_TEXT_OVERLAP * bar.width * bar.height)) continue;
    const label = rowLabel(bar, lines);
    if (label) candidates.push({ bar, label });
  }
  if (candidates.length > MAX_CANDIDATES) return;
  const rows = bestBarRun(candidates);
  if (!rows) return;

  // The whole rows — a bar only reads against every label column to its left (task, owner,
  // dates) — plus the scale or legend text just above and below the bars.
  const bars = rows.map((row) => row.bar);
  const region = renderRegion(
    [
      ...rows.flatMap((row) => [row.bar, ...lines.filter((line) => isRowLabel(line, row.bar))]),
      ...lines.filter((line) => isScaleOrLegendLine(line, bars)),
    ],
    page,
  );
  const examples = rows
    .slice(0, 2)
    .map((row) => `"${shortTextSample(row.label.text)}"`)
    .join(', ');
  out.push({
    code: 'text_row_vector_bars',
    severity: 'warning',
    message: `${rows.length} filled bars sit in text rows (beside ${examples}) with no text inside them — the native text has the row labels and any printed values, but not what the bars' start, length or colour shows (dates, durations, status); render that region (--render-region ${region}) when the answer depends on them`,
  });
}

/**
 * The largest set of same-height bars stacked row after row (a chart or a
 * schedule), one per row, that varies like encoded values. Bars of mixed
 * heights scattered down a page — arrow shafts in a flowchart, shading
 * pieces of a table — do not form one.
 */
function bestBarRun(candidates: readonly RowBar[]): RowBar[] | undefined {
  let best: RowBar[] | undefined;
  for (const seed of candidates) {
    const sameHeight = candidates
      .filter((item) => Math.abs(item.bar.height - seed.bar.height) <= SAME_HEIGHT_TOLERANCE_PT)
      .sort((a, b) => centerY(a.bar) - centerY(b.bar));
    const maxGap = Math.max(seed.bar.height * RUN_MAX_GAP_HEIGHTS, RUN_MAX_GAP_PT);
    let run: RowBar[] = [];
    const consider = (): void => {
      if (
        run.length >= MIN_BAR_ROWS &&
        (!best || run.length > best.length || (run.length === best.length && run[0].bar.height > best[0].bar.height)) &&
        variesLikeEncodedValues(run.map((row) => row.bar))
      ) {
        best = run;
      }
    };
    for (const item of sameHeight) {
      const previous = run.at(-1);
      // A progress bar drawn inside its task bar is the same row.
      if (previous && Math.abs(centerY(previous.bar) - centerY(item.bar)) < BAR_MIN_HEIGHT_PT) continue;
      if (previous && centerY(item.bar) - centerY(previous.bar) > maxGap) {
        consider();
        run = [];
      }
      run.push(item);
    }
    consider();
  }
  return best;
}

function isBarShape(box: VectorBox, page: Pick<PageResult, 'width'>): boolean {
  return (
    box.height >= BAR_MIN_HEIGHT_PT &&
    box.height <= BAR_MAX_HEIGHT_PT &&
    box.width >= box.height * BAR_MIN_ASPECT &&
    box.width <= page.width * BAR_MAX_PAGE_WIDTH_RATIO
  );
}

/** A text line on the bar's row that ends before the bar starts. */
function rowLabel(bar: VectorBox, lines: readonly LayoutLine[]): LayoutLine | undefined {
  let best: LayoutLine | undefined;
  for (const line of lines) {
    if (!isRowLabel(line, bar)) continue;
    if (!best || line.x + line.width > best.x + best.width) best = line;
  }
  return best;
}

function isScaleOrLegendLine(line: LayoutLine, bars: readonly VectorBox[]): boolean {
  const left = Math.min(...bars.map((bar) => bar.x));
  const right = Math.max(...bars.map((bar) => bar.x + bar.width));
  const top = Math.min(...bars.map((bar) => bar.y));
  const bottom = Math.max(...bars.map((bar) => bar.y + bar.height));
  if (Math.min(right, line.x + line.width) - Math.max(left, line.x) <= 0) return false;
  const above = top - (line.y + line.height);
  const below = line.y - bottom;
  return (above >= 0 && above <= SCALE_MAX_DISTANCE_PT) || (below >= 0 && below <= SCALE_MAX_DISTANCE_PT);
}

function isRowLabel(line: LayoutLine, bar: VectorBox): boolean {
  return line.x + line.width <= bar.x + 2 && Math.abs(centerY(line) - centerY(bar)) <= Math.max(4, bar.height * 0.6);
}

function variesLikeEncodedValues(bars: readonly VectorBox[]): boolean {
  const bin = (value: number) => Math.round(value / POSITION_BIN_PT);
  const starts = new Map<number, number>();
  for (const bar of bars) starts.set(bin(bar.x), (starts.get(bin(bar.x)) ?? 0) + 1);
  const widths = new Set(bars.map((bar) => bin(bar.width)));
  if (starts.size >= MIN_DISTINCT_VALUES && widths.size >= MIN_DISTINCT_VALUES) return true;
  const sharedStart = Math.max(...starts.values()) / bars.length;
  return sharedStart >= BAR_CHART_SHARED_START_RATIO && widths.size >= BAR_CHART_MIN_DISTINCT_WIDTHS;
}

function renderRegion(boxes: readonly BoxLike[], page: Pick<PageResult, 'width' | 'height' | 'userUnit'>): string {
  const x = Math.max(0, Math.min(...boxes.map((box) => box.x)) - REGION_PADDING_PT);
  const y = Math.max(0, Math.min(...boxes.map((box) => box.y)) - REGION_PADDING_PT);
  const right = Math.min(page.width, Math.max(...boxes.map((box) => box.x + box.width)) + REGION_PADDING_PT);
  const bottom = Math.min(page.height, Math.max(...boxes.map((box) => box.y + box.height)) + REGION_PADDING_PT);
  // Detectors see physical points; --render-region takes raw page units.
  const toRaw = 1 / (page.userUnit ?? 1);
  return [x, y, right - x, bottom - y].map((n) => Math.round(n * toRaw * 100) / 100).join(',');
}

function centerY(box: BoxLike): number {
  return box.y + box.height / 2;
}
