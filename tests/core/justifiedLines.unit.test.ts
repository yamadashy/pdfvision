import { describe, expect, it } from 'vitest';
import { buildLayoutLines } from '../../src/core/layout/lines.js';
import { collectFontTextHints } from '../../src/core/text/fontTextHints.js';
import type { TextSpan } from '../../src/types/index.js';

function span(text: string, x: number, y: number, width: number, size = 38): TextSpan {
  return { text, x, y, width, height: size, fontSize: size };
}

const lineTexts = (spans: TextSpan[], pageWidth = 3370) => buildLayoutLines(spans, pageWidth).map((line) => line.text);

describe('justified lines stretched past the gutter threshold (#268)', () => {
  // poster-multiblock: a 745pt measure at 38pt with six words on the first line.
  const stretched = [
    span('The', 905, 559, 65.5),
    span('drone', 1030, 559, 97.2),
    span('flagged', 1186.5, 559, 124.6),
    span('87%', 1370.6, 559, 76),
    span('of', 1506.1, 559, 31.7),
    span('the', 1597.2, 559, 52.8),
  ];
  const paragraph = [
    span('observer-confirmed heat-stress events, with', 905, 609, 745),
    span('a median lead time of 38 minutes before the', 905, 659, 745),
  ];

  it('rejoins the words of a line that fills its paragraph’s measure', () => {
    expect(lineTexts([...stretched, ...paragraph])).toEqual([
      'The drone flagged 87% of the',
      'observer-confirmed heat-stress events, with',
      'a median lead time of 38 minutes before the',
    ]);
  });

  it('keeps the words apart when no prose line shares both edges', () => {
    const narrower = paragraph.map((line) => ({ ...line, width: 600 }));
    expect(lineTexts([...stretched, ...narrower])).toContain('The');
  });

  it('keeps table cells apart: the rows beside them are cells too, not prose', () => {
    const rows = [
      span('Name', 905, 559, 90),
      span('Region', 1180, 559, 120),
      span('Units', 1550, 559, 100),
      span('Alice', 905, 609, 90),
      span('North', 1180, 609, 110),
      span('1200', 1570, 609, 80),
    ];
    // The header joins under the older spaced-out-words rule; the data row, whose neighbours are cells, stays split.
    expect(lineTexts(rows)).toEqual(['Name Region Units', 'Alice', 'North', '1200']);
  });

  it('keeps the first lines of text columns under a full-width paragraph apart', () => {
    const page = [
      span('A full-width abstract paragraph runs across the whole page measure here', 90, 100, 1500, 20),
      span('Left column text begins with a long run', 90, 130, 450, 20),
      span('Middle column text is another long run', 610, 130, 450, 20),
      span('Right column text ends at the measure', 1140, 130, 450, 20),
    ];
    expect(lineTexts(page)).toHaveLength(4);
  });
});

describe('letter spacing set by TJ adjustments (#268)', () => {
  const OPS = { save: 1, restore: 2, setFont: 3, setCharSpacing: 4, textShowOps: new Set([5]) };
  const glyph = (unicode: string) => ({ unicode, width: 500, isSpace: unicode === ' ' });
  /** A showText array with `push` between every glyph of `text` (TJ thousandths; negative moves right). */
  const tracked = (text: string, push: number) =>
    Array.from(text).flatMap((char, i) => (i === 0 ? [glyph(char)] : [push, glyph(char)]));

  it('records a word whose every glyph is pushed apart by the same adjustment', () => {
    const hints = collectFontTextHints([3, 5], [['f1', 8], [tracked('CLASS', -150)]], OPS, () => undefined);
    expect(hints.get('f1')?.trackedWords?.split('\u0000')).toEqual(['CLASS']);
  });

  it('records tracking written together with pair kerning into each adjustment', () => {
    const pushes = [-150, -180, -130, -150, -150, -190, -120, -150];
    const glyphs = Array.from('CLASSROOM').flatMap((char, i) =>
      i === 0 ? [glyph(char)] : [pushes[i - 1], glyph(char)],
    );
    const hints = collectFontTextHints([3, 5], [['f1', 8], [glyphs]], OPS, () => undefined);
    expect(hints.get('f1')?.trackedWords?.split('\u0000')).toEqual(['CLASSROOM']);
  });

  it('does not take a word move between two short words for a pair kern', () => {
    const words = [glyph('G'), -80, glyph('O'), -180, glyph('T'), -80, glyph('O')];
    const hints = collectFontTextHints([3, 5], [['f1', 8], [words]], OPS, () => undefined);
    expect(hints.get('f1')?.trackedWords).toBeUndefined();
  });

  it('does not take justified word spaces for tracking', () => {
    // `as a b conference`: the same push between words, single-letter words in a row.
    const words = [glyph('a'), glyph('s'), -383, glyph('a'), -383, glyph('b'), -383, glyph('c'), glyph('o')];
    const hints = collectFontTextHints([3, 5], [['f1', 8], [words]], OPS, () => undefined);
    expect(hints.get('f1')?.trackedWords).toBeUndefined();
  });

  it('leaves evenly spaced math and digit rows alone', () => {
    const hints = collectFontTextHints(
      [3, 5, 5],
      [['f1', 8], [tracked('a+b+c', -222)], [tracked('1234', -300)]],
      OPS,
      () => undefined,
    );
    expect(hints.get('f1')?.trackedWords).toBeUndefined();
  });
});
