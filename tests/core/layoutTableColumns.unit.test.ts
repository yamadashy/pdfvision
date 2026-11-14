import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../src/core/layout/index.js';
import { tableCandidateRow } from '../../src/core/layout/tableCandidateRows.js';
import type { LayoutTable, TextSpan } from '../../src/types/index.js';

function span(text: string, x: number, y: number, width: number, fontSize = 9): TextSpan {
  return { text, x, y, width, height: fontSize, fontSize };
}

function cellsOf(table: LayoutTable | undefined, firstText: string) {
  const row = table?.rows.find((candidate) => candidate.cells[0]?.text === firstText);
  return row?.cells.map((cell) => ({ text: cell.text, column: cell.column, columnSpan: cell.columnSpan }));
}

function findTable(tables: LayoutTable[] | undefined, text: string): LayoutTable | undefined {
  return tables?.find((table) => table.rows.some((row) => row.cells.some((cell) => cell.text === text)));
}

describe('layout table columns', () => {
  // "Attention Is All You Need" Table 2-shaped: rows with empty BLEU or
  // cost cells, grouped headers, and a cost value merged across both
  // cost columns.
  const attentionTable2: TextSpan[] = [
    span('BLEU', 311.02, 96, 26.01),
    span('Training Cost (FLOPs)', 383.25, 96, 92.07),
    span('Model', 136.67, 103, 26.01),
    span('EN-DE EN-FR', 288.72, 110, 70.61),
    span('EN-DE', 387.47, 110, 29.88),
    span('EN-FR', 440.04, 110, 28.78),
    span('ByteNet [18]', 136.67, 123, 52.29),
    span('23.75', 292.45, 123, 22.42),
    span('Deep-Att + PosUnk [39]', 136.67, 134, 98.31),
    span('39.2', 336.22, 134, 17.43),
    span('1.0 · 1020', 435.26, 134, 37.83),
    span('GNMT + RL [38]', 136.67, 145, 71.75),
    span('24.6', 294.94, 145, 17.43),
    span('39.92', 333.73, 145, 22.42),
    span('2.3 · 1019', 383.25, 145, 37.82),
    span('1.4 · 1020', 435.26, 145, 37.83),
    span('ConvS2S [9]', 136.67, 156, 51.36),
    span('25.16', 292.45, 156, 22.42),
    span('40.46', 333.73, 156, 22.42),
    span('9.6 · 1018', 383.25, 156, 37.82),
    span('1.5 · 1020', 435.26, 156, 37.83),
    span('MoE [32]', 136.67, 167, 39.01),
    span('26.03', 292.45, 167, 22.42),
    span('40.56', 333.73, 167, 22.42),
    span('2.0 · 1019', 383.25, 167, 37.82),
    span('1.2 · 1020', 435.27, 167, 37.82),
    span('Transformer (base model)', 136.67, 180, 103.67),
    span('27.3', 294.94, 180, 17.43),
    span('38.1', 336.22, 180, 17.43),
    span('3.3 · 1018', 407.34, 180, 43.4),
  ];

  it('places sparse row values in their own columns instead of packing them left', () => {
    const table = findTable(buildLayout(attentionTable2, 612, 792).tables, '39.2');

    expect(table?.columnCount).toBe(5);
    expect(cellsOf(table, 'ByteNet [18]')).toEqual([
      { text: 'ByteNet [18]', column: 0, columnSpan: undefined },
      { text: '23.75', column: 1, columnSpan: undefined },
    ]);
    expect(cellsOf(table, 'Deep-Att + PosUnk [39]')).toEqual([
      { text: 'Deep-Att + PosUnk [39]', column: 0, columnSpan: undefined },
      { text: '39.2', column: 2, columnSpan: undefined },
      { text: '1.0 · 1020', column: 4, columnSpan: undefined },
    ]);
  });

  it('gives merged values and grouped headers a column span', () => {
    const table = findTable(buildLayout(attentionTable2, 612, 792).tables, '39.2');

    expect(cellsOf(table, 'Transformer (base model)')?.at(-1)).toEqual({
      text: '3.3 · 1018',
      column: 3,
      columnSpan: 2,
    });
    expect(cellsOf(table, 'BLEU')).toEqual([
      { text: 'BLEU', column: 1, columnSpan: 2 },
      { text: 'Training Cost (FLOPs)', column: 3, columnSpan: 2 },
    ]);
    expect(cellsOf(table, 'EN-DE EN-FR')).toEqual([
      { text: 'EN-DE EN-FR', column: 1, columnSpan: 2 },
      { text: 'EN-DE', column: 3, columnSpan: undefined },
      { text: 'EN-FR', column: 4, columnSpan: undefined },
    ]);
  });

  it('keeps rows whose empty values are dash placeholders', () => {
    // Apple 10-K cash-flow-shaped case: a row whose prior-year value is
    // an em dash used to vanish because only one cell looked numeric.
    const rows: [string, string, string][] = [
      ['Payments for dividends and dividend equivalents', '(15,234)', '(15,025)'],
      ['Repurchases of common stock', '(94,949)', '(77,550)'],
      ['Proceeds from issuance of term debt, net', '—', '5,228'],
      ['Repayments of term debt', '(9,958)', '(11,151)'],
      ['Other', '(361)', '(581)'],
    ];
    const spans = rows.flatMap(([label, current, prior], index) => {
      const y = 100 + index * 12;
      return [
        span(label, 58, y, label.length * 4),
        span(current, current === '—' ? 455 : 432, y, current === '—' ? 8 : 31),
        span(prior, 504, y, 31),
      ];
    });
    const table = findTable(buildLayout(spans, 612, 792).tables, '5,228');

    expect(table?.rows.map((row) => row.cells.map((cell) => cell.text))).toContainEqual([
      'Proceeds from issuance of term debt, net',
      '—',
      '5,228',
    ]);
    expect(cellsOf(table, 'Proceeds from issuance of term debt, net')?.map((cell) => cell.column)).toEqual([0, 1, 2]);
  });

  it('keeps a row whose only values carry footnote markers', () => {
    const rows = [
      ['Products', '69,958', '67,184'],
      ['Services', '24,972', '22,314'],
      ['Adjustments', '10 (a)', '20 (b)'],
      ['Total', '94,940', '89,518'],
    ];
    const spans = rows.flatMap(([label, current, prior], index) => {
      const y = 100 + index * 12;
      return [span(label, 50, y, 45), span(current, 200, y, 30), span(prior, 260, y, 30)];
    });
    const table = findTable(buildLayout(spans, 612, 792).tables, '69,958');

    expect(cellsOf(table, 'Adjustments')?.map(({ text, column }) => [text, column])).toEqual([
      ['Adjustments', 0],
      ['10 (a)', 1],
      ['20 (b)', 2],
    ]);
  });

  it('does not take a row of nothing but placeholders as a table row', () => {
    const line = (text: string, x: number) => ({ text, x, y: 100, width: 20, height: 9, fontSize: 9 });
    expect(tableCandidateRow([line('Other', 50), line('—', 200), line('—', 260)])).toBeUndefined();
    expect(tableCandidateRow([line('Other', 50), line('n/a', 200), line('— (a)', 260)])).toBeUndefined();
  });

  it('keeps group-label rows inside the table and centers grouped headers over their columns', () => {
    // Apple 10-K income-statement-shaped case: without the group labels,
    // `Products` and `Services` appear twice with nothing to tell the
    // net-sales rows from the cost-of-sales rows.
    const values = (y: number, a: string, b: string, c: string, d: string) => [
      span(a, 333.26, y, 28),
      span(b, 399.26, y, 28),
      span(c, 460.26, y, 33),
      span(d, 526.26, y, 33),
    ];
    const spans = [
      span('Three Months Ended', 326.21, 100, 80.08),
      span('Twelve Months Ended', 455.83, 100, 84.85),
      span('2024', 323.44, 112, 19.63),
      span('2023', 389.51, 112, 19.5),
      span('2024', 455.44, 112, 19.63),
      span('2023', 521.51, 112, 19.5),
      span('Net sales:', 52.08, 126, 40),
      span('Products', 58.63, 138, 36),
      ...values(138, '69,958', '67,184', '294,866', '298,085'),
      span('Services', 58.63, 150, 34),
      ...values(150, '24,972', '22,314', '96,169', '85,200'),
      span('Total net sales', 70.08, 162, 60),
      ...values(162, '94,930', '89,498', '391,035', '383,285'),
      span('Cost of sales:', 52.08, 174, 52),
      span('Products', 58.63, 186, 36),
      ...values(186, '44,566', '42,586', '185,233', '189,282'),
      span('Services', 58.63, 198, 34),
      ...values(198, '6,485', '6,485', '25,119', '24,855'),
      span('Total cost of sales', 70.08, 210, 72),
      ...values(210, '51,051', '49,071', '210,352', '214,137'),
    ];
    const table = findTable(buildLayout(spans, 612, 792).tables, '69,958');
    const texts = table?.rows.map((row) => row.cells.map((cell) => cell.text));

    expect(texts?.findIndex((row) => row[0] === 'Net sales:')).toBeLessThan(
      texts?.findIndex((row) => row[0] === 'Products') ?? -1,
    );
    expect(cellsOf(table, 'Net sales:')).toEqual([{ text: 'Net sales:', column: 0, columnSpan: undefined }]);
    expect(cellsOf(table, 'Cost of sales:')).toEqual([{ text: 'Cost of sales:', column: 0, columnSpan: undefined }]);
    expect(cellsOf(table, 'Three Months Ended')).toEqual([
      { text: 'Three Months Ended', column: 1, columnSpan: 2 },
      { text: 'Twelve Months Ended', column: 3, columnSpan: 2 },
    ]);
    expect(cellsOf(table, '2024')?.map((cell) => cell.column)).toEqual([1, 2, 3, 4]);
  });

  it('splits trailing currency and footnote markers away from the next column', () => {
    // Apple 10-K non-GAAP reconciliation-shaped case: pdf.js joins the
    // `$` of the next column onto a value, and adjustments carry `(b)`.
    const spans = [
      span('As Reported', 315.33, 100, 48.03),
      span('Non-GAAP', 385.28, 100, 42.03),
      span('As Adjusted', 465.65, 100, 46.9),
      span('Income before provision for income taxes', 52.08, 115, 164.1),
      span('$ 29,610 $', 339.2, 115, 44.16),
      span('—', 424.66, 115, 7.79),
      span('$ 29,610', 488.96, 115, 28.21),
      span('Provision for income taxes', 52.08, 127, 104.78),
      span('14,874', 339.2, 127, 27.49),
      span('(10,246) (b)', 402.16, 127, 49.44),
      span('4,628', 493.96, 127, 24.2),
      span('Net income', 52.08, 139, 45.98),
      span('$ 14,736 $', 339.2, 139, 44.16),
      span('10,246 (b) $', 406.16, 139, 60),
      span('24,982', 488.96, 139, 28.21),
      span('Shares used in computing diluted earnings per share', 52.08, 151, 210.04),
      span('15,242,853', 321.7, 151, 46.28),
      span('—', 424.66, 151, 7.79),
      span('15,242,853', 471.46, 151, 46.28),
    ];
    const table = findTable(buildLayout(spans, 792, 612).tables, '14,874');

    expect(table?.columnCount).toBe(4);
    expect(
      cellsOf(table, 'Income before provision for income taxes')?.map(({ text, column }) => [text, column]),
    ).toEqual([
      ['Income before provision for income taxes', 0],
      ['$ 29,610', 1],
      ['$ —', 2],
      ['$ 29,610', 3],
    ]);
    expect(cellsOf(table, 'Net income')?.map(({ text, column }) => [text, column])).toEqual([
      ['Net income', 0],
      ['$ 14,736', 1],
      ['$ 10,246 (b)', 2],
      ['$ 24,982', 3],
    ]);
  });

  it('folds a header digit that overlaps no value into the nearest column', () => {
    // IRS EIC-table-shaped case: centered single-digit headers sit a few
    // points left of right-aligned `0` values that are too narrow to
    // overlap them; the header must not open a column of its own.
    const rows = [
      ['56,800', '56,850', '0', '102', '996'],
      ['56,850', '56,900', '0', '92', '986'],
      ['56,900', '56,950', '0', '81', '975'],
      ['56,950', '57,000', '0', '71', '965'],
    ];
    const xs = [60.28, 94.09, 130.61, 172.35, 195.68];
    const widths = [15.4, 15.4, 2.7, 8.1, 8.1];
    const spans = [
      span('0', 122.72, 90, 3.6, 6.5),
      span('1', 169.88, 90, 3.6, 6.5),
      span('2', 193.46, 90, 3.6, 6.5),
      ...rows.flatMap((row, rowIndex) =>
        row.map((text, index) => {
          const width = text.length < 3 && index === 3 ? 5.4 : widths[index];
          const x = index === 3 ? 180.5 - width : xs[index];
          return span(text, x, 120 + rowIndex * 7, width, 6.5);
        }),
      ),
    ];
    const table = findTable(buildLayout(spans, 612, 792).tables, '56,800');

    expect(table?.columnCount).toBe(5);
    expect(table?.rows[0]?.cells.map((cell) => [cell.text, cell.column])).toEqual([
      ['0', 2],
      ['1', 3],
      ['2', 4],
    ]);
  });

  it('keeps a sparse body column that has its own header', () => {
    // Q2 holds a value in only one row, a few points right of the Q1
    // values; its own header shows it is a real column, not a stray header
    // digit to fold into Q1.
    const rows: [string, string, number][] = [
      ['Revenue', '1,010', 95],
      ['Costs', '1,020', 95],
      ['Taxes', '1,030', 95],
      ['Other', '1,040', 95],
      ['Margin', '1,050', 124],
    ];
    const spans = [
      span('Item', 0, 90, 18),
      span('Q1', 100, 90, 10),
      span('Q2', 128, 90, 10),
      span('Q3', 175, 90, 10),
      span('Total', 210, 90, 20),
      ...rows.flatMap(([label, value, x], index) => {
        const y = 102 + index * 12;
        return [
          span(label, 0, y, 28),
          span(value, x, y, 20),
          span(`7${index}`, 175, y, 10),
          span(`90${index}`, 212, y, 14),
        ];
      }),
    ];
    const table = findTable(buildLayout(spans, 612, 792).tables, '1,050');

    expect(table?.columnCount).toBe(5);
    expect(cellsOf(table, 'Item')?.map((cell) => cell.column)).toEqual([0, 1, 2, 3, 4]);
    expect(cellsOf(table, 'Margin')?.map(({ text, column }) => [text, column])).toEqual([
      ['Margin', 0],
      ['1,050', 2],
      ['74', 3],
      ['904', 4],
    ]);
  });

  it('assigns columns in an aligned-text table on a page with no numeric table rows', () => {
    // Every value mixes letters and digits, so no row is a numeric table
    // candidate and only the aligned-text detector finds the table.
    const rows: (string | undefined)[][] = [
      ['Alpha', 'x86-64', 'gcc12', 'Linux6'],
      ['Beta', 'arm64', 'clang17', 'macOS14'],
      ['Gamma', 'riscv64', undefined, 'Linux6'],
      ['Delta', 'x86-64', 'msvc19', 'Win11'],
      ['Epsilon', 'arm64', 'gcc13', 'Android14'],
    ];
    const xs = [50, 150, 250, 350];
    const spans = rows.flatMap((row, rowIndex) =>
      row.flatMap((text, column) => (text ? [span(text, xs[column], 100 + rowIndex * 12, text.length * 4.5)] : [])),
    );
    const table = findTable(buildLayout(spans, 612, 792).tables, 'riscv64');

    expect(cellsOf(table, 'Gamma')?.map(({ text, column }) => [text, column])).toEqual([
      ['Gamma', 0],
      ['riscv64', 1],
      ['Linux6', 3],
    ]);
  });

  it('keeps a column header above the first row instead of gluing it onto that row label', () => {
    // ViT appendix-shaped case: `N/A` makes the first data row a table row,
    // and the header line above it must not become part of its label.
    const spans = [
      span('Pos. Emb.', 166.64, 283, 37.4),
      span('Default/Stem Every Layer Every Layer-Shared', 250.3, 283, 190),
      span('No Pos. Emb.', 166.64, 294, 52.3),
      span('0.61382', 260.7, 294, 29.9),
      span('N/A', 326.4, 294, 15.9),
      span('N/A', 404.4, 294, 15.9),
      span('1-D Pos. Emb.', 166.64, 305, 55.3),
      span('0.64206', 260.7, 305, 29.9),
      span('0.63964', 319.4, 305, 29.9),
      span('0.64292', 397.4, 305, 29.9),
      span('2-D Pos. Emb.', 166.64, 316, 55.3),
      span('0.64001', 260.7, 316, 29.9),
      span('0.64046', 319.4, 316, 29.9),
      span('0.64022', 397.4, 316, 29.9),
      span('Rel. Pos. Emb.', 166.64, 327, 56.9),
      span('0.64032', 260.7, 327, 29.9),
      span('N/A', 326.4, 327, 15.9),
      span('N/A', 404.4, 327, 15.9),
    ];
    const table = findTable(buildLayout(spans, 612, 792).tables, '0.61382');

    expect(table?.rows.map((row) => row.cells.map((cell) => cell.text))).toEqual([
      ['Pos. Emb.', 'Default/Stem Every Layer Every Layer-Shared'],
      ['No Pos. Emb.', '0.61382', 'N/A', 'N/A'],
      ['1-D Pos. Emb.', '0.64206', '0.63964', '0.64292'],
      ['2-D Pos. Emb.', '0.64001', '0.64046', '0.64022'],
      ['Rel. Pos. Emb.', '0.64032', 'N/A', 'N/A'],
    ]);
  });
});
