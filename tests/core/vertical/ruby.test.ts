import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../../src/core/layout/index.js';
import { extractBodyVerticalCjkRunAnalysis } from '../../../src/core/layout/verticalText.js';
import { verticalGlyphs, verticalSpan } from './helpers.js';

describe('vertical ruby', () => {
  it('classifies adjacent half-size ruby stacks without adding them to body vertical blocks', () => {
    const rightBody = verticalGlyphs('私東京で相当の地位を得たい', 300, 100, 12);
    const leftBody = verticalGlyphs('から宜しく頼む', 279, 100, 12);
    const ruby = verticalGlyphs('わたくし', 312, 94, 6);
    const spans = [...rightBody, ...ruby, ...leftBody];

    const analysis = extractBodyVerticalCjkRunAnalysis(spans);
    expect(analysis.rubySpans.map((item) => item.text).join('')).toBe('わたくし');
    expect(analysis.rubyAssociations).toHaveLength(1);
    expect(analysis.rubyAssociations[0].baseSpans.map((item) => item.text).join('')).toBe('私');
    expect(analysis.blocks).toHaveLength(1);
    expect(analysis.blocks[0].columns.map((column) => column.spans.map((item) => item.text).join(''))).toEqual([
      '私東京で相当の地位を得たい',
      'から宜しく頼む',
    ]);

    const layout = buildLayout(spans, 595);
    const verticalBlocks = layout.blocks.filter((block) => block.writingMode === 'vertical');
    expect(verticalBlocks.map((block) => block.text)).toContain(
      '私《わたくし》東京で相当の地位を得たい\nから宜しく頼む',
    );
  });

  it('does not readmit half-size short ruby stacks through contextual short-run detection', () => {
    const rightBody = verticalGlyphs('東京で相当の地位を得たい', 300, 100, 12);
    const leftBody = verticalGlyphs('から宜しく頼む', 279, 100, 12);
    const ruby = verticalGlyphs('ふりがな', 312, 124, 6);
    const spans = [...rightBody, ...ruby, ...leftBody];

    const analysis = extractBodyVerticalCjkRunAnalysis(spans);
    expect(analysis.rubySpans.map((item) => item.text).join('')).toBe('ふりがな');
    expect(analysis.blocks.flatMap((block) => block.columns).flatMap((column) => column.spans)).not.toEqual(
      expect.arrayContaining(ruby),
    );
  });

  it('does not classify a small vertical stack far from a larger body column as ruby', () => {
    const body = verticalGlyphs('東京で相当の地位を得たい', 300, 100, 12);
    const farSmall = verticalGlyphs('かな', 330, 124, 6);

    const analysis = extractBodyVerticalCjkRunAnalysis([...body, ...farSmall]);

    expect(analysis.rubySpans).toEqual([]);
    expect(analysis.blocks[0].columns.map((column) => column.spans.map((item) => item.text).join(''))).toEqual([
      '東京で相当の地位を得たい',
    ]);
  });

  it('classifies a two-glyph ruby stack when it is adjacent to a larger body column', () => {
    const body = verticalGlyphs('東京で相当の地位を得たい', 300, 100, 12);
    const ruby = verticalGlyphs('わた', 312, 124, 6);

    const analysis = extractBodyVerticalCjkRunAnalysis([...body, ...ruby]);

    expect(analysis.rubySpans.map((item) => item.text).join('')).toBe('わた');
    expect(analysis.blocks[0].columns.map((column) => column.spans.map((item) => item.text).join(''))).toEqual([
      '東京で相当の地位を得たい',
    ]);
  });

  it('attaches ruby to an internal range of a multi-character vertical body span', () => {
    const body = verticalSpan('甲朱雀乙丙丁戊己庚辛', 300, 100, 12);
    const ruby = verticalSpan('すざく', 312, 112, 6, 24);
    const spans = [body, ruby];

    const analysis = extractBodyVerticalCjkRunAnalysis(spans);
    expect(analysis.rubySpans).toEqual([ruby]);
    expect(analysis.rubyAssociations).toHaveLength(1);
    expect(analysis.rubyAssociations[0].baseRanges).toMatchObject([{ span: body, start: 1, end: 3 }]);

    const layout = buildLayout(spans, 595);
    expect(layout.blocks.filter((block) => block.writingMode === 'vertical').map((block) => block.text)).toEqual([
      '甲朱雀《すざく》乙丙丁戊己庚辛',
    ]);
  });
});
