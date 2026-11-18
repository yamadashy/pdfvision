import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../src/core/layout/index.js';
import { formatMarkdown } from '../../src/output/markdown.js';
import type { DocumentResult, TextSpan, VectorBox } from '../../src/types/index.js';

/** One upright glyph of a vertical column, set glyph by glyph the way DTP software draws tategaki. */
function glyph(char: string, x: number, y: number, size = 10): TextSpan {
  return { text: char, x, y, width: size, height: size, fontSize: size };
}

/** A vertical column of `text` with its glyph boxes at `x`, from `top` down. */
function column(text: string, x: number, top: number): TextSpan[] {
  return Array.from(text, (char, i) => glyph(char, x, top + i * 10));
}

const rule = (x: number, y: number, height: number): VectorBox => ({ x, y, width: 0.6, height });

function marked(spans: TextSpan[], boxes: VectorBox[]) {
  return buildLayout(spans, 842, 595, { vectorBoxes: boxes, imageBoxes: [] }).markedText ?? [];
}

// Columns 18pt apart, right to left, a 22-box measure from y=60.
const columns = [
  column('第一条この省令において次の各号に掲げる用語', 700, 60),
  column('の意義はそれぞれ当該各号に定めるところによ', 682, 60),
  column('る二移動図書館自動車その他の移動手段を用い', 664, 60),
  column('て図書館資料の閲覧及び貸出しを行う事業をい', 646, 60),
  column('う。', 628, 60),
].flat();

describe('side lines beside vertical text (#265)', () => {
  it('reports the passage a side line marks, from the glyphs it runs beside', () => {
    // 自動車その他の移動手段: boxes 7..17 of the third column; the line hugs the glyphs' right edge.
    const result = marked(columns, [rule(675.5, 130, 110)]);
    expect(result).toEqual([
      expect.objectContaining({ mark: 'side_line', text: '自動車その他の移動手段', x: 664, y: 130 }),
    ]);
  });

  it('carries a passage on into the next column when it runs to the foot of a full column', () => {
    const result = marked(columns, [rule(675.5, 200, 70), rule(657.5, 60, 30)]);
    expect(result.map((item) => item.text)).toEqual(['移動手段を用いて図書']);
  });

  it('ignores a rule centred between two columns, as a vertical table draws its cell borders', () => {
    expect(marked(columns, [rule(677, 60, 220)])).toEqual([]);
  });

  it('ignores a frame line that runs past the columns of its tier', () => {
    expect(marked(columns, [rule(711.5, 20, 500)])).toEqual([]);
  });

  it('ignores a rule beside one glyph, or beside table labels stacked a row apart', () => {
    expect(marked(columns, [rule(675.5, 130, 10)])).toEqual([]);
    // One label per table row, read as a vertical column: glyphs 20pt apart at 10pt.
    const labels = Array.from('額額額計額', (char, i) => glyph(char, 400, 60 + i * 30));
    expect(marked([...columns, ...labels], [rule(411.5, 55, 150)])).toEqual([]);
  });

  it('lists the marked passages in Markdown', () => {
    const layout = buildLayout(columns, 842, 595, { vectorBoxes: [rule(675.5, 130, 110)], imageBoxes: [] });
    const doc: DocumentResult = {
      file: '/tmp/x.pdf',
      totalPages: 1,
      metadata: { title: null, author: null, subject: null, creator: null },
      pages: [
        {
          page: 1,
          text: '',
          charCount: 0,
          imageCount: 0,
          vectorCount: 0,
          textCoverage: 0,
          nonPrintableRatio: 0,
          nonPrintableCount: 0,
          quality: { nativeTextStatus: 'empty' },
          width: 842,
          height: 595,
          layout,
        },
      ],
    };
    const md = formatMarkdown(doc, { layout: true });
    expect(md).toContain('### Marked text');
    expect(md).toContain('| side line | 自動車その他の移動手段 |');
  });
});

describe('bar chart labels read bar by bar (#265)', () => {
  it('reads a chart framed on its own by stacks, with the title across them first', () => {
    // ponchi-dashboard's column chart: a panel box, the title over all five bars, values over bars, years under them.
    const spans: TextSpan[] = [
      { text: 'Shortage (estimate)', x: 56, y: 317, width: 126, height: 9, fontSize: 9 },
      ...[
        ['8.2', 68, 435],
        ['9.5', 100, 422],
        ['11.3', 130, 404],
        ['12.8', 162, 389],
        ['14.6', 194, 371],
      ].map(([text, x, y]) => ({ text: String(text), x: Number(x), y: Number(y), width: 16, height: 8, fontSize: 8 })),
      ...['2022', '2023', '2024', '2025', '2026'].map((text, i) => ({
        text,
        x: 66 + i * 32,
        y: 534,
        width: 17,
        height: 7.5,
        fontSize: 7.5,
      })),
      {
        text: 'A paragraph of body text under the chart panel that runs on.',
        x: 40,
        y: 580,
        width: 500,
        height: 9,
        fontSize: 9,
      },
    ];
    const bars: VectorBox[] = [
      { x: 40, y: 308, width: 190, height: 250 },
      { x: 65, y: 446, width: 18, height: 82 },
      { x: 97, y: 433, width: 18, height: 95 },
      { x: 129, y: 415, width: 18, height: 113 },
      { x: 161, y: 400, width: 18, height: 128 },
      { x: 193, y: 382, width: 18, height: 146 },
    ];
    const order = buildLayout(spans, 842, 595, { vectorBoxes: bars, imageBoxes: [] }).blocks.map((b) => b.text);
    const start = order.indexOf('Shortage (estimate)');
    expect(order.slice(start, start + 11)).toEqual([
      'Shortage (estimate)',
      '8.2',
      '2022',
      '9.5',
      '2023',
      '11.3',
      '2024',
      '12.8',
      '2025',
      '14.6',
      '2026',
    ]);
  });
});
