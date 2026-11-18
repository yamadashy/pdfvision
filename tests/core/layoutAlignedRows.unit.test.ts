import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../src/core/layout/index.js';
import { cellLines } from '../../src/core/layout/rows/index.js';
import type { LayoutBlock, TextSpan } from '../../src/types/index.js';

function span(text: string, x: number, y: number, fontSize = 10, width = [...text].length * fontSize * 0.5): TextSpan {
  return { text, x, y, width, height: fontSize, fontSize };
}

function lines(blocks: readonly LayoutBlock[]): string[] {
  return blocks.flatMap((block) => block.lines.map((line) => line.text));
}

describe('aligned rows — label and value read as one row (#301)', () => {
  it('reads a contents entry with its page number, leaders kept, part headings between them', () => {
    // Labels, then leaders, then page numbers, each written as its own pass.
    const entries = [
      { label: 'Preface', page: '1', y: 140 },
      { label: 'Part 1 Transport today', y: 170, part: true },
      { label: '1. Bus ridership', page: '3', y: 192 },
      { label: '2. Rail stations', page: '11', y: 214 },
      { label: '3. Driver shortage', page: '15', y: 236 },
      { label: 'Part 2 Measures', y: 266, part: true },
      { label: '1. Demand-responsive transit', page: '21', y: 288 },
    ];
    const spans: TextSpan[] = [
      ...entries.map((entry) => span(entry.label, 80, entry.y, entry.part ? 11.5 : 10.5)),
      ...entries
        .filter((entry) => entry.page)
        .map((entry) => span('. . . . . . . . . . . . . . . .', 260, entry.y, 10.5, 230)),
      ...entries.filter((entry) => entry.page).map((entry) => span(entry.page ?? '', 509, entry.y, 10.5, 6)),
    ];
    const read = lines(buildLayout(spans, 595, 842).blocks);
    expect(read).toEqual([
      'Preface . . . . . . . . . . . . . . . . 1',
      'Part 1 Transport today',
      '1. Bus ridership . . . . . . . . . . . . . . . . 3',
      '2. Rail stations . . . . . . . . . . . . . . . . 11',
      '3. Driver shortage . . . . . . . . . . . . . . . . 15',
      'Part 2 Measures',
      '1. Demand-responsive transit . . . . . . . . . . . . . . . . 21',
    ]);
  });

  it('pairs a leaderless list whose numbers are right-aligned far from the labels', () => {
    const labels = ['Fig 1-1 Ridership trend', 'Fig 1-2 Stop coverage', 'Table 1-3 Driver ages', 'Table 2-1 Services'];
    const pages = ['3', '8', '16', '21'];
    const spans = [
      ...labels.map((label, i) => span(label, 94, 630 + i * 20)),
      ...pages.map((page, i) => span(page, 515 - page.length * 5, 630 + i * 20)),
    ];
    expect(lines(buildLayout(spans, 595, 842).blocks)).toEqual([
      'Fig 1-1 Ridership trend 3',
      'Fig 1-2 Stop coverage 8',
      'Table 1-3 Driver ages 16',
      'Table 2-1 Services 21',
    ]);
  });

  it('pairs a code with its statement, and keeps the list heading above as its own block', () => {
    const spans = [
      span('Hazard statements', 54, 245, 9),
      span('H290', 64, 258, 9),
      span('H314', 64, 270, 9),
      span('H335', 64, 282, 9),
      span('May be corrosive to metals.', 160, 258, 9),
      span('Causes severe skin burns and eye damage.', 160, 270, 9),
      span('May cause respiratory irritation.', 160, 282, 9),
    ];
    const blocks = buildLayout(spans, 612, 792).blocks;
    expect(blocks.map((block) => block.text)).toEqual([
      'Hazard statements',
      'H290 May be corrosive to metals.\nH314 Causes severe skin burns and eye damage.\nH335 May cause respiratory irritation.',
    ]);
    // Checks that measure cells against geometry still see each cell.
    expect(cellLines(blocks).map((line) => line.text)).toContain('H314');
  });

  it('reads a table without rules row by row (#297)', () => {
    const spans: TextSpan[] = [];
    const rows = [
      ['Corvid-7B', 'Feb-2023', '7', '1.0T'],
      ['Corvid-65B', 'Feb-2023', '65', '1.4T'],
      ['Heron-13B', 'Apr-2023', '13', '1.2T'],
      ['Heron-70B', 'Jul-2023', '70', '2.0T'],
    ];
    rows.forEach((row, r) => {
      row.forEach((cell, c) => {
        spans.push(span(cell, 74 + c * 90, 128 + r * 11.2, 8));
      });
    });
    expect(lines(buildLayout(spans, 612, 792).blocks)).toEqual(rows.map((row) => row.join(' ')));
  });

  it('orders the cells of a right-to-left row from the right', () => {
    const rows = [
      ['שם', 'דנה כהן'],
      ['עיר', 'חיפה'],
      ['טלפון', '04-555-0101'],
    ];
    const spans = rows.flatMap(([label, value], r) => [span(label, 450, 100 + r * 14), span(value, 200, 100 + r * 14)]);
    const read = lines(buildLayout(spans, 612, 792).blocks);
    expect(read[0].startsWith('שם')).toBe(true);
  });
});

describe('aligned rows — text that only shares baselines stays as it was', () => {
  const without = (spans: TextSpan[], width = 612) => lines(buildLayout(spans, width, 792).blocks);

  it('does not join two columns of prose', () => {
    const left = [
      'The survey covered every depot in the region and',
      'recorded the chargers that were installed by the',
      'end of September, together with their utilisation',
      'over the month and the status of each programme.',
    ];
    const right = [
      'Depots that opened during the month report no',
      'utilisation, since they have fewer than four weeks',
      'of operation; their figures follow in the next',
      'quarterly report together with the full year.',
    ];
    const spans = [
      ...left.map((text, i) => span(text, 54, 100 + i * 12, 9, 240)),
      ...right.map((text, i) => span(text, 318, 100 + i * 12, 9, 240)),
    ];
    expect(without(spans)).toEqual(expect.arrayContaining([...left, ...right]));
  });

  it('does not join two lists set side by side', () => {
    const left = ['• Low offset voltage', '• Rail-to-rail output', '• Supply range 2.7 V'];
    const right = ['• Audio preamplifiers', '• Active filters', '• Battery instruments'];
    const spans = [
      ...left.map((text, i) => span(text, 44, 300 + i * 12, 9)),
      ...right.map((text, i) => span(text, 326, 300 + i * 12, 9)),
    ];
    expect(without(spans)).toEqual(expect.arrayContaining([...left, ...right]));
  });

  it('does not join names set in columns', () => {
    const left = ['Mireille Ostrander', 'Halcyon Labs', 'Priya Ramaswamy'];
    const right = ['Tobiah Kwanberg', 'Halcyon Research', 'Oskar Lindqvist'];
    const spans = [
      ...left.map((text, i) => span(text, 100, 150 + i * 12, 10)),
      ...right.map((text, i) => span(text, 330, 150 + i * 12, 10)),
    ];
    expect(without(spans)).toEqual(expect.arrayContaining([...left, ...right]));
  });

  it('does not join a passage that runs on beside another (a court caption)', () => {
    const left = ['MARLOWE BAKERY COOPERATIVE, a', 'Calisota cooperative corporation,', 'Plaintiff,', 'v.'];
    const right = [
      ') NOTICE OF MOTION AND',
      ') MOTION TO COMPEL FURTHER',
      ') PRODUCTION OF DOCUMENTS',
      ') AND SANCTIONS',
    ];
    const spans = [
      ...left.map((text, i) => span(text, 90, 300 + i * 24, 10)),
      ...right.map((text, i) => span(text, 316, 300 + i * 24, 10)),
    ];
    expect(without(spans)).toEqual(expect.arrayContaining([...left, ...right]));
  });

  it('leaves margin line numbers out of the rows', () => {
    const text = [
      'PLEASE TAKE NOTICE that on January 14, 2027 at',
      'the court will hear the motion of the Plaintiff',
      'for an order compelling the Defendant to produce',
      'all documents responsive to the first request',
      'and for monetary sanctions against the Defendant',
    ];
    const spans = text.flatMap((line, i) => [
      span(String(15 + i), 48, 100 + i * 24, 10, 10),
      span(line, 90, 100 + i * 24, 10, 230),
    ]);
    expect(without(spans)).toEqual(expect.arrayContaining(text));
  });

  it('does not join index columns, whose entries each end in their page numbers', () => {
    const left = ['Qualified tips 101, 102', 'Cash tips 102', 'Employee 103', 'Non-employee 103'];
    const right = ['Tax help 83', 'Tax table 68-79', 'Tax Topics 118', 'Tip income 112'];
    const spans = [
      ...left.map((text, i) => span(text, 42, 100 + i * 10, 7.5)),
      ...right.map((text, i) => span(text, 406, 100 + i * 10, 7.5)),
    ];
    expect(without(spans)).toEqual(expect.arrayContaining([...left, ...right]));
  });

  it('does not join the text of two boxes set side by side', () => {
    const left = ['Briefings', 'general knowledge', 'explained once'];
    const right = ['Consultations', 'questions answered', 'as they come'];
    const spans = [
      ...left.map((text, i) => span(text, 60, 100 + i * 12, 9)),
      ...right.map((text, i) => span(text, 260, 100 + i * 12, 9)),
    ];
    const boxes = [
      { x: 50, y: 90, width: 150, height: 50 },
      { x: 250, y: 90, width: 150, height: 50 },
    ];
    const read = lines(buildLayout(spans, 612, 792, { vectorBoxes: boxes }).blocks);
    expect(read).toEqual(expect.arrayContaining([...left, ...right]));
  });

  it('keeps a paragraph beside a table out of the table rows', () => {
    const table = [
      ['Z+jets', '0.3', '0.5'],
      ['ttbar', '0.02', '0.04'],
      ['WZ', '0.2', '0.4'],
      ['ZZ', '0.01', '0.03'],
    ];
    const spans = table.flatMap((row, r) => row.map((cell, c) => span(cell, 340 + c * 45, 300 + r * 11, 9)));
    // A line of the prose column beside it sits level with the last row, a
    // gutter away: further than the table's own columns are apart.
    spans.push(span('simulation. The MC description of the selection efficiency', 65, 333, 9, 221));
    const read = lines(buildLayout(spans, 612, 792).blocks);
    expect(read).toContain('ZZ 0.01 0.03');
    expect(read).toContain('simulation. The MC description of the selection efficiency');
  });

  it('does not join narrow prose columns whose lines break off mid-sentence', () => {
    const left = ['Line 2a', 'Enter amounts received as alimony or', 'vorce or separation agreement entered'];
    const right = ['4684, line 31, on line 4 and check the', 'Lines 8a Through 8z', 'Other Income'];
    const spans = [
      ...left.map((text, i) => span(text, 42, 100 + i * 10, 8.5)),
      ...right.map((text, i) => span(text, 222, 100 + i * 10, 8.5)),
    ];
    expect(without(spans)).toEqual(expect.arrayContaining([...left, ...right]));
  });

  it('does not join a directory of people set in two columns, name over title', () => {
    const left = ['Dana Deasy', 'Chief Information Officer', 'John Sherman', 'Principal Deputy CIO'];
    const right = ['Matthew A. Kozma', 'Chief Information Officer', 'Michael E. Waschull', 'Deputy Chief Information'];
    const spans = [
      ...left.map((text, i) => span(text, 90, 225 + i * 14, 9)),
      ...right.map((text, i) => span(text, 342, 225 + i * 14, 9)),
    ];
    expect(without(spans)).toEqual(expect.arrayContaining([...left, ...right]));
  });

  it('does not join the two halves of a glyph chart', () => {
    const left = [
      ['✫', 'a38 [x272B]'],
      ['✬', 'a39 [x272C]'],
      ['✭', 'a40 [x272D]'],
    ];
    const right = [
      ['❞', 'a100 [x275E]'],
      ['❡', 'a101 [x2761]'],
      ['❢', 'a102 [x2762]'],
    ];
    const spans = [
      ...left.flatMap(([glyph, code], i) => [span(glyph, 247, 100 + i * 14, 10, 10), span(code, 270, 100 + i * 14, 9)]),
      ...right.flatMap(([glyph, code], i) => [
        span(glyph, 384, 100 + i * 14, 10, 10),
        span(code, 410, 100 + i * 14, 9),
      ]),
    ];
    const read = without(spans);
    expect(read.some((line) => line.includes('a38') && line.includes('a100'))).toBe(false);
  });

  it('does not join a numbered topic list set in columns, numbers apart from titles', () => {
    const spans = [
      span('and other grants', 221, 100, 8),
      span('423 Social Security and equivalent', 221, 110, 8),
      span('railroad retirement benefits', 221, 120, 8),
      span('424 401(k) plans', 221, 130, 8),
      span('602', 401, 100, 8),
      span('608', 401, 110, 8),
      span('610', 401, 130, 8),
      span('Child and Dependent Care Credit', 426, 100, 8),
      span('Excess Social Security and RRTA', 426, 110, 8),
      span('tax withheld', 426, 120, 8),
      span('Retirement Savings Contributions', 426, 130, 8),
    ];
    const read = without(spans);
    expect(read.some((line) => line.includes('424 401(k) plans') && line.includes('610'))).toBe(false);
  });

  it('does not join a side head set larger than the text beside it', () => {
    const left = ['Part 2', 'Filers Who', 'Answered'];
    const right = [
      '● No qualifying children who have valid SSNs',
      '● 1 or more qualifying children',
      'Yes. Leave line 5 blank.',
    ];
    const spans = [
      ...left.map((text, i) => span(text, 61, 356 + i * 14, 11.5)),
      ...right.map((text, i) => span(text, 168, 356 + i * 14, 9)),
    ];
    expect(without(spans)).toEqual(expect.arrayContaining([...left, ...right]));
  });

  it('needs three rows', () => {
    const spans = [span('Name', 54, 100), span('Dana Cohen', 170, 100), span('City', 54, 114), span('Haifa', 170, 114)];
    expect(without(spans)).toEqual(expect.arrayContaining(['Name', 'Dana Cohen', 'City', 'Haifa']));
  });

  it('does not read across a painted column rule', () => {
    const spans = ['base', 'big', 'huge'].flatMap((label, r) => [
      span(label, 90, 193 + r * 12, 9),
      span(String(r + 1), 275, 193 + r * 12, 9),
    ]);
    const rule = { x: 250, y: 185, width: 0, height: 50 };
    const read = lines(buildLayout(spans, 612, 792, { vectorBoxes: [rule] }).blocks);
    expect(read).not.toContain('base 1');
    expect(lines(buildLayout(spans, 612, 792).blocks)).toContain('base 1');
  });

  it('does not join cells whose columns do not line up on either side', () => {
    // Labels and values at scattered x, as chart labels across a poster.
    const spans = [
      span('Drone', 1031, 900, 28),
      span('Visual check', 1178, 900, 28),
      span('100', 939, 960, 28),
      span('0.80', 2106, 960, 28),
      span('91', 1052, 1020, 28),
      span('0.78', 2245, 1020, 28),
    ];
    expect(without(spans, 3370)).toEqual(expect.arrayContaining(['100', '0.80', '91', '0.78']));
  });
});

describe('aligned rows — depth of the labels', () => {
  it('keeps the depth of a statement label read as a row with its values', () => {
    const rows: [string, number, string, string][] = [
      ['Net sales:', 0, '', ''],
      ['Products', 1, '69,958', '67,184'],
      ['Services', 1, '24,972', '22,314'],
      ['Total net sales', 2, '94,930', '89,498'],
      ['Cost of sales:', 0, '', ''],
      ['Products', 1, '44,566', '42,586'],
      ['Services', 1, '6,485', '6,485'],
      ['Total cost of sales', 2, '51,051', '49,071'],
    ];
    const spans = rows.flatMap(([label, depth, a, b], r) => [
      span(label, 72 + depth * 12, 100 + r * 12, 9),
      ...(a ? [span(a, 400 - a.length * 4.5, 100 + r * 12, 9), span(b, 480 - b.length * 4.5, 100 + r * 12, 9)] : []),
    ]);
    const read = lines(buildLayout(spans, 612, 792).blocks);
    expect(read).toContain('  Products 69,958 67,184');
    expect(read).toContain('    Total net sales 94,930 89,498');
  });

  it('gives no depth to a detail line set under another column of the rows', () => {
    const spans: TextSpan[] = [];
    ['Oct 01', 'Oct 03', 'Oct 04', 'Oct 07'].forEach((date, r) => {
      const y = 100 + r * 26;
      spans.push(span(date, 54, y, 8.5, 25), span(`Card purchase ${r}`, 104, y, 8.5), span('12.40', 380, y, 8.5, 21));
      spans.push(span(`Card ending 77${r}`, 112, y + 10.3, 7.5));
    });
    const read = lines(buildLayout(spans, 612, 792).blocks);
    expect(read).toContain('Card ending 770');
  });
});
