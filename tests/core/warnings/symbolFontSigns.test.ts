import { describe, expect, it } from 'vitest';
import { detectPageWarnings } from '../../../src/core/warnings/index.js';
import type { TextSpan } from '../../../src/types/index.js';
import { page } from './helpers.js';

type Part = [text: string, font: string, size?: number, rise?: number];

/** Lay parts out left to right on one baseline, butting each against the last. */
function lineSpans(parts: Part[], y: number, size = 10): TextSpan[] {
  let x = 72;
  return parts.map(([text, fontName, partSize = size, rise = 0]) => {
    const width = text.length * partSize * 0.5;
    const span = { text, x, y: y + (size - partSize) - rise, width, height: partSize, fontSize: partSize, fontName };
    x += width;
    return span;
  });
}

const BODY = 'font1';
const SYM = 'font2';

/** Body text with one long prose line, so the page is not glyph-by-glyph positioned. */
function prose(y: number): TextSpan[] {
  return lineSpans([['Hospital admissions fell relative to usual care in the remote monitoring arm.', BODY]], y);
}

function warningsFor(spans: TextSpan[]) {
  return detectPageWarnings({ ...page([]), userUnit: 2 }, { spans }).filter(
    (warning) => warning.code === 'symbol_font_substitution',
  );
}

describe('symbol_font_substitution', () => {
  it('flags a font used only for single glyphs set beside numbers that extract as digits and punctuation', () => {
    const spans = [
      ...prose(100),
      ...lineSpans(
        [
          ['usual care (', BODY],
          ['2', SYM],
          ['52%, p ', BODY],
          [',', SYM],
          [' 0.001), unchanged (', BODY],
          ['2', SYM],
          ['2%, p ', BODY],
          ['¼', SYM],
          [' 0.91); age 61.3 ', BODY],
          ['þ', SYM],
          [' 9.8 years', BODY],
        ],
        120,
      ),
    ];
    const out = warningsFor(spans);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('warning');
    expect(out[0].message).toContain('5 single-glyph runs in font font2');
    expect(out[0].message).toContain('"2", ",", "¼", "þ"');
    expect(out[0].message).toContain('"(252%,"');
    expect(out[0].message).toContain('"p , 0.001),"');
    // The region comes back in the raw page-view units the spans were given in,
    // even though detectors work in physical points on a /UserUnit 2 page.
    const sign = spans.find((span) => span.fontName === SYM) as TextSpan;
    expect(out[0].message).toContain(`--render-region ${sign.x},${sign.y},`);
  });

  it('stays quiet when the symbol font maps its signs to the real characters', () => {
    const spans = [
      ...prose(100),
      ...lineSpans(
        [
          ['usual care (', BODY],
          ['−', SYM],
          ['52%, p ', BODY],
          ['<', SYM],
          [' 0.001), unchanged (', BODY],
          ['−', SYM],
          ['2%, p ', BODY],
          ['=', SYM],
          [' 0.91)', BODY],
        ],
        120,
      ),
    ];
    expect(warningsFor(spans)).toEqual([]);
  });

  it('ignores superscript reference digits set smaller and raised in another font', () => {
    const spans = [
      ...prose(100),
      ...lineSpans(
        [
          ['as reported in 2019', BODY],
          ['1', SYM, 6, 4],
          [', 2020', BODY],
          ['2', SYM, 6, 4],
          [' and 2021', BODY],
          ['3', SYM, 6, 4],
          [' by the trial group.', BODY],
        ],
        120,
      ),
    ];
    expect(warningsFor(spans)).toEqual([]);
  });

  it('ignores a font that also sets longer runs elsewhere on the page', () => {
    const spans = [
      ...prose(100),
      ...lineSpans([['Results and discussion', SYM]], 80),
      ...lineSpans(
        [
          ['steps 1 ', BODY],
          ['2', SYM],
          [' 3 then 4 ', BODY],
          ['5', SYM],
          [' 6 then 7 ', BODY],
          ['8', SYM],
          [' 9', BODY],
        ],
        120,
      ),
    ];
    expect(warningsFor(spans)).toEqual([]);
  });

  it('ignores a fraction font beside numbers, since a vulgar fraction is what it claims to be', () => {
    const spans = [
      ...prose(100),
      ...lineSpans(
        [
          ['add 3', BODY],
          ['½', SYM],
          [' cups, then 1', BODY],
          ['¼', SYM],
          [' cups and 2', BODY],
          ['¾', SYM],
          [' more', BODY],
        ],
        120,
      ),
    ];
    expect(warningsFor(spans)).toEqual([]);
  });

  it('ignores a figures font whose digits never sit beside digits of another font', () => {
    const spans = [
      ...prose(100),
      ...lineSpans(
        [
          ['mean ', BODY],
          ['7', SYM],
          ['.', BODY],
          ['1', SYM],
          [' and ', BODY],
          ['8', SYM],
          ['.', BODY],
          ['2', SYM],
          [' years', BODY],
        ],
        120,
      ),
    ];
    expect(warningsFor(spans)).toEqual([]);
  });

  it('ignores TeX math-italic decimal points and commas beside numbers, which really are punctuation', () => {
    // TeX sets the `.` and `,` of math-mode numbers from cmmi, so a font used
    // only for single periods and commas between digits is ordinary LaTeX.
    const spans = [
      ...prose(100),
      ...lineSpans(
        [
          ['accuracy of 88', BODY],
          ['.', SYM],
          ['55 on the range [0', BODY],
          [',', SYM],
          [' 100) with 0', BODY],
          ['.', SYM],
          ['3 dropout, equations 164a', BODY],
          [',', SYM],
          ['164b and Section 3', BODY],
          [',', SYM],
          [' using 2', BODY],
          ['.', SYM],
          ['5 epochs', BODY],
        ],
        120,
      ),
    ];
    expect(warningsFor(spans)).toEqual([]);
  });

  it('needs more than one digit or Latin-1 slot, however much punctuation sits beside it', () => {
    const spans = [
      ...prose(100),
      ...lineSpans(
        [
          ['value 88', BODY],
          ['.', SYM],
          ['55 and 0', BODY],
          [',', SYM],
          ['1 then (', BODY],
          ['2', SYM],
          ['3 and 4', BODY],
          ['.', SYM],
          ['5', BODY],
        ],
        120,
      ),
    ];
    expect(warningsFor(spans)).toEqual([]);
  });

  it('ignores pages whose producer positions every glyph separately', () => {
    const glyphs: Part[] = [];
    for (const ch of 'care (52%, p 0.001) and 7.1 9.8 years') glyphs.push([ch, BODY]);
    glyphs.splice(6, 0, ['2', SYM]);
    glyphs.splice(14, 0, [',', SYM]);
    glyphs.splice(30, 0, ['þ', SYM]);
    expect(warningsFor(lineSpans(glyphs, 120))).toEqual([]);
  });
});
