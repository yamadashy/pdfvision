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
});
