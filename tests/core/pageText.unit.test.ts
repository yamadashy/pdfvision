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
});
