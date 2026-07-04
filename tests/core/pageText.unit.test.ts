import { describe, expect, it } from 'vitest';
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

  it('keeps classified ruby out of vertical body text and search spans', () => {
    const result = extractPageText({
      content: {
        items: [
          ...verticalGlyphItems('東京で相当の地位を得たい', 300, 130, 12),
          ...verticalGlyphItems('わた', 312, 154, 6),
          ...verticalGlyphItems('から宜しく頼む', 279, 100, 12),
        ],
      },
      flags: { ...BASE_FLAGS, needSpansForSearch: true },
      pageHeight: 800,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(result.text).toBe('東京で相当の地位を得たいから宜しく頼む');
    expect(result.spans.map((span) => span.text).join('')).toContain('わた');
    expect(result.searchSpans?.map((span) => span.text).join('')).toBe('東京で相当の地位を得たいから宜しく頼む');
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
