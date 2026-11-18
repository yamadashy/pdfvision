import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../src/core/layout/index.js';
import { extractTitleGrids } from '../../src/core/layout/titleGrid.js';
import type { TextSpan } from '../../src/types/index.js';

const CHAR_WIDTH = 0.5;

function span(text: string, x: number, y: number, fontSize = 10): TextSpan {
  return { text, x, y, width: text.length * fontSize * CHAR_WIDTH, height: fontSize, fontSize };
}

function centred(text: string, cx: number, y: number, fontSize = 10): TextSpan {
  const width = text.length * fontSize * CHAR_WIDTH;
  return { text, x: cx - width / 2, y, width, height: fontSize, fontSize };
}

/** An author block: name (with an optional raised mark), affiliation, email, centred on `cx`. */
function author(name: string, affiliation: string, email: string, cx: number, y: number, mark = ''): TextSpan[] {
  const nameSpan = centred(name, cx - (mark.length * 3.5) / 2, y);
  const spans = [nameSpan];
  if (mark)
    spans.push({
      text: mark,
      x: nameSpan.x + nameSpan.width,
      y: y - 1,
      width: mark.length * 3.5,
      height: 7,
      fontSize: 7,
    });
  let line = y + 11;
  if (affiliation) {
    spans.push(centred(affiliation, cx, line, 9.5));
    line += 11;
  }
  spans.push(centred(email, cx, line, 8));
  return spans;
}

function texts(spans: TextSpan[]): string[] {
  return buildLayout(spans, 612, 792).blocks.map((block) => block.text);
}

describe('title grids', () => {
  const grid = [
    centred('Sparse Routing Is All You Need', 306, 80, 17),
    ...author('Mireille Ostrander', 'Halcyon Labs', 'mostrander@halcyon.ai', 142, 140, '*'),
    ...author('Tobiah Kwan', 'Halcyon Labs', 'tkwan@halcyon.ai', 251, 140, '*'),
    ...author('Ines Valcárcel', 'Halcyon Research', 'ivalcarcel@halcyon.ai', 360, 140, '*'),
    ...author('Dmitri Halvorsen', 'Halcyon Research', 'dhalvorsen@halcyon.ai', 469, 140, '*'),
    ...author('Priya Ramaswamy', 'Halcyon Research', 'pramaswamy@halcyon.ai', 160, 186, '*'),
    ...author('Oskar Lindqvist', 'University of Tarrow', 'oskar@cs.tarrow.edu', 306, 186, '*†'),
    ...author('Yusra Haddad', '', 'yusra.haddad@fastmail.org', 452, 186, '*‡'),
    centred('Abstract', 306, 250, 12),
  ];

  it('reads each author block whole, row by row and left to right, with its marks', () => {
    expect(texts(grid)).toEqual([
      'Sparse Routing Is All You Need',
      'Mireille Ostrander*\nHalcyon Labs\nmostrander@halcyon.ai',
      'Tobiah Kwan*\nHalcyon Labs\ntkwan@halcyon.ai',
      'Ines Valcárcel*\nHalcyon Research\nivalcarcel@halcyon.ai',
      'Dmitri Halvorsen*\nHalcyon Research\ndhalvorsen@halcyon.ai',
      'Priya Ramaswamy*\nHalcyon Research\npramaswamy@halcyon.ai',
      'Oskar Lindqvist*†\nUniversity of Tarrow\noskar@cs.tarrow.edu',
      'Yusra Haddad*‡\nyusra.haddad@fastmail.org',
      'Abstract',
    ]);
  });

  it('keeps emails that nearly touch in their own cells', () => {
    const tight = [
      ...author('Ashish Vaswani', 'Google Brain', 'avaswani@google.com', 166, 232),
      ...author('Noam Shazeer', 'Google Brain', 'noam@google.com', 270, 232),
      ...author('Niki Parmar', 'Google Research', 'nikip@google.com', 365, 232),
    ];
    const blocks = texts(tight);
    expect(blocks).toContain('Ashish Vaswani\nGoogle Brain\navaswani@google.com');
    expect(blocks).toContain('Noam Shazeer\nGoogle Brain\nnoam@google.com');
    expect(blocks.some((text) => text.includes('avaswani@google.com noam@google.com'))).toBe(false);
  });

  it('does not take two columns of justified prose for a grid', () => {
    const prose = [0, 1, 2, 3].flatMap((row) => [
      span('the quick brown fox jumps over the lazy dog', 72, 300 + row * 12),
      span('a second column of prose set beside the first', 320, 300 + row * 12),
    ]);
    expect(extractTitleGrids(prose).blocks).toEqual([]);
  });

  it('does not take the centred value columns of a table for a grid', () => {
    const table = [
      centred('Model A', 100, 300),
      centred('Model B', 100, 312),
      centred('0.61382', 260, 300),
      centred('N/A', 260, 312),
      centred('0.64206', 340, 300),
      centred('0.63964', 340, 312),
    ];
    expect(extractTitleGrids(table).blocks).toEqual([]);
  });

  it('does not take centred word columns beside a table label column for a grid', () => {
    const table = [
      span('Supports streaming', 72, 300),
      span('Supports batching', 72, 312),
      centred('Yes please', 300, 300),
      centred('No', 300, 312),
      centred('Partly so', 400, 300),
      centred('Yes', 400, 312),
    ];
    expect(extractTitleGrids(table).blocks).toEqual([]);
  });

  it('does not report the title block over a two-column page as the header of a table (#242)', () => {
    // JGLUE p.1-shaped: centred author lines and a full-width abstract above
    // a left text column whose first lines sit level with a table in the
    // right column.
    const w = (text: string, x: number, y: number, width: number, fontSize = 9): TextSpan => ({
      text,
      x,
      y,
      width,
      height: fontSize,
      fontSize,
    });
    const prose = 'running text of the left column that fills its measure';
    const spans = [
      w('A Benchmark for Evaluating Language Understanding', 101.5, 79.2, 394.6, 14.3),
      w('Kentaro Kurihara, Daisuke Kawahara, Tomohide Shibata', 143.7, 113.9, 310, 12),
      w('Waseda University, Yahoo Japan Corporation', 204, 127.9, 189.5, 10),
      w('{kkurihara, dkw}@waseda.jp, tomshiba@yahoo-corp.jp', 168.7, 139.8, 260, 10),
      w('Abstract', 280.2, 167.2, 37.1, 10),
      ...[180.2, 191.1, 202.1, 213, 224].map((y) => w(`${prose} of the whole page width`, 72, y, 453.6)),
      w('will facilitate research.', 72, 234.9, 145.8),
      w('Keywords: benchmark, text classification, sentence pair classification, QA', 72, 256.9, 353.1),
      w('1. Introduction', 138.2, 281.4, 85.9, 12),
      ...[299.4, 311.4, 323.3, 335.3, 347.3, 359.2].map((y) => w(prose, 72, y, 218.3, 10)),
      w('Task', 325.6, 282.5, 16.7),
      w('Dataset', 383, 282.5, 26.9),
      w('Train', 440.2, 282.5, 19.1),
      w('Dev', 476, 282.5, 14.7),
      w('Test', 506.2, 282.5, 14.8),
      w('Text', 309.5, 293.9, 15.7),
      w('MARC-ja', 360.7, 293.9, 35.9),
      w('187,528', 432.2, 293.9, 29.1),
      w('5,654', 473.3, 293.9, 20.2),
      w('5,639', 505.4, 293.9, 20.2),
      w('Classification JCoLA', 309.5, 304.8, 77.1),
      w('—', 452.3, 304.8, 9),
      w('—', 484.5, 304.8, 9),
      w('—', 516.6, 304.8, 9),
      w('Sentence Pair JSTS', 309.5, 316.2, 70.1),
      w('12,451', 436.6, 316.2, 24.7),
      w('1,457', 473.3, 316.2, 20.2),
      w('1,589', 505.4, 316.2, 20.2),
      w('Classification JNLI', 309.5, 327.1, 69.6),
      w('20,073', 436.6, 327.1, 24.7),
      w('2,434', 473.3, 327.1, 20.2),
      w('2,508', 505.4, 327.1, 20.2),
      w('QA', 309.5, 338.5, 12.9),
      w('JSQuAD', 360.7, 338.5, 32.4),
      w('63,870', 436.6, 338.5, 24.7),
      w('4,475', 473.3, 338.5, 20.2),
      w('4,470', 505.4, 338.5, 20.2),
      w('JCommonsenseQA', 360.7, 349.5, 69.2),
      w('9,012', 441.1, 349.5, 20.2),
      w('1,119', 473.3, 349.5, 20.2),
      w('1,118', 505.4, 349.5, 20.2),
    ];
    const tables = buildLayout(spans, 595, 842).tables ?? [];
    const texts = tables.flatMap((table) => table.rows.flatMap((row) => row.cells.map((cell) => cell.text)));
    expect(texts.some((text) => text.includes('Kurihara'))).toBe(false);
    expect(texts.some((text) => text.startsWith('Abstract'))).toBe(false);
  });

  it('does not take the titles over two side-by-side tables for a grid', () => {
    const spans = [
      centred('STANDARD Withholding Rate Schedules', 160, 100),
      centred('(Use these if the box is NOT checked.)', 160, 111),
      centred('Form W-4, Step 2, Checkbox Schedules', 440, 100),
      centred('(Use these if the box IS checked.)', 440, 111),
      ...[0, 1, 2, 3, 4].flatMap((row) => [
        span(`$${row * 100}`, 60, 140 + row * 11),
        span(`$${row * 100 + 99}`, 120, 140 + row * 11),
        span(`${row}%`, 200, 140 + row * 11),
        span(`$${row * 200}`, 360, 140 + row * 11),
        span(`$${row * 200 + 199}`, 420, 140 + row * 11),
        span(`${row * 2}%`, 500, 140 + row * 11),
      ]),
    ];
    expect(extractTitleGrids(spans).blocks).toEqual([]);
  });

  it('does not cut two centred-looking lines out of a running text column', () => {
    const spans = [
      span('records of the agency that the Interagency', 93, 338),
      centred('Working Group shall release in their entirety', 196, 350),
      centred('war criminal records described in subsection', 196, 361),
      span('(a). The exception for privacy applies here.', 100, 372),
      centred('SEC. 4. EXPEDITED PROCESSING OF FOIA RE-', 415, 352),
      centred('QUESTS FOR NAZI WAR CRIMINAL RECORDS.', 415, 363),
    ];
    expect(extractTitleGrids(spans).blocks).toEqual([]);
  });

  it('does not take one centred stack for a grid', () => {
    const single = author('Illia Polosukhin', 'Independent', 'illia@example.com', 306, 330);
    expect(extractTitleGrids(single).blocks).toEqual([]);
  });
});

describe('sparse single-row tables under prose', () => {
  it('keeps a table of two header rows and one data row set under a paragraph', () => {
    const w = (text: string, x: number, y: number, width: number): TextSpan => ({
      text,
      x,
      y,
      width,
      height: 10,
      fontSize: 10,
    });
    const spans = [
      w('we compare the norm against the top singular vectors of W or a random matrix.', 108, 322.6, 396),
      w('by replacing U, V with the top r singular vectors of W or a random matrix.', 108, 333.6, 360),
      w('r = 4', 279.1, 360.2, 23),
      w('r = 64', 391.1, 360.2, 28),
      w('∆W_q', 239.5, 371.1, 21.4),
      w('W_q', 277.9, 371.1, 13.1),
      w('Random', 307.9, 371.1, 33.8),
      w('∆W_q', 354, 371.1, 21.4),
      w('W_q', 392.4, 371.1, 13.1),
      w('Random', 422.5, 371.1, 33.8),
      w('||UW_qV||_F =', 155.8, 387.9, 55),
      w('0.32', 241.8, 387.9, 17.4),
      w('21.67', 273.6, 387.9, 22.4),
      w('0.02', 316.1, 387.9, 17.4),
      w('1.90', 356.4, 387.9, 17.4),
      w('37.71', 388.1, 387.9, 22.4),
      w('0.33', 430.6, 387.9, 17.4),
    ];
    const table = buildLayout(spans, 612, 792).tables?.find((candidate) =>
      candidate.rows.some((row) => row.cells.some((cell) => cell.text === '37.71')),
    );
    expect(table?.rows.map((row) => row.cells.map((cell) => cell.text))).toEqual([
      ['r = 4', 'r = 64'],
      ['∆W_q', 'W_q', 'Random', '∆W_q', 'W_q', 'Random'],
      ['||UW_qV||_F =', '0.32', '21.67', '0.02', '1.90', '37.71', '0.33'],
    ]);

    // With a second data row below, the table is not cut to its first row.
    const longer = [
      ...spans,
      w('||UW_vV||_F =', 155.8, 398.9, 55),
      ...[
        ['0.41', 241.8],
        ['20.12', 273.6],
        ['0.03', 316.1],
        ['2.10', 356.4],
        ['36.02', 388.1],
        ['0.31', 430.6],
      ].map(([text, x]) => w(text as string, x as number, 398.9, 18)),
    ];
    const cells = (buildLayout(longer, 612, 792).tables ?? []).flatMap((candidate) =>
      candidate.rows.flatMap((row) => row.cells.map((cell) => cell.text)),
    );
    expect(cells).toContain('37.71');
    expect(cells).toContain('36.02');
  });
});
