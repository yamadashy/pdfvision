import { describe, expect, it } from 'vitest';
import { detectColumnGutters, gapCrossesColumnGutter } from '../../src/core/layout/columnGutters.js';
import { buildLayout } from '../../src/core/layout/index.js';
import type { TextSpan } from '../../src/types/index.js';

function span(text: string, x: number, y: number, fontSize: number, width: number, height = fontSize): TextSpan {
  return { text, x, y, width, height, fontSize };
}

const SIZE = 8.5;
const LEADING = 9.6;
const COLS = [42, 222, 402];
const COL_W = 168;

/** Justified column lines: one span per line, each column on its own
 *  baseline grid (offsets differ), as in a dense government register. */
function registerColumns(rows: number, offsets = [0, 3, 5]): TextSpan[] {
  const spans: TextSpan[] = [];
  for (let c = 0; c < COLS.length; c++) {
    for (let r = 0; r < rows; r++) {
      spans.push(
        span(
          `column ${c + 1} justified line ${r + 1} of the body`,
          COLS[c],
          70 + offsets[c] + r * LEADING,
          SIZE,
          COL_W,
        ),
      );
    }
  }
  return spans;
}

function lineTexts(spans: TextSpan[], pageWidth = 612): string[] {
  return buildLayout(spans, pageWidth, 792).blocks.flatMap((block) => block.lines.map((line) => line.text));
}

describe('detectColumnGutters', () => {
  it('finds narrow gutters between columns on independent baselines', () => {
    const gutters = detectColumnGutters(registerColumns(12));
    expect(gutters.map((g) => [g.left, g.right])).toEqual([
      [210, 222],
      [390, 402],
    ]);
  });

  it('finds nothing in single-column justified prose, even with an aligned word river', () => {
    // A word starts at x=200 after a wide space on every other line, but
    // the lines in between run straight through that x.
    const spans: TextSpan[] = [];
    for (let r = 0; r < 12; r++) {
      const y = 70 + r * 12;
      if (r % 2 === 0) {
        spans.push(span('justified prose before a wide word space', 50, y, 10, 140));
        spans.push(span('and the rest of the same line of prose', 200, y, 10, 300));
      } else {
        spans.push(span('an ordinary line that runs straight through the river position', 50, y, 10, 450));
      }
    }
    expect(detectColumnGutters(spans)).toEqual([]);
  });

  it('ignores hanging list markers, whose text on one side is short', () => {
    const spans: TextSpan[] = [];
    for (let item = 0; item < 6; item++) {
      const y = 70 + item * 30;
      spans.push(span(`${item + 1}.`, 72, y, 10, 8));
      spans.push(span('First line of a list item that wraps onto a', 90, y, 10, 300));
      spans.push(span('continuation line at the same hanging indent', 90, y + 12, 10, 300));
    }
    expect(detectColumnGutters(spans)).toEqual([]);
    expect(lineTexts(spans)).toContain('1. First line of a list item that wraps onto a');
  });

  it('ignores narrow numeric table cells', () => {
    const spans: TextSpan[] = [];
    for (let r = 0; r < 8; r++) {
      const y = 70 + r * 12;
      spans.push(span(`Row label number ${r + 1} for the item`, 50, y, 10, 160));
      spans.push(span(`${(r + 1) * 12}.5`, 220, y, 10, 20));
      spans.push(span(`${(r + 1) * 7}.0`, 250, y, 10, 20));
    }
    expect(detectColumnGutters(spans)).toEqual([]);
  });

  it('ignores table columns whose rows are mostly short cells', () => {
    // A directors table: name and birth date on the first row of each
    // person, then one career date and description per row. Only the first
    // rows have wide text left of the description column.
    const spans: TextSpan[] = [];
    for (let person = 0; person < 4; person++) {
      for (let r = 0; r < 5; r++) {
        const y = 70 + (person * 5 + r) * 12;
        if (r === 0) {
          spans.push(span('横 見 真 一', 50, y, 9, 60));
          spans.push(span('1965年7月18日生', 120, y, 9, 70));
        }
        spans.push(span('2018年10月', 200, y, 9, 45));
        spans.push(span('同 経営企画部経営企画グループ長兼サステナ', 257, y, 9, 190));
      }
    }
    expect(detectColumnGutters(spans).some((gutter) => gutter.right === 257)).toBe(false);
  });

  it('keeps hanging bullets of the right column with their text', () => {
    // Census report shape: the right column is a bulleted list whose
    // bullets hang 12pt left of the text. The text edge recurs with the left
    // column as neighbour, but the strip in front of it holds the bullets.
    const spans: TextSpan[] = [];
    for (let r = 0; r < 24; r++) {
      const y = 100 + r * 11;
      spans.push(span(`left column line ${r} of the report body prose`, 42, y, 9, 168));
      if (r % 4 === 0) spans.push(span('•', 227.33, y + 1, 9, 4.3));
      spans.push(span(`right column bulleted line ${r} of the list`, 239.33, y + 1, 9, 141.8));
    }
    expect(detectColumnGutters(spans).some((gutter) => gutter.right === 239.33)).toBe(false);
    expect(lineTexts(spans)).toContain('• right column bulleted line 0 of the list');
  });

  it('does not treat the strips between figure columns of a tax table as prose gutters', () => {
    // IRS tax table: blocks of "at least / less than / tax" figures set as
    // wide runs of numbers separated by clear strips.
    const spans: TextSpan[] = [];
    for (let r = 0; r < 20; r++) {
      const y = 100 + r * 9;
      for (const blockX of [42, 220, 398]) {
        ['75,000', '75,050', '11,420', '8,526', '11,420', '9,681'].forEach((value, i) => {
          spans.push(span(value, blockX + i * 28, y, 7, 22));
        });
      }
    }
    expect(detectColumnGutters(spans)).toEqual([]);
  });

  it('ends a gutter at a line that runs across it', () => {
    const spans = [
      ...registerColumns(6).filter((s) => s.x < 300),
      span('A spanning line that crosses the gutter between the first two columns', 42, 140, SIZE, 348),
      ...registerColumns(6)
        .filter((s) => s.x < 300)
        .map((s) => ({ ...s, y: s.y + 90 })),
    ];
    const gutters = detectColumnGutters(spans);
    expect(gutters).toHaveLength(2);
    for (const gutter of gutters) {
      expect(gutter.bottom < 140 || gutter.top > 140 + SIZE).toBe(true);
    }
  });

  it('ignores rotated spans', () => {
    const rotated = Array.from({ length: 8 }, (_, i) => span('rotated margin text', 15 + i * 20, 100, 6.5, 6.5, 130));
    expect(detectColumnGutters(rotated)).toEqual([]);
  });

  it('reports a gap as crossing only at the gutter height', () => {
    const gutters = [{ left: 210, right: 222, top: 100, bottom: 200 }];
    const left = { x: 42, y: 150, width: 168, height: 8.5 };
    expect(gapCrossesColumnGutter(gutters, left, { x: 222, y: 150, width: 100, height: 8.5 })).toBe(true);
    expect(gapCrossesColumnGutter(gutters, { ...left, y: 300 }, { x: 222, y: 300, width: 100, height: 8.5 })).toBe(
      false,
    );
    expect(gapCrossesColumnGutter(gutters, { ...left, width: 175 }, { x: 222, y: 150, width: 100, height: 8.5 })).toBe(
      false,
    );
  });
});

describe('buildLayout — lines across narrow column gutters', () => {
  it('does not fuse the first word of a neighbouring column offset by half a line', () => {
    // Column 3's next line starts 5pt (0.6 line) below column 2's line and
    // only 12pt to its right: close enough for the partial-overlap rule.
    const spans = registerColumns(10);
    spans.push(span('transferred, sublet or used for a vessel other than', 222, 278.91, SIZE, 168));
    spans.push(span('level', 402, 283.91, SIZE, 16.18));
    spans.push(span('is 80 micrograms per 100 grams.', 426.61, 283.91, SIZE, 143.39));
    const texts = lineTexts(spans);
    expect(texts).toContain('transferred, sublet or used for a vessel other than');
    expect(texts).toContain('level is 80 micrograms per 100 grams.');
  });

  it('splits a full column line from a short line in the next column on a shared baseline', () => {
    const spans = registerColumns(10, [0, 2, 4]);
    spans.push(span('municipal harbor committees and one marine', 42, 578.51, SIZE, 168));
    spans.push(span('the end of the list.', 222, 576.51, SIZE, 61.15));
    const texts = lineTexts(spans);
    expect(texts).toContain('municipal harbor committees and one marine');
    expect(texts).toContain('the end of the list.');
  });

  it('keeps a bullet with its item when the bullet was grouped with the next column first', () => {
    // IRS publication shape: the larger bullet sits between the right
    // column's line above and its own item text below.
    const spans: TextSpan[] = [];
    for (let r = 0; r < 30; r++) {
      const y = 100 + r * 11.5;
      if (y > 318 && y < 345) continue;
      spans.push(span(`left column line ${r} of plain body prose text`, 42, y, 10, 255));
      spans.push(span(`right column line ${r} of plain body prose text`, 315, y + 3, 10, 255));
    }
    spans.push(span('right column line above the bullet', 315, 326.16, 10, 255));
    spans.push(span('•', 48, 329.64, 12, 4.69));
    spans.push(span('Primarily responsible for the overall substantive accu-', 59, 331.16, 10, 232.78));
    const texts = lineTexts(spans);
    expect(texts).toContain('• Primarily responsible for the overall substantive accu-');
  });

  it('does not join two lines beside a tall caution icon in the right column', () => {
    // IRS Form 941 instructions: a ▲! icon spans two lines of the right
    // column, level with a left-column heading.
    const spans: TextSpan[] = [];
    for (let r = 0; r < 30; r++) {
      const y = 120 + r * 11;
      spans.push(span(`left column line ${r} of plain body prose text`, 36, y, 10, 259));
      spans.push(span(`right column line ${r} of plain body prose text`, 317, y + 2, 10, 254));
    }
    spans.push(span('▲', 317.56, 83.26, 25.2, 22.48, 21.6));
    spans.push(span('Purpose of Form', 36, 84.57, 12, 95.77));
    spans.push(span('Use Form 941-V if you’re paying your balance due', 344.8, 85.14, 10, 223));
    spans.push(span('!', 326.48, 88.2, 14.5, 4.64, 14.5));
    spans.push(span('on Form 941 by check or money order. However, if', 344.8, 95.89, 10, 226.49));
    spans.push(span('Complete Form 941-V if you’re paying your balance due', 36, 102.14, 10, 250.25));
    spans.push(span('CAUTION', 318.01, 106.22, 4.5, 21.58));
    spans.push(span('you pay an amount with Form 941 that should’ve', 344.8, 106.64, 10, 217.11));
    const texts = lineTexts(spans);
    expect(texts.some((text) => text.includes('balance due') && text.includes('on Form 941 by check'))).toBe(false);
  });

  it('keeps a bullet smaller than a heading beside it with its item text', () => {
    // Slide: a 54pt heading on the left shares a row with a 25pt bullet;
    // the bullet's 20pt item line starts 5pt lower.
    const texts = lineTexts(
      [
        span('ライフスタイル‧人材', 198.28, 174.48, 54, 552.36),
        span('•', 1006.77, 184.04, 25, 8.75),
        span('デジタル技術の専門知識をもつ人材を育成します。', 1033.77, 189.04, 20, 493),
      ],
      1920,
    );
    expect(texts).toContain('• デジタル技術の専門知識をもつ人材を育成します。');
  });

  it('splits per-word justified columns whose word spaces are nearly as wide as the gutter', () => {
    // Seven words per 168pt line leave ~10pt word spaces against a
    // 12pt gutter; word positions differ from row to row as in real text,
    // and the second column sits 3pt lower on its own baseline grid.
    const spans: TextSpan[] = [];
    for (let r = 0; r < 8; r++) {
      const y = 70 + r * LEADING;
      for (const [c, colX] of COLS.slice(0, 2).entries()) {
        const widths = Array.from({ length: 7 }, (_, i) => 12 + ((r * 5 + i * 3 + c * 2) % 7));
        const space = (COL_W - widths.reduce((sum, w) => sum + w, 0)) / 6;
        let x = colX;
        widths.forEach((w, i) => {
          spans.push(span(`w${c + 1}.${i + 1}`, x, y + c * 3, SIZE, w));
          x += w + space;
        });
      }
    }
    const texts = lineTexts(spans);
    expect(texts).toHaveLength(16);
    expect(texts.every((text) => text.split(' ').length === 7)).toBe(true);
  });

  it('splits CJK columns that have no word spaces', () => {
    const spans: TextSpan[] = [];
    for (let r = 0; r < 8; r++) {
      spans.push(span('日本語の本文が左の段に組まれている行です', 40, 70 + r * 14, 10, 200));
      spans.push(span('右の段の本文も同じ行送りで続いていく行', 252, 72 + r * 14, 10, 200));
    }
    const texts = lineTexts(spans);
    expect(texts).toContain('日本語の本文が左の段に組まれている行です');
    expect(texts).toContain('右の段の本文も同じ行送りで続いていく行');
    expect(texts.some((text) => text.includes('行です') && text.includes('右の段'))).toBe(false);
  });

  it('keeps single-column justified prose with wide word spaces on one line', () => {
    const spans: TextSpan[] = [];
    for (let r = 0; r < 10; r++) {
      const y = 70 + r * 12;
      const shift = (r * 37) % 120;
      spans.push(span('justified words before a wide space', 50, y, 10, 150 + shift));
      spans.push(span('and after it', 212 + shift, y, 10, 288 - shift));
    }
    const texts = lineTexts(spans);
    expect(texts.filter((text) => text.includes('before a wide space and after it'))).toHaveLength(10);
  });
});

describe('buildLayout — tables beside prose columns', () => {
  it('splits a numeric table inside one column as finely as without the gutter', () => {
    // A small figure table in the left column of a two-column page. Its
    // cells are 10pt apart; the dense-numeric split reads the page-wide row,
    // which the right column's prose makes wide enough.
    const spans: TextSpan[] = [];
    for (let r = 0; r < 16; r++) {
      const y = 100 + r * 11;
      if (r < 10) {
        spans.push(span(`left column prose line ${r} before the small table`, 42, y, 8, 250));
      } else {
        spans.push(span('1,913', 42, y, 8, 20));
        spans.push(span('2,250', 72, y, 8, 20));
        spans.push(span('2,531', 102, y, 8, 20));
      }
      spans.push(span(`right column prose line ${r} beside the table rows`, 312, y + 2, 8, 250));
    }
    expect(detectColumnGutters(spans).length).toBeGreaterThan(0);
    const texts = lineTexts(spans);
    expect(texts).not.toContain('1,913 2,250 2,531');
    expect(texts).toContain('1,913');
  });

  it('drops a layout table whose columns are exactly the prose columns', () => {
    const spans: TextSpan[] = [];
    for (let r = 0; r < 14; r++) {
      const y = 100 + r * 10.5;
      COLS.forEach((x, c) => {
        spans.push(span(`column ${c + 1} prose line ${r} ending in ${2020 + r}.`, x, y, SIZE, COL_W));
      });
    }
    const layout = buildLayout(spans, 612, 792);
    expect(layout.tables).toBeUndefined();
  });
});

describe('reorderForColumns — rotated margin text', () => {
  it('keeps indented first lines in their column and reads the rotated mark after the run', () => {
    const block = (text: string, x: number, y: number) => span(text, x, y, SIZE, COL_W - (x - 42));
    const spans: TextSpan[] = [
      block('Column one opening paragraph line before the gap.', 42, 70),
      block('Column one second line of the opening paragraph.', 42, 79.6),
      block('Indented first line of the second paragraph', 50, 110),
      block('continuation of the second paragraph in column one', 42, 119.6),
      block('Indented first line of the third paragraph', 50, 150),
      block('continuation of the third paragraph in column one', 42, 159.6),
      block('Column two first line that sits beside column one', 262, 72),
      block('Column two second line that sits beside column one', 262, 81.6),
      block('Column two third paragraph after a gap in the text', 262, 140),
      block('Column two last line that ends the second column', 262, 149.6),
      span('kmalloy on DSK7QP2VN1PROD with RULES', 15, 100, 6.5, 6.5, 130),
    ];
    const text = buildLayout(spans, 612, 792)
      .blocks.map((block) => block.text)
      .join('\n');
    const order = (needle: string) => text.indexOf(needle);
    expect(order('Indented first line of the second')).toBeLessThan(order('continuation of the second'));
    expect(order('Indented first line of the third')).toBeLessThan(order('continuation of the third'));
    expect(order('continuation of the third')).toBeLessThan(order('Column two first line'));
    expect(order('kmalloy')).toBeGreaterThan(order('Column two last line'));
  });
});
