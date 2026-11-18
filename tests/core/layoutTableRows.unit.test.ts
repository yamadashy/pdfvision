import { describe, expect, it } from 'vitest';
import { isCaptionHeadingText } from '../../src/core/layout/headingText.js';
import { buildLayout } from '../../src/core/layout/index.js';
import { hasTableValueEvidence, isTableValueCell } from '../../src/core/layout/tableCells.js';
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

  it('keeps a placeholder row that ends the grid at its row pitch, but not one far below it', () => {
    const edge = statement([
      ['Net income', '93,736', '96,995'],
      ['Depreciation and amortization', '11,445', '11,519'],
      ['Share-based compensation expense', '11,688', '10,833'],
      ['Other', '(2,266)', '(2,227)'],
      ['Restructuring charges', '—', '—'],
    ]);
    edge.push(span('Impairment', 84, 260, 44), span('—', 460, 260, 10), span('—', 530, 260, 10));
    const table = findTable(buildLayout(edge, 612, 792).tables, '93,736');

    expect(texts(table)?.at(-1)).toEqual(['Restructuring charges', '—', '—']);
    expect(texts(table)?.flat()).not.toContain('Impairment');
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

  it('measures the label column from body labels, not a wide header above them', () => {
    const spans = [
      span('(In millions, except per-share amounts)', 60, 86, 220),
      span('2024', 448, 86, 22),
      span('2023', 518, 86, 22),
      ...uniformPitch('Proceeds from sale of marketable', 112),
    ];
    const layout = buildLayout(spans, 612, 792);
    expect(texts(findTable(layout.tables, '5,228'))?.[0]?.[0]).toBe('(In millions, except per-share amounts)');
    expect(uncertainty(spans)).toEqual([expect.stringContaining('1 wrapped label sits as close to the row above')]);
  });

  it('does not flag it when the row above ends in a short line that could not have wrapped', () => {
    // A group heading above the first item of a group reads the same way.
    expect(uncertainty(uniformPitch('Net sales', 40))).toEqual([]);
  });

  it('flags a label set in two lines around its values line', () => {
    const rows = (y: number, label: string, a: string, b: string) => [
      span(label, 68, y, label.length * 7.5, 7.5),
      span(a, 283 - a.length * 4, y, a.length * 4, 7.5),
      span(b, 377 - b.length * 4, y, b.length * 4, 7.5),
    ];
    const spans = [
      ...rows(100, '剰余金の配当', '(9,794)', '(9,794)'),
      // `親会社株主に帰属す / る当期純利益` set around `27,691 | 27,691`.
      span('親会社株主に帰属す', 68, 112.5, 68, 7.5),
      span('27,691', 259, 117.5, 24, 7.5),
      span('27,691', 353, 117.5, 24, 7.5),
      span('る当期純利益', 68, 122.5, 45, 7.5),
      ...rows(135, '自己株式の取得', '(6,294)', '(6,294)'),
      ...rows(150, '自己株式の処分', '435', '435'),
      ...rows(165, '当期変動額合計', '19,046', '13,006'),
    ];

    expect(uncertainty(spans)).toEqual([expect.stringContaining('1 row has values but no label')]);
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

  it('splits a header that holds one single-letter column among words', () => {
    const spans = report().map((item) => (item.text === 'Planned' ? { ...item, text: 'N', width: 5 } : item));
    const table = findTable(buildLayout(spans, 612, 792).tables, 'Aarhus');

    expect(texts(table)?.[0]).toEqual(['Depot', 'Region', 'N', 'Installed', 'Utilisation', 'Status']);
  });

  it('does not read a letter-spaced title as a row of cells', () => {
    const spans = [...report(), ...'SUMMARY'.split('').map((ch, index) => span(ch, 60 + index * 12, 40, 5))];
    const layout = buildLayout(spans, 612, 792);

    expect(layout.blocks.flatMap((block) => block.lines.map((line) => line.text))).toContain('S U M M A R Y');
    expect((layout.tables ?? []).flatMap((table) => texts(table)?.flat() ?? [])).not.toContain('S');
  });

  it('keeps the rows the aligned-text pass found past the end of the numeric table', () => {
    // A region sub-heading, then a depot whose only figure is 0%: the
    // numeric pass stops at Bordeaux, the aligned-text pass carries on.
    const spans = report();
    spans.push(span('Ireland', 186, 177, 31.5));
    for (const [text, x, width] of [
      ['Cork', 60, 18],
      ['West', 186, 18],
      ['TBD', 292, 14],
      ['TBD', 357, 14],
      ['0%', 437, 9],
      ['Planned', 466, 31.5],
    ] as const)
      spans.push(span(text, x, 192, width));
    const table = findTable(buildLayout(spans, 612, 792).tables, 'Aarhus');

    expect(texts(table)?.at(-2)).toEqual(['Ireland']);
    expect(texts(table)?.at(-1)).toEqual(['Cork', 'West', 'TBD', 'TBD', '0%', 'Planned']);
  });

  it('keeps a header whose first word only starts like a caption keyword', () => {
    const spans = report().map((item) => (item.text === 'Depot' ? { ...item, text: 'Tableware', width: 40 } : item));
    const table = findTable(buildLayout(spans, 612, 792).tables, 'Aarhus');

    expect(texts(table)?.[0]?.[0]).toBe('Tableware');
  });

  it('tells a caption from a word that starts with a caption keyword', () => {
    for (const text of [
      'Table 1',
      'Table A',
      'Table IV',
      'Table S1 (continued)',
      'Fig. 3',
      'Fig.3',
      'Figure 2b',
      'Table1',
      '表1',
    ]) {
      expect(isCaptionHeadingText(text), text).toBe(true);
    }
    for (const text of ['Tableware', 'Tablets', 'Platelets', 'Figures']) {
      expect(isCaptionHeadingText(text), text).toBe(false);
    }
  });

  it('keeps a `(continued)` caption out of a table whose header it precedes', () => {
    const spans = report().map((item) =>
      item.text.startsWith('Table 1') ? { ...item, text: 'Table 1 (continued)', width: 82 } : item,
    );
    const table = findTable(buildLayout(spans, 612, 792).tables, 'Aarhus');

    expect(texts(table)?.[0]?.[0]).toBe('Depot');
  });
});

describe('layout table rows — the rest of the grid (#262)', () => {
  // Schedule-shaped: phase rows (`2 Design`) and a task with no dates yet
  // are not candidate rows on their own, and a timeline axis sits beside
  // the header.
  function schedule(): TextSpan[] {
    const spans = [
      span('ID', 27, 85, 7),
      span('Task', 51, 85, 16),
      span('Owner', 183, 85, 23),
      span('Start', 262, 85, 26),
      span('End', 309, 85, 25),
      span('9/7', 347, 92, 9),
      span('9/14', 372, 92, 13),
      span('9/21', 399, 92, 13),
    ];
    const rows: [string, string, string?, string?, string?][] = [
      ['1', 'Discovery'],
      ['1.1', 'Stakeholder interviews', 'P. Nair', '9/7/26', '9/18/26'],
      ['1.2', 'Current-state audit', 'J. Brandt', '9/14/26', '9/25/26'],
      ['1.3', 'Requirements sign-off', 'R. Solis', '9/25/26', '9/25/26'],
      ['2', 'Design'],
      ['2.1', 'UX wireframes', 'M. Lindqvist', '9/21/26', '10/9/26'],
      ['2.2', 'Visual design system', 'A. Tanaka', '9/28/26', '10/23/26'],
      ['2.3', 'Design review', 'R. Solis', '10/23/26', '10/23/26'],
      ['3', 'Test & launch'],
      ['3.1', 'QA regression', 'QA team', '11/23/26', '12/4/26'],
      ['3.2', 'Penetration test', 'Vendor (TBD)'],
      ['3.3', 'User acceptance testing', 'J. Brandt', '12/7/26', '12/18/26'],
      ['3.4', 'Go-live', 'R. Solis', '12/18/26', '12/18/26'],
    ];
    rows.forEach(([id, task, owner, start, end], index) => {
      const y = 107 + index * 18;
      spans.push(span(id, 27, y, id.length * 3.5));
      spans.push(span(task, id.includes('.') ? 59 : 51, y, task.length * 3.6));
      if (owner) spans.push(span(owner, 183, y, owner.length * 3.4));
      if (start) spans.push(span(start, 288 - start.length * 3.6, y, start.length * 3.6));
      if (end) spans.push(span(end, 334 - end.length * 3.6, y, end.length * 3.6));
    });
    return spans;
  }

  it('keeps group rows and sparse rows of the same grid in the table to its last row', () => {
    const table = findTable(buildLayout(schedule(), 612, 792).tables, 'Discovery');

    expect(texts(table)?.[0]).toEqual(['ID', 'Task', 'Owner', 'Start', 'End']);
    expect(texts(table)).toContainEqual(['3', 'Test & launch']);
    expect(texts(table)).toContainEqual(['3.2', 'Penetration test', 'Vendor (TBD)']);
    expect(texts(table)?.at(-1)).toEqual(['3.4', 'Go-live', 'R. Solis', '12/18/26', '12/18/26']);
  });

  it('does not bridge across prose that runs over several columns', () => {
    const spans = schedule().filter((item) => item.text !== 'Design' && item.text !== '2');
    spans.push(span('The design phase was moved to the next quarter', 27, 179, 300));
    const tables = buildLayout(spans, 612, 792).tables;

    expect((tables ?? []).flatMap((table) => texts(table)?.flat() ?? [])).not.toContain(
      'The design phase was moved to the next quarter',
    );
  });

  it('keeps the word-valued rows that end a regression table', () => {
    const coefficient = (y: number, label: string, values: string[]) => [
      span(label, 72, y, label.length * 4),
      ...values.map((value, index) => span(value, 243 + index * 60, y, value.length * 4.2)),
    ];
    const spans = [
      ...coefficient(100, 'Log minimum wage', ['-0.142***', '-0.097***', '-0.061**', '-0.031']),
      ...coefficient(112.5, '', ['(0.031)', '(0.029)', '(0.027)', '(0.025)']).slice(1),
      ...coefficient(125, 'Log county population', ['0.412***', '0.398***', '0.094', '0.088']),
      ...coefficient(137.5, '', ['(0.058)', '(0.061)', '(0.060)', '(0.062)']).slice(1),
      ...coefficient(150, 'Observations', ['48,912', '48,912', '48,640', '48,640']),
      ...coefficient(162.5, 'R2', ['0.912', '0.918', '0.751', '0.756']),
      ...coefficient(181, 'County fixed effects', ['Yes', 'Yes', 'Yes', 'Yes']),
      ...coefficient(193.5, 'State linear trends', ['No', 'Yes', 'No', 'Yes']),
    ];
    const table = findTable(buildLayout(spans, 612, 792).tables, '48,912');

    expect(texts(table)?.[0]).toEqual(['Log minimum wage', '-0.142***', '-0.097***', '-0.061**', '-0.031']);
    expect(texts(table)?.slice(-2)).toEqual([
      ['County fixed effects', 'Yes', 'Yes', 'Yes', 'Yes'],
      ['State linear trends', 'No', 'Yes', 'No', 'Yes'],
    ]);
  });

  it('keeps the word-valued row that ends a table whose every coefficient is starred', () => {
    const coefficient = (y: number, label: string, values: string[]) => [
      span(label, 72, y, label.length * 4),
      ...values.map((value, index) => span(value, 243 + index * 60, y, value.length * 4.2)),
    ];
    const spans = [
      ...coefficient(100, 'Log minimum wage', ['-0.142***', '-0.097***', '-0.061**']),
      ...coefficient(112.5, 'Log county population', ['0.412***', '0.398***', '0.094*']),
      ...coefficient(125, 'Unemployment rate', ['-0.031**', '-0.028**', '-0.019*']),
      ...coefficient(137.5, 'Share of teens', ['0.217***', '0.203***', '0.188***']),
      ...coefficient(150, 'Fixed effects', ['Yes', 'Yes', 'Yes']),
    ];
    const table = findTable(buildLayout(spans, 612, 792).tables, '-0.142***');

    expect(texts(table)?.at(-1)).toEqual(['Fixed effects', 'Yes', 'Yes', 'Yes']);
  });

  it('does not attach a word row that lies outside the value columns or past the row pitch', () => {
    const spans = [
      span('Products', 50, 100, 40),
      span('69,958', 200, 100, 30),
      span('67,184', 260, 100, 30),
      span('Services', 50, 112, 40),
      span('24,972', 200, 112, 30),
      span('22,314', 260, 112, 30),
      span('Total', 50, 124, 40),
      span('94,930', 200, 124, 30),
      span('89,498', 260, 124, 30),
      // A note straddling both value columns, then a row far below.
      span('See note', 215, 136, 60),
      span('Audited', 50, 170, 35),
      span('Yes', 205, 170, 20),
      span('No', 265, 170, 15),
    ];
    const table = findTable(buildLayout(spans, 612, 792).tables, '69,958');

    expect(texts(table)?.flat()).not.toContain('See note');
    expect(texts(table)?.flat()).not.toContain('Audited');
  });

  it('keeps rows whose values are written negative with a triangle', () => {
    const rows: [string, string, string][] = [
      ['営業利益', '2,559,294', '2,464,217'],
      ['持分法による投資損益', '378,530', '264,315'],
      ['その他の金融収益', '337,941', '270,945'],
      ['その他の金融費用', '△44,300', '△53,694'],
      ['為替差損益<純額>', '299,376', '△226,811'],
      ['税引前中間利益', '3,521,525', '2,732,069'],
      ['法人所得税費用', '874,004', '866,418'],
    ];
    const spans = rows.flatMap(([label, current, prior], index) => {
      const y = 100 + index * 14.3;
      return [
        span(label, 60, y, label.length * 9),
        span(current, 394 - current.length * 4.5, y, current.length * 4.5),
        span(prior, 520 - prior.length * 4.5, y, prior.length * 4.5),
      ];
    });
    const table = findTable(buildLayout(spans, 612, 792).tables, '2,559,294');

    expect(texts(table)).toContainEqual(['その他の金融費用', '△44,300', '△53,694']);
    expect(texts(table)?.at(-1)).toEqual(['法人所得税費用', '874,004', '866,418']);
  });

  it('joins a cell wrapped over several lines to the row it belongs to', () => {
    // Text column wrapped around the row line: one line above it, one below,
    // each set tight to that row and apart from the neighbouring rows.
    const spans: TextSpan[] = [];
    const rows: [string, string, string, string, string[]][] = [
      ['Revenue', '195,676', '186,176', '-9,500', ['Lower volumes']],
      ['Gross profit', '23,597', '18,364', '-5,233', ['Lower volumes', 'and coal sales']],
      ['SG&A', '-16,923', '-14,653', '+2,270', ['Deconsolidation']],
      ['Securities', '2,330', '3,056', '+726', ['Prior-year gains', 'reversed, offset by', 'remeasurement gains']],
      ['Asset sales', '372', '1,346', '+974', ['Coal asset sales']],
      ['Impairments', '-296', '-39', '+257', ['Prior-year charge']],
    ];
    let y = 100;
    for (const [label, a, b, c, reason] of rows) {
      const valueLine = reason.length === 3 ? 1 : 0;
      const top = y;
      for (const [index, line] of reason.entries()) spans.push(span(line, 380, top + index * 10, line.length * 4.5));
      const valueY = top + valueLine * 10;
      spans.push(span(label, 63, valueY, label.length * 4.5));
      spans.push(span(a, 229 - a.length * 4.5, valueY, a.length * 4.5));
      spans.push(span(b, 289 - b.length * 4.5, valueY, b.length * 4.5));
      spans.push(span(c, 349 - c.length * 4.5, valueY, c.length * 4.5));
      y = top + reason.length * 10 + 15;
    }
    const table = findTable(buildLayout(spans, 612, 792).tables, 'Securities');

    expect(texts(table)).toContainEqual([
      'Securities',
      '2,330',
      '3,056',
      '+726',
      'Prior-year gains reversed, offset by remeasurement gains',
    ]);
    expect(texts(table)).toContainEqual(['Gross profit', '23,597', '18,364', '-5,233', 'Lower volumes and coal sales']);
  });

  it('joins a run of wrapped lines set at their own line pitch to the row they hang from', () => {
    // Two continuation lines under a reason cell: each is as close to the
    // next as to the cell, but the run as a whole sits tight to its row.
    const spans: TextSpan[] = [];
    const rows: [string, string, string, string[]][] = [
      ['Revenue', '195,676', '186,176', ['Lower volumes']],
      ['Gross profit', '23,597', '18,364', ['Lower volumes', 'and coal sales', 'in the period']],
      ['SG&A', '-16,923', '-14,653', ['Deconsolidation']],
      ['Impairments', '-296', '-39', ['Prior-year charge']],
    ];
    let y = 100;
    for (const [label, a, b, reason] of rows) {
      for (const [index, line] of reason.entries()) spans.push(span(line, 380, y + index * 10, line.length * 4.5));
      spans.push(span(label, 63, y, label.length * 4.5));
      spans.push(span(a, 229 - a.length * 4.5, y, a.length * 4.5));
      spans.push(span(b, 289 - b.length * 4.5, y, b.length * 4.5));
      y += reason.length * 10 + 15;
    }
    const table = findTable(buildLayout(spans, 612, 792).tables, 'SG&A');

    expect(texts(table)).toContainEqual([
      'Gross profit',
      '23,597',
      '18,364',
      'Lower volumes and coal sales in the period',
    ]);
    expect(texts(table)?.at(-1)?.[0]).toBe('Impairments');
  });

  it('does not fold a caption set between two rows into the label above it', () => {
    const spans: TextSpan[] = [];
    const rows: [string, string, string][] = [
      ['Products', '69,958', '67,184'],
      ['Services', '24,972', '22,314'],
      ['Licences', '9,402', '8,817'],
      ['Total', '104,332', '98,315'],
    ];
    rows.forEach(([label, a, b], index) => {
      const y = index < 2 ? 100 + index * 40 : 140 + (index - 1) * 15;
      spans.push(span(label, 60, y, label.length * 4.5));
      spans.push(span(a, 229 - a.length * 4.5, y, a.length * 4.5));
      spans.push(span(b, 289 - b.length * 4.5, y, b.length * 4.5));
    });
    spans.push(span('Table 1 (continued)', 60, 112, 82));
    const table = findTable(buildLayout(spans, 612, 792).tables, '69,958');

    expect(table).toBeDefined();
    expect(
      texts(table)
        ?.flat()
        .some((text) => text.includes('Table 1')),
    ).toBe(false);
  });
});

describe('layout table value cells', () => {
  it('reads significance stars, triangle negatives, and note markers as values', () => {
    expect(isTableValueCell('0.412***')).toBe(true);
    expect(isTableValueCell('-0.054**')).toBe(true);
    expect(isTableValueCell('(0.031)†')).toBe(true);
    expect(isTableValueCell('△1,166')).toBe(true);
    expect(isTableValueCell('▲42')).toBe(true);
    expect(isTableValueCell('※7 26,269')).toBe(true);
  });

  it('reads a value carrying several lettered notes as a value (#258)', () => {
    expect(isTableValueCell('(9,350) (a)(b)')).toBe(true);
    expect(isTableValueCell('(9,350) (a) (b)')).toBe(true);
    expect(isTableValueCell('9,350 (a), (b)')).toBe(true);
    expect(isTableValueCell('(a)(b)')).toBe(false);
    expect(isTableValueCell('Total (a)(b)')).toBe(false);
  });

  it('keeps the label and first value of a row whose adjustment carries several notes (#258)', () => {
    const rows: string[][] = [
      ['Research and development', '88,140', '(14,220) (a)', '73,920', '259,600', '(41,050) (a)', '218,550'],
      ['Sales and marketing', '97,310', '(11,860) (a)', '85,450', '284,170', '(33,940) (a)', '250,230'],
      ['General and administrative', '41,780', '(9,350) (a)(b)', '32,430', '125,410', '(27,600) (a)(b)', '97,810'],
      ['Restructuring charges', '27,240', '(27,240) (b)', '—', '38,620', '(38,620) (b)', '—'],
      ['Total operating expenses', '254,470', '(62,670)', '191,800', '707,800', '(141,210)', '566,590'],
    ];
    // Right edges of the value columns; adjustments are left-aligned.
    const rights = [322, 0, 492, 582, 0, 752];
    const lefts = [0, 383, 0, 0, 643, 0];
    const spans = rows.flatMap(([label, ...values], index) => {
      const y = 140 + index * 15;
      return [
        span(label, 52, y, label.length * 4.2),
        ...values.map((value, column) => {
          const width = value.length * 4.2;
          return span(value, lefts[column] || rights[column] - width, y, width);
        }),
      ];
    });
    const table = buildLayout(spans, 792, 612).tables?.[0];
    expect(texts(table)).toContainEqual(rows[2]);
    expect(texts(table)).toContainEqual(rows[3]);
  });

  it('does not read a bare marker or starred words as a value', () => {
    expect(isTableValueCell('***')).toBe(false);
    expect(isTableValueCell('△')).toBe(false);
    expect(isTableValueCell('※7')).toBe(false);
    expect(isTableValueCell('Model***')).toBe(false);
  });

  it('reads a lone check or cross mark as a value, and a marked phrase as text', () => {
    expect(isTableValueCell('✓')).toBe(true);
    expect(isTableValueCell('✗')).toBe(true);
    expect(hasTableValueEvidence('✓')).toBe(true);
    expect(isTableValueCell('✓ Approved')).toBe(false);
    expect(isTableValueCell('✓✓')).toBe(false);
    expect(hasTableValueEvidence('—')).toBe(false);
  });
});
