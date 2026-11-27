import type { LayoutChart, LayoutChartValue, LayoutTable, TextSpan } from '../../types/index.js';
import { type ChartMarks, insidePolygon, type Swatch } from '../graphics/chartMarks.js';
import type { TextColourRun } from '../graphics/opaqueFillText.js';
import { parseHexColor } from '../graphics/paintColor.js';
import { isBlankFill, type Point, vertices } from '../graphics/shapeKinds.js';
import type { VectorShape, VectorShapeSet } from '../graphics/vectorShapes.js';
import { type BBox, round2 } from './geometry.js';

/**
 * Chart values paired with their series through colour. A legend keys
 * each series name with a swatch; the series' line, slice or bar segment
 * is painted in that colour; and a value label set on a point, inside a
 * slice or inside a segment belongs to it. Where every step holds — each
 * legend colour is distinct, the label sits on exactly one mark and no
 * other mark of another colour is as near — the value is reported with
 * its series (and, for a line or a bar, its category on the axis).
 * Anything less sound is left to `vector_chart_labels`.
 */

const NUMERIC = /^[-+−–]?\d[\d.,]*\s*[%‰]?$/u;
/** Two value labels or more in one text item. */
const NUMERIC_RUN = /^[-+−–]?\d[\d.,]*\s*[%‰]?(?:\s+[-+−–]?\d[\d.,]*\s*[%‰]?)+$/u;
/** A legend name starts within this many ems right of its swatch. */
const LEGEND_GAP_EM = 1.2;
/** Colours this close per channel are one colour (anti-aliased exports round differently). */
const SAME_COLOUR = 6;
/** Channels this far apart make a colour a hue rather than a grey. */
const SATURATED_SPREAD = 40;
/** A point label stands within this many ems of its point. */
const POINT_REACH_EM = 1.6;
const AMBIGUITY = 1.5;
/** At least this share of a chart's value labels must pair, or none is reported. */
const MIN_PAIRED_SHARE = 0.7;
const MIN_VALUES = 3;

interface LegendEntry {
  colour: string;
  name: string;
  swatch: Swatch;
  box: BBox;
  spans: TextSpan[];
}

/** Legend entries and the drawn panels that scope them. */
interface Key {
  entries: LegendEntry[];
  panels: BBox[];
}

export interface ChartReading {
  charts: LayoutChart[];
  legends: LegendEntry[];
}

export function readChartValues(
  spans: readonly TextSpan[],
  marks: ChartMarks | undefined,
  shapes: VectorShapeSet | undefined,
  textColours?: readonly TextColourRun[],
): ChartReading {
  const empty: ChartReading = { charts: [], legends: [] };
  if (!marks || marks.swatches.length < 2) return empty;
  const legends = legendEntries(spans, marks.swatches);
  if (legends.length < 2) return empty;
  const key: Key = {
    entries: legends,
    panels: (shapes?.shapes ?? []).filter(
      (shape) => shape.subpaths.length === 1 && shape.subpaths[0].closed && shape.width >= 40 && shape.height >= 30,
    ),
  };
  const legendSpans = new Set(legends.flatMap((entry) => entry.spans));
  const values = spans.filter((span) => !legendSpans.has(span) && NUMERIC.test(span.text.trim()));
  const charts: LayoutChart[] = [];
  for (const pie of marks.pies) {
    const chart = readPie(pie, values, key);
    if (chart) charts.push(chart);
  }
  const lineChart = readLines(marks, values, spans, key, textColours ?? [], shapes);
  if (lineChart) charts.push(lineChart);
  charts.push(...readBars(shapes, values, spans, key));
  return { charts, legends };
}

/**
 * Swatches with a name right after them on their centre line. A legend
 * names each colour once; a colour named twice keys nothing for sure.
 */
function legendEntries(spans: readonly TextSpan[], swatches: readonly Swatch[]): LegendEntry[] {
  const entries: LegendEntry[] = [];
  for (const swatch of swatches) {
    const cy = swatch.y + swatch.height / 2;
    const right = swatch.x + swatch.width;
    const row = spans
      .filter((span) => Math.abs(span.y + span.height / 2 - cy) <= Math.max(swatch.height, span.height * 0.5))
      .filter((span) => span.x >= right - 0.5 && span.text.trim().length > 0)
      .sort((a, b) => a.x - b.x);
    const first = row[0];
    if (!first) continue;
    const em = first.fontSize || first.height;
    if (first.x > right + em * LEGEND_GAP_EM) continue;
    const next = Math.min(
      ...swatches
        .filter(
          (other) => other !== swatch && other.x > right && Math.abs(other.y + other.height / 2 - cy) <= swatch.height,
        )
        .map((other) => other.x),
    );
    const taken: TextSpan[] = [];
    let end = first.x;
    for (const span of row) {
      if (span.x >= next || span.x > end + em * 0.6) break;
      taken.push(span);
      end = span.x + span.width;
    }
    // A name may share a text item with the next entry (`Work School Shopping` as one run); cut it at the next swatch.
    const name = cutAt(taken, next).replace(/\s+/gu, ' ').trim();
    if (!name || NUMERIC.test(name)) continue;
    const x = first.x;
    entries.push({
      colour: swatch.colour,
      name,
      swatch,
      box: { x, y: first.y, width: Math.min(end, next) - x, height: first.height },
      spans: taken,
    });
  }
  return entries;
}

function cutAt(spans: readonly TextSpan[], stop: number): string {
  let text = '';
  for (const span of spans) {
    let piece = span.text;
    if (span.x + span.width > stop) {
      const chars = Array.from(piece);
      piece = chars.slice(0, Math.floor((chars.length * (stop - span.x)) / span.width)).join('');
    }
    text += text ? ` ${piece}` : piece;
  }
  return text;
}

/** A hue, not black, white or a grey axis or gridline. */
function isSaturated(colour: string): boolean {
  const rgb = parseHexColor(colour);
  return rgb !== undefined && Math.max(...rgb) - Math.min(...rgb) > SATURATED_SPREAD;
}

function sameColour(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  if (a === b) return true;
  const p = parseHexColor(a);
  const q = parseHexColor(b);
  if (!p || !q) return false;
  return p.every((channel, i) => Math.abs(channel - q[i]) <= SAME_COLOUR);
}

/**
 * The legend name keyed to a mark's colour. Two charts on a page may reuse
 * a colour, so among entries of that colour the one nearest the mark wins
 * when it is clearly the nearest; a colour named twice in one legend keys nothing.
 */
function seriesOf(colour: string, key: Key, mark: BBox): string | undefined {
  // A chart set in its own panel takes its names from the legend in that panel.
  const frame = panelOf(mark, key.panels);
  const scoped = frame ? key.entries.filter((entry) => contains(frame, centreOf(entry.box))) : key.entries;
  const matches = scoped
    .filter((entry) => sameColour(entry.colour, colour))
    .map((entry) => ({ entry, distance: boxGap(entry.box, mark) }))
    .sort((a, b) => a.distance - b.distance);
  if (matches.length === 0) return undefined;
  if (matches.length > 1 && matches[1].distance <= matches[0].distance * 2 + 20) return undefined;
  return matches[0].entry.name;
}

/** The smallest drawn frame round the mark, well larger than it: the chart's panel. */
function panelOf(mark: BBox, panels: readonly BBox[]): BBox | undefined {
  let best: BBox | undefined;
  for (const frame of panels) {
    if (frame.width * frame.height < mark.width * mark.height * 2) continue;
    if (
      mark.x < frame.x - 1 ||
      mark.y < frame.y - 1 ||
      mark.x + mark.width > frame.x + frame.width + 1 ||
      mark.y + mark.height > frame.y + frame.height + 1
    ) {
      continue;
    }
    if (!best || frame.width * frame.height < best.width * best.height) best = frame;
  }
  return best;
}

function boxGap(a: BBox, b: BBox): number {
  const dx = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width));
  const dy = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height));
  return Math.hypot(dx, dy);
}

function readPie(pie: ChartMarks['pies'][number], values: readonly TextSpan[], legends: Key): LayoutChart | undefined {
  const inPie = values.filter((span) => contains(pie, centreOf(span)));
  if (inPie.length < MIN_VALUES) return undefined;
  const out: LayoutChartValue[] = [];
  let unpaired = 0;
  for (const span of inPie) {
    const c = centreOf(span);
    const slices = pie.slices.filter((slice) => insidePolygon(c, slice.polygon));
    // A label in a donut's hole (its total, its year) is on no slice and belongs to none.
    if (slices.length === 0) continue;
    const series = slices.length === 1 ? seriesOf(slices[0].colour, legends, pie) : undefined;
    if (series === undefined) {
      unpaired++;
      continue;
    }
    out.push(chartValue(span, series));
  }
  if (out.length < MIN_VALUES || out.length < (out.length + unpaired) * MIN_PAIRED_SHARE) return undefined;
  return chartOf('pie', pie, out, unpaired);
}

/**
 * Point labels of a line chart: each value goes to the nearest vertex of
 * any series line, set over or under it, when no vertex of another series
 * is nearly as near; its category is the axis label centred under that
 * vertex below the plot.
 */
function readLines(
  marks: ChartMarks,
  values: readonly TextSpan[],
  spans: readonly TextSpan[],
  legends: Key,
  textColours: readonly TextColourRun[],
  shapes: VectorShapeSet | undefined,
): LayoutChart | undefined {
  const named = marks.lines
    .map((line) => ({ line, series: seriesOf(line.colour, legends, line) }))
    .filter((item): item is { line: ChartMarks['lines'][number]; series: string } => item.series !== undefined);
  if (named.length === 0) return undefined;
  // Every line in the plot must be keyed, or a value could belong to the unnamed one.
  const plot = unionOf(named.map((item) => item.line));
  const unnamed = marks.lines.filter((line) => !named.some((item) => item.line === line) && overlapsBox(line, plot));
  if (unnamed.length > 0) return undefined;
  // A series drawn so it is not read as a line (dashes as separate strokes) still has its
  // values in the plot: a coloured stroke there in no named series' colour is one.
  const unread = (shapes?.shapes ?? []).some(
    (shape) =>
      shape.stroke !== undefined &&
      isSaturated(shape.stroke) &&
      overlapsBox(shape, plot) &&
      !named.some((item) => sameColour(item.line.colour, shape.stroke)),
  );
  if (unread) return undefined;
  const points = named.flatMap((item) =>
    item.line.points.map((point) => ({ point, series: item.series, line: item.line })),
  );
  const plotBottom = plot.y + plot.height;
  const candidates = values.filter(
    (span) => centreOf(span).x >= plot.x - 4 && centreOf(span).x <= plot.x + plot.width + 4,
  );
  const claims = new Map<Point, { span: TextSpan; distance: number }>();
  const unpaired: TextSpan[] = [];
  for (const span of candidates) {
    const em = span.fontSize || span.height;
    const c = centreOf(span);
    // A point label stands over or under its point: centred on it across.
    const ranked = points
      .filter((p) => Math.abs(c.x - p.point.x) <= span.width / 2 + 2)
      .map((p) => ({ ...p, distance: boxDistance(span, p.point) }))
      .sort((a, b) => a.distance - b.distance);
    // A label printed in a series' colour is that series'; otherwise the nearest point must be clearly nearest.
    const own = seriesOfColour(colourOf(span, textColours), named);
    const best = own !== undefined ? ranked.find((p) => p.series === own) : ranked[0];
    if (!best || best.distance > em * POINT_REACH_EM) {
      if (c.y <= plotBottom && c.y >= plot.y) unpaired.push(span);
      continue;
    }
    const rival = own !== undefined ? undefined : ranked.find((p) => p.series !== best.series);
    if (rival && rival.distance <= best.distance * AMBIGUITY + em * 0.5) {
      unpaired.push(span);
      continue;
    }
    const held = claims.get(best.point);
    if (held && held.distance <= best.distance) {
      unpaired.push(span);
      continue;
    }
    if (held) unpaired.push(held.span);
    claims.set(best.point, { span, distance: best.distance });
  }
  const out: LayoutChartValue[] = [];
  // The axis labels are what is left under the plot once the point labels are taken.
  const claimed = new Set([...claims.values()].map((claim) => claim.span));
  const axis = spans.filter((span) => !claimed.has(span) && !unpaired.includes(span));
  const categories = axisRow(
    [...claims.keys()].map((point) => point.x),
    plotBottom,
    Math.max(30, plot.height * 0.6),
    axis,
  );
  for (const [point, claim] of claims) {
    const owner = points.find((p) => p.point === point);
    if (!owner) continue;
    out.push(chartValue(claim.span, owner.series, categories?.get(point.x)));
  }
  if (out.length < MIN_VALUES || out.length < (out.length + unpaired.length) * MIN_PAIRED_SHARE) return undefined;
  return chartOf('line', unionOf([plot, ...out]), sortValues(out, legends.entries), unpaired.length);
}

/** The fill colour of the text run drawn over most of the span. */
function colourOf(span: TextSpan, runs: readonly TextColourRun[]): string | undefined {
  let best: { colour: string; share: number } | undefined;
  const area = Math.max(span.width * span.height, 0.01);
  for (const run of runs) {
    const w = Math.min(span.x + span.width, run.x + run.width) - Math.max(span.x, run.x);
    const h = Math.min(span.y + span.height, run.y + run.height) - Math.max(span.y, run.y);
    if (w <= 0 || h <= 0) continue;
    const share = (w * h) / area;
    if (!best || share > best.share) best = { colour: run.colour, share };
  }
  return best && best.share >= 0.5 ? best.colour : undefined;
}

function seriesOfColour(
  colour: string | undefined,
  named: ReadonlyArray<{ line: ChartMarks['lines'][number]; series: string }>,
): string | undefined {
  if (colour === undefined) return undefined;
  const matches = new Set(named.filter((item) => sameColour(item.line.colour, colour)).map((item) => item.series));
  return matches.size === 1 ? [...matches][0] : undefined;
}

/**
 * Bar segments (filled rectangles in a legend colour) holding a value
 * label: the value is that series'. The category is the label at the
 * left of the bar's row, or under the bar's column.
 */
function readBars(
  shapes: VectorShapeSet | undefined,
  values: readonly TextSpan[],
  spans: readonly TextSpan[],
  legends: Key,
): LayoutChart[] {
  if (!shapes) return [];
  const swatchSet = new Set(legends.entries.map((entry) => `${entry.swatch.x},${entry.swatch.y}`));
  const bars = shapes.shapes.filter((shape) => {
    if (shape.fill === undefined || isBlankFill(shape.fill) || shape.subpaths.length !== 1 || shape.curves > 0) {
      return false;
    }
    if (swatchSet.has(`${shape.x},${shape.y}`)) return false;
    const points = vertices(shape);
    return (
      points.length === 4 && shape.width >= 3 && shape.height >= 3 && seriesOf(shape.fill, legends, shape) !== undefined
    );
  });
  // Charts set side by side each in their own panel are read apart: one row of bars never crosses a frame.
  const groups = new Map<BBox | undefined, VectorShape[]>();
  for (const bar of bars) {
    const frame = panelOf(bar, legends.panels);
    groups.set(frame, [...(groups.get(frame) ?? []), bar]);
  }
  return [...groups.values()].flatMap((group) => readBarGroup(group, values, spans, legends));
}

function readBarGroup(
  bars: readonly VectorShape[],
  values: readonly TextSpan[],
  spans: readonly TextSpan[],
  legends: Key,
): LayoutChart[] {
  if (bars.length < MIN_VALUES) return [];
  const out: LayoutChartValue[] = [];
  const used: BBox[] = [];
  let rows = 0;
  // Category labels stand outside the bars; a value inside a lower segment is not one.
  const outside = spans.filter((span) => !bars.some((bar) => contains(bar, centreOf(span))));
  let unpaired = 0;
  for (const span of values) {
    const c = centreOf(span);
    const inside = bars.filter((bar) => contains(bar, c));
    const holders = inside.length > 0 ? inside : barsUnder(span, bars);
    const bar = holders.length === 1 ? holders[0] : undefined;
    const series = bar?.fill !== undefined ? seriesOf(bar.fill, legends, bar) : undefined;
    if (bar === undefined || series === undefined) {
      // A label set inside a segment is one of the chart's values even when it cannot be paired.
      if (inside.length > 0) unpaired++;
      continue;
    }
    const row = inside.length > 0 ? rowLabel(bar, bars, spans) : undefined;
    if (row !== undefined) rows++;
    const category = row ?? groupLabelBelow(stackBase(bar, bars), outside);
    out.push(chartValue(span, series, category));
    used.push(bar);
  }
  // Neighbouring segments' labels can come as one text item (`9% 21%`): each is a value left unpaired.
  for (const span of spans) {
    if (!NUMERIC_RUN.test(span.text.trim()) || !bars.some((bar) => contains(bar, centreOf(span)))) continue;
    unpaired += span.text.trim().split(/\s+/u).length;
  }
  if (out.length < MIN_VALUES || out.length < (out.length + unpaired) * MIN_PAIRED_SHARE) return [];
  // Only charts whose categories all resolved are worth a table; partial ones stay with the warning.
  if (out.some((value) => value.category === undefined)) return [];
  // Horizontal bars take their categories down the page, vertical bars across it.
  return [chartOf('bar', unionOf(used), sortValues(out, legends.entries, rows === out.length ? 'y' : 'x'), unpaired)];
}

/**
 * The column bar a value label stands on: centred over its top, within an
 * em above it. A bar with another coloured segment under it is part of a
 * stack, whose label on top is the total, not this segment's value.
 */
function barsUnder(span: TextSpan, bars: readonly VectorShape[]): VectorShape[] {
  const c = centreOf(span);
  const em = span.fontSize || span.height;
  const bottom = span.y + span.height;
  return bars.filter(
    (bar) =>
      bar.height > bar.width * 0.5 &&
      Math.abs(c.x - (bar.x + bar.width / 2)) <= bar.width / 2 &&
      bottom <= bar.y + 1 &&
      bottom >= bar.y - em * 1.5 &&
      !bars.some(
        (other) =>
          other !== bar &&
          Math.abs(other.y - (bar.y + bar.height)) <= 1 &&
          other.x < bar.x + bar.width &&
          bar.x < other.x + other.width,
      ),
  );
}

/** A column's lowest segment: walk down through segments stacked under the bar. */
function stackBase(bar: VectorShape, bars: readonly VectorShape[]): BBox {
  let current: VectorShape = bar;
  for (let step = 0; step < bars.length; step++) {
    const below = bars.find(
      (other) =>
        other !== current &&
        Math.abs(other.y - (current.y + current.height)) <= 1 &&
        Math.abs(other.x - current.x) <= 1 &&
        Math.abs(other.width - current.width) <= 1,
    );
    if (!below) break;
    current = below;
  }
  return current;
}

/**
 * The category under a column bar: the one label below its base whose
 * centre lies within about a bar's width of the bar's centre (a grouped
 * chart centres one label under each group).
 */
function groupLabelBelow(bar: BBox, spans: readonly TextSpan[]): string | undefined {
  const cx = bar.x + bar.width / 2;
  const base = bar.y + bar.height;
  const below = spans.filter(
    (span) =>
      span.y >= base - 1 &&
      span.y <= base + Math.max(30, (span.fontSize || span.height) * 2) &&
      Math.abs(centreOf(span).x - cx) <= Math.max(3, bar.width * 1.2),
  );
  const top = Math.min(...below.map((span) => span.y));
  const row = below.filter((span) => span.y <= top + 1);
  return row.length === 1 ? row[0].text.trim() || undefined : undefined;
}

/** The text at the left of a horizontal bar's row, before its first segment. */
function rowLabel(bar: BBox, bars: readonly BBox[], spans: readonly TextSpan[]): string | undefined {
  const cy = bar.y + bar.height / 2;
  const row = bars.filter(
    (other) => Math.abs(other.y + other.height / 2 - cy) <= 1 && Math.abs(other.height - bar.height) <= 1,
  );
  const left = Math.min(...row.map((other) => other.x));
  const label = spans
    .filter((span) => Math.abs(span.y + span.height / 2 - cy) <= bar.height / 2 && span.x + span.width <= left + 0.5)
    .sort((a, b) => b.x - a.x)[0];
  if (!label || left - (label.x + label.width) > (label.fontSize || label.height) * 2) return undefined;
  // A row label is horizontal bars' category; vertical bars stand side by side on one baseline instead.
  if (row.length < 2) return undefined;
  return label.text.trim();
}

/**
 * The category axis under a line chart: one label centred under each
 * point's x, all on one row. Any point without one, or labels on
 * different rows, and no categories are given.
 */
function axisRow(
  xs: readonly number[],
  bottom: number,
  reach: number,
  spans: readonly TextSpan[],
): Map<number, string> | undefined {
  const out = new Map<number, string>();
  const tops: number[] = [];
  for (const x of new Set(xs)) {
    const label = spans
      .filter((span) => span.y >= bottom - 1 && span.y <= bottom + reach)
      .filter((span) => Math.abs(centreOf(span).x - x) <= Math.max(3, (span.fontSize || span.height) * 0.3))
      .sort((a, b) => a.y - b.y)[0];
    const text = label?.text.trim();
    if (!label || !text) return undefined;
    out.set(x, text);
    tops.push(label.y);
  }
  const em = Math.min(...spans.filter((span) => tops.includes(span.y)).map((span) => span.fontSize || span.height));
  return Math.max(...tops) - Math.min(...tops) <= em * 0.5 ? out : undefined;
}

function sortValues(
  values: LayoutChartValue[],
  legends: readonly LegendEntry[],
  axis: 'x' | 'y' = 'x',
): LayoutChartValue[] {
  const order = (series: string) => legends.findIndex((entry) => entry.name === series);
  const other = axis === 'x' ? 'y' : 'x';
  return values.sort((a, b) => order(a.series) - order(b.series) || a[axis] - b[axis] || a[other] - b[other]);
}

function chartValue(span: TextSpan, series: string, category?: string): LayoutChartValue {
  return {
    value: span.text.trim(),
    series,
    ...(category !== undefined && { category }),
    x: round2(span.x),
    y: round2(span.y),
    width: round2(span.width),
    height: round2(span.height),
  };
}

function chartOf(kind: LayoutChart['kind'], box: BBox, values: LayoutChartValue[], unpaired = 0): LayoutChart {
  return {
    kind,
    ...(unpaired > 0 && { unpaired }),
    x: round2(box.x),
    y: round2(box.y),
    width: round2(box.width),
    height: round2(box.height),
    values,
  };
}

/**
 * A layout-table row made of legend names (`Work School Shopping Other`
 * over a stacked bar) is the legend, not a header: dropped, so the names
 * do not shift onto the columns under them.
 */
export function dropLegendRows(
  tables: LayoutTable[] | undefined,
  legends: readonly LegendEntry[],
  shapes: VectorShapeSet | undefined,
): LayoutTable[] | undefined {
  if (!tables || legends.length < 2 || !shapes) return tables;
  const swatches = new Set(legends.map((entry) => entry.swatch));
  return tables
    .map((table) => {
      // Only over a chart: the table holds marks painted in two legend colours or more.
      const colours = new Set(
        shapes.shapes
          .filter((shape) => shape.fill !== undefined && overlapsBox(shape, table))
          .filter((shape) => ![...swatches].some((swatch) => swatch.x === shape.x && swatch.y === shape.y))
          .map((shape) => legends.find((entry) => sameColour(entry.colour, shape.fill))?.name)
          .filter((name) => name !== undefined),
      );
      if (colours.size < 2) return table;
      const rows = table.rows.filter((row) => !isLegendRow(row, legends));
      if (rows.length === table.rows.length) return table;
      const y = Math.min(...rows.map((row) => row.y));
      const bottom = Math.max(...rows.map((row) => row.y + row.height));
      return { ...table, rows, rowCount: rows.length, y: round2(y), height: round2(bottom - y) };
    })
    .filter((table) => table.rows.length >= 2);
}

function isLegendRow(row: LayoutTable['rows'][number], legends: readonly LegendEntry[]): boolean {
  const inRow = legends.filter(
    (entry) => entry.box.y + entry.box.height / 2 >= row.y && entry.box.y + entry.box.height / 2 <= row.y + row.height,
  );
  if (inRow.length < 2) return false;
  let text = row.cells.map((cell) => cell.text).join(' ');
  for (const entry of [...inRow].sort((a, b) => b.name.length - a.name.length)) text = text.replace(entry.name, ' ');
  return text.trim().length === 0;
}

function centreOf(box: BBox): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function contains(box: BBox, p: Point): boolean {
  return p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height;
}

function boxDistance(box: BBox, p: Point): number {
  const dx = Math.max(box.x - p.x, 0, p.x - (box.x + box.width));
  const dy = Math.max(box.y - p.y, 0, p.y - (box.y + box.height));
  return Math.hypot(dx, dy);
}

function overlapsBox(a: BBox, b: BBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function unionOf(boxes: readonly BBox[]): BBox {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
}
