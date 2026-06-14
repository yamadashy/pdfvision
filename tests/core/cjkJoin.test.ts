import { describe, expect, it } from 'vitest';
import { isCjkLeading, type JoinItem, joinPageText } from '../../src/core/cjkJoin.js';

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
