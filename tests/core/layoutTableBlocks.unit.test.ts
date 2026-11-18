import { describe, expect, it } from 'vitest';
import { isProseColumnTable } from '../../src/core/layout/columnGutters.js';
import { splitUnlevelledStacks } from '../../src/core/layout/tableStacks.js';
import type { LayoutBlock, LayoutTable, LayoutTableCell, LayoutTableRow, TextSpan } from '../../src/types/index.js';

function span(text: string, x: number, y: number, width: number, fontSize = 9): TextSpan {
  return { text, x, y, width, height: fontSize, fontSize };
}

function rightAligned(text: string, right: number, y: number, fontSize = 9): TextSpan {
  const width = text.length * fontSize * 0.5;
  return span(text, right - width, y, width, fontSize);
}

/** A rule is a zero-height vector box, as pdf.js reports a stroked line. */
function rule(x: number, y: number, width: number) {
  return { x, y, width, height: 0 };
}

function texts(table: LayoutTable | undefined): string[][] | undefined {
  return table?.rows.map((row) => row.cells.map((cell) => cell.text));
}

function findTable(tables: LayoutTable[] | undefined, text: string): LayoutTable | undefined {
  return tables?.find((table) => table.rows.some((row) => row.cells.some((cell) => cell.text === text)));
}

function cell(text: string, x: number, y: number, width: number, height = 9): LayoutTableCell {
  return { text, x, y, width, height };
}

function tableOf(rows: LayoutTableCell[][]): LayoutTable {
  const cells = rows.flat();
  const x = Math.min(...cells.map((c) => c.x));
  const y = Math.min(...cells.map((c) => c.y));
  const tableRows: LayoutTableRow[] = rows.map((row) => {
    const top = Math.min(...row.map((c) => c.y));
    return { y: top, height: Math.max(...row.map((c) => c.y + c.height)) - top, cells: row };
  });
  return {
    x,
    y,
    width: Math.max(...cells.map((c) => c.x + c.width)) - x,
    height: Math.max(...cells.map((c) => c.y + c.height)) - y,
    rowCount: rows.length,
    columnCount: Math.max(...rows.map((row) => row.length)),
    rows: tableRows,
  };
}

describe('splitUnlevelledStacks', () => {
  // invoice-ja: what a text table glued above the item grid is once the
  // grid's rows are taken out — the recipient block beside the invoice
  // fields and the issuer's address, joined only by overlapping rows.
  const addressBlock = tableOf([
    [
      cell('株式会社さくら商事 御中', 50, 98.2, 160.4, 14),
      cell('請求書番号', 395, 93.4, 45),
      cell('INV-2026-0412', 484.7, 93.4, 60.3),
    ],
    [cell('発行日', 395, 108.4, 27), cell('2026年10月31日', 478, 108.4, 67)],
    [
      cell('経理部 ご担当者様', 50, 125.5, 78.1, 9.5),
      cell('お支払期限', 395, 123.4, 45),
      cell('2026年11月30日', 478, 123.4, 67),
    ],
    [
      cell('下記のとおりご請求申し上げます。', 50, 153.5, 151.1, 9.5),
      cell('株式会社みなとテック', 365, 151.9, 120, 12),
    ],
    [
      cell('ご請求金額 ¥611,884 (税込)', 60, 180.9, 224, 18),
      cell('東京都港区芝公園九丁目8番7号', 365, 183.4, 119.9, 8.5),
      cell('みなとビル5階', 365, 195.4, 55.7, 8.5),
    ],
  ]);

  it('keeps only the key–value fields of blocks set side by side', () => {
    expect(splitUnlevelledStacks(addressBlock).map(texts)).toEqual([
      [
        ['請求書番号', 'INV-2026-0412'],
        ['発行日', '2026年10月31日'],
        ['お支払期限', '2026年11月30日'],
      ],
    ]);
  });

  it('leaves a table whose columns sit level alone', () => {
    const table = tableOf(
      ['Revenue', 'Costs', 'Margin', 'Tax'].map((label, row) => [
        cell(label, 72, 100 + row * 12, 40),
        cell(String(100 + row), 200, 100 + row * 12, 15),
        cell(String(200 + row), 260, 100 + row * 12, 15),
      ]),
    );
    expect(splitUnlevelledStacks(table)).toEqual([table]);
  });

  it('does not split at a header cell set between columns', () => {
    const table = tableOf([
      [cell('Q', 230, 88, 6)],
      ...['Revenue', 'Costs', 'Margin'].map((label, row) => [
        cell(label, 72, 100 + row * 12, 40),
        cell(String(100 + row), 200, 100 + row * 12, 15),
        cell(String(200 + row), 260, 100 + row * 12, 15),
      ]),
    ]);
    expect(splitUnlevelledStacks(table)).toEqual([table]);
  });
});

describe('isProseColumnTable — short tables (#242)', () => {
  // poster-multiblock: two lines of each of several poster columns read
  // across as a 2-row table.
  const gutters = [{ left: 600, right: 640, top: 600, bottom: 900 }];
  const prose = (text: string, x: number, y: number) => cell(text, x, y, 420, 30);

  it('drops a two-row table whose rows are prose lines on both sides of a gutter', () => {
    const table = tableOf([
      [
        prose('more common as summers warm. Farmers', 90, 659),
        prose('a median lead time of 38 minutes before the', 700, 659),
      ],
      [
        prose('usually notice it from panting or crowding at', 90, 709),
        cell('first visible panting.', 700, 709, 250, 30),
      ],
    ]);
    expect(
      isProseColumnTable(
        {
          ...table,
          rows: table.rows.map((row) => ({ ...row, cells: row.cells.map((c, i) => ({ ...c, column: i * 2 })) })),
          columnCount: 3,
        },
        gutters,
      ),
    ).toBe(true);
  });

  it('keeps a two-row table with a row that holds no prose', () => {
    const table = tableOf([
      [
        prose('more common as summers warm. Farmers', 90, 659),
        prose('a median lead time of 38 minutes before the', 700, 659),
      ],
      [cell('Total', 90, 709, 60, 30), cell('0.91', 700, 709, 60, 30)],
    ]);
    expect(
      isProseColumnTable(
        {
          ...table,
          rows: table.rows.map((row) => ({ ...row, cells: row.cells.map((c, i) => ({ ...c, column: i * 2 })) })),
          columnCount: 3,
        },
        gutters,
      ),
    ).toBe(false);
  });
});
