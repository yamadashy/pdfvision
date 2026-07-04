import { describe, expect, it } from 'vitest';
import { isCjkLeading, type JoinItem, joinPageText } from '../../src/core/text/cjkJoin.js';

/**
 * Build the per-item stream that pdf.js's `getTextContent` would emit
 * for a string of CJK glyphs at tight horizontal spacing. Each glyph is
 * one JoinItem; a whitespace-only item sits between every pair to
 * mirror the positional-gap artifact pdfjs inserts. Coordinates use a
 * unit font (fontSize=10, width=10) for simple gap arithmetic.
 */
function cjkRun(text: string, fontSize = 10, glyphWidth = 10, spacingGap = 0): JoinItem[] {
  const items: JoinItem[] = [];
  let x = 0;
  for (let i = 0; i < text.length; i++) {
    items.push({ str: text[i], x, width: glyphWidth, fontSize, hasEOL: false });
    x += glyphWidth;
    if (i < text.length - 1) {
      // Whitespace item with the synthetic positional gap pdf.js
      // inserts. Width carries the visual gap; the next glyph's x picks
      // up after it.
      items.push({ str: ' ', x, width: spacingGap, fontSize, hasEOL: false });
      x += spacingGap;
    }
  }
  return items;
}

describe('isCjkLeading', () => {
  it('recognises Han characters', () => {
    expect(isCjkLeading('人')).toBe(true);
    expect(isCjkLeading('的')).toBe(true);
  });

  it('recognises Hiragana and Katakana', () => {
    expect(isCjkLeading('あ')).toBe(true);
    expect(isCjkLeading('ア')).toBe(true);
  });

  it('recognises Hangul syllables', () => {
    expect(isCjkLeading('세')).toBe(true);
    expect(isCjkLeading('한')).toBe(true);
  });

  it('rejects latin and digit lead characters', () => {
    expect(isCjkLeading('a')).toBe(false);
    expect(isCjkLeading('9')).toBe(false);
    expect(isCjkLeading('')).toBe(false);
  });
});

describe('joinPageText (CJK-aware whitespace handling)', () => {
  it('returns the source text unchanged for a simple latin run', () => {
    const items: JoinItem[] = [
      { str: 'hello', x: 0, width: 50, fontSize: 12, hasEOL: false },
      { str: ' ', x: 50, width: 4, fontSize: 12, hasEOL: false },
      { str: 'world', x: 54, width: 50, fontSize: 12, hasEOL: false },
    ];
    expect(joinPageText(items)).toBe('hello world');
  });

  it('drops tight synthetic spaces inside Latin words', () => {
    // PDF.js issue9655-shaped case: the visible heading reads
    // "Property Insurance", but getTextContent inserts whitespace-only
    // items between tightly packed Latin word fragments.
    const items: JoinItem[] = [
      { str: 'P', x: 192.24, width: 8.88, fontSize: 17.28, hasEOL: false },
      { str: ' ', x: 201.12, width: 0.72, fontSize: 17.28, hasEOL: false },
      { str: 'ro', x: 201.84, width: 13.44, fontSize: 17.28, hasEOL: false },
      { str: ' ', x: 215.28, width: 0.24, fontSize: 17.28, hasEOL: false },
      { str: 'p', x: 215.52, width: 8.16, fontSize: 17.28, hasEOL: false },
      { str: ' ', x: 223.68, width: 0.24, fontSize: 17.28, hasEOL: false },
      { str: 'e', x: 223.92, width: 7.44, fontSize: 17.28, hasEOL: false },
      { str: ' ', x: 231.36, width: 0.96, fontSize: 17.28, hasEOL: false },
      { str: 'rt', x: 232.32, width: 9.84, fontSize: 17.28, hasEOL: false },
      { str: ' ', x: 242.16, width: 0, fontSize: 17.28, hasEOL: false },
      { str: 'y', x: 241.92, width: 7.44, fontSize: 17.28, hasEOL: false },
      { str: ' ', x: 249.36, width: 4.56, fontSize: 17.28, hasEOL: false },
      { str: 'Ins', x: 253.92, width: 19.44, fontSize: 17.28, hasEOL: false },
      { str: ' ', x: 273.36, width: 0.48, fontSize: 17.28, hasEOL: false },
      { str: 'ura', x: 273.84, width: 20.88, fontSize: 17.28, hasEOL: false },
      { str: ' ', x: 294.72, width: 0.96, fontSize: 17.28, hasEOL: false },
      { str: 'nce', x: 295.68, width: 23.04, fontSize: 17.28, hasEOL: false },
    ];
    expect(joinPageText(items)).toBe('Property Insurance');
  });

  it('drops the synthetic whitespace between tight CJK glyphs', () => {
    // The Chinese-UDHR case: every Han glyph is followed by a
    // whitespace item with effectively zero visual gap. Pdfvision
    // used to surface `人 人 生 而 自 由`; the fixed joiner emits
    // `人人生而自由`.
    const items = cjkRun('人人生而自由', /*fontSize*/ 10, /*glyphWidth*/ 10, /*spacingGap*/ 0);
    expect(joinPageText(items)).toBe('人人生而自由');
  });

  it('keeps the whitespace when the CJK gap is wide enough to be intentional', () => {
    // Column break inside a CJK paragraph: a real space that the
    // joiner must preserve. We make the gap > 30 % of fontSize so it
    // passes the threshold.
    const items = cjkRun('左右', /*fontSize*/ 10, /*glyphWidth*/ 10, /*spacingGap*/ 5);
    expect(joinPageText(items)).toBe('左 右');
  });

  it('keeps whitespace at latin↔CJK boundaries even when the gap is tight', () => {
    // `2025 年` should NOT collapse to `2025年` — the script change
    // signals a real word boundary regardless of geometry.
    const items: JoinItem[] = [
      { str: '2025', x: 0, width: 30, fontSize: 10, hasEOL: false },
      { str: ' ', x: 30, width: 0, fontSize: 10, hasEOL: false },
      { str: '年', x: 30, width: 10, fontSize: 10, hasEOL: false },
    ];
    expect(joinPageText(items)).toBe('2025 年');
  });

  it('honours hard line breaks (hasEOL) even between tight CJK glyphs', () => {
    // Two CJK glyphs that pdfjs flagged as a paragraph break — the
    // tight-gap rule must not swallow the newline.
    const items: JoinItem[] = [
      { str: '人', x: 0, width: 10, fontSize: 10, hasEOL: false },
      { str: '', x: 10, width: 0, fontSize: 10, hasEOL: true },
      { str: '人', x: 0, width: 10, fontSize: 10, hasEOL: false },
    ];
    expect(joinPageText(items)).toBe('人\n人');
  });

  it('synthesizes a newline when pdf.js omits EOL across distant visual lines', () => {
    const items: JoinItem[] = [
      { str: '3', x: 658.37, y: 365.69, width: 11.52, fontSize: 20.06, hasEOL: false },
      { str: 'int main() {', x: 201.46, y: 207.19, width: 59.53, fontSize: 13.1, hasEOL: true },
    ];

    expect(joinPageText(items)).toBe('3\nint main() {\n\n');
  });

  it('drops the artifact even when the joiner has no fontSize on one side', () => {
    // PDFs from some Office exporters report `fontSize: 0` on
    // individual items. We fall back to the other neighbour rather
    // than refusing to apply the rule.
    const items: JoinItem[] = [
      { str: '人', x: 0, width: 10, fontSize: 10, hasEOL: false },
      { str: ' ', x: 10, width: 0, fontSize: 0, hasEOL: false },
      { str: '人', x: 10, width: 10, fontSize: 0, hasEOL: false },
    ];
    // Next.fontSize is 0, falls back to prev.fontSize (10); gap is 0 < 3, drops the space.
    expect(joinPageText(items)).toBe('人人');
  });

  it('merges detected vertical-run items into column lines in stream order', () => {
    const rightColumn = Array.from('質問主意書').map((str, index) => ({
      str,
      x: 100,
      y: 100 + index * 10,
      width: 10,
      fontSize: 10,
      hasEOL: index < 4,
    }));
    const leftColumn = Array.from('国会質疑中').map((str, index) => ({
      str,
      x: 80,
      y: 100 + index * 10,
      width: 10,
      fontSize: 10,
      hasEOL: index < 4,
    }));
    const items: JoinItem[] = [
      ...rightColumn,
      { str: '', x: 80, y: 100, width: 0, fontSize: 10, hasEOL: true },
      ...leftColumn,
    ];

    expect(
      joinPageText(items, {
        verticalRuns: [{ itemIndices: [0, 1, 2, 3, 4] }, { itemIndices: [6, 7, 8, 9, 10] }],
      }),
    ).toBe('質問主意書\n国会質疑中\n');
  });

  it('keeps mixed horizontal items around detected vertical runs in stream order', () => {
    const items: JoinItem[] = [
      { str: 'Before ', x: 10, y: 40, width: 42, fontSize: 10, hasEOL: false },
      { str: '質', x: 100, y: 50, width: 10, fontSize: 10, hasEOL: true },
      { str: '問', x: 100, y: 60, width: 10, fontSize: 10, hasEOL: true },
      { str: '主', x: 100, y: 70, width: 10, fontSize: 10, hasEOL: true },
      { str: '意', x: 100, y: 80, width: 10, fontSize: 10, hasEOL: true },
      { str: '書', x: 100, y: 90, width: 10, fontSize: 10, hasEOL: false },
      { str: 'After', x: 10, y: 120, width: 30, fontSize: 10, hasEOL: false },
    ];

    expect(joinPageText(items, { verticalRuns: [{ itemIndices: [1, 2, 3, 4, 5] }] })).toBe('Before 質問主意書\nAfter');
  });

  it('falls back to the old per-run behavior when stream order does not match top-to-bottom order', () => {
    const items: JoinItem[] = [
      { str: '問', x: 100, y: 60, width: 10, fontSize: 10, hasEOL: true },
      { str: '質', x: 100, y: 50, width: 10, fontSize: 10, hasEOL: true },
      { str: '国', x: 80, y: 50, width: 10, fontSize: 10, hasEOL: true },
      { str: '会', x: 80, y: 60, width: 10, fontSize: 10, hasEOL: true },
      { str: '質', x: 80, y: 70, width: 10, fontSize: 10, hasEOL: true },
      { str: '疑', x: 80, y: 80, width: 10, fontSize: 10, hasEOL: true },
      { str: '中', x: 80, y: 90, width: 10, fontSize: 10, hasEOL: false },
    ];

    expect(
      joinPageText(items, {
        verticalRuns: [{ itemIndices: [1, 0] }, { itemIndices: [2, 3, 4, 5, 6] }],
      }),
    ).toBe('問\n\n質\n\n国会質疑中\n');
  });

  it('returns the empty string for empty input', () => {
    expect(joinPageText([])).toBe('');
  });

  it('orders RTL text runs right-to-left within each visual line', () => {
    const items: JoinItem[] = [
      { str: 'اﻟﻌﺮﺑﻴﺔ', x: 160.26, width: 117.32, fontSize: 36, hasEOL: false, dir: 'rtl' },
      { str: ' ', x: 277.58, width: 0.3, fontSize: 36, hasEOL: false, dir: 'ltr' },
      { str: 'اخلﻄﻮط', x: 288.3, width: 120.92, fontSize: 36, hasEOL: false, dir: 'rtl' },
      { str: ' ', x: 409.22, width: 0.3, fontSize: 36, hasEOL: false, dir: 'ltr' },
      { str: 'اﻧﻮاع', x: 419.87, width: 82.04, fontSize: 36, hasEOL: false, dir: 'rtl' },
      { str: '', x: 0, width: 0, fontSize: 36, hasEOL: true, dir: 'ltr' },
      { str: 'اﻟﻌﺮﺑﻴﺔ', x: 269.75, width: 72.94, fontSize: 36, hasEOL: false, dir: 'rtl' },
      { str: 'اﻧﻮاع', x: 443.66, width: 58.32, fontSize: 36, hasEOL: false, dir: 'rtl' },
    ];

    expect(joinPageText(items).normalize('NFKC')).toBe('انواع اخلطوط العربية\nانواع العربية');
  });
});
