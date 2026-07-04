import { describe, expect, it } from 'vitest';
import { mergeConsecutiveRubyAssociations } from '../../src/core/layout/rubyMerge.js';
import type { TextSpan } from '../../src/types/index.js';

interface TestAssociation {
  baseRanges: { span: TextSpan; start: number; end: number }[];
  reading: string;
}

function span(text: string): TextSpan {
  return { text, x: 0, y: 0, width: text.length * 10, height: 10, fontSize: 10 };
}

function mergeAssociations(associations: readonly TestAssociation[], spanOrder: readonly TextSpan[]) {
  return mergeConsecutiveRubyAssociations(associations, {
    getBaseRanges: (association) => association.baseRanges,
    getReading: (association) => association.reading,
    spanOrder,
    merge: (_group, baseRanges, reading) => ({
      baseRanges: [...baseRanges],
      reading,
    }),
  });
}

describe('ruby association merging', () => {
  it('merges consecutive readings attached to the same base range', () => {
    const base = span('京都');
    const result = mergeAssociations(
      [
        { baseRanges: [{ span: base, start: 0, end: 2 }], reading: 'きょ' },
        { baseRanges: [{ span: base, start: 0, end: 2 }], reading: 'う' },
      ],
      [base],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ reading: 'きょう' });
    expect(result[0].baseRanges).toEqual([{ span: base, start: 0, end: 2 }]);
  });

  it('merges consecutive readings attached to overlapping ranges with the same end', () => {
    const base = span('京都');
    const result = mergeAssociations(
      [
        { baseRanges: [{ span: base, start: 0, end: 2 }], reading: 'きょ' },
        { baseRanges: [{ span: base, start: 1, end: 2 }], reading: 'う' },
      ],
      [base],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ reading: 'きょう' });
  });

  it('merges consecutive readings attached to contiguous base ranges', () => {
    const base = span('京都');
    const result = mergeAssociations(
      [
        { baseRanges: [{ span: base, start: 0, end: 1 }], reading: 'きょ' },
        { baseRanges: [{ span: base, start: 1, end: 2 }], reading: 'う' },
      ],
      [base],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ reading: 'きょう' });
  });

  it('keeps readings separate when a base character intervenes', () => {
    const base = span('京都府');
    const result = mergeAssociations(
      [
        { baseRanges: [{ span: base, start: 0, end: 1 }], reading: 'きょ' },
        { baseRanges: [{ span: base, start: 2, end: 3 }], reading: 'ふ' },
      ],
      [base],
    );

    expect(result).toHaveLength(2);
    expect(result.map((association) => association.reading)).toEqual(['きょ', 'ふ']);
  });
});
