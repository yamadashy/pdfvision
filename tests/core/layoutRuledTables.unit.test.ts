import { describe, expect, it } from 'vitest';
import type { BBox } from '../../src/core/layout/geometry.js';
import { buildLayout } from '../../src/core/layout/index.js';
import type { LayoutTable, TextSpan } from '../../src/types/index.js';

function span(text: string, x: number, y: number, width = text.length * 3.6, fontSize = 7.5): TextSpan {
  return { text, x, y, width, height: fontSize, fontSize };
}

const hRule = (x1: number, y: number, x2: number): BBox => ({ x: x1, y: y - 0.25, width: x2 - x1, height: 0.5 });
const vRule = (x: number, y1: number, y2: number): BBox => ({ x: x - 0.25, y: y1, width: 0.5, height: y2 - y1 });

function grid(table: LayoutTable | undefined): string[][] | undefined {
  return table?.rows.map((row) => row.cells.map((cell) => `${cell.column}:${cell.text}`));
}

// An electrical-characteristics table: parameter | symbol | conditions | MIN | TYP | MAX | unit,
// the parameter and symbol cells merged over two condition rows (the inner
// rule starts at the conditions column).
const X = [40, 150, 200, 360, 400, 440, 480, 572];
function characteristics(extraSpans: TextSpan[] = []): { spans: TextSpan[]; boxes: BBox[] } {
  const boxes = [
    hRule(40, 100, 572),
    hRule(40, 120, 572),
    hRule(200, 134, 572),
    hRule(40, 148, 572),
    hRule(40, 162, 572),
    ...X.map((x) => vRule(x, 100, 162)),
  ];
  const spans = [
    ...['PARAMETER', 'SYMBOL', 'TEST CONDITIONS', 'MIN', 'TYP', 'MAX', 'UNIT'].map((label, i) =>
      span(label, X[i] + 4, 106),
    ),
    span('Input offset voltage', 44, 124),
    span('VOS', 168, 124),
    span('TA = 25°C', 204, 124),
    span('±0.3', 412, 124),
    span('±1.5', 452, 124),
    span('mV', 500, 124),
    span('TA = –40°C to +125°C', 204, 138),
    span('±2.5', 452, 138),
    span('mV', 500, 138),
    // Symbol and condition set 3pt apart: only the rule separates them.
    span('dVOS/dT', 160, 152, 36.5),
    span('TA = –40°C to +125°C', 204, 152),
    span('Offset voltage drift', 44, 152),
    span('1.2', 414, 152),
    span('μV/°C', 496, 152),
    ...extraSpans,
  ];
  return { spans, boxes };
}

describe('ruled layout tables', () => {
  it('reads cells from the rules and repeats a merged cell in every row it spans (#277)', () => {
    const { spans, boxes } = characteristics();
    const layout = buildLayout(spans, 612, 792, { vectorBoxes: boxes });
    expect(layout.tables).toHaveLength(1);
    const [table] = layout.tables ?? [];
    expect(table).toMatchObject({ x: 40, y: 100, width: 532, height: 62, columnCount: 7 });
    expect(grid(table)).toEqual([
      ['0:PARAMETER', '1:SYMBOL', '2:TEST CONDITIONS', '3:MIN', '4:TYP', '5:MAX', '6:UNIT'],
      ['0:Input offset voltage', '1:VOS', '2:TA = 25°C', '4:±0.3', '5:±1.5', '6:mV'],
      ['0:Input offset voltage', '1:VOS', '2:TA = –40°C to +125°C', '5:±2.5', '6:mV'],
      ['0:Offset voltage drift', '1:dVOS/dT', '2:TA = –40°C to +125°C', '4:1.2', '6:μV/°C'],
    ]);
  });

  it('marks the copies of a merged cell with the rows it spans', () => {
    const { spans, boxes } = characteristics();
    const [table] = buildLayout(spans, 612, 792, { vectorBoxes: boxes }).tables ?? [];
    const spanned = table?.rows.map((row) =>
      row.cells.filter((cell) => cell.rowSpan).map((cell) => `${cell.text}×${cell.rowSpan}`),
    );
    expect(spanned).toEqual([[], ['Input offset voltage×2', 'VOS×2'], ['Input offset voltage×2', 'VOS×2'], []]);
  });

  it('splits a line where a vertical rule runs between its spans', () => {
    const { spans, boxes } = characteristics();
    const lines = buildLayout(spans, 612, 792, { vectorBoxes: boxes }).blocks.flatMap((block) => block.lines);
    expect(lines.map((line) => line.text)).toContain('dVOS/dT');
    const without = buildLayout(spans, 612, 792).blocks.flatMap((block) => block.lines);
    expect(without.map((line) => line.text)).toContain('dVOS/dT TA = –40°C to +125°C');
  });

  it('splits an unruled header band above ruled columns at the column boundaries', () => {
    const { spans, boxes } = characteristics();
    // The inner column rules start below the header band; the outer ones frame it.
    const shortened = boxes.map((box) =>
      box.width === 0.5 && box.x > 41 && box.x < 571 ? { ...box, y: 120, height: 42 } : box,
    );
    const [table] = buildLayout(spans, 612, 792, { vectorBoxes: shortened }).tables ?? [];
    expect(grid(table)?.[0]).toEqual([
      '0:PARAMETER',
      '1:SYMBOL',
      '2:TEST CONDITIONS',
      '3:MIN',
      '4:TYP',
      '5:MAX',
      '6:UNIT',
    ]);
  });

  it('keeps the header row a text detector found right above the ruled grid', () => {
    const xs = [40, 160, 240, 320];
    const names = ['Aarhus', 'Bergen', 'Cork', 'Dundee', 'Esbjerg'];
    const boxes = [
      ...Array.from({ length: names.length + 1 }, (_, i) => hRule(40, 120 + i * 16, 320)),
      ...xs.map((x) => vRule(x, 120, 120 + names.length * 16)),
    ];
    const spans = [
      span('Depot', 44, 106),
      span('Planned', 200, 106, 30),
      span('Installed', 276, 106, 34),
      ...names.flatMap((name, i) => [
        span(name, 44, 124 + i * 16),
        span(`${10 + i * 3}`, 224, 124 + i * 16, 8),
        span(`${8 + i * 2}`, 304, 124 + i * 16, 8),
      ]),
    ];
    const [table] = buildLayout(spans, 612, 792, { vectorBoxes: boxes }).tables ?? [];
    expect(grid(table)?.slice(0, 2)).toEqual([
      ['0:Depot', '1:Planned', '2:Installed'],
      ['0:Aarhus', '1:10', '2:8'],
    ]);
    expect(table?.rowCount).toBe(6);
  });

  it('keeps a comb field one digit per box on one line', () => {
    const digits = '417203';
    const spans = [...digits].map((digit, i) => span(digit, 102 + i * 12, 104, 4));
    const boxes = [
      hRule(100, 100, 172),
      hRule(100, 114, 172),
      ...Array.from({ length: 7 }, (_, i) => vRule(100 + i * 12, 100, 114)),
    ];
    const lines = buildLayout(spans, 612, 792, { vectorBoxes: boxes }).blocks.flatMap((block) => block.lines);
    expect(lines.map((line) => line.text)).toEqual(['4 1 7 2 0 3']);
  });

  it('does not read a chart grid with one row of axis labels as a ruled table', () => {
    const xs = [60, 100, 140, 180, 220, 260];
    const boxes = [...[100, 130, 160, 190].map((y) => hRule(60, y, 260)), ...xs.map((x) => vRule(x, 100, 190))];
    const spans = [
      span('Revenue by quarter', 60, 90),
      ...['2021', '2022', '2023', '2024', '2025'].map((year, i) => span(year, xs[i] + 12, 180)),
      span('12', 72, 150),
      span('18', 112, 120),
    ];
    const tables = buildLayout(spans, 612, 792, { vectorBoxes: boxes }).tables ?? [];
    expect(tables.every((table) => table.y > 190 || table.y + table.height < 100 || table.rowCount !== 2)).toBe(true);
  });

  it('does not read a ruled frame of prose columns as a table', () => {
    const boxes = [
      hRule(40, 100, 572),
      hRule(40, 300, 572),
      vRule(40, 100, 300),
      vRule(306, 100, 300),
      vRule(572, 100, 300),
    ];
    const spans = Array.from({ length: 16 }, (_, i) => [
      span(`line ${i + 1} of the left column runs on with words and figures such as ${i}`, 44, 104 + i * 11, 250),
      span(`line ${i + 1} of the right column also runs on with ${i * 2} more words`, 310, 104 + i * 11, 250),
    ]).flat();
    const tables = buildLayout(spans, 612, 792, { vectorBoxes: boxes }).tables ?? [];
    expect(tables.some((table) => table.x === 40 && table.width === 532)).toBe(false);
  });

  it('leaves a ruled box whose rows are not ruled to the text detectors', () => {
    const boxes = [hRule(40, 100, 300), hRule(40, 180, 300), ...[40, 160, 230, 300].map((x) => vRule(x, 100, 180))];
    const spans = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'].flatMap((name, i) => [
      span(name, 44, 104 + i * 14),
      span(`${(i + 1) * 120}`, 200, 104 + i * 14, 14),
      span(`${(i + 2) * 7}.5`, 270, 104 + i * 14, 14),
    ]);
    const [table] = buildLayout(spans, 612, 792, { vectorBoxes: boxes }).tables ?? [];
    expect(table?.rowCount).toBe(5);
    expect(table?.rows[1]?.cells.map((cell) => cell.text)).toEqual(['Beta', '240', '21.5']);
  });

  it('keeps the whole table when rules are drawn around only some of its columns', () => {
    const names = ['Revenue', 'Gross profit', 'Operating costs', 'Operating income', 'Net income'];
    const boxes = [
      ...Array.from({ length: names.length + 1 }, (_, i) => hRule(300, 118 + i * 16, 540)),
      ...[300, 380, 540].map((x) => vRule(x, 118, 118 + names.length * 16)),
    ];
    const spans = names.flatMap((name, i) => [
      span(name, 60, 122 + i * 16),
      span(`${100 + i},000`, 180, 122 + i * 16, 28),
      span(`${110 + i},500`, 240, 122 + i * 16, 28),
      span(`+${i + 1},500`, 340, 122 + i * 16, 28),
      span(`change ${i}`, 390, 122 + i * 16, 40),
    ]);
    const [table] = buildLayout(spans, 612, 792, { vectorBoxes: boxes }).tables ?? [];
    expect(table?.rows[0]?.cells.map((cell) => cell.text)).toEqual([
      'Revenue',
      '100,000',
      '110,500',
      '+1,500',
      'change 0',
    ]);
  });

  it('reads a ruled grid whose cells hold figures inside words', () => {
    const xs = [60, 200, 300, 400];
    const rows = [
      ['Resolution date', 'May 12, 2020', 'May 12, 2021'],
      ['Number of options', '316 units', '335 units'],
      ['Shares', '15,800 shares', '16,750 shares'],
    ];
    const boxes = [
      ...Array.from({ length: rows.length + 1 }, (_, i) => hRule(60, 100 + i * 20, 400)),
      ...xs.map((x) => vRule(x, 100, 100 + rows.length * 20)),
    ];
    const spans = rows.flatMap((row, i) => row.map((text, column) => span(text, xs[column] + 4, 106 + i * 20)));
    const [table] = buildLayout(spans, 612, 792, { vectorBoxes: boxes }).tables ?? [];
    expect(grid(table)).toEqual(rows.map((row) => row.map((text, column) => `${column}:${text}`)));
  });
});
