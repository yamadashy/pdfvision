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
