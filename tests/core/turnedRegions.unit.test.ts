import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../src/core/layout/index.js';
import { markSpanTurn, type QuarterTurn } from '../../src/core/layout/spanMetadata.js';
import { turnBox, unturnBox } from '../../src/core/layout/turnedRegions.js';
import { detectPageWarnings } from '../../src/core/warnings/index.js';
import type { PageResult, TextSpan } from '../../src/types/index.js';

const W = 612;
const H = 792;

function upright(text: string, x: number, y: number, size = 10, width = text.length * size * 0.5): TextSpan {
  return { text, x, y, width, height: size, fontSize: size };
}

/** A span laid out at (u, v) in the page turned upright for `turn`, placed back on the page and marked turned. */
function turned(turn: QuarterTurn, text: string, u: number, v: number, size = 10): TextSpan {
  const local = { x: u, y: v, width: text.length * size * 0.5, height: size };
  const span: TextSpan = { text, ...unturnBox(local, turn, W, H), fontSize: size };
  markSpanTurn(span, turn);
  return span;
}

const HEAD = ['Variety', 'Type', 'Ashby', 'Brenmoor', 'Carrow', 'Mean'];
const ROWS = [
  ['Aldora', 'winter', '9.42', '8.87', '9.10', '8.33'],
  ['Brisk', 'winter', '9.05', '9.21', '8.66', '8.45'],
  ['Calder', 'winter', '10.11', '9.48', '9.73', '8.86'],
  ['Dorran', 'spring', '7.88', '7.35', '7.61', '7.15'],
  ['Elvet', 'spring', '8.14', '7.70', '7.92', '7.44'],
];

function turnedTable(turn: QuarterTurn, top = 120): TextSpan[] {
  const spans = [turned(turn, 'Table 2: Yields by variety and site (t/ha), 2025 season.', 72, top - 30)];
  [HEAD, ...ROWS].forEach((row, r) => {
    row.forEach((cell, c) => {
      spans.push(turned(turn, cell, 72 + c * 90, top + r * 16));
    });
  });
  return spans;
}

describe('turnBox / unturnBox', () => {
  it('round-trips a box for every turn', () => {
    const box = { x: 100, y: 200, width: 40, height: 10 };
    for (const turn of [90, 180, 270] as const) {
      expect(unturnBox(turnBox(box, turn, W, H), turn, W, H)).toEqual(box);
    }
  });
});

describe('buildLayout — turned regions', () => {
  it('reads a sideways table in its own frame, with page-frame bboxes and rotation', () => {
    const spans = [upright('Chapter 4. Field trials', 72, 40), upright('57', 530, 40), ...turnedTable(90)];
    const layout = buildLayout(spans, W, H);
    expect(layout.blocks[0].text).toBe('Chapter 4. Field trials');
    const turnedBlocks = layout.blocks.filter((block) => block.rotation === 90);
    expect(turnedBlocks[0].text).toContain('Table 2: Yields');
    expect(layout.blocks.indexOf(turnedBlocks[0])).toBeGreaterThan(1);
    const [table] = layout.tables ?? [];
    expect(table.rotation).toBe(90);
    expect(table.rows.map((row) => row.cells.map((cell) => cell.text))).toEqual([HEAD, ...ROWS]);
    // Every cell box is the box its span has on the page.
    const calder = table.rows[3].cells[0];
    const source = spans.find((span) => span.text === 'Calder') as TextSpan;
    expect({ x: calder.x, y: calder.y, width: calder.width, height: calder.height }).toEqual({
      x: source.x,
      y: source.y,
      width: source.width,
      height: source.height,
    });
    // Turned text runs up the page: its blocks are taller than wide.
    expect(table.height).toBeGreaterThan(table.width);
  });

  it('reads text turned the other way (270°) and upside down (180°) as well', () => {
    for (const turn of [270, 180] as const) {
      const layout = buildLayout(turnedTable(turn), W, H);
      expect(layout.tables?.[0].rotation).toBe(turn);
      expect(layout.tables?.[0].rows[1].cells.map((cell) => cell.text)).toEqual(ROWS[0]);
      expect(layout.blocks.every((block) => block.rotation === turn)).toBe(true);
    }
  });

  it('reads a sideways text box between upright paragraphs in order, line by line', () => {
    const lines = [
      'Note: every regional office reports its figures each quarter to',
      'the central team, which checks them against the ledger before',
      'they are published in this summary of the year.',
    ];
    const spans = [
      upright('The first upright paragraph sits above the turned note on this page.', 72, 100),
      ...lines.map((line, i) => turned(270, line, 300, 300 + i * 12)),
      upright('The second upright paragraph sits below the turned note on this page.', 72, 700),
    ];
    const layout = buildLayout(spans, W, H);
    const texts = layout.blocks.map((block) => block.text);
    expect(texts[0]).toContain('first upright paragraph');
    const note = layout.blocks.find((block) => block.rotation === 270);
    expect(note?.text).toBe(lines.join('\n'));
  });

  it('leaves a turned axis title and a margin stamp alone', () => {
    const spans = [
      upright('Revenue grew in every region during the year under review.', 72, 100),
      // Turned 90°, `v` is the page x: the title beside a chart, the stamp in the left margin.
      turned(90, 'Revenue (USD millions, constant prices)', 300, 90),
      turned(90, 'arXiv:2401.01234v2 [cs.CL] 12 Jan 2024 — preprint, under review', 200, 20),
    ];
    const layout = buildLayout(spans, W, H);
    expect(layout.blocks.some((block) => block.rotation !== undefined)).toBe(false);
  });

  it('leaves a two-line turned stamp in the page margin alone', () => {
    const body = Array.from({ length: 10 }, (_, i) =>
      upright('An upright paragraph line with plenty of ordinary body text.', 72, 100 + i * 12),
    );
    const stamp = [
      turned(90, 'This publication is available free of charge from the institute', 200, 20, 8),
      turned(90, 'website at https://doi.org/10.6028/EXAMPLE.SP.800-00r5 (2024)', 200, 30, 8),
    ];
    const layout = buildLayout([...body, ...stamp], W, H);
    expect(layout.blocks.some((block) => block.rotation !== undefined)).toBe(false);
  });

  it('leaves turned tick labels of a chart grid alone', () => {
    const spans = [
      upright('Figure 6: Normalized subspace similarity between the column vectors of both layers.', 72, 600),
      // Four heatmaps, each with an axis of turned ticks 1…8 and a turned x axis 1 6 12 … 58.
      ...[0, 1, 2, 3].flatMap((panel) => [
        turned(90, `Layer ${panel * 32 + 1}`, 400 - panel * 120, 60, 8),
        ...Array.from({ length: 8 }, (_, i) => turned(90, String(i + 1), 420 - panel * 120 - i * 14, 75, 7)),
        ...['1', '6', '12', '18', '23', '29', '35', '40', '46', '52', '58'].map((tick, i) =>
          turned(90, tick, 200, 100 + panel * 30 + i * 0.1, 7),
        ),
      ]),
      // Row labels of an attention-mask grid: separate turned words, one row each.
      ...['Models', 'Language', 'Large', 'of', 'Survey', 'A'].map((word, i) => turned(90, word, 300 + i * 22, 420, 5)),
      turned(90, 'Encoder', 330, 400, 10),
      turned(90, 'Decoder', 400, 400, 10),
    ];
    const layout = buildLayout(spans, W, H);
    expect(layout.blocks.some((block) => block.rotation !== undefined)).toBe(false);
  });

  it('leaves turned header cells of an upright table alone', () => {
    const headers = ['Strongly agree overall', 'Agree on most of the points', 'Neutral or undecided overall'];
    const spans = [
      upright('Survey results', 72, 60, 14),
      // Each header is turned 90° and stands right above its narrow column of upright values.
      ...headers.map((h, i) => {
        const span = turned(90, h, H - 240, 200 + i * 20, 9);
        return span;
      }),
      ...['Service quality', 'Response time', 'Value for money'].flatMap((label, r) => [
        upright(label, 72, 250 + r * 16, 9),
        ...headers.map((_, i) => upright(String(10 + r * 3 + i), 200 + i * 20, 250 + r * 16, 9)),
      ]),
    ];
    const layout = buildLayout(spans, W, H);
    expect(layout.blocks.some((block) => block.rotation !== undefined)).toBe(false);
  });
});

describe('rotated_text_read_upright', () => {
  function page(spans: TextSpan[]): PageResult {
    return {
      page: 1,
      text: '',
      charCount: 0,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.1,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: W,
      height: H,
      layout: buildLayout(spans, W, H),
      quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
    } as unknown as PageResult;
  }
  const codes = (p: PageResult) => detectPageWarnings(p).map((warning) => warning.code);

  it('fires when most of the page is drawn turned', () => {
    const warnings = detectPageWarnings(page([upright('57', 530, 40), ...turnedTable(270)]));
    const warning = warnings.find((w) => w.code === 'rotated_text_read_upright');
    expect(warning?.message).toContain('rotation: 270');
    expect(warning?.message).toContain('running down the page');
  });

  it('stays quiet for a turned region that is a small part of the page', () => {
    const body = Array.from({ length: 30 }, (_, i) =>
      upright('An upright paragraph line with plenty of ordinary body text in it.', 72, 60 + i * 12),
    );
    expect(codes(page([...body, ...turnedTable(90, 500)]))).not.toContain('rotated_text_read_upright');
  });
});
