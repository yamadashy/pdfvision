import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../../src/core/layout/index.js';
import type { TextSpan } from '../../../src/types/index.js';
import { span } from './helpers.js';

describe('vertical display-title layout', () => {
  it('keeps Japanese vertical glyph stacks as separate top-to-bottom blocks', () => {
    // Japanese slide-title-shaped input from a public government PDF:
    // pdf.js emits one square-ish glyph per span. A y-row-only layout pass
    // used to merge the two vertical columns row-wise (`縦 書\n書 籍...`).
    const spans: TextSpan[] = [
      span('ネットの横書き', 290, 430, 32, 210),
      span('縦', 36, 194, 76, 72),
      span('書', 36, 299, 76, 72),
      span('き', 36, 405, 76, 72),
      span('書', 182, 97, 76, 72),
      span('籍', 182, 202, 76, 72),
      span('の', 182, 308, 76, 72),
      span('と', 589, 137, 92, 86),
    ];
    const layout = buildLayout(spans, 720);
    const verticalBlocks = layout.blocks.filter((block) => block.writingMode === 'vertical');

    expect(verticalBlocks.map((block) => block.text)).toEqual(expect.arrayContaining(['縦書き', '書籍の']));
    expect(verticalBlocks.every((block) => block.lines[0]?.writingMode === 'vertical')).toBe(true);
    expect(layout.blocks.map((block) => block.text)).not.toContain('縦 書\n書 籍\nき の');
  });

  it('marks tall CJK spans as vertical columns in right-to-left order', () => {
    // PDF.js vertical.pdf-shaped input: each vertical column arrives as
    // one tall span whose text is already top-to-bottom.
    const spans: TextSpan[] = [
      span('あいうえお', 233.86, 21.97, 9.21, 9.21),
      span('日本語', 218.27, 21.97, 9.21, 9.21),
    ];
    spans[0].height = 46.06;
    spans[1].height = 27.64;

    const layout = buildLayout(spans, 300);
    expect(layout.blocks.map((block) => block.text)).toEqual(['あいうえお', '日本語']);
    expect(layout.blocks.every((block) => block.writingMode === 'vertical')).toBe(true);
    expect(layout.blocks.every((block) => block.lines[0]?.writingMode === 'vertical')).toBe(true);
  });

  it('marks tall vertical spans with leading ASCII parens when they contain CJK text', () => {
    const spans: TextSpan[] = [span('(1935)年5月、新聞にこんな', 467.1, 615.32, 9.5, 9.5)];
    spans[0].height = 152;

    const layout = buildLayout(spans, 595);

    expect(layout.blocks).toHaveLength(1);
    expect(layout.blocks[0].text).toBe('(1935)年5月、新聞にこんな');
    expect(layout.blocks[0].writingMode).toBe('vertical');
    expect(layout.blocks[0].lines[0]?.writingMode).toBe('vertical');
  });

  it('stitches tatechuyoko digit fragments into the same vertical layout line', () => {
    const spans: TextSpan[] = [
      span('昭和', 100, 100, 10, 10),
      span('10', 95, 119, 10, 10),
      span('(1935)年5月、新聞にこんな', 100, 130, 10, 10),
    ];
    spans[0].height = 20;
    spans[2].height = 160;

    const layout = buildLayout(spans, 300);
    const verticalBlocks = layout.blocks.filter((block) => block.writingMode === 'vertical');

    expect(verticalBlocks).toHaveLength(1);
    expect(verticalBlocks[0].text).toBe('昭和10(1935)年5月、新聞にこんな');
    expect(verticalBlocks[0].lines).toHaveLength(1);
    expect(verticalBlocks[0].lines[0]).toMatchObject({
      text: '昭和10(1935)年5月、新聞にこんな',
      writingMode: 'vertical',
    });
  });

  it('does not classify horizontal digit rows as vertical writing', () => {
    const spans: TextSpan[] = [span('10', 50, 100, 10, 10), span('20', 70, 100, 10, 10), span('30', 90, 100, 10, 10)];

    const layout = buildLayout(spans, 300);

    expect(layout.blocks.some((block) => block.writingMode === 'vertical')).toBe(false);
    expect(layout.blocks[0].lines[0]?.text).toBe('10 20 30');
  });

  it('does not classify tall ASCII-only spans as vertical CJK writing', () => {
    const spans: TextSpan[] = [span('https://example.com/path', 100, 100, 10, 10)];
    spans[0].height = 180;

    const layout = buildLayout(spans, 300);

    expect(layout.blocks.some((block) => block.writingMode === 'vertical')).toBe(false);
  });

  it('marks page-edge vertical navigation tabs as repeated chrome', () => {
    const spans: TextSpan[] = [
      span('本文の見出し', 65, 54, 18, 120),
      span('本文の一行目がここにあります', 62, 84, 10, 220),
      span('第', 22, 126, 8.5, 8.5),
      span('1', 15, 132, 19.8, 13.1),
      span('章', 22, 155, 8.5, 8.5),
      span('働き方改革の推進などを通じた労働環境の整備など', 23, 181, 9.2, 9.2),
      span('本文の二行目がここにあります', 62, 140, 10, 220),
    ];
    spans[5].height = 212;

    const layout = buildLayout(spans, 595.28, 841.89);
    const chromeTexts = layout.blocks.filter((block) => block.repeated).map((block) => block.text);

    expect(chromeTexts).toEqual(expect.arrayContaining(['第', '1', '章']));
    expect(chromeTexts).toContain('働き方改革の推進などを通じた労働環境の整備など');
    expect(layout.blocks.find((block) => block.text === '本文の一行目がここにあります')?.repeated).toBeUndefined();
  });

  it('does not merge vertical side labels into horizontal text lines', () => {
    const spans: TextSpan[] = [
      { text: '(Version 2)', x: 114, y: 200, width: 45, height: 10, fontSize: 10 },
      { text: 'arXiv:2106.09685v2 [cs.CL] 16 Oct 2021', x: 12, y: 214, width: 20, height: 346, fontSize: 20 },
      span('Abstract body text starts in the main column.', 144, 265, 10, 220),
    ];
    const layout = buildLayout(spans, 612);
    const sidebar = layout.blocks.find((b) => b.text.includes('arXiv'));
    const version = layout.blocks.find((b) => b.text.includes('Version'));

    expect(sidebar?.text).toBe('arXiv:2106.09685v2 [cs.CL] 16 Oct 2021');
    expect(sidebar?.width).toBe(20);
    expect(version?.text).toBe('(Version 2)');
  });
});
