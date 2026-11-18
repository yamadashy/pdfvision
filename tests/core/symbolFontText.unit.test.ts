import { describe, expect, it } from 'vitest';
import { collectFontTextHints, mapSymbolFontText } from '../../src/core/text/fontTextHints.js';
import { standardSymbolFontKind, symbolFontChar } from '../../src/core/text/symbolFontEncodings.js';

const OPS = { save: 1, restore: 2, setFont: 3, setCharSpacing: 4, textShowOps: new Set([5]) };

/** A glyph as pdf.js reports it with fontExtraProperties: the text it decoded and the code drawn. */
function glyph(unicode: string, code = unicode.charCodeAt(0)) {
  return { unicode, originalCharCode: code, width: 700 };
}

function hintsFor(name: string | undefined, glyphs: unknown[], differences?: unknown) {
  return collectFontTextHints([3, 5], [['f1', 10], [glyphs]], OPS, () => ({ name, differences }));
}

describe('standardSymbolFontKind', () => {
  it('recognises the standard symbol fonts, subset or not', () => {
    expect(standardSymbolFontKind('ZapfDingbats')).toBe('dingbats');
    expect(standardSymbolFontKind('ABCDEF+ZapfDingbats')).toBe('dingbats');
    expect(standardSymbolFontKind('ZapfDingbatsITC')).toBe('dingbats');
    expect(standardSymbolFontKind('Symbol')).toBe('symbol');
    expect(standardSymbolFontKind('SymbolMT')).toBe('symbol');
  });

  it('does not take other fonts for them', () => {
    for (const name of ['Times-Roman', 'Wingdings', 'SymbolNerdFont', 'NotoSansSymbols', 'Webdings', undefined]) {
      expect(standardSymbolFontKind(name)).toBeUndefined();
    }
  });
});

describe('symbolFontChar', () => {
  it('reads the built-in encodings and Dingbats /Differences names', () => {
    expect(symbolFontChar('dingbats', 51)).toBe('✓');
    expect(symbolFontChar('dingbats', 55)).toBe('✗');
    expect(symbolFontChar('dingbats', 108)).toBe('●');
    expect(symbolFontChar('symbol', 97)).toBe('α');
    expect(symbolFontChar('symbol', 45)).toBe('−');
    expect(symbolFontChar('dingbats', 40, 'a19')).toBe('✓');
    expect(symbolFontChar('dingbats', 40, 'three')).toBeUndefined();
  });
});

describe('symbol font char maps', () => {
  it('maps codes pdf.js passed through as text to the glyph they draw', () => {
    const charMap = hintsFor(
      'ZapfDingbats',
      [glyph('3'), glyph('7')],
      new Map([
        [51, 'a19'],
        [55, 'a23'],
      ]),
    ).get('f1')?.charMap;
    expect(charMap && mapSymbolFontText('3 7', charMap)).toBe('✓ ✗');
  });

  it('uses the built-in encoding when the font has no /Differences', () => {
    const charMap = hintsFor('ZapfDingbats', [glyph('l')]).get('f1')?.charMap;
    expect(charMap?.get('l')).toBe('●');
  });

  it('leaves glyphs pdf.js already mapped, and the characters they produced', () => {
    // A ToUnicode CMap maps code 52 to `3`: `3` is a real mapping here, not a passed-through code.
    const hints = hintsFor('ZapfDingbats', [glyph('✓', 51), glyph('3', 52), glyph('3', 51)]);
    expect(hints.get('f1')?.charMap?.has('3')).not.toBe(true);
  });

  it('builds no map for ordinary fonts', () => {
    expect(hintsFor('Helvetica', [glyph('3')]).get('f1')).toBeUndefined();
    expect(hintsFor(undefined, [glyph('3')]).get('f1')).toBeUndefined();
  });
});
