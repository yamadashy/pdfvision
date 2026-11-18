import { describe, expect, it } from 'vitest';
import { collapseOverdrawnText } from '../../src/core/text/overdraw.js';
import type { RawTextItem } from '../../src/core/text/textItems.js';

function item(str: string, x: number, width: number, options: { y?: number; size?: number; font?: string } = {}) {
  const size = options.size ?? 13;
  return {
    str,
    width,
    height: size,
    transform: [size, 0, 0, size, x, options.y ?? 700],
    fontName: options.font ?? 'f1',
    hasEOL: false,
  };
}

const texts = (items: unknown[]) => (items as RawTextItem[]).map((entry) => entry.str);

describe('collapseOverdrawnText', () => {
  it('keeps one copy of a run drawn several times with sub-point offsets', () => {
    const items = [item('決算短信', 100, 52), item('決算短信', 100.2, 52), item('決算短信', 100.4, 52)];
    expect(texts(collapseOverdrawnText(items))).toEqual(['決算短信']);
  });

  it('splits merged copies of neighbouring runs into the new part only', () => {
    // pdf.js merges the last copy of `2` with the first copy of `0`.
    const items = [
      item('2', 105.54, 7.22),
      item('2', 105.74, 7.22),
      item('20', 105.94, 14.03),
      item('0', 112.95, 7.22),
      item('02', 113.15, 14.03),
      item('2', 120.17, 7.22),
      item('27', 120.37, 14.03),
      item('7', 127.38, 7.22),
      item('7年3月期', 127.58, 53.03),
      item('年3月期', 134.6, 46.22),
      item('年3月期 第2四半期', 134.8, 107.94),
      item('第2四半期', 183.73, 59.22),
      item('第2四半期（', 183.93, 71.82),
      item('（', 242.94, 13),
    ];
    expect(texts(collapseOverdrawnText(items)).join('')).toBe('2027年3月期 第2四半期（');
  });

  it('moves the line break of a dropped copy to the kept run', () => {
    const items = [item('Total', 100, 30), { ...item('Total', 100.3, 30), hasEOL: true }];
    const out = collapseOverdrawnText(items) as RawTextItem[];
    expect(out).toHaveLength(1);
    expect(out[0].hasEOL).toBe(true);
  });

  it('keeps repeated text that sits a glyph or more apart', () => {
    const items = [item('.', 100, 3.6), item('.', 103.6, 3.6), item('.', 107.2, 3.6)];
    expect(texts(collapseOverdrawnText(items))).toEqual(['.', '.', '.']);
  });

  it('keeps the same text in another font, size or line', () => {
    const items = [
      item('Total', 100, 30),
      item('Total', 100.2, 30, { font: 'f2' }),
      item('Total', 100.2, 27, { size: 12 }),
      item('Total', 100.2, 30, { y: 686 }),
    ];
    expect(texts(collapseOverdrawnText(items))).toHaveLength(4);
  });

  it('keeps different text drawn at the same place', () => {
    const items = [item('12', 100, 14), item('13', 100.2, 14)];
    expect(texts(collapseOverdrawnText(items))).toEqual(['12', '13']);
  });

  it('leaves rotated text alone', () => {
    const rotated = { ...item('Total', 100, 30), transform: [0, 13, -13, 0, 100, 700] };
    const items = [rotated, { ...rotated, transform: [0, 13, -13, 0, 100.2, 700] }];
    expect(collapseOverdrawnText(items)).toHaveLength(2);
  });
});
