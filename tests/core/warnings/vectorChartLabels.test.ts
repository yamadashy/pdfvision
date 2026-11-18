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
});
