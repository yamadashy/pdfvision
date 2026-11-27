import type { ImageBox, LayoutBlock, LayoutChart, PageResult, PageWarning, VectorBox } from '../../types/index.js';
import type { VectorFigureEvidence } from '../graphics/vectorFigures.js';
import type { BBox } from '../layout/geometry.js';
import { detectLayoutRegions, type LayoutRegion } from '../layout/regions.js';
import { shortTextSample } from './textSamples.js';

const MIN_LABELS = 4;
const MIN_NUMERIC_LABELS = 2;
/** A chart read in part lies inside the figure it is warned on, within this margin. */
const HOLD_MARGIN_PT = 2;
const TABLE_COVER_RATIO = 0.5;
const LINE_SPAN_SHARE = 0.7;
const NUMERIC_LABEL = /^[-+−–]?\d[\d.,]*\s*[%‰]?$/u;
/** Chart text is mostly short labels and a good share of numbers; a form,
 *  a table of contents or a score carries longer words around its digits. */
const MIN_NUMERIC_SHARE = 0.3;
const MAX_MEAN_LABEL_CHARS = 12;

/**
 * A vector chart whose text labels the layout pass kept together. The
 * labels are read row by row inside the chart, which keeps them away from
 * the prose; but a value is tied to its bar, series or category only by
 * where it is drawn, so the text alone cannot say which value is whose.
 * The warning names the region so the reader can render it.
 *
 * A figure counts as a chart when it holds several numeric labels and at
 * least one word, and has bars: text-free marks of one width (or height)
 * standing side by side on one baseline, with different lengths; a ruled or
 * gridded table has its numbers inside text-bearing cells, and a layout
 * table already reconstructed over the region is left to `tables`.
 */
export function detectVectorChartLabels(
  page: PageResult,
  blocks: readonly LayoutBlock[],
  vectorBoxes: readonly VectorBox[] | undefined,
  imageBoxes: readonly ImageBox[] | undefined,
  out: PageWarning[],
  figures?: VectorFigureEvidence,
): void {
  if (!vectorBoxes || vectorBoxes.length === 0) return;
  const regions = detectLayoutRegions(blocks, { vectorBoxes, imageBoxes }, page.width, page.height);
  const tables = page.layout?.tables ?? [];
  const reported: BBox[] = [];
  const read = page.layout?.charts ?? [];
  const figuresOnly = regions.filter((region) => region.kind === 'figure');
  // Bars first, in region order; then line and pie charts, the widest region first so the
  // reported box takes in the whole plot rather than one band of its labels.
  const passes: Array<{ kinds: ReadonlyArray<ChartKind>; regions: LayoutRegion[] }> = [
    { kinds: ['bar'], regions: figuresOnly },
    {
      kinds: ['line', 'pie'],
      regions: [...figuresOnly].sort((a, b) => b.width * b.height - a.width * a.height),
    },
  ];
  const report = (region: LayoutRegion, chart: { kind: ChartKind; mark?: BBox }): void => {
    const area = chart.mark ? union(region, chart.mark) : region;
    if (reported.some((other) => overlaps(other, area))) return;
    const labels = region.blocks.map((block) => block.text.replace(/\s+/gu, ' ').trim());
    const numeric = labels.filter((text) => NUMERIC_LABEL.test(text));
    if (labels.length < MIN_LABELS || numeric.length < MIN_NUMERIC_LABELS) return;
    if (numeric.length < labels.length * MIN_NUMERIC_SHARE) return;
    const meanChars = labels.reduce((sum, text) => sum + text.length, 0) / labels.length;
    if (meanChars > MAX_MEAN_LABEL_CHARS) return;
    const word = labels.find((text) => /\p{L}/u.test(text));
    // A line or a pie is itself the sign of a chart; a bar-like grid needs a word among its numbers.
    if (chart.kind === 'bar' && word === undefined) return;
    if (tables.some((table) => isTableOfRegion(region, table))) return;
    // A chart whose every value label was paired with its series by colour is read; nothing is left to render for.
    if (read.some((other) => isComplete(other) && overlaps(other, area))) return;
    reported.push(area);
    const box = [area.x, area.y, area.width, area.height].map((n) => Math.round(n)).join(',');
    const samples = `values such as "${shortTextSample(numeric[0])}"${word !== undefined ? `, labels such as "${shortTextSample(word)}"` : ''}`;
    out.push({
      code: 'vector_chart_labels',
      severity: 'warning',
      blockIndex: blocks.indexOf(region.blocks[0]),
      message: `vector ${chart.kind === 'bar' ? '' : `${chart.kind} `}chart at ${box} has ${labels.length} text labels (${samples}), read together ${chart.kind === 'bar' && region.verticalMarks ? 'bar by bar' : 'row by row'} — which value belongs to which ${chart.kind === 'pie' ? 'slice' : chart.kind === 'line' ? 'line, point' : 'bar'}, series or category is shown only by the drawing; render the region (--render-region ${box}) before pairing or quoting values`,
    });
  };
  // A chart read only in part is a chart for certain: warn on the smallest figure holding it,
  // its own panel rather than a row of charts it stands in.
  for (const chart of read) {
    if (isComplete(chart)) continue;
    const holder = figuresOnly
      .filter((region) => holds(region, chart))
      .sort((a, b) => a.width * a.height - b.width * b.height)[0];
    if (holder) report(holder, { kind: chart.kind, mark: chart });
  }
  for (const pass of passes) {
    for (const region of pass.regions) {
      const chart = chartKind(region, figures, pass.kinds);
      if (chart) report(region, chart);
    }
  }
}

type ChartKind = 'bar' | 'line' | 'pie';

/** Every label paired, and every series has a value in every category. */
function isComplete(chart: LayoutChart): boolean {
  if (chart.unpaired) return false;
  const series = new Set(chart.values.map((value) => value.series));
  const categories = new Set(chart.values.map((value) => value.category));
  return chart.values.length === series.size * categories.size;
}

function union(a: BBox, b: BBox): BBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/**
 * What makes the figure a chart: bars from its boxes (or, in a figure
 * framed by one box, from the paths inside it), or, from the path shapes,
 * a series line running across most of it or a pie inside it. A figure
 * whose own boxes are bars is a bar chart or nothing.
 */
function chartKind(
  region: LayoutRegion,
  figures: VectorFigureEvidence | undefined,
  kinds: ReadonlyArray<ChartKind>,
): { kind: ChartKind; mark?: BBox } | undefined {
  if (kinds.includes('bar')) return region.bars || region.framedBars ? { kind: 'bar' } : undefined;
  if (region.bars || !figures) return undefined;
  // The labels of a line chart sit on and around its lines; most of a line's run lies within them.
  const line = figures.seriesLines.find(
    (candidate) => overlapShare(candidate, region) >= LINE_SPAN_SHARE && candidate.width >= region.width * 0.3,
  );
  if (line) return { kind: 'line', mark: line };
  const pie = figures.pies.find(
    (candidate) => insideShare(region, candidate) > 0 && overlapShare(candidate, region) > 0.3,
  );
  if (pie) return { kind: 'pie', mark: pie };
  return undefined;
}

/** The share of `line`'s width that runs within `region`'s x extent, when their boxes meet. */
function overlapShare(line: BBox, region: BBox): number {
  if (!overlaps(line, region)) return 0;
  const w = Math.min(line.x + line.width, region.x + region.width) - Math.max(line.x, region.x);
  return w / Math.max(line.width, 1);
}

/** The share of `inner`'s box that lies inside `outer`. */
function insideShare(inner: BBox, outer: BBox): number {
  const w = Math.min(inner.x + inner.width, outer.x + outer.width) - Math.max(inner.x, outer.x);
  const h = Math.min(inner.y + inner.height, outer.y + outer.height) - Math.max(inner.y, outer.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.max(inner.width * inner.height, 1);
}

function holds(outer: BBox, inner: BBox): boolean {
  return (
    inner.x >= outer.x - HOLD_MARGIN_PT &&
    inner.y >= outer.y - HOLD_MARGIN_PT &&
    inner.x + inner.width <= outer.x + outer.width + HOLD_MARGIN_PT &&
    inner.y + inner.height <= outer.y + outer.height + HOLD_MARGIN_PT
  );
}

function overlaps(a: BBox, b: BBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** A layout table that covers most of the region and lies mostly inside
 *  it is the region read as a table; one that spans far beyond it is
 *  about something else. */
function isTableOfRegion(region: BBox, table: BBox): boolean {
  const w = Math.min(region.x + region.width, table.x + table.width) - Math.max(region.x, table.x);
  const h = Math.min(region.y + region.height, table.y + table.height) - Math.max(region.y, table.y);
  if (w <= 0 || h <= 0) return false;
  const overlap = w * h;
  return (
    overlap >= region.width * region.height * TABLE_COVER_RATIO &&
    overlap >= table.width * table.height * TABLE_COVER_RATIO
  );
}
