import { describe, expect, it } from 'vitest';
import { normalizeText } from '../../src/core/processor/textUtils.js';
import { attachScripts, markUnicodeScripts, withoutScriptMarkup } from '../../src/core/text/scripts.js';
import type { RawTextItem } from '../../src/core/text/textItems.js';

/** A text item whose baseline is `y` (PDF space, up is positive). */
function item(str: string, x: number, width: number, y: number, size: number, extra: Partial<RawTextItem> = {}) {
  return { str, width, height: size, transform: [size, 0, 0, size, x, y], fontName: 'f1', hasEOL: false, ...extra };
}
const eol = (x: number, y: number, size: number) => item('', x, 0, y, size, { hasEOL: true });

const texts = (items: unknown[]) => (items as RawTextItem[]).map((entry) => entry.str);

describe('attachScripts', () => {
  it('marks an exponent, a squared bar and a footnote marker', () => {
    const items = [
      item('trained for 2.3 · 10', 90, 168.53, 670.49, 11),
      item('19', 258.53, 7.15, 674.67, 7.15),
      item(' ', 265.68, 2.75, 674.67, 7.15),
      item('FLOPs, about seven times the base model.', 268.43, 186.55, 670.49, 11),
      item('1', 454.98, 3.58, 674.67, 7.15),
    ];
    expect(texts(attachScripts(items)).join('')).toBe(
      'trained for 2.3 · 10^19 FLOPs, about seven times the base model.^1',
    );
  });

  it('marks a subscript and braces a multi-letter script', () => {
    const items = [
      item('P', 189.91, 6.72, 636.49, 11),
      item('drop', 196.63, 13.11, 634.51, 7.15),
      item(' ', 209.74, 2.75, 634.51, 7.15),
      item('= 0.1', 212.49, 30, 636.49, 11),
    ];
    expect(texts(attachScripts(items)).join('')).toBe('P_{drop} = 0.1');
  });

  it('joins a script set from two runs and keeps stacked scripts on one base', () => {
    const exponent = [
      item('e', 100, 4.9, 600, 11),
      item('−', 104.9, 3.6, 604.2, 7.15),
      item('f', 108.5, 2, 604.2, 7.15),
    ];
    expect(texts(attachScripts(exponent)).join('')).toBe('e^{−f}');
    const stacked = [
      item('= 410', 285.72, 25.45, 298.58, 11),
      item('+160', 311.68, 15.89, 303.2, 7.7),
      eol(311.68, 295.83, 7.7),
      item('−180', 311.68, 17.09, 295.83, 7.7),
      item(' ', 328.77, 3.25, 295.83, 7.7),
      item('Mpc', 332.02, 20, 298.58, 11),
    ];
    expect(texts(attachScripts(stacked)).join('')).toBe('= 410^+160_−180 Mpc');
    // The decimal point of a stacked bound is its own run, often in another font.
    const decimal = [
      item('waves, 0.112', 84.61, 137.86, 489.43, 9.96),
      item('+0', 222.47, 10.09, 493.7, 6.97),
      item('.', 232.55, 2.37, 493.7, 6.97, { fontName: 'f2' }),
      item('008', 234.92, 11.91, 493.7, 6.97),
      eol(222.47, 486.78, 6.97),
      item('−', 222.47, 6.23, 486.78, 6.97),
      item('0', 228.69, 3.97, 486.78, 6.97),
      item('.', 232.66, 2.37, 486.78, 6.97, { fontName: 'f2' }),
      item('009', 235.03, 11.91, 486.78, 6.97),
      item(',', 246.94, 2.77, 489.43, 9.96),
    ];
    expect(texts(attachScripts(decimal)).join('')).toBe('waves, 0.112^{+0.008}_{−0.009},');
  });

  it('keeps an index and the charge set after it as two scripts', () => {
    const ion = [
      item('sulfites (SO', 100, 50, 600, 9.5),
      item('3', 150, 3.43, 598.29, 6.18),
      item('2−', 153.43, 7.4, 603.61, 6.18),
      item(')', 160.83, 3.16, 600, 9.5),
    ];
    expect(texts(attachScripts(ion)).join('')).toBe('sulfites (SO_3^{2−})');
    // A second index of the same kind after the first is not chained on.
    const repeated = [item('x', 100, 5, 600, 10), item('i', 105, 2, 597, 6.5), item('j', 107.5, 2, 597.2, 4.5)];
    expect(texts(attachScripts(repeated))).toEqual(['x_i', 'j']);
  });

  it('nests a script of a script inside it', () => {
    const sub = [
      item('P', 100, 7, 600, 10),
      item('d', 107, 3.5, 598.5, 7),
      item('k', 110.5, 2.8, 597.3, 5),
      item('j', 113.3, 2, 597.3, 5),
      item(' ', 115.3, 2.5, 600, 10),
      item('= 1', 117.8, 12, 600, 10),
    ];
    expect(texts(attachScripts(sub)).join('')).toBe('P_{d_{kj}} = 1');
    const sup = [item('e', 100, 5, 600, 10), item('x', 105, 3, 604, 6.5), item('2', 108, 3, 607, 4.5)];
    expect(texts(attachScripts(sup))).toEqual(['e^{x^2}']);
    // The script goes on after the script of it, past an italic correction.
    const space = [
      item('R', 345.94, 7.19, 681.13, 9.96),
      item('(', 353.14, 3.11, 685.25, 6.97),
      item('P', 356.25, 5.07, 685.25, 6.97),
      item(' ', 361.32, 1.07, 685.25, 6.97),
      item('2', 362.4, 3.39, 688.25, 4.98),
      item('·', 366.28, 2.37, 685.25, 6.97),
      item('C)×D', 368.65, 21.5, 685.25, 6.97),
      item(',', 391.42, 2.77, 681.13, 9.96),
    ];
    expect(texts(attachScripts(space)).join('')).toBe('R^{(P^2·C)×D},');
  });

  it('reads through the sliver of space TeX leaves before a script, not a word space', () => {
    // dvips output: `F`, an italic correction, then `m` over `t` with a line break between.
    const stacked = [
      item('F', 231, 8.6, 203.4, 11.96),
      item(' ', 239.6, 1.24, 203.4, 11.96),
      item('m', 240.84, 7.49, 208.44, 7.97, { hasEOL: true }),
      item('t', 239.64, 3.06, 200.52, 7.97),
      item(' ', 242.7, 9.3, 200.52, 7.97),
      item('= 2', 252, 18.34, 203.4, 11.96),
    ];
    expect(texts(attachScripts(stacked)).join('')).toBe('F^m_t = 2');
    const marker = [
      item('capacity of each GPU', 108, 210.01, 153.42, 9.96),
      item(' ', 318.01, 2.49, 153.42, 9.96),
      item('5', 320.5, 3.49, 157.03, 6.97),
      item('.', 324.49, 2.49, 153.42, 9.96),
    ];
    expect(texts(attachScripts(marker)).join('')).toBe('capacity of each GPU ^5.');
  });

  it('leaves the numerator of an inline fraction for the math pass', () => {
    // `log(P(female|Context)/P(male|Context))` set as a text-style fraction.
    const fraction = [
      item('log(', 120.19, 16.74, 320.09, 9.96),
      item(' ', 136.93, 1.19, 320.09, 9.96),
      item('P', 138.12, 5.07, 324.92, 6.97),
      item(' ', 143.2, 1.07, 324.92, 6.97),
      item('(female', 144.27, 25.44, 324.92, 6.97),
    ];
    expect(texts(attachScripts(fraction))).toEqual(['log(', ' ', 'P', ' ', '(female']);
  });

  it('takes an opening parenthesis into the script it opens', () => {
    const items = [
      item('P E', 235.51, 15.14, 446.27, 9.96),
      item('(', 250.64, 3.11, 444.47, 6.97),
      item('pos,', 253.76, 14.17, 444.47, 6.97),
      item('2', 267.92, 3.97, 444.47, 6.97),
      item('i', 271.89, 2.82, 444.47, 6.97),
      item(')', 274.71, 3.11, 444.47, 6.97),
      item(' ', 277.83, 3.27, 444.47, 6.97),
      item('=', 281.09, 7.75, 446.27, 9.96),
    ];
    expect(texts(attachScripts(items)).join('')).toBe('P E_{(pos,2i)} =');
    const lone = [item('x', 100, 5, 600, 10), item('(', 105, 2, 604, 6.5), item(' ', 107, 3, 600, 10)];
    expect(texts(attachScripts(lone))).toEqual(['x', '(', ' ']);
  });

  it('keeps the word space a script run ends with', () => {
    const items = [item('2', 100, 5, 600, 10), item('nd ', 105, 9, 603.5, 6.5), item('floor', 114, 22, 600, 10)];
    const out = attachScripts(items) as RawTextItem[];
    expect(texts(out)).toEqual(['2^{nd}', ' ', 'floor']);
    expect(out[0].width).toBeCloseTo(11);
  });

  it('attaches a marker that opens a line to the text after it', () => {
    const items = [
      eol(90, 91.27, 5.85),
      item('1', 90, 2.93, 91.27, 5.85),
      item(' ', 92.92, 2.25, 91.27, 5.85),
      item('Measured on eight GPUs.', 95.17, 113.74, 87.85, 9),
    ];
    expect(texts(attachScripts(items)).join('')).toBe('^1 Measured on eight GPUs.');
  });

  it('leaves a text-style fraction after a word space for the math pass', () => {
    // `½` set as 1 over 2 (the rule between them is a vector path).
    const half = [
      item('when b = ', 90, 40, 600, 10),
      item('1', 130, 3.5, 604, 7),
      eol(130, 597, 7),
      item('2', 130, 3.5, 597, 7),
      item('∇a', 134.5, 12, 600, 10),
    ];
    expect(texts(attachScripts(half))).toEqual(['when b = ', '1', '', '2', '∇a']);
  });

  it('leaves small caps, a spaced-apart raised label and long small print alone', () => {
    const smallCaps = [item('B', 90, 7.34, 514.49, 11), item('ACKGROUND', 97.34, 67, 514.4, 8.6)];
    expect(texts(attachScripts(smallCaps))).toEqual(['B', 'ACKGROUND']);
    const label = [item('$4.2M', 90, 60, 500, 24), item('+12%', 156, 20, 508, 12)];
    expect(texts(attachScripts(label))).toEqual(['$4.2M', '+12%']);
    const smallPrint = [item('Price', 90, 25, 500, 10), item('(excluding_tax)', 115, 40, 503, 7)];
    expect(texts(attachScripts(smallPrint))).toEqual(['Price', '(excluding_tax)']);
  });

  it('leaves ruby, CJK annotations and note marks alone', () => {
    // Ruby sits about an em above its base.
    const ruby = [item('漢字', 100, 20, 600, 10), item('かんじ', 120, 15, 610, 5)];
    expect(texts(attachScripts(ruby))).toEqual(['漢字', 'かんじ']);
    const kana = [item('澪', 100, 10, 600, 10), item('み', 110, 5, 603, 5)];
    expect(texts(attachScripts(kana))).toEqual(['澪', 'み']);
    const stars = [item('-0.142', 100, 25, 600, 10), item('***', 125, 8, 604, 6.5)];
    expect(texts(attachScripts(stars))).toEqual(['-0.142', '***']);
    const citation = [item('famous.', 100, 30, 600, 10), item('[4]', 130, 8, 604, 6.5)];
    expect(texts(attachScripts(citation))).toEqual(['famous.', '[4]']);
    const quote = [item('a bat', 100, 25, 600, 10), item('?', 125, 4, 603, 7)];
    expect(texts(attachScripts(quote))).toEqual(['a bat', '?']);
  });

  it('leaves runs in fonts that cannot hold scripts (an invisible OCR layer)', () => {
    const items = [item('trained for 10', 90, 60, 600, 11), item('19', 150, 7, 604, 7.15)];
    expect(texts(attachScripts(items, () => false))).toEqual(['trained for 10', '19']);
  });

  it('leaves text that is not upright', () => {
    const rotated = [
      { ...item('10', 100, 10, 600, 10), transform: [0, 10, -10, 0, 100, 600] },
      { ...item('19', 104, 7, 610, 6.5), transform: [0, 6.5, -6.5, 0, 104, 610] },
    ];
    expect(texts(attachScripts(rotated))).toEqual(['10', '19']);
  });
});

describe('markUnicodeScripts', () => {
  it('writes superscript and subscript characters in the script notation', () => {
    expect(markUnicodeScripts('area in m²')).toBe('area in m^2');
    expect(markUnicodeScripts('2.3 · 10¹⁹ FLOPs')).toBe('2.3 · 10^19 FLOPs');
    expect(markUnicodeScripts('s⁻¹ and H₂O and xᵢ')).toBe('s^−1 and H_2O and x_i');
    expect(markUnicodeScripts('aⁿ⁺¹')).toBe('a^{n+1}');
  });

  it('survives NFKC normalization, which would fold ² to 2', () => {
    expect(normalizeText('R² = 0.91')).toBe('R^2 = 0.91');
    expect(normalizeText('plain 2 text')).toBe('plain 2 text');
  });
});

describe('withoutScriptMarkup', () => {
  it('drops the markers and braces but keeps the script text', () => {
    expect(withoutScriptMarkup('dV_{OS}/dT T_A = 25°C')).toBe('dVOS/dT TA = 25°C');
    expect(withoutScriptMarkup('2.3 · 10^19 and e^{-f}')).toBe('2.3 · 1019 and e-f');
    expect(withoutScriptMarkup('plain text')).toBe('plain text');
  });
});
