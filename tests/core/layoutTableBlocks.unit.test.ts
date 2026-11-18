import { describe, expect, it } from 'vitest';
import { sortColumnRun } from '../../src/core/layout/columnBottomNotes.js';
import { isProseColumnTable } from '../../src/core/layout/columnGutters.js';
import { buildLayout } from '../../src/core/layout/index.js';
import { mergeSplitHeaderTables } from '../../src/core/layout/splitHeaderTables.js';
import { insertTableGroupLabelRows } from '../../src/core/layout/tableGroupRows.js';
import { joinWrappedHeaderRows } from '../../src/core/layout/tableHeaderWraps.js';
import { markHeaderRow } from '../../src/core/layout/tableLeadingRows.js';
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

describe('layout tables — header lines above the rows (#294)', () => {
  // An earnings-summary segment table: one header cell wraps onto a second
  // line (`消去又は` / `全社`) that sits between the header and the rows as a
  // single-cell row, above a label-only group row (`営業収益`).
  const RIGHTS = [265, 329.8, 394.6, 459.4, 524.2];
  const DATA: [string, number, string[]][] = [
    ['外部顧客への営業収益', 69.2, ['20,131,829', '1,598,175', '251,613', '-', '21,981,617']],
    ['セグメント間の営業収益', 69.2, ['33,479', '23,191', '374,053', '△430,723', '-']],
    ['計', 125.7, ['20,165,308', '1,621,366', '625,666', '△430,723', '21,981,617']],
    ['営業費用', 60.2, ['17,918,009', '1,376,466', '545,862', '△418,014', '19,422,323']],
    ['営業利益', 60.2, ['2,247,299', '244,900', '79,804', '△12,709', '2,559,294']],
  ];
  const segmentSpans = (secondHeaderLine: boolean): TextSpan[] => [
    span('自動車', 223.6, 302.3, 27),
    span('金融', 292.9, 302.3, 18),
    span('その他', 353.2, 302.3, 27),
    span('消去又は', 413.5, secondHeaderLine ? 297.3 : 302.3, 36),
    ...(secondHeaderLine ? [span('全社', 424.8, 307.3, 18)] : []),
    span('連結', 487.3, 302.3, 18),
    span('営業収益', 60.2, 326.3, 36),
    ...DATA.flatMap(([label, x, values], row) => [
      span(label, x, 348.8 + row * 21.8, label.length * 9),
      ...values.map((value, column) => rightAligned(value, RIGHTS[column], 348.8 + row * 21.8)),
    ]),
  ];

  it('keeps the header row when a wrapped header cell puts its second line on a row of its own', () => {
    const table = findTable(buildLayout(segmentSpans(true), 595, 842).tables, '20,131,829');
    expect(texts(table)?.[0]).toEqual(['自動車', '金融', 'その他', '消去又は 全社', '連結']);
    expect(table?.rows[0]?.cells.map((c) => c.column)).toEqual([1, 2, 3, 4, 5]);
    expect(texts(table)?.at(-1)).toEqual(['営業利益', '2,247,299', '244,900', '79,804', '△12,709', '2,559,294']);
  });

  it('reads the same table with a one-line header as before', () => {
    const table = findTable(buildLayout(segmentSpans(false), 595, 842).tables, '20,131,829');
    expect(texts(table)?.[0]).toEqual(['自動車', '金融', 'その他', '消去又は', '連結']);
  });

  it('does not take a title line above the header as part of it', () => {
    const spans = [
      span('前中間連結会計期間(2023年9月30日に終了した6ヶ月間)', 93.7, 271.1, 283.5),
      ...segmentSpans(true),
    ];
    const table = findTable(buildLayout(spans, 595, 842).tables, '20,131,829');
    expect(table?.rows.flatMap((row) => row.cells.map((c) => c.text))).not.toContain(
      '前中間連結会計期間(2023年9月30日に終了した6ヶ月間)',
    );
  });
});

describe('layout tables — header rows above a group label', () => {
  // census-shaped: a year row and an estimate / margin-of-error row over
  // pairs of value columns, then a group label, then the rows.
  const RIGHTS = [250, 330, 430, 510];
  const rowsOf = (top: number, labels: string[]) =>
    labels.flatMap((label, row) => {
      const y = top + row * 11.5;
      return [
        span(label, 54, y, label.length * 4.5),
        ...[`${131 + row},400`, `${1 + row},006`, `${132 + row},200`, `${6 + row}34`].map((value, column) =>
          rightAligned(value, RIGHTS[column], y),
        ),
      ];
    });
  const spans = [
    span('2022', 260, 100, 18),
    span('2023', 440, 100, 18),
    span('Estimate', 214, 112, 36),
    span('Margin', 300, 112, 30),
    span('Estimate', 394, 112, 36),
    span('Margin', 480, 112, 30),
    span('HOUSEHOLDS', 54, 128, 50),
    ...rowsOf(140, ['All households', 'Family households', 'Married-couple', 'Nonfamily households']),
  ];

  it('keeps the year row a header, so value columns stay apart', () => {
    const table = findTable(buildLayout(spans, 612, 792).tables, 'All households');
    expect(texts(table)?.[0]).toEqual(['2022', '2023']);
    expect(table?.columnCount).toBe(5);
    expect(table?.rows.find((row) => row.cells[0]?.text === 'All households')?.cells.map((c) => c.column)).toEqual([
      0, 1, 2, 3, 4,
    ]);
  });

  it('does not take the last row of the table above as a header over a single line', () => {
    // A table, a group label 22pt under its last row, the next table's rows 22pt under that.
    const stacked = [
      ...rowsOf(10, ['Leases', 'Deposits', 'Bonds']),
      span('FAMILIES', 54, 64, 40),
      ...rowsOf(95, ['All households', 'Family households', 'Married-couple', 'Nonfamily households']),
    ];
    const table = findTable(buildLayout(stacked, 612, 792).tables, 'All households');
    expect(table?.rows.some((row) => row.cells[0]?.text === 'Bonds')).toBe(false);
  });
});

describe('layout tables — booktabs group labels and two-line headers', () => {
  // survey-tall-table's shape: a two-line header over a booktabs table, and
  // each row group opened by a label centred across the table in a band of
  // its own between two full-width rules.
  const CENTRES = [218, 285, 350, 420];
  const groupRows = (top: number, names: string[]): TextSpan[] =>
    names.flatMap((name, row) => {
      const y = top + row * 11.2;
      return [
        span(name, 74, y, name.length * 4, 8),
        ...['Feb-2023', String(7 + row), `${row + 1}.0T`, '2k'].map((value, column) => {
          const width = value.length * 4;
          return span(value, CENTRES[column] - width / 2, y, width, 8);
        }),
      ];
    });
  const header: TextSpan[] = [
    span('Model', 74, 95.4, 21.8, 8),
    span('Release', 205.1, 90.4, 25.8, 8),
    span('Params', 271.9, 90.4, 26.1, 8),
    span('Pre-train', 334.3, 90.4, 31.4, 8),
    span('Context', 406.4, 90.4, 27.1, 8),
    span('date', 210.7, 99.9, 14.7, 8),
    span('(B)', 279.7, 99.9, 10.7, 8),
    span('tokens', 338.9, 99.9, 22.1, 8),
    span('length', 409.3, 99.9, 21.3, 8),
  ];
  const spans: TextSpan[] = [
    ...header,
    span('Open source', 285.8, 115.4, 40.4, 8),
    ...groupRows(128.1, ['Corvid-7B', 'Corvid-65B', 'Heron-13B', 'Heron-70B', 'Lumen-7B', 'Lumen-40B']),
    span('Closed source', 283.4, 199.8, 45, 8),
    ...groupRows(212.5, ['Atlas-1', 'Atlas-2', 'Beacon-1', 'Beacon-2', 'Gemma-Pro']),
  ];
  const rules = {
    vectorBoxes: [
      rule(72, 89, 400),
      rule(72, 114, 400),
      rule(72, 128, 400),
      rule(72, 198.4, 400),
      rule(72, 212.4, 400),
      rule(72, 270, 400),
    ],
  };

  it('joins the header lines per column and keeps both group labels in place', () => {
    const table = findTable(buildLayout(spans, 612, 792, rules).tables, 'Corvid-7B');
    const rows = texts(table) ?? [];
    expect(rows[0]).toEqual(['Model', 'Release date', 'Params (B)', 'Pre-train tokens', 'Context length']);
    expect(rows[1]).toEqual(['Open source']);
    expect(rows[2]?.[0]).toBe('Corvid-7B');
    expect(rows.findIndex((row) => row[0] === 'Closed source')).toBe(rows.findIndex((row) => row[0] === 'Atlas-1') - 1);
  });
});

describe('insertTableGroupLabelRows — labels in a rule band', () => {
  const line = (text: string, x: number, y: number, width: number) => ({ text, x, y, width, height: 8, fontSize: 8 });
  const table = tableOf(
    [128, 139, 150, 212, 223].map((y, row) => [
      cell(`Model-${row}`, 74, y, 40, 8),
      cell(String(7 + row), 280, y, 8, 8),
      cell(`${row}.0T`, 340, y, 16, 8),
    ]),
  );
  const rows = [
    ...table.rows.map((row) => row.cells.map((c) => line(c.text, c.x, c.y, c.width))),
    [line('Closed source', 283, 199.8, 45)],
  ];
  const band = [
    { at: 198.4, start: 72, end: 472 },
    { at: 212, start: 72, end: 472 },
  ];
  const labels = (result: LayoutTable) =>
    result.rows.filter((row) => row.cells.length === 1).map((row) => row.cells[0].text);

  it('inserts a label set across the table between two full-width rules', () => {
    expect(labels(insertTableGroupLabelRows(table, rows, band))).toEqual(['Closed source']);
  });

  it('leaves it out without the rules', () => {
    expect(labels(insertTableGroupLabelRows(table, rows))).toEqual([]);
  });

  it('leaves it out when other text shares its band', () => {
    const crowded = [...rows, [line('see note', 400, 203, 30)]];
    expect(labels(insertTableGroupLabelRows(table, crowded, band))).toEqual([]);
  });

  it('leaves it out when the rules run only part of the table', () => {
    const partial = band.map((r) => ({ ...r, end: 300 }));
    expect(labels(insertTableGroupLabelRows(table, rows, partial))).toEqual([]);
  });
});

describe('joinWrappedHeaderRows', () => {
  it('joins a row of second header lines onto the cells above them', () => {
    const table = tableOf([
      [cell('区分', 128.9, 121.6, 18), cell('当期首残高', 226.8, 116.6, 45), cell('平均利率', 384.3, 116.6, 36)],
      [cell('(百万円)', 231.3, 126.6, 36), cell('(%)', 393.3, 126.6, 18)],
      [cell('借用金', 69.2, 139.1, 27), cell('1,377,528', 242.5, 139.1, 40.5), cell('0.06', 418, 139.1, 18)],
      [cell('借入金', 69.2, 156.6, 27), cell('1,377,528', 242.5, 156.6, 40.5), cell('0.06', 418, 156.6, 18)],
    ]);
    expect(texts(joinWrappedHeaderRows(table))?.slice(0, 2)).toEqual([
      ['区分', '当期首残高 (百万円)', '平均利率 (%)'],
      ['借用金', '1,377,528', '0.06'],
    ]);
  });

  it('keeps a group header over two sub-columns as its own level', () => {
    const table = tableOf([
      [cell('Three Months Ended', 200, 100, 80)],
      [cell('2024', 205, 110, 20), cell('2023', 255, 110, 20)],
      [cell('Net sales', 72, 122, 40), cell('1,200', 205, 122, 22), cell('1,100', 255, 122, 22)],
      [cell('Cost', 72, 134, 20), cell('800', 207, 134, 15), cell('700', 257, 134, 15)],
    ]);
    expect(joinWrappedHeaderRows(table)).toBe(table);
  });

  it('keeps header rows apart that are farther apart than wrapped lines', () => {
    const table = tableOf([
      [cell('Label', 72, 100, 30), cell('Value', 200, 100, 30)],
      [cell('(units)', 200, 116, 30)],
      [cell('a', 72, 130, 10), cell('12', 205, 130, 12)],
    ]);
    expect(joinWrappedHeaderRows(table)).toBe(table);
  });

  it('does not join a lone line onto a lone line', () => {
    const table = tableOf([
      [cell('6.4 Comparison to Other Algorithms', 70, 266, 260)],
      [cell('We also ran PPO on the benchmark', 70, 278, 300)],
      [cell('A2C', 200, 290, 20), cell('ACER', 260, 290, 24)],
      [cell('(1) avg. reward', 70, 302, 90), cell('1', 205, 302, 5), cell('18', 265, 302, 10)],
    ]);
    expect(joinWrappedHeaderRows(table)).toBe(table);
  });

  it('never joins the rows the detector says are data', () => {
    const table = tableOf([
      [cell('Alpha', 50, 100, 22), cell('x86', 150, 100, 14)],
      [cell('Beta', 50, 110, 18), cell('arm', 150, 110, 14)],
      [cell('Gamma', 50, 120, 22), cell('64', 150, 120, 9)],
    ]);
    expect(joinWrappedHeaderRows(table, 0)).toBe(table);
  });
});

describe('mergeSplitHeaderTables — a header stack the table already holds', () => {
  const header = [cell('資本金', 171, 143, 22), cell('資本剰余金', 211, 143, 37), cell('合計', 300, 143, 15)];
  const data = (y: number, label: string) => [
    cell(label, 59, y, 80),
    cell('397,050', 178, y, 26),
    cell('498,728', 225, y, 26),
    cell('895,778', 290, y, 26),
  ];
  const table = tableOf([header, data(165, '2023年4月1日現在残高'), data(178, '中間利益'), data(192, '配当金の支払')]);
  const stack = tableOf([
    [cell('前中間連結会計期間', 81, 91, 283)],
    [cell('(単位:百万円)', 467, 106, 72)],
    header,
    data(165, '2023年4月1日現在残高'),
  ]);

  it('drops a stack whose rows are the top of a table that took its header over a gap line', () => {
    const marked = { ...table, rows: table.rows.map((row) => ({ ...row })) };
    markHeaderRow(marked.rows[0]);
    expect(mergeSplitHeaderTables([marked, stack])).toEqual([marked]);
  });

  it('keeps such a stack beside a table found without a gap line, as before', () => {
    expect(mergeSplitHeaderTables([table, stack])).toHaveLength(2);
  });

  it('still merges the header rows a stack adds above the table', () => {
    const group = [cell('その他の', 211, 132, 30), cell('非支配持分', 290, 132, 37)];
    const merged = mergeSplitHeaderTables([
      tableOf([header, ...table.rows.slice(1).map((row) => row.cells)]),
      tableOf([group, header]),
    ]);
    expect(merged).toHaveLength(1);
    expect(texts(merged[0])?.[0]).toEqual(['その他の', '非支配持分']);
  });
});

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

describe('sortColumnRun — the page foot under column bottom notes', () => {
  const block = (text: string, x: number, y: number, fontSize: number, width = 240): LayoutBlock => ({
    text,
    x,
    y,
    width,
    height: fontSize,
    lines: [{ text, x, y, width, height: fontSize, fontSize }],
  });

  it('reads a footnote at the foot of a column before the page number below it', () => {
    const left = block('Left column body text that runs on for a while.', 54, 400, 10);
    const right = block('Right column body text that runs on for a while.', 315, 300, 10);
    const note = block('^1Code and probe weights: https://example.org/atp', 54, 714.5, 8, 158);
    const folio = block('1', 303.5, 744.8, 10, 5);
    const pending = [left, right, folio, note];
    const columnOf = new Map<LayoutBlock, number>([
      [left, 0],
      [note, 0],
      [right, 1],
      [folio, 1],
    ]);
    sortColumnRun(pending, columnOf, 792);
    expect(pending.map((b) => b.text)).toEqual([left.text, right.text, note.text, '1']);
  });

  it('keeps the column order when there is no bottom note', () => {
    const left = block('Left column body text that runs on for a while.', 54, 400, 10);
    const right = block('Right column body text that runs on for a while.', 315, 300, 10);
    const folio = block('1', 303.5, 744.8, 10, 5);
    const pending = [right, folio, left];
    sortColumnRun(
      pending,
      new Map([
        [left, 0],
        [right, 1],
        [folio, 1],
      ]),
      792,
    );
    expect(pending.map((b) => b.text)).toEqual([left.text, right.text, '1']);
  });
});
