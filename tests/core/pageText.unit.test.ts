import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../src/core/layout/index.js';
import type { PageFlags } from '../../src/core/processor/pageData.js';
import { extractPageText } from '../../src/core/processor/pageText.js';

const BASE_FLAGS: PageFlags = {
  normalize: false,
  geometry: true,
  layout: false,
  imageBoxes: false,
  vectorBoxes: false,
  visualRegions: false,
  formFields: false,
  links: false,
  annotations: false,
  annotationAppearanceHints: false,
  structure: false,
  viewer: false,
  needSpansForSearch: false,
  needSpansForWarnings: false,
  needFormFieldsForSearch: false,
  needAnnotationsForSearch: false,
  needLinksForSearch: false,
};

function textItem(str: string, y: number, width = 80) {
  return {
    str,
    width,
    height: 10,
    transform: [10, 0, 0, 10, 50, 800 - y],
    hasEOL: true,
    fontName: 'g_d0_f1',
  };
}

function positionedTextItem(str: string, x: number, y: number, fontSize: number, width = str.length * fontSize) {
  return {
    str,
    width,
    height: fontSize,
    transform: [fontSize, 0, 0, fontSize, x, 800 - y - fontSize],
    hasEOL: false,
    fontName: 'g_d0_f1',
  };
}

function positionedSpaceItem(x: number, y: number, fontSize: number, width: number) {
  return {
    ...positionedTextItem(' ', x, y, fontSize, width),
    height: 0,
  };
}

function verticalGlyphItem(str: string, x: number, y: number, fontSize: number) {
  return {
    str,
    width: fontSize,
    height: fontSize,
    transform: [fontSize, 0, 0, fontSize, x, 800 - y],
    hasEOL: true,
    fontName: 'g_d0_f1',
    dir: 'ttb',
  };
}

function verticalRunItem(str: string, x: number, y: number, width: number, height: number, fontSize = 10) {
  return {
    str,
    width,
    height,
    transform: [fontSize, 0, 0, fontSize, x, 800 - y],
    hasEOL: true,
    fontName: 'g_d0_f1',
    dir: 'ttb',
  };
}

function verticalGlyphItems(text: string, x: number, y: number, fontSize: number, step = fontSize) {
  return Array.from(text).map((glyph, index) => verticalGlyphItem(glyph, x, y + index * step, fontSize));
}

describe('extractPageText', () => {
  it('emits one public span per retained item without merging or splitting adjacent items', () => {
    const result = extractPageText({
      content: {
        items: [
          positionedTextItem('Whole phrase', 50, 100, 10, 60),
          positionedTextItem('left', 110, 100, 10, 20),
          positionedTextItem('right', 130, 100, 10, 25),
        ],
      },
      flags: BASE_FLAGS,
      pageHeight: 800,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(result.spans).toHaveLength(3);
    expect(result.spans.map((span) => span.text)).toEqual(['Whole phrase', 'left', 'right']);
  });

  it('keeps identical raw text at distinct transforms as distinct public spans', () => {
    const result = extractPageText({
      content: {
        items: [positionedTextItem('repeat', 50, 100, 10, 30), positionedTextItem('repeat', 100, 100, 10, 30)],
      },
      flags: BASE_FLAGS,
      pageHeight: 800,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(result.spans.map(({ text, x }) => ({ text, x }))).toEqual([
      { text: 'repeat', x: 50 },
      { text: 'repeat', x: 100 },
    ]);
  });

  it('deduplicates matching raw item keys and preserves hasEOL from later draws', () => {
    const first = { ...positionedTextItem('same', 50, 100, 10, 20), hasEOL: false };
    const result = extractPageText({
      content: {
        items: [first, { ...first, hasEOL: true }, positionedTextItem('next', 50, 120, 10, 20)],
      },
      flags: BASE_FLAGS,
      pageHeight: 800,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(result.text).toBe('same\n\nnext');
    expect(result.spans.map((span) => span.text)).toEqual(['same', 'next']);
  });

  it('deduplicates before normalization so raw items may normalize to the same public text', () => {
    const first = positionedTextItem('ﬁ', 50, 100, 10, 10);
    const result = extractPageText({
      content: { items: [first, { ...first, str: 'fi' }] },
      flags: { ...BASE_FLAGS, normalize: true },
      pageHeight: 800,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(result.spans.map((span) => span.text)).toEqual(['fi', 'fi']);
  });

  it('omits a standalone positioned whitespace item from public spans', () => {
    const result = extractPageText({
      content: { items: [positionedTextItem('   ', 50, 100, 10, 18)] },
      flags: BASE_FLAGS,
      pageHeight: 800,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(result.spans).toEqual([]);
  });

  it('threads dropped RTL spaces into layout without changing serialized spans', () => {
    const visualGlyphs = ['ل', 'ي', 'م', 'ج', ' ', 'ر', 'ص', 'م'];
    const items = visualGlyphs.map((glyph, index) => ({
      ...positionedTextItem(glyph, index < 4 ? index * 10 : 39.9 + (index - 4) * 10, 100, 10, glyph === ' ' ? 1.6 : 10),
      dir: glyph === ' ' ? 'ltr' : 'rtl',
      hasEOL: index === visualGlyphs.length - 1,
    }));

    const result = extractPageText({
      content: { items },
      flags: BASE_FLAGS,
      pageHeight: 800,
      viewMinX: 0,
      viewMinY: 0,
    });
    const layout = buildLayout(result.spans);

    expect(result.text).toBe('مصر جميل');
    expect(layout.blocks[0].lines[0].text).toBe('مصر جميل');
    expect(JSON.parse(JSON.stringify(result.spans))).toEqual(result.spans);
  });

  it('filters prepress production marks from text and spans', () => {
    const result = extractPageText({
      content: {
        items: [
          textItem('Visible heading', 80, 92),
          textItem('24_JD_fortress balance_10', 24, 128),
          textItem('DRAFT 3/4/24 – TYPESET: 4/7/24r1 v. 24_JD_fortress balance_', 50, 190),
          textItem('4/10/24r1 3:45pm', 16, 78),
          textItem('4/6/25_r1 2:40 pm', 18, 90),
          textItem('4/6/25_r1 Footnote pg #s added 11:15 pm', 30, 170),
          textItem('REV. 4/5/25_r1 v. 25_JD_fortress balance_08', 60, 180),
          textItem('REV. 4/5/25_r1', 62, 48),
          textItem('v. 25_JD_fortress balance_08', 62, 92),
          textItem('**FOOTNOTES –MOVED TO BACK PAGE', 738, 110),
          textItem('Business text', 120, 76),
        ],
      },
      flags: BASE_FLAGS,
      pageHeight: 800,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(result.text).toBe('Visible heading\n\nBusiness text');
    expect(result.spans.map((span) => span.text)).toEqual(['Visible heading', 'Business text']);
  });

  it('strips normalized C0 control-only lines without leaving an empty line', () => {
    const result = extractPageText({
      content: {
        items: [
          { ...textItem('Before', 80), hasEOL: false },
          { ...textItem('\b', 100), hasEOL: false },
          { ...textItem('After', 120), hasEOL: false },
        ],
      },
      flags: { ...BASE_FLAGS, normalize: true },
      pageHeight: 800,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(result.text).toBe('Before\nAfter');
    expect(result.rawText).toBe('Before\n\b\nAfter');
    expect(result.nonPrintableSourceText).toBe('Before\n\b\nAfter');
    expect(result.spans.map((span) => span.text)).toEqual(['Before', 'After']);
  });

  it('attaches classified ruby to its aligned vertical body base', () => {
    const result = extractPageText({
      content: {
        items: [
          ...verticalGlyphItems('私東京で相当の地位を得たい', 300, 100, 12),
          ...verticalGlyphItems('わたくし', 312, 94, 6),
          ...verticalGlyphItems('から宜しく頼む', 279, 100, 12),
        ],
      },
      flags: { ...BASE_FLAGS, needSpansForSearch: true },
      pageHeight: 800,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(result.text).toBe('私《わたくし》東京で相当の地位を得たいから宜しく頼む');
    expect(result.spans.map((span) => span.text).join('')).toContain('わた');
    expect(result.searchSpans?.map((span) => span.text).join('')).toContain('わたくし');
  });

  it('attaches a ruby run after a two-glyph vertical body base', () => {
    const result = extractPageText({
      content: {
        items: [...verticalGlyphItems('甲基基乙丙丁戊', 300, 100, 12), ...verticalGlyphItems('よみ', 312, 117, 6, 10)],
      },
      flags: BASE_FLAGS,
      pageHeight: 800,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(result.text).toBe('甲基基《よみ》乙丙丁戊');
  });

  it('attaches ruby inside a multi-character vertical body span', () => {
    const base = '天地玄黄宇宙洪荒日月盈昃辰宿列張寒来暑往秋収冬蔵雨';
    const rainIndex = Array.from(base).indexOf('雨');
    const result = extractPageText({
      content: {
        items: [
          verticalRunItem(base, 300, 100, 12, Array.from(base).length * 12, 12),
          verticalRunItem('あま', 312, 100 + rainIndex * 12, 6, 12, 6),
          verticalRunItem('やみ', 300, 100 + Array.from(base).length * 12, 12, 24, 12),
        ],
      },
      flags: BASE_FLAGS,
      pageHeight: 800,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(result.text).toContain('雨《あま》やみ');
    expect(result.text).not.toContain('雨あまやみ');
  });

  it('attaches a multi-character ruby run after a multi-character base range inside one body span', () => {
    const result = extractPageText({
      content: {
        items: [
          verticalRunItem('甲朱雀乙丙丁戊己庚辛', 300, 100, 12, 120, 12),
          verticalRunItem('すざく', 312, 112, 6, 24, 6),
        ],
      },
      flags: BASE_FLAGS,
      pageHeight: 800,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(result.text).toBe('甲朱雀《すざく》乙丙丁戊己庚辛');
  });

  it('attaches ruby across single-glyph bases connected to multi-character vertical body spans', () => {
    const result = extractPageText({
      content: {
        items: [
          verticalRunItem('羅生門が、朱', 300, 100, 12, 84, 12),
          verticalRunItem('す', 312, 172, 6, 6, 6),
          verticalGlyphItem('雀', 300, 184, 12),
          verticalRunItem('ざく', 312, 184, 6, 12, 6),
          verticalGlyphItem('大', 300, 196, 12),
          verticalRunItem('おお', 312, 196, 6, 12, 6),
          verticalGlyphItem('路', 300, 208, 12),
          verticalRunItem('じ', 312, 211, 6, 6, 6),
          verticalRunItem('に降る雨音を聞く', 300, 220, 12, 96, 12),
        ],
      },
      flags: BASE_FLAGS,
      pageHeight: 800,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(result.text).toBe('羅生門が、朱雀大路《すざくおおじ》に降る雨音を聞く');
  });

  it('excludes ruby beside a mixed-ASCII vertical body span without mutating the base text', () => {
    const base = '甲乙ABC丙丁戊己';
    const result = extractPageText({
      content: {
        items: [
          verticalRunItem(base, 300, 100, 12, Array.from(base).length * 12, 12),
          verticalRunItem('よみ', 312, 160, 6, 12, 6),
        ],
      },
      flags: BASE_FLAGS,
      pageHeight: 800,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(result.text).toBe(base);
  });

  it('excludes ambiguous ruby overlap inside a multi-character vertical body span', () => {
    const base = '甲乙丙丁戊己庚辛壬癸';
    const result = extractPageText({
      content: {
        items: [verticalRunItem(base, 300, 100, 12, 120, 12), verticalRunItem('よみ', 312, 119, 6, 10, 6)],
      },
      flags: BASE_FLAGS,
      pageHeight: 800,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(result.text).toBe(base);
  });

  it('excludes ambiguous ruby associations instead of guessing a base', () => {
    const result = extractPageText({
      content: {
        items: [
          ...verticalGlyphItems('右側本文甲乙丙丁', 300, 100, 12),
          ...verticalGlyphItems('近接本文甲乙丙丁', 296, 100, 12),
          ...verticalGlyphItems('よみ', 312, 105, 6, 10),
        ],
      },
      flags: BASE_FLAGS,
      pageHeight: 800,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(result.text).toBe('右側本文甲乙丙丁近接本文甲乙丙丁');
    expect(result.text).not.toContain('よみ');
  });

  it('keeps ruby-free vertical body text unchanged', () => {
    const result = extractPageText({
      content: {
        items: [
          ...verticalGlyphItems('東京で相当の地位を得たい', 300, 100, 12),
          ...verticalGlyphItems('から宜しく頼む', 279, 100, 12),
        ],
      },
      flags: BASE_FLAGS,
      pageHeight: 800,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(result.text).toBe('東京で相当の地位を得たい\nから宜しく頼む');
  });

  it('keeps vertical body text continuous when a right-gutter annotation mark interrupts stream order', () => {
    const before = '本文《';
    const after = 'レクイエム》直後にLDが発売';
    const result = extractPageText({
      content: {
        items: [
          ...verticalGlyphItems(before, 300, 100, 10),
          ...verticalGlyphItems('(注%)', 310, 124, 8),
          ...verticalGlyphItems(after, 300, 100 + before.length * 10, 10),
        ],
      },
      flags: BASE_FLAGS,
      pageHeight: 800,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(result.text).toBe(`${before}${after}`);
    expect(result.text).not.toContain('注');
    expect(result.text).not.toContain('レ\nク');
    expect(result.text).not.toContain('L\nD');
  });

  it('keeps ASCII option markers beside false vertical body columns', () => {
    const optionRows = [
      { option: 'p', reading: 'primary', label: '主マーク', y: 100, labelX: 262.26 },
      { option: 's', reading: 'seconday', label: '副マーク', y: 115.94, labelX: 262.26 },
      { option: 'f', reading: 'full', label: '全配置', y: 131.88, labelX: 262.26 },
    ];
    const items: unknown[] = [];
    for (const row of optionRows) {
      items.push(
        { ...positionedTextItem(row.option, 195.98, row.y, 9.96, 5.23), hasEOL: false },
        positionedSpaceItem(201.21, row.y, 9.96, 3.32),
        positionedTextItem('(', 204.53, row.y + 2.99, 6.97, 3.11),
        positionedTextItem('<', 207.64, row.y + 2.99, 6.97, 6.22),
        positionedSpaceItem(213.86, row.y + 2.99, 6.97, 1.33),
        positionedTextItem(row.reading, 215.19, row.y + 2.99, 6.97, row.reading.length * 4.08),
        positionedTextItem(')', 244.41, row.y + 2.99, 6.97, 3.11),
        { ...positionedTextItem(` ${row.label}`, row.labelX, row.y + 0.75, 9.21, 54), hasEOL: true },
      );
    }
    items.push(
      { ...positionedTextItem('F', 195.98, 147.82, 9.96, 5.23), hasEOL: true },
      { ...positionedTextItem('、', 195.23, 162.45, 9.21, 9.21), hasEOL: true },
    );

    const result = extractPageText({
      content: { items },
      flags: BASE_FLAGS,
      pageHeight: 800,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(result.text).toContain('p (< primary) 主マーク');
    expect(result.text).not.toContain('pprimary)');
  });

  it('joins context-supported short vertical ellipsis columns in page text', () => {
    const result = extractPageText({
      content: {
        items: [
          ...verticalGlyphItems('右側本文甲乙丙丁', 300, 100, 12),
          ...verticalGlyphItems('それとも……', 279, 124, 12),
          ...verticalGlyphItems('左側本文甲乙丙丁', 258, 100, 12),
        ],
      },
      flags: BASE_FLAGS,
      pageHeight: 800,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(result.text.split('\n')).toEqual(['右側本文甲乙丙丁', 'それとも……', '左側本文甲乙丙丁']);
    expect(result.text).not.toContain('そ\nれ\nと\nも');
  });

  it('stitches tatechuyoko fragments into page text when stream order matches geometry', () => {
    const result = extractPageText({
      content: {
        items: [
          verticalRunItem('昭和', 100, 100, 10, 20),
          verticalRunItem('10', 95, 119, 10, 10),
          verticalRunItem('(1935)年5月、新聞にこんな', 100, 130, 10, 160),
        ],
      },
      flags: BASE_FLAGS,
      pageHeight: 800,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(result.text).toBe('昭和10(1935)年5月、新聞にこんな');
  });
});
