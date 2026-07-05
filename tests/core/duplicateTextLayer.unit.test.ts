import { describe, expect, it } from 'vitest';
import { detectPageWarnings } from '../../src/core/warnings/index.js';
import type { PageResult, TextSpan } from '../../src/types/index.js';

function page(text: string): PageResult {
  return {
    page: 1,
    text,
    charCount: text.length,
    imageCount: 0,
    vectorCount: 0,
    textCoverage: 0.2,
    nonPrintableRatio: 0,
    nonPrintableCount: 0,
    width: 515.91,
    height: 728.5,
    quality: { nativeTextStatus: 'ok' },
  };
}

function span(text: string, y: number, fontName: string, fontSize: number): TextSpan {
  return {
    text,
    x: 60,
    y,
    width: text.length * fontSize,
    height: fontSize,
    fontSize,
    fontName,
  };
}

function duplicateSpans(texts: readonly string[], options: { scale?: number; offset?: number } = {}): TextSpan[] {
  const scale = options.scale ?? 0.9;
  const offset = options.offset ?? 118.5;
  const sourceYs = [110, 198, 244, 286, 332];
  return texts.flatMap((text, index) => {
    const y = sourceYs[index];
    return [span(text, y, 'font1', 10), span(text, y * scale + offset, 'font2', 9)];
  });
}

describe('duplicate_text_layer warning', () => {
  it('flags a J-STAGE-shaped hidden duplicate text layer', () => {
    const texts = [
      '情報検索システムの評価',
      '本研究では検索結果の提示手法',
      '利用者の行動を分析するため',
      '実験結果から有効性を確認',
    ];
    const out = detectPageWarnings(page(texts.join('\n').repeat(2)), { spans: duplicateSpans(texts) });

    const warning = out.find((item) => item.code === 'duplicate_text_layer');
    expect(warning).toMatchObject({ code: 'duplicate_text_layer', severity: 'warning' });
    expect(warning?.message).toContain('scale 0.90');
    expect(warning?.message).toContain('offset 118.5pt');
  });

  it('does not flag repeated texts at inconsistent positions', () => {
    const pairs = [
      [span('Repeated segment alpha', 100, 'font1', 10), span('Repeated segment alpha', 220, 'font2', 9)],
      [span('Repeated segment beta', 200, 'font1', 10), span('Repeated segment beta', 410, 'font2', 9)],
      [span('Repeated segment gamma', 300, 'font1', 10), span('Repeated segment gamma', 460, 'font2', 9)],
    ].flat();

    const out = detectPageWarnings(page(pairs.map((item) => item.text).join('\n')), { spans: pairs });

    expect(out.filter((item) => item.code === 'duplicate_text_layer')).toEqual([]);
  });

  it('requires at least three distinct duplicated runs', () => {
    const texts = ['Repeated segment alpha', 'Repeated segment beta'];
    const out = detectPageWarnings(page(texts.join('\n').repeat(2)), { spans: duplicateSpans(texts) });

    expect(out.filter((item) => item.code === 'duplicate_text_layer')).toEqual([]);
  });

  it('does not flag duplicates with the same font and same size', () => {
    const texts = ['Repeated segment alpha', 'Repeated segment beta', 'Repeated segment gamma'];
    const spans = duplicateSpans(texts).map((item) => ({ ...item, fontName: 'font1', fontSize: 10 }));

    const out = detectPageWarnings(page(texts.join('\n').repeat(2)), { spans });

    expect(out.filter((item) => item.code === 'duplicate_text_layer')).toEqual([]);
  });

  it('requires duplicated text to cover enough of the page text', () => {
    const texts = ['alpha1', 'beta22', 'gamma3'];
    const filler =
      'This page contains a much larger amount of ordinary visible prose that should dominate the character volume. ';
    const out = detectPageWarnings(page(`${texts.join('\n').repeat(2)}\n${filler.repeat(8)}`), {
      spans: duplicateSpans(texts),
    });

    expect(out.filter((item) => item.code === 'duplicate_text_layer')).toEqual([]);
  });
});
