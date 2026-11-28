import { describe, expect, it } from 'vitest';
import { splitTablesAtChartPanels } from '../../src/core/layout/chartPanels.js';
import type { LayoutTable, TextSpan } from '../../src/types/index.js';

function cell(text: string, x: number, y: number) {
  return { text, x, y, width: 20, height: 8 };
}

function table(y: number, xs: readonly number[]): LayoutTable {
  const cells = xs.map((x, i) => cell(`c${i}`, x, y));
  return {
    x: xs[0],
    y,
    width: xs[xs.length - 1] + 20 - xs[0],
    height: 8,
    rowCount: 1,
    columnCount: xs.length,
    rows: [{ y, height: 8, cells }],
  };
}

describe('splitTablesAtChartPanels', () => {
  const panels = {
    charts: [{ x: 0, y: 0, width: 100, height: 600 }],
    others: [{ x: 120, y: 0, width: 100, height: 600 }],
  };
  // Each re-read gives one table tagged by where its text was.
  const read = (own: TextSpan[]) => (own.length > 0 ? [table(own[0].y, [own[0].x])] : undefined);

  it('puts each fused table’s pieces where the table stood', () => {
    const fusedTop = table(100, [10, 130]);
    const between = table(300, [300, 330]);
    const fusedBottom = table(500, [10, 130]);
    const spans: TextSpan[] = [];
    for (const t of [fusedTop, fusedBottom]) {
      for (const c of t.rows[0].cells)
        spans.push({ text: c.text, x: c.x, y: c.y, width: c.width, height: c.height, fontSize: 8 });
    }
    const out = splitTablesAtChartPanels([fusedTop, between, fusedBottom], panels, spans, read) ?? [];
    expect(out.map((t) => t.y)).toEqual([100, 100, 300, 500]);
  });
});
