import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../../src/core/layout/index.js';
import { detectPageWarnings } from '../../../src/core/warnings/index.js';
import type { LayoutTable, LayoutTableCell, PageResult, TextSpan } from '../../../src/types/index.js';
import { block, line, page } from './helpers.js';

function cell(text: string, x: number, y: number, column: number, width = 30): LayoutTableCell {
  return { text, x, y, width, height: 8, column };
}

function table(rows: LayoutTableCell[][], columnCount: number): LayoutTable {
  const cells = rows.flat();
  const left = Math.min(...cells.map((c) => c.x));
  const top = Math.min(...cells.map((c) => c.y));
  const right = Math.max(...cells.map((c) => c.x + c.width));
  const bottom = Math.max(...cells.map((c) => c.y + c.height));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    rowCount: rows.length,
    columnCount,
    rows: rows.map((rowCells) => ({ y: rowCells[0]?.y ?? 0, height: 8, cells: rowCells })),
  };
}

function withTables(result: PageResult, tables: LayoutTable[]): PageResult {
  return { ...result, layout: { blocks: result.layout?.blocks ?? [], tables } };
}

function uncertain(result: PageResult) {
  return detectPageWarnings(result).filter((warning) => warning.code === 'layout_table_uncertain');
}

const cleanRows = [
  [cell('Products', 50, 100, 0, 40), cell('69,958', 200, 100, 1), cell('67,184', 260, 100, 2)],
  [cell('Services', 50, 112, 0, 40), cell('24,972', 200, 112, 1), cell('22,314', 260, 112, 2)],
  [cell('Total', 50, 124, 0, 40), cell('94,930', 200, 124, 1), cell('89,498', 260, 124, 2)],
];

function linesOf(rows: LayoutTableCell[][]) {
  return rows.flat().map((c) => line(c.text, c.x, c.y, c.width, c.height));
}

describe('layout_table_uncertain', () => {
  it('stays quiet on a table whose every line landed in a row and column', () => {
    const result = withTables(page([block(50, 100, 240, 32, { lines: linesOf(cleanRows) })]), [table(cleanRows, 3)]);
    expect(uncertain(result)).toEqual([]);
  });

  it('stays quiet on unclaimed header text above the first body row', () => {
    const header = line('September 28, September 30,', 190, 86, 100);
    const result = withTables(page([block(50, 86, 240, 46, { lines: [header, ...linesOf(cleanRows)] })]), [
      { ...table(cleanRows, 3), y: 86, height: 46 },
    ]);
    expect(uncertain(result)).toEqual([]);
  });

  it('flags a numeric line inside the table that no row claimed', () => {
    // Attention-paper Table 4-shaped case: a data row was left out of the
    // table although it sits inside the table's box.
    const dropped = [line('Dropped row', 50, 106, 40), line('88.3', 200, 106, 30)];
    const rows = [cleanRows[0], cleanRows[2]];
    const result = withTables(page([block(50, 100, 240, 32, { lines: [...linesOf(rows), ...dropped] })]), [
      table(rows, 3),
    ]);
    const warnings = uncertain(result);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ severity: 'warning', tableIndex: 0 });
    expect(warnings[0].message).toContain('1 line with numbers inside the table belongs to no row');
    expect(warnings[0].message).toContain('--render-region 50,100,240,32');
  });

  it('flags two values assigned to one column of the same row', () => {
    const rows = [
      ...cleanRows,
      [cell('Other', 50, 136, 0, 40), cell('19', 200, 136, 1, 10), cell('29', 215, 136, 1, 10)],
    ];
    const warnings = uncertain(withTables(page([block(50, 100, 240, 44, { lines: linesOf(rows) })]), [table(rows, 3)]));

    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('1 row has two values in one column');
  });

  it('flags a value whose column span overlaps another value of the same row', () => {
    const rows = [
      ...cleanRows,
      [cell('Other', 50, 136, 0, 40), { ...cell('19', 200, 136, 1, 10), columnSpan: 2 }, cell('29', 260, 136, 2)],
    ];
    const warnings = uncertain(withTables(page([block(50, 100, 240, 44, { lines: linesOf(rows) })]), [table(rows, 3)]));

    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('1 row has two values in one column');
  });

  it('flags neighbouring columns that no row fills together', () => {
    // GPT-3 SuperGLUE-shaped case: two stacked tables with different column
    // grids were read as one table, so each value's column depends on its row.
    const rows = [
      [cell('A', 50, 100, 0), cell('1.0', 150, 100, 1), cell('2.0', 250, 100, 3)],
      [cell('B', 50, 112, 0), cell('1.1', 150, 112, 1), cell('2.1', 250, 112, 3)],
      [cell('C', 50, 124, 0), cell('1.2', 150, 124, 1), cell('3.2', 200, 124, 2)],
      [cell('D', 50, 136, 0), cell('1.3', 150, 136, 1), cell('3.3', 200, 136, 2)],
    ];
    const warnings = uncertain(withTables(page([block(50, 100, 230, 44, { lines: linesOf(rows) })]), [table(rows, 4)]));

    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('1 pair of neighbouring columns never filled in the same row');
  });

  it('does not flag a sparse but consistent table built from real geometry', () => {
    // Columns that are empty in some rows are fine as long as some row
    // fills neighbouring columns together.
    const spans: TextSpan[] = [
      ['ByteNet', '23.75', undefined, undefined],
      ['Deep-Att', undefined, '39.2', '1.0'],
      ['GNMT', '24.6', '39.92', '2.3'],
      ['ConvS2S', '25.16', '40.46', '9.6'],
    ].flatMap((row, rowIndex) =>
      row.flatMap((text, column) =>
        text === undefined
          ? []
          : [
              {
                text,
                x: [100, 200, 260, 320][column] ?? 0,
                y: 100 + rowIndex * 11,
                width: column === 0 ? 40 : 22,
                height: 9,
                fontSize: 9,
              },
            ],
      ),
    );
    const layout = buildLayout(spans, 612, 792);
    const result: PageResult = { ...page(layout.blocks), layout };

    expect(layout.tables).toHaveLength(1);
    expect(uncertain(result)).toEqual([]);
  });
});
