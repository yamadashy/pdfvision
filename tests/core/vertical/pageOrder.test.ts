import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../../src/core/layout/index.js';
import type { TextSpan } from '../../../src/types/index.js';
import { span, verticalGlyphs } from './helpers.js';

function blockTexts(spans: TextSpan[], width: number, height: number): string[] {
  return buildLayout(spans, width, height).blocks.map((block) => block.text);
}

describe('vertical page reading order (#261)', () => {
  it('reads tiers top to bottom and each tier right to left', () => {
    const fontSize = 10;
    const spans = [
      ...verticalGlyphs('上段右側の本文です', 300, 60, fontSize),
      ...verticalGlyphs('上段左側の本文です', 282, 60, fontSize),
      ...verticalGlyphs('下段右側の本文です', 300, 200, fontSize),
      ...verticalGlyphs('下段左側の本文です', 282, 200, fontSize),
    ];
    expect(blockTexts(spans, 400, 400)).toEqual([
      '上段右側の本文です\n上段左側の本文です',
      '下段右側の本文です\n下段左側の本文です',
    ]);
  });

  it('reads a title column set apart from the text first, then the text right to left', () => {
    const fontSize = 12;
    const spans = [
      ...verticalGlyphs('法律案の題名を一行で置く', 380, 128, fontSize),
      ...verticalGlyphs('本文の第一行目がここに入る文章', 330, 92, fontSize),
      ...verticalGlyphs('本文の第二行目がここに入る文章', 309, 92, fontSize),
      span('一', 300, 380, 10, 10),
    ];
    expect(blockTexts(spans, 420, 400)).toEqual([
      '法律案の題名を一行で置く',
      '本文の第一行目がここに入る文章\n本文の第二行目がここに入る文章',
      '一',
    ]);
  });

  it('reads the right page of a vertical spread before the left, and the page numbers after the text', () => {
    const fontSize = 9;
    const spans = [
      ...verticalGlyphs('右頁一行目の本文がここに', 600, 80, fontSize),
      ...verticalGlyphs('右頁二行目の本文がここに', 584, 80, fontSize),
      ...verticalGlyphs('左頁一行目の本文がここに', 300, 80, fontSize),
      ...verticalGlyphs('左頁二行目の本文がここに', 284, 80, fontSize),
      span('一二五', 40, 300, 7.5, 22.5),
      span('一二四', 560, 300, 7.5, 22.5),
    ];
    expect(blockTexts(spans, 700, 400)).toEqual([
      '右頁一行目の本文がここに\n右頁二行目の本文がここに',
      '左頁一行目の本文がここに\n左頁二行目の本文がここに',
      '一二四',
      '一二五',
    ]);
  });

  it('keeps a larger heading column apart from the body it heads', () => {
    const spans = [
      ...verticalGlyphs('灯台守の手紙', 400, 110, 14),
      ...verticalGlyphs('港の時計台が午後を打った', 378, 84, 9),
      ...verticalGlyphs('りいくらか弱まり沖のほう', 362, 75, 9),
    ];
    expect(blockTexts(spans, 500, 400)).toEqual(['灯台守の手紙', '港の時計台が午後を打った\nりいくらか弱まり沖のほう']);
  });

  it('starts each column of tall runs with the item number standing above it', () => {
    // Columns arrive as one tall span each; the item numbers 一 二 三 sit on
    // one y above three neighbouring columns and would otherwise form one line.
    const tall = (text: string, x: number) => ({ ...span(text, x, 120, 14, 14), height: [...text].length * 14 });
    const spans = [
      tall('第二十五条の二次の各号のいずれかに該当する者', 300),
      tall('第二十一条第一項の規定に違反して寄附をした者', 266),
      tall('第二十一条第一項の規定に違反してあつせんをした者', 232),
      tall('第二十一条第二項の規定に違反して勧誘した者', 198),
      span('一', 266, 92, 14, 14),
      span('二', 232, 92, 14, 14),
      span('三', 198, 92, 14, 14),
    ];
    const lines = buildLayout(spans, 400, 800).blocks.flatMap((block) => block.text.split('\n'));
    expect(lines).toEqual([
      '第二十五条の二次の各号のいずれかに該当する者',
      '一 第二十一条第一項の規定に違反して寄附をした者',
      '二 第二十一条第一項の規定に違反してあつせんをした者',
      '三 第二十一条第二項の規定に違反して勧誘した者',
    ]);
  });

  it('leaves a horizontal page with one vertical label in horizontal reading order', () => {
    const spans = [
      span('First paragraph of horizontal text runs across the page.', 60, 50, 10, 300),
      span('Second paragraph of horizontal text runs across the page.', 60, 70, 10, 300),
      ...verticalGlyphs('縦書きの見出し', 20, 40, 10),
      span('Third paragraph of horizontal text runs across the page.', 60, 90, 10, 300),
    ];
    const texts = blockTexts(spans, 400, 400);
    const horizontal = texts.filter((text) => /^[A-Z]/u.test(text)).join('\n');
    expect(horizontal.indexOf('First')).toBeLessThan(horizontal.indexOf('Second'));
    expect(horizontal.indexOf('Second')).toBeLessThan(horizontal.indexOf('Third'));
  });
});
