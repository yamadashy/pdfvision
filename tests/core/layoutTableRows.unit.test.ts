import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../src/core/layout/index.js';
import { detectPageWarnings } from '../../src/core/warnings/index.js';
import type { LayoutTable, PageResult, TextSpan } from '../../src/types/index.js';

function span(text: string, x: number, y: number, width: number, fontSize = 9): TextSpan {
  return { text, x, y, width, height: fontSize, fontSize };
}

function texts(table: LayoutTable | undefined): string[][] | undefined {
  return table?.rows.map((row) => row.cells.map((cell) => cell.text));
}

function findTable(tables: LayoutTable[] | undefined, text: string): LayoutTable | undefined {
  return tables?.find((table) => table.rows.some((row) => row.cells.some((cell) => cell.text === text)));
}

function uncertainty(spans: TextSpan[]): string[] {
  const layout = buildLayout(spans, 612, 792);
  const page: PageResult = {
    page: 1,
    text: '',
    charCount: 0,
    imageCount: 0,
    vectorCount: 0,
    textCoverage: 0,
    nonPrintableRatio: 0,
    nonPrintableCount: 0,
    width: 612,
    height: 792,
    layout,
    quality: { nativeTextStatus: 'ok' },
  };
  return detectPageWarnings(page)
    .filter((warning) => warning.code === 'layout_table_uncertain')
    .map((warning) => warning.message);
}

// Cash-flow-statement shape: a label column and two right-aligned year
// columns, section labels without values, `—` for zero.
function statement(rows: [string, string?, string?][]): TextSpan[] {
  const spans: TextSpan[] = [span('2024', 448, 100, 22), span('2023', 518, 100, 22)];
  rows.forEach(([label, current, prior], index) => {
    const y = 120 + index * 16.6;
    spans.push(span(label, 84, y, label.length * 4.4));
    if (current)
      spans.push(
        span(
          current,
          current === '—' ? 460 : 470 - current.length * 4.6,
          y,
          current === '—' ? 10 : current.length * 4.6,
        ),
      );
    if (prior)
      spans.push(
        span(prior, prior === '—' ? 530 : 540 - prior.length * 4.6, y, prior === '—' ? 10 : prior.length * 4.6),
      );
  });
  return spans;
}

describe('layout table rows — dash placeholders (#250)', () => {
  const rows: [string, string?, string?][] = [
    ['Operating activities:'],
    ['Net income', '93,736', '96,995'],
    ['Adjustments to reconcile net income:'],
    ['Depreciation and amortization', '11,445', '11,519'],
    ['Share-based compensation expense', '11,688', '10,833'],
    ['Deferred income tax benefit', '(4,738)', '—'],
    ['Restructuring charges', '—', '—'],
    ['Other', '(2,266)', '(2,227)'],
    ['Changes in operating assets:'],
    ['Accounts receivable, net', '(3,788)', '(1,688)'],
    ['Vendor non-trade receivables', '—', '1,271'],
    ['Inventories', '(1,046)', '(1,618)'],
  ];

  it('keeps a row of nothing but placeholders inside the table it sits in', () => {
    const table = findTable(buildLayout(statement(rows), 612, 792).tables, '93,736');

    expect(texts(table)).toContainEqual(['Restructuring charges', '—', '—']);
    expect(texts(table)).toContainEqual(['Inventories', '(1,046)', '(1,618)']);
    const restructuring = table?.rows.find((row) => row.cells[0]?.text === 'Restructuring charges');
    expect(restructuring?.cells.map((cell) => cell.column)).toEqual([0, 1, 2]);
  });

  it('keeps placeholder rows that open a table above its first numbered row', () => {
    const spans = statement([
      ['Bonds', '—', '—'],
      ['Municipal', '—', '—'],
      ['Corporate', '24,539', '23,373'],
      ['Other', '50,590', '48,571'],
      ['Subtotal', '75,129', '71,944'],
      ['Total', '75,129', '71,944'],
    ]);
    const table = findTable(buildLayout(spans, 612, 792).tables, '24,539');

    expect(texts(table)?.slice(1, 3)).toEqual([
      ['Bonds', '—', '—'],
      ['Municipal', '—', '—'],
    ]);
  });

  it('does not admit a placeholder row whose dashes sit outside the value columns', () => {
    const restructuringY = 120 + 6 * 16.6;
    const misaligned = statement(rows).map((item) =>
      item.y === restructuringY && item.text === '—' ? { ...item, x: item.x - 160 } : item,
    );
    const tables = buildLayout(misaligned, 612, 792).tables ?? [];

    expect(tables.flatMap((table) => texts(table)?.flat() ?? [])).not.toContain('Restructuring charges');
  });
});

describe('layout table rows — wrapped labels (#251)', () => {
  // Invoice-shaped: rows padded 20pt apart, item names wrap at a 12pt line
  // pitch with the values on the first line.
  function invoice(lineGap: number, rowPitch: number): TextSpan[] {
    const spans: TextSpan[] = [];
    let y = 100;
    const items: [string[], string, string, string][] = [
      [['Website maintenance (October)'], '1', '120,000', '120,000'],
      [['Cloud server usage'], '3', '30,000', '90,000'],
      [['System change: order entry screen fields,', 'report layout and integration tests'], '1', '350,000', '350,000'],
      [['Meeting lunches'], '12', '1,080', '12,960'],
      [['Bottled drinks'], '24', '150', '3,600'],
    ];
    for (const [name, qty, price, amount] of items) {
      name.forEach((part, index) => {
        spans.push(span(part, 55, y + index * lineGap, part.length * 4.4));
      });
      spans.push(span(qty, 367 - qty.length * 5, y, qty.length * 5));
      spans.push(span(price, 470 - price.length * 4.6, y, price.length * 4.6));
      spans.push(span(amount, 540 - amount.length * 4.6, y, amount.length * 4.6));
      y += rowPitch + (name.length - 1) * lineGap;
    }
    return spans;
  }

  it('joins a wrapped line to the row above when it sits clearly closer to it', () => {
    const table = findTable(buildLayout(invoice(12, 20), 612, 792).tables, '350,000');

    expect(texts(table)).toContainEqual([
      'System change: order entry screen fields, report layout and integration tests',
      '1',
      '350,000',
      '350,000',
    ]);
    expect(texts(table)).toContainEqual(['Meeting lunches', '12', '1,080', '12,960']);
  });

  it('keeps a label wrapped above its values with the row below in a statement', () => {
    // Statement-shaped: values on the label's last line, rows 4pt apart
    // and lines inside a label 2pt apart.
    const spans = [
      span('Net sales', 60, 100, 40),
      span('94,930', 440, 100, 30),
      span('89,498', 510, 100, 30),
      span('Proceeds from issuance of', 60, 113, 110),
      span('term debt, net', 60, 124, 60),
      span('5,228', 445, 124, 25),
      span('4,000', 515, 124, 25),
      span('Other', 60, 137, 25),
      span('(361)', 445, 137, 25),
      span('(581)', 515, 137, 25),
      span('Total', 60, 150, 25),
      span('99,797', 440, 150, 30),
      span('92,917', 510, 150, 30),
    ];
    const layout = buildLayout(spans, 612, 792);
    const table = findTable(layout.tables, '5,228');

    expect(texts(table)).toContainEqual(['Proceeds from issuance of term debt, net', '5,228', '4,000']);
    expect(texts(table)).toContainEqual(['Net sales', '94,930', '89,498']);
  });

  // Uniform 12pt pitch everywhere: the first label line could end the row
  // above as well as start the row below.
  function uniformPitch(aboveLabel: string, aboveWidth: number): TextSpan[] {
    return [
      span(aboveLabel, 60, 100, aboveWidth),
      span('94,930', 440, 100, 30),
      span('89,498', 510, 100, 30),
      span('Proceeds from issuance of', 60, 112, 110),
      span('term debt, net', 60, 124, 60),
      span('5,228', 445, 124, 25),
      span('4,000', 515, 124, 25),
      span('Other', 60, 136, 25),
      span('(361)', 445, 136, 25),
      span('(581)', 515, 136, 25),
      span('Total', 60, 148, 25),
      span('99,797', 440, 148, 30),
      span('92,917', 510, 148, 30),
    ];
  }

  it('flags a wrapped label that sits as close to the full row above as to its own values', () => {
    expect(uncertainty(uniformPitch('Proceeds from sale of marketable', 112))).toEqual([
      expect.stringContaining('1 wrapped label sits as close to the row above'),
    ]);
  });

  it('does not flag it when the row above ends in a short line that could not have wrapped', () => {
    // A group heading above the first item of a group reads the same way.
    expect(uncertainty(uniformPitch('Net sales', 40))).toEqual([]);
  });

  it('does not flag a value row set apart under its labelled row', () => {
    // A standard error under its coefficient: no label line overlaps it.
    const spans = [
      span('Log minimum wage', 72, 100, 70),
      span('-0.142***', 243, 100, 38),
      span('-0.097***', 303, 100, 38),
      span('(0.031)', 243, 112.5, 30),
      span('(0.029)', 303, 112.5, 30),
      span('Log county population', 72, 125, 88),
      span('0.412***', 246, 125, 35),
      span('0.398***', 306, 125, 35),
      span('(0.058)', 243, 137.5, 30),
      span('(0.061)', 303, 137.5, 30),
      span('Observations', 72, 150, 50),
      span('48,912', 235, 150, 27),
      span('48,912', 295, 150, 27),
    ];

    expect(uncertainty(spans).filter((message) => message.includes('no label'))).toEqual([]);
  });

  it('does not flag a wrapped label that the spacing settles', () => {
    expect(uncertainty(invoice(12, 20)).filter((message) => message.includes('wrapped label'))).toEqual([]);
  });
});

describe('layout table rows — headers and captions (#253)', () => {
  // Report-shaped: caption, a header row of single words set as separate
  // spans with wide gaps, then data rows.
  function report(): TextSpan[] {
    const header: [string, number, number][] = [
      ['Depot', 60, 25],
      ['Region', 186, 28],
      ['Planned', 273, 33],
      ['Installed', 333, 38],
      ['Utilisation', 400, 46],
      ['Status', 466, 26],
    ];
    const rows: [string, string, string, string, string, string][] = [
      ['Aarhus', 'North', '10', '10', '48%', 'Complete'],
      ['Aberdeen', 'East', '17', '12', '59%', 'On track'],
      ['Antwerp', 'South', '12', '4', '70%', 'On track'],
      ['Bilbao', 'West', '19', '15', '50%', 'Delayed'],
      ['Bordeaux', 'West', '14', '7', '61%', 'On track'],
    ];
    const spans = [span('Table 1: Depot charging deployment at 30 September 2026', 56, 70, 249)];
    for (const [text, x, width] of header) spans.push(span(text, x, 86, width));
    rows.forEach((row, index) => {
      const y = 102 + index * 15;
      spans.push(span(row[0], 60, y, row[0].length * 4.5));
      spans.push(span(row[1], 186, y, row[1].length * 4.5));
      spans.push(span(row[2], 306 - row[2].length * 4.5, y, row[2].length * 4.5));
      spans.push(span(row[3], 371 - row[3].length * 4.5, y, row[3].length * 4.5));
      spans.push(span(row[4], 446 - row[4].length * 4.5, y, row[4].length * 4.5));
      spans.push(span(row[5], 466, y, row[5].length * 4.5));
    });
    return spans;
  }

  it('reads a widely spaced header row as one cell per column and keeps the caption out', () => {
    const layout = buildLayout(report(), 612, 792);
    const table = findTable(layout.tables, 'Aarhus');

    expect(texts(table)?.[0]).toEqual(['Depot', 'Region', 'Planned', 'Installed', 'Utilisation', 'Status']);
    expect(table?.rows[0]?.cells.map((cell) => cell.column)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(texts(table)?.[1]?.[0]).toBe('Aarhus');
    expect(
      texts(table)
        ?.flat()
        .some((text) => text.startsWith('Table 1')),
    ).toBe(false);
    // The reading text keeps the header as one line.
    expect(layout.blocks.flatMap((block) => block.lines).map((line) => line.text)).toContain(
      'Depot Region Planned Installed Utilisation Status',
    );
  });

  it('does not split widely spaced single letters (stacked subscripts) into cells', () => {
    const spans = report();
    // `V` `O L S`: a symbol's subscripts set apart on the row of Aarhus.
    spans.push(span('O', 120, 102, 4), span('L', 140, 102, 4), span('S', 160, 102, 4));
    const table = findTable(buildLayout(spans, 612, 792).tables, 'Aarhus');

    expect(texts(table)?.[1]).toContain('Aarhus');
    expect(texts(table)?.[1]).not.toContain('L');
  });

  it('keeps a `(continued)` caption out of a table whose header it precedes', () => {
    const spans = report().map((item) =>
      item.text.startsWith('Table 1') ? { ...item, text: 'Table 1 (continued)', width: 82 } : item,
    );
    const table = findTable(buildLayout(spans, 612, 792).tables, 'Aarhus');

    expect(texts(table)?.[0]?.[0]).toBe('Depot');
  });
});
