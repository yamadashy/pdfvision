import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../../src/core/layout/index.js';
import { extractBodyVerticalCjkRunAnalysis } from '../../../src/core/layout/verticalText.js';
import type { TextSpan } from '../../../src/types/index.js';
import { span, verticalGlyphs, verticalGlyphTexts } from './helpers.js';

describe('vertical body runs', () => {
  it('groups body-sized Japanese vertical glyph runs right-to-left', () => {
    const rightColumn = Array.from('質問主意書').map((text, index) => span(text, 300, 100 + index * 8, 8, 8));
    const leftColumn = Array.from('国会質疑中').map((text, index) => span(text, 276, 100 + index * 8, 8, 8));

    const layout = buildLayout([...leftColumn, ...rightColumn], 595);
    const verticalBlocks = layout.blocks.filter((block) => block.writingMode === 'vertical');

    expect(verticalBlocks).toHaveLength(1);
    expect(verticalBlocks[0].text).toBe('質問主意書\n国会質疑中');
    expect(verticalBlocks[0].lines.map((line) => line.text)).toEqual(['質問主意書', '国会質疑中']);
    expect(verticalBlocks[0].lines.every((line) => line.writingMode === 'vertical')).toBe(true);
  });

  it('accepts short vertical columns with normalized ellipsis leaders when body columns corroborate them', () => {
    const rightColumn = verticalGlyphs('右側本文甲乙丙丁', 300, 100, 12);
    const shortColumn = verticalGlyphTexts(['そ', 'れ', 'と', 'も', '...', '...'], 279, 124, 12);
    const leftColumn = verticalGlyphs('左側本文甲乙丙丁', 258, 100, 12);
    const spans = [...leftColumn, ...shortColumn, ...rightColumn];

    const analysis = extractBodyVerticalCjkRunAnalysis(spans);
    expect(analysis.blocks).toHaveLength(1);
    expect(analysis.blocks[0].columns.map((column) => column.spans.map((item) => item.text).join(''))).toEqual([
      '右側本文甲乙丙丁',
      'それとも......',
      '左側本文甲乙丙丁',
    ]);

    const layout = buildLayout(spans, 595);
    const verticalBlocks = layout.blocks.filter((block) => block.writingMode === 'vertical');
    expect(verticalBlocks).toHaveLength(1);
    expect(verticalBlocks[0].lines.map((line) => line.text)).toEqual([
      '右側本文甲乙丙丁',
      'それとも......',
      '左側本文甲乙丙丁',
    ]);
    expect(verticalBlocks[0].lines.every((line) => line.writingMode === 'vertical')).toBe(true);
  });

  it('does not accept the same short ellipsis column without vertical body context', () => {
    const shortColumn = verticalGlyphTexts(['そ', 'れ', 'と', 'も', '...', '...'], 120, 100, 12);

    const analysis = extractBodyVerticalCjkRunAnalysis(shortColumn);
    expect(analysis.blocks).toEqual([]);

    const layout = buildLayout(shortColumn, 300);
    expect(layout.blocks.some((block) => block.writingMode === 'vertical')).toBe(false);
  });

  it('keeps uniformly small vertical columns as body when no larger adjacent column exists', () => {
    const rightBody = verticalGlyphs('質問主意書', 120, 100, 6);
    const leftBody = verticalGlyphs('国会質疑中', 108, 100, 6);
    const spans = [...rightBody, ...leftBody];

    const analysis = extractBodyVerticalCjkRunAnalysis(spans);
    expect(analysis.rubySpans).toEqual([]);
    expect(analysis.blocks[0].columns.map((column) => column.spans.map((item) => item.text).join(''))).toEqual([
      '質問主意書',
      '国会質疑中',
    ]);

    const layout = buildLayout(spans, 300);
    expect(layout.blocks.filter((block) => block.writingMode === 'vertical').map((block) => block.text)).toEqual([
      '質問主意書\n国会質疑中',
    ]);
  });

  it('does not treat x-aligned multi-character CJK spans as body vertical writing', () => {
    const spans: TextSpan[] = ['質問', '主意', '書面', '回答', '資料'].map((text, index) =>
      span(text, 80, 100 + index * 8, 8, 16),
    );

    const layout = buildLayout(spans, 300);

    expect(layout.blocks.some((block) => block.writingMode === 'vertical')).toBe(false);
  });

  it('does not treat short x-aligned CJK glyph runs as body vertical writing', () => {
    const spans: TextSpan[] = Array.from('質問書').map((text, index) => span(text, 80, 100 + index * 8, 8, 8));

    const layout = buildLayout(spans, 300);

    expect(layout.blocks.some((block) => block.writingMode === 'vertical')).toBe(false);
  });

  it('does not treat short x-aligned table labels near horizontal spans as body vertical writing', () => {
    const label = verticalGlyphs('注記表', 80, 100, 8, 8);
    const spans: TextSpan[] = [span('横書きの表見出し', 48, 92, 8, 80), span('別の表セル', 96, 108, 8, 48), ...label];

    const layout = buildLayout(spans, 300);

    expect(layout.blocks.some((block) => block.writingMode === 'vertical')).toBe(false);
  });

  it('does not treat aligned first glyphs of horizontal CJK lines as vertical writing', () => {
    const spans: TextSpan[] = [
      span('日', 50, 50, 12, 12),
      span('本', 63, 50, 12, 12),
      span('語', 76, 50, 12, 12),
      span('日', 50, 68, 12, 12),
      span('本', 63, 68, 12, 12),
      span('語', 76, 68, 12, 12),
      span('日', 50, 86, 12, 12),
      span('本', 63, 86, 12, 12),
      span('語', 76, 86, 12, 12),
    ];
    const layout = buildLayout(spans);

    expect(layout.blocks.some((block) => block.writingMode === 'vertical')).toBe(false);
    expect(layout.blocks.flatMap((block) => block.lines.map((line) => line.text))).toEqual([
      '日本語',
      '日本語',
      '日本語',
    ]);
  });

  it('does not extract small horizontal CJK labels with wide spacing as vertical blocks', () => {
    // Table/list-shaped Japanese text can repeat short labels at the same
    // x across rows while using a deliberate full-width-ish gap inside
    // each row. Those rows should stay horizontal, not get stripped into a
    // top-to-bottom label.
    const spans: TextSpan[] = [
      span('序', 50, 50, 12, 12),
      span('文', 66.64, 50, 12, 12), // gap ≈ 0.72 × fontSize
      span('本', 90, 50, 12, 40),
      span('序', 50, 68, 12, 12),
      span('文', 66.64, 68, 12, 12),
      span('本', 90, 68, 12, 40),
      span('序', 50, 86, 12, 12),
      span('文', 66.64, 86, 12, 12),
      span('本', 90, 86, 12, 40),
    ];
    const layout = buildLayout(spans);

    expect(layout.blocks.some((block) => block.writingMode === 'vertical')).toBe(false);
    expect(layout.blocks.flatMap((block) => block.lines.map((line) => line.text))).toEqual([
      '序 文 本',
      '序 文 本',
      '序 文 本',
    ]);
  });
});
