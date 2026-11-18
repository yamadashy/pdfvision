import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../../src/core/layout/index.js';
import { isVerticalColumnGlyph } from '../../../src/core/layout/vertical/columnGrowth.js';
import type { TextSpan } from '../../../src/types/index.js';
import { span, verticalGlyphs } from './helpers.js';

/** One column set glyph by glyph; a space in `text` is a blank em box. */
function column(text: string, x: number, y: number, fontSize: number): TextSpan[] {
  const out: TextSpan[] = [];
  Array.from(text).forEach((glyph, index) => {
    if (glyph !== ' ') out.push(span(glyph, x, y + index * fontSize, fontSize, fontSize));
  });
  return out;
}

function verticalLines(spans: TextSpan[], pageWidth = 400): string[] {
  return buildLayout(spans, pageWidth, 400)
    .blocks.filter((block) => block.writingMode === 'vertical')
    .flatMap((block) => block.lines.map((line) => line.text));
}

describe('vertical column growth (#261)', () => {
  it('keeps a 縦中横 number inside its column', () => {
    const fontSize = 9;
    const right = [
      ...column('港の時計台が午後', 300, 80, fontSize),
      // Two digits set across one em box, slightly smaller than the column.
      { text: '11', x: 300.18, y: 80 + 8 * fontSize + 0.75, width: 8.64, height: 7.78, fontSize: 7.78 },
      ...column('時を打ったとき', 300, 80 + 9 * fontSize, fontSize),
    ];
    const left = column('風は昼間よりいくらか弱まり', 284, 80, fontSize);

    expect(verticalLines([...right, ...left])).toEqual([
      '港の時計台が午後11時を打ったとき',
      '風は昼間よりいくらか弱まり',
    ]);
  });

  it('keeps vertical dashes inside their column', () => {
    const fontSize = 9;
    const spans = [...column('宛名は君のお父さんだが――いや、読めばわかる', 300, 80, fontSize)];
    expect(verticalLines([...spans, ...column('封筒の消印は父が灯台を去った年', 284, 80, fontSize)])).toEqual([
      '宛名は君のお父さんだが――いや、読めばわかる',
      '封筒の消印は父が灯台を去った年',
    ]);
  });

  it('reads a blank em box after a column-head number as a space, not a column break', () => {
    const fontSize = 12;
    const spans = [
      ...column('第七条第二項中「三年」を「五年」に改める。', 300, 80, fontSize),
      ...column('3 市町村の教育委員会は、これを公表しなければならない。', 279, 80, fontSize),
      ...column('一 学校教育の関係者', 258, 92, fontSize),
    ];
    expect(verticalLines(spans)).toEqual([
      '第七条第二項中「三年」を「五年」に改める。',
      '3 市町村の教育委員会は、これを公表しなければならない。',
      '一 学校教育の関係者',
    ]);
  });

  it('lets short bracketed columns chain off each other beside the body', () => {
    const fontSize = 10;
    const spans = [
      ...column('第一条 (略)', 300, 60, fontSize),
      ...column('(定義)', 282, 70, fontSize),
      ...column('第二条 この省令において次の各号に掲げる用', 264, 60, fontSize),
    ];
    expect(verticalLines(spans)).toEqual(['第一条 (略)', '(定義)', '第二条 この省令において次の各号に掲げる用']);
  });

  it('keeps a label column standing between two tiers of a column', () => {
    const fontSize = 10;
    const spans = [
      ...column('改正後', 330, 160, fontSize),
      ...column('第一条 (略)', 303, 61, fontSize),
      ...column('第一条 (略)', 303, 301, fontSize),
      ...column('第二条この省令において次の各号に掲げる用', 285, 61, fontSize),
      ...column('第二条この省令において次の各号に掲げる用', 285, 301, fontSize),
    ];
    const lines = verticalLines(spans);
    expect(lines).toContain('改正後');
    expect(lines.filter((line) => line === '第一条 (略)')).toHaveLength(2);
  });

  it('does not join two tiers whose columns meet across a wider gap', () => {
    const fontSize = 10;
    const spans = [
      ...column('この省令において次の各号に掲げる用', 300, 61, fontSize),
      // 2.8 em below the upper tier's last glyph: the next tier, not a blank em box.
      ...column('第二条この省令において', 300, 61 + 17 * fontSize + 28, fontSize),
      ...column('語の意義はそれぞれ当該各号に定める', 282, 61, fontSize),
    ];
    const lines = verticalLines(spans);
    expect(lines).toContain('この省令において次の各号に掲げる用');
    expect(lines).toContain('第二条この省令において');
  });

  it('does not grow a column from the first glyphs of widely spaced horizontal lines', () => {
    const fontSize = 10;
    const body = [
      ...column('本文甲乙丙丁戊己庚辛', 300, 50, fontSize),
      ...column('続篇甲乙丙丁戊己庚辛', 284, 50, fontSize),
    ];
    // Lines 2.2 em apart: every step is a "blank em", so nothing says column.
    const rows = ['表', '見', '出', '項'].map((glyph, index) => span(glyph, 268, 50 + index * 22, fontSize, fontSize));
    const lines = verticalLines([...body, ...rows]);
    expect(lines).toEqual(['本文甲乙丙丁戊己庚辛', '続篇甲乙丙丁戊己庚辛']);
  });

  it('leaves a lone row label beside a single vertical label horizontal', () => {
    const label = verticalGlyphs('所得金額等', 35.5, 297.42, 9);
    const rowLabel = span('雑', 54, 327.2, 7.5, 7.5);
    const rowRest = span('(その他)', 66, 327.2, 7.5, 30);
    const layout = buildLayout([...label, rowLabel, rowRest], 595, 842);
    const vertical = layout.blocks.filter((block) => block.writingMode === 'vertical').map((block) => block.text);
    expect(vertical).toEqual(['所得金額等']);
    expect(layout.blocks.some((block) => block.writingMode !== 'vertical' && block.text.includes('雑'))).toBe(true);
  });

  it('does not take a glyph set flush against horizontal text into a column', () => {
    const fontSize = 10;
    const body = [
      ...column('本文甲乙丙丁戊己庚辛', 300, 50, fontSize),
      ...column('続篇甲乙丙丁戊己庚辛', 284, 50, fontSize),
    ];
    const horizontal = [span('注', 268, 60, fontSize, fontSize), span('記の文章が続く', 278.5, 60, fontSize, 70)];
    expect(verticalLines([...body, ...horizontal])).toEqual(['本文甲乙丙丁戊己庚辛', '続篇甲乙丙丁戊己庚辛']);
  });

  it('does not grow short columns on a mostly horizontal form with a few vertical labels', () => {
    const labels = [...verticalGlyphs('所得から差し', 40.5, 375, 9), ...verticalGlyphs('引かれる金額', 30.5, 375, 9)];
    const prose = Array.from({ length: 8 }, (_, row) =>
      span('横書きの記入欄の説明文がここに長く続いていきます。', 80, 100 + row * 14, 9, 220),
    );
    // A two-glyph stack beside the labels: the ends of horizontal row labels.
    const stray = [span('業', 50, 380, 9, 9), span('雑', 50, 389, 9, 9)];
    const lines = verticalLines([...labels, ...prose, ...stray], 595);
    expect(lines).toEqual(['所得から差し', '引かれる金額']);
  });

  it('keeps an evenly letter-spaced label free of spaces but marks a real blank box', () => {
    const fontSize = 9;
    // Every step leaves half an em: letter spacing, not blank boxes.
    const spaced = Array.from('所得金額等').map((glyph, index) =>
      span(glyph, 300, 100 + index * 13.5, fontSize, fontSize),
    );
    const body = column('本文甲乙丙丁戊己庚辛', 284, 100, fontSize);
    expect(verticalLines([...spaced, ...body])).toEqual(['所得金額等', '本文甲乙丙丁戊己庚辛']);
  });

  it('recognises the glyph shapes a vertical column carries', () => {
    expect(isVerticalColumnGlyph(span('12', 0, 0, 7.78, 8.64))).toBe(true);
    expect(isVerticalColumnGlyph(span('―', 0, 0, 9, 9))).toBe(true);
    expect(isVerticalColumnGlyph(span('(', 0, 0, 9, 9))).toBe(true);
    expect(isVerticalColumnGlyph(span('...', 0, 0, 9, 9))).toBe(true);
    expect(isVerticalColumnGlyph(span('12345', 0, 0, 9, 20))).toBe(false);
    expect(isVerticalColumnGlyph(span('word', 0, 0, 9, 40))).toBe(false);
    expect(isVerticalColumnGlyph(span('漢字', 0, 0, 9, 18))).toBe(false);
  });
});
