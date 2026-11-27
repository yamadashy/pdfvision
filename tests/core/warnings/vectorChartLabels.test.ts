import { describe, expect, it } from 'vitest';
import { detectPageWarnings } from '../../../src/core/warnings/index.js';
import type { LayoutBlock, LayoutTable, VectorBox } from '../../../src/types/index.js';
import { block, line, page } from './helpers.js';

function label(text: string, x: number, y: number, width = text.length * 4): LayoutBlock {
  return block(x, y, width, 8, { text, lines: [line(text, x, y, width, 8)] });
}

// paper-two-column's grouped bar chart: legend swatches, plot frame and four bars.
const chartBoxes: VectorBox[] = [
  { x: 351, y: 271, width: 8, height: 8 },
  { x: 418, y: 271, width: 8, height: 8 },
  { x: 345, y: 286, width: 213, height: 126 },
  { x: 358, y: 320, width: 20, height: 91 },
  { x: 380, y: 367, width: 20, height: 44 },
  { x: 429, y: 333, width: 20, height: 78 },
  { x: 451, y: 372, width: 20, height: 39 },
];
const chartLabels = [
  label('Full attention', 362, 267, 42),
  label('ATP (ours)', 429, 267, 35),
  label('182', 363, 309, 10),
  label('88', 387, 356, 7),
  label('156', 434, 322, 10),
  label('79', 458, 360, 7),
  label('LongDocQA', 359, 413, 41),
  label('MultiNews-R', 429, 413, 43),
];

describe('vector_chart_labels', () => {
  it('names the chart region whose values are tied to bars only by the drawing', () => {
    const out = detectPageWarnings(page(chartLabels), { vectorBoxes: chartBoxes });
    const warning = out.find((w) => w.code === 'vector_chart_labels');
    expect(warning?.message).toContain('bar by bar');
    expect(warning?.message).toMatch(/--render-region \d+,\d+,\d+,\d+/u);
    expect(warning?.blockIndex).toBeGreaterThanOrEqual(0);
  });

  it('stays quiet for a gridded table whose numbers sit in text-bearing cells', () => {
    const cells: LayoutBlock[] = [];
    const boxes: VectorBox[] = [];
    ['Name', 'Q1', 'Q2'].forEach((head, c) => {
      cells.push(label(head, 62 + c * 100, 102));
      boxes.push({ x: 60 + c * 100, y: 100, width: 100, height: 14 });
      for (let r = 1; r <= 3; r++) {
        cells.push(label(c === 0 ? `Row ${r}` : String(10 * r + c), 62 + c * 100, 102 + r * 14));
        boxes.push({ x: 60 + c * 100, y: 100 + r * 14, width: 100, height: 14 });
      }
    });
    const out = detectPageWarnings(page(cells), { vectorBoxes: boxes });
    expect(out.some((w) => w.code === 'vector_chart_labels')).toBe(false);
  });

  it('stays quiet when a layout table already reads the region', () => {
    const table = {
      x: 340,
      y: 265,
      width: 220,
      height: 160,
      rows: [],
      rowCount: 4,
      columnCount: 4,
    } as unknown as LayoutTable;
    const result = page(chartLabels);
    result.layout = { blocks: chartLabels, tables: [table] };
    const out = detectPageWarnings(result, { vectorBoxes: chartBoxes });
    expect(out.some((w) => w.code === 'vector_chart_labels')).toBe(false);
  });

  it('stays quiet for a figure without numbers', () => {
    const words = ['Input', 'Encoder', 'Decoder', 'Output'].map((text, i) => label(text, 360 + i * 50, 300));
    const out = detectPageWarnings(page(words), { vectorBoxes: chartBoxes });
    expect(out.some((w) => w.code === 'vector_chart_labels')).toBe(false);
  });

  it('stays quiet for same-width shapes that do not stand on one baseline', () => {
    // A package outline: pads and leads of one width at different heights,
    // dimension numbers around them.
    const shapes: VectorBox[] = [
      { x: 360, y: 300, width: 20, height: 30 },
      { x: 400, y: 320, width: 20, height: 50 },
      { x: 440, y: 290, width: 20, height: 70 },
      { x: 345, y: 286, width: 213, height: 126 },
    ];
    const out = detectPageWarnings(page(chartLabels), { vectorBoxes: shapes });
    expect(out.some((w) => w.code === 'vector_chart_labels')).toBe(false);
  });

  // A line chart: plot frame, gridlines, and point labels; no bars.
  const lineBoxes: VectorBox[] = [
    { x: 80, y: 180, width: 460, height: 120 },
    { x: 100, y: 200, width: 400, height: 0 },
    { x: 100, y: 240, width: 400, height: 0 },
    { x: 100, y: 205, width: 400, height: 60 },
    { x: 100, y: 230, width: 400, height: 50 },
  ];
  const lineLabels = [
    label('41.2', 96, 250, 14),
    label('46.8', 196, 235, 14),
    label('49.5', 296, 222, 14),
    label('52.3', 396, 212, 14),
    label('35.0', 96, 280, 14),
    label('51.7', 296, 215, 14),
  ];
  const series = { seriesLines: [{ x: 100, y: 205, width: 400, height: 60 }], pies: [], outlinedText: [] };

  it('names a line chart from its series line, though it has no bars', () => {
    const out = detectPageWarnings(page(lineLabels), { vectorBoxes: lineBoxes, vectorFigures: series });
    const warning = out.find((w) => w.code === 'vector_chart_labels');
    expect(warning?.message).toContain('vector line chart at');
    expect(warning?.message).toContain('line, point, series or category');
  });

  it('stays quiet for the same labels without a series line', () => {
    const out = detectPageWarnings(page(lineLabels), { vectorBoxes: lineBoxes });
    expect(out.some((w) => w.code === 'vector_chart_labels')).toBe(false);
  });

  it('stays quiet when every value of the chart was paired with its series by colour', () => {
    const result = page(lineLabels);
    const values = ['41.2', '46.8', '49.5', '52.3'].map((value, i) => ({
      value,
      series: 'Red',
      category: String(2021 + i),
      x: 96 + i * 100,
      y: 220,
      width: 14,
      height: 8,
    }));
    result.layout = { blocks: lineLabels, charts: [{ kind: 'line', x: 90, y: 200, width: 420, height: 90, values }] };
    const out = detectPageWarnings(result, { vectorBoxes: lineBoxes, vectorFigures: series });
    expect(out.some((w) => w.code === 'vector_chart_labels')).toBe(false);
    // One label left over keeps the warning.
    result.layout.charts = [{ kind: 'line', unpaired: 1, x: 90, y: 200, width: 420, height: 90, values }];
    const kept = detectPageWarnings(result, { vectorBoxes: lineBoxes, vectorFigures: series });
    expect(kept.some((w) => w.code === 'vector_chart_labels')).toBe(true);
  });
  /** A bar chart in its own frame: title, value labels over the bars, years under them. */
  function framedBars(x: number, values: readonly number[]) {
    const boxes: VectorBox[] = [{ x, y: 300, width: 190, height: 250 }];
    const labels = [label('Shortfall (k)', x + 16, 308, 60)];
    values.forEach((value, i) => {
      const height = value * 10;
      const bx = x + 20 + i * 34;
      boxes.push({ x: bx, y: 520 - height, width: 18, height });
      labels.push(label(String(value), bx + 2, 508 - height, 14), label(String(2022 + i), bx, 526, 16));
    });
    return { boxes, labels };
  }

  it('names each framed chart of a row on its own, not the row', () => {
    const a = framedBars(40, [8.2, 9.5, 11.3, 12.8]);
    const b = framedBars(238, [3.1, 3.8, 4.6, 5.2]);
    const out = detectPageWarnings(page([...a.labels, ...b.labels]), { vectorBoxes: [...a.boxes, ...b.boxes] });
    const regions = out
      .filter((w) => w.code === 'vector_chart_labels')
      .map((w) => w.message.match(/--render-region (\S+)\)/u)?.[1]);
    expect(regions).toEqual(['40,300,190,250', '238,300,190,250']);
  });

  it('names the panel of a chart whose values were read only in part', () => {
    const a = framedBars(40, [8.2, 9.5, 11.3, 12.8]);
    // A stacked chart in the next frame: no bars a bounding box can tell, but read in part by colour.
    const stack = [
      label('Large', 250, 340, 22),
      label('62%', 300, 340, 14),
      label('28% 10%', 360, 340, 30),
      label('Medium', 250, 376, 26),
      label('41%', 300, 376, 14),
      label('33%', 340, 376, 14),
      label('26%', 380, 376, 14),
    ];
    const values = ['62%', '41%', '33%', '26%'].map((value, i) => ({
      value,
      series: ['Done', 'Done', 'Planned', 'None'][i],
      category: i === 0 ? 'Large' : 'Medium',
      x: 300 + i * 20,
      y: i === 0 ? 340 : 376,
      width: 14,
      height: 8,
    }));
    const result = page([...a.labels, ...stack]);
    result.layout = {
      blocks: [...a.labels, ...stack],
      charts: [{ kind: 'bar', unpaired: 2, x: 290, y: 336, width: 120, height: 50, values }],
    };
    const boxes = [...a.boxes, { x: 238, y: 300, width: 190, height: 250 }];
    const out = detectPageWarnings(result, { vectorBoxes: boxes });
    const regions = out
      .filter((w) => w.code === 'vector_chart_labels')
      .map((w) => w.message.match(/--render-region (\S+)\)/u)?.[1]);
    expect(regions).toContain('238,300,190,250');
    expect(regions).not.toContain('40,300,388,250');
    // A chart read whole beside it in the same figure does not silence it.
    const pie = {
      kind: 'pie' as const,
      x: 380,
      y: 420,
      width: 40,
      height: 40,
      values: [{ ...values[0], series: 'A' }],
    };
    result.layout.charts = [...(result.layout.charts ?? []), pie];
    const beside = detectPageWarnings(result, { vectorBoxes: boxes })
      .filter((w) => w.code === 'vector_chart_labels')
      .map((w) => w.message.match(/--render-region (\S+)\)/u)?.[1]);
    expect(beside).toContain('238,300,190,250');
  });
});
