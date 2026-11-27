import { describe, expect, it } from 'vitest';
import type { LineGlyphLookup } from '../../src/core/graphics/lineGlyphs.js';
import { collectFontTextHints } from '../../src/core/text/fontTextHints.js';
import { joinJustifiedGlyphRuns } from '../../src/core/text/justifiedGlyphRuns.js';
import { joinTrackedTokens, removeTrackingSpaces } from '../../src/core/text/letterSpacing.js';
import type { RawTextItem } from '../../src/core/text/textItems.js';

const OPS = { save: 1, restore: 2, setFont: 3, setCharSpacing: 4, textShowOps: new Set([5]) };

function glyphs(text: string) {
  return Array.from(text, (unicode) => ({ unicode, width: 500, isSpace: unicode === ' ' }));
}

function item(str: string, x: number, width: number, y = 700, size = 8) {
  return { str, width, height: size, transform: [size, 0, 0, size, x, y], fontName: 'f1', hasEOL: false };
}

const texts = (items: unknown[]) => (items as RawTextItem[]).map((entry) => entry.str);

describe('tracked words from the operator list', () => {
  it('records words drawn with character spacing, split at space glyphs', () => {
    const hints = collectFontTextHints(
      [3, 4, 5, 4, 5],
      [['f1', 8.6], [1.6], [glyphs('SUMMARY OF')], [0], [glyphs('plain text')]],
      OPS,
      () => undefined,
    );
    expect(hints.get('f1')?.trackedWords?.split('\u0000')).toEqual(['SUMMARY', 'OF']);
  });

  it('ends a tracked word at a TJ adjustment larger than a pair kern', () => {
    const hints = collectFontTextHints(
      [3, 4, 5],
      [['f1', 10], [1], [[...glyphs('1'), -2000, ...glyphs('Scope'), -40, ...glyphs('s')]]],
      OPS,
      () => undefined,
    );
    expect(hints.get('f1')?.trackedWords?.split('\u0000')).toEqual(['Scopes']);
  });

  it('marks a font drawn only in an invisible rendering mode', () => {
    const ops = { ...OPS, setTextRenderingMode: 6 };
    const hints = collectFontTextHints(
      [3, 6, 5, 3, 6, 5],
      [['ocr', 10], [3], [glyphs('hidden')], ['body', 10], [0], [glyphs('shown')]],
      ops,
      () => undefined,
    );
    expect(hints.get('ocr')?.invisible).toBe(true);
    expect(hints.get('body')).toBeUndefined();
  });

  it('ignores kerning-sized character spacing and restores it with the graphics state', () => {
    const hints = collectFontTextHints(
      [3, 4, 5, 1, 4, 2, 5],
      [['f1', 10], [0.2], [glyphs('kerned')], [], [3], [], [glyphs('after')]],
      OPS,
      () => undefined,
    );
    expect(hints.get('f1')).toBeUndefined();
  });
});

describe('joinTrackedTokens', () => {
  it('rejoins letters pdf.js spaced apart and keeps real word spaces', () => {
    expect(joinTrackedTokens('A C K G R O U N D', 'ACKGROUND')).toBe('ACKGROUND');
    expect(joinTrackedTokens('E C O M M E N D AT I O N S', 'ECOMMENDATIONS')).toBe('ECOMMENDATIONS');
    expect(joinTrackedTokens('S U M M A R Y O F', 'SUMMARY\u0000OF')).toBe('SUMMARY OF');
  });

  it('leaves tokens that do not spell a tracked word', () => {
    expect(joinTrackedTokens('1 2 3 4 5', 'ACKGROUND')).toBe('1 2 3 4 5');
    expect(joinTrackedTokens('Plan A B testing', 'AB')).toBe('Plan AB testing');
    expect(joinTrackedTokens('a long word here', 'longword')).toBe('a long word here');
  });

  it('keeps doubled spaces', () => {
    expect(joinTrackedTokens('O F  T H E', 'OF\u0000THE')).toBe('OF  THE');
  });
});

describe('removeTrackingSpaces', () => {
  it('only rewrites items in a font with tracked words', () => {
    const items = [
      { ...item('S A M P L E', 0, 80), fontName: 'f1' },
      { ...item('S A M P L E', 0, 80, 600), fontName: 'f2' },
    ];
    const hints = new Map([['f1', { trackedWords: 'SAMPLE' }]]);
    expect(texts(removeTrackingSpaces(items, hints))).toEqual(['SAMPLE', 'S A M P L E']);
  });

  /** One item per glyph with a space item between, as pdf.js gives tracking past ~0.6 em. */
  const spread = (text: string, x: number, pitch: number, wordGap: number) => {
    const out: ReturnType<typeof item>[] = [];
    let at = x;
    for (const char of text) {
      if (char === ' ') {
        at += wordGap - pitch;
        continue;
      }
      if (out.length > 0) out.push(item(' ', at - (pitch - 6), pitch - 6));
      out.push(item(char, at, 6));
      at += pitch;
    }
    return out;
  };

  it('rejoins a tracked word pdf.js split into one item per glyph', () => {
    const hints = new Map([['f1', { trackedWords: 'AGENDA' }]]);
    expect(texts(removeTrackingSpaces(spread('AGENDA', 72, 12, 0), hints))).toEqual(['AGENDA']);
  });

  it('keeps two tracked words a word space apart on one item, and words far apart in their own', () => {
    const hints = new Map([['f1', { trackedWords: 'MEETING\u0000NOTES' }]]);
    expect(texts(removeTrackingSpaces(spread('MEETING NOTES', 72, 12, 22), hints))).toEqual(['MEETING NOTES']);
    const apart = removeTrackingSpaces(spread('MEETING NOTES', 72, 12, 200), hints);
    expect(texts(apart).filter((text) => text.trim())).toEqual(['MEETING', 'NOTES']);
  });

  it('leaves single-glyph items that do not spell a tracked word', () => {
    const hints = new Map([['f1', { trackedWords: 'AGENDA' }]]);
    const cells = spread('ABCD', 72, 12, 0);
    expect(texts(removeTrackingSpaces(cells, hints))).toEqual(texts(cells));
  });
});

describe('joinJustifiedGlyphRuns', () => {
  const pitch = 12.94;
  const justified = (text: string, y: number) =>
    Array.from(text).flatMap((char, i, all) => [
      item(char, 55 + i * pitch, 8, y),
      ...(i < all.length - 1 ? [item(' ', 63 + i * pitch, 4.94, y)] : []),
    ]);
  const tight = (text: string, y: number) => item(text, 55, Array.from(text).length * 8, y);

  it('rejoins a justified CJK line next to a tightly set line of the same measure', () => {
    const line = 'ると判断する一定の前提に基づいて';
    // 25 glyphs at 8pt span the same measure as the 16 justified ones.
    const above = tight('本資料に記載されている業績見通し等の将来に関する記', 712);
    expect(texts(joinJustifiedGlyphRuns([above, ...justified(line, 700)]))).toEqual([above.str, line]);
  });

  it('keeps single glyphs at one pitch with no tight line beside them (weekday header)', () => {
    const header = justified('日月火水木金土', 700);
    const days = Array.from('1234567', (char, i) => item(char, 57 + i * pitch, 4, 688));
    expect(joinJustifiedGlyphRuns([...header, ...days])).toHaveLength(header.length + days.length);
  });

  it('keeps short runs and runs with uneven gaps', () => {
    const above = tight('本資料に記載されている業績見通し等の将来に', 712);
    const short = justified('目次項目', 700);
    expect(joinJustifiedGlyphRuns([above, ...short])).toHaveLength(1 + short.length);
    const uneven = Array.from('ると判断する一定', (char, i) => item(char, 55 + i * pitch + (i % 2) * 3, 8, 700));
    expect(joinJustifiedGlyphRuns([above, ...uneven])).toHaveLength(1 + uneven.length);
  });

  it('keeps Latin letters in their own items', () => {
    const above = tight('A normal line of tightly set text here', 712);
    const letters = Array.from('ABCDEFGH', (char, i) => item(char, 55 + i * pitch, 6, 700));
    expect(joinJustifiedGlyphRuns([above, ...letters])).toHaveLength(1 + letters.length);
  });

  describe('a line pdf.js merged into one item with spaces inside', () => {
    const line = 'ると判断する一定の前提に基づいて';
    const above = tight('本資料に記載されている業績見通し等の将来に関する記', 712);
    const merged = item(Array.from(line).join(' '), 55, 15 * pitch + 8, 700);
    /** Glyphs as the operator list placed them: 8pt wide at `pitch`, plus `extra` before glyph `at`. */
    const placed =
      (extra = 0, at = -1): LineGlyphLookup =>
      (bands) =>
        bands.map(() =>
          Array.from(line, (text, i) => {
            const left = 55 + i * pitch + (i >= at && at >= 0 ? extra : 0);
            return { text, whitespace: false, left, right: left + 8 };
          }),
        );

    it('reads it when the drawn glyphs sit at one pitch', () => {
      expect(texts(joinJustifiedGlyphRuns([above, merged], placed())).at(-1)).toBe(line);
    });

    it('keeps a gap clearly wider than the pitch as a space', () => {
      const spaced = item(Array.from(line).join(' '), 55, 15 * pitch + 8 + 3, 700);
      expect(texts(joinJustifiedGlyphRuns([above, spaced], placed(3, 6))).at(-1)).toBe(
        'ると判断する 一定の前提に基づいて',
      );
    });

    it('leaves it alone when the glyphs cannot be placed', () => {
      expect(texts(joinJustifiedGlyphRuns([above, merged])).at(-1)).toBe(merged.str);
      const none: LineGlyphLookup = (bands) => bands.map(() => undefined);
      expect(texts(joinJustifiedGlyphRuns([above, merged], none)).at(-1)).toBe(merged.str);
    });
  });
});
