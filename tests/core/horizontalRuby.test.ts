import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../src/core/layout/index.js';
import type { PageFlags } from '../../src/core/processor/pageData.js';
import { extractPageText } from '../../src/core/processor/pageText.js';
import { compileSearch, searchPage } from '../../src/core/search/index.js';
import type { TextSpan } from '../../src/types/index.js';

const PAGE_HEIGHT = 800;

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
  needSpansForSearch: true,
  needSpansForWarnings: false,
  needFormFieldsForSearch: false,
  needAnnotationsForSearch: false,
  needLinksForSearch: false,
};

function textItem(str: string, x: number, y: number, fontSize: number, width = str.length * fontSize) {
  return {
    str,
    width,
    height: fontSize,
    transform: [fontSize, 0, 0, fontSize, x, PAGE_HEIGHT - y - fontSize],
    hasEOL: true,
    fontName: 'g_d0_f1',
  };
}

function span(text: string, x: number, y: number, fontSize: number, width = text.length * fontSize): TextSpan {
  return {
    text,
    x,
    y,
    width,
    height: fontSize,
    fontSize,
  };
}

function extractText(items: unknown[]): string {
  return extractPageText({
    content: { items },
    flags: BASE_FLAGS,
    pageHeight: PAGE_HEIGHT,
    viewMinX: 0,
    viewMinY: 0,
  }).text;
}

describe('horizontal ruby', () => {
  it('merges per-character interleaved ruby across contiguous CJK base glyphs', () => {
    const result = extractText([
      textItem('権', 100, 100, 12, 12),
      textItem('けん', 101, 96, 5, 10),
      textItem('利', 112, 100, 12, 12),
      textItem('り', 116, 96, 5, 5),
      textItem('条', 124, 100, 12, 12),
      textItem('じょう', 124, 96, 5, 12),
      textItem('約', 136, 100, 12, 12),
      textItem('やく', 137, 96, 5, 10),
    ]);

    expect(result).toBe('権利条約《けんりじょうやく》');
  });

  it('merges split horizontal ruby spans that target the same base range', () => {
    const result = extractText([
      textItem('京都', 100, 100, 12, 24),
      textItem('きょ', 100, 96, 5, 24),
      textItem('う', 100, 96, 5, 24),
    ]);

    expect(result).toBe('京都《きょう》');
  });

  it('merges adjacent per-word horizontal ruby and collapses reading whitespace', () => {
    const result = extractText([
      textItem('国民', 100, 100, 12, 24),
      textItem('こくみん', 100, 96, 5, 24),
      textItem('保険', 124, 100, 12, 24),
      textItem('ほ け ん', 124, 96, 5, 24),
    ]);

    expect(result).toBe('国民保険《こくみんほけん》');
  });

  it('attaches pinyin-shaped ruby with tone marks above CJK base glyphs', () => {
    const result = extractText([
      textItem('云', 100, 100, 12, 12),
      textItem('yún', 100, 96, 5, 12),
      textItem('剛', 112, 100, 12, 12),
      textItem('ɡānɡ', 112, 96, 5, 12),
      textItem('女', 124, 100, 12, 12),
      textItem('nǚ', 124, 96, 5, 12),
    ]);

    expect(result).toBe('云剛女《yúnɡānɡnǚ》');
  });

  it('merges split pinyin script-g ruby spans with the same CJK base glyph', () => {
    const result = extractText([
      textItem('長', 100, 100, 12, 12),
      textItem('chán', 96, 96, 5, 16),
      textItem('ɡ', 113, 96, 5, 3),
    ]);

    expect(result).toBe('長《chánɡ》');
  });

  it('leaves small non-kana superscript text untouched', () => {
    const result = extractText([textItem('法律', 100, 100, 12, 24), textItem('fn', 104, 96, 5, 8)]);

    expect(result).toBe('法律\n\nfn');
  });

  it('leaves small English footnote letters above Latin text untouched', () => {
    const result = extractText([textItem('Reference', 100, 100, 12, 90), textItem('a', 104, 96, 6, 4)]);

    expect(result).toBe('Reference\n\na');
  });

  it('leaves one-letter English footnote markers above CJK untouched', () => {
    const result = extractText([textItem('法律', 100, 100, 12, 24), textItem('a', 104, 96, 5, 4)]);

    expect(result).toBe('法律\n\na');
  });

  it('leaves normal-size English words above CJK untouched', () => {
    const result = extractText([textItem('云', 100, 100, 12, 12), textItem('fan', 100, 92, 10, 12)]);

    expect(result).toBe('云\n\nfan');
  });

  it('leaves digit-containing superscript text above CJK untouched', () => {
    const result = extractText([textItem('得', 100, 100, 12, 12), textItem('de2', 101, 96, 5, 10)]);

    expect(result).toBe('得\n\nde2');
  });

  it('leaves kana text above CJK untouched when the size ratio is too large for ruby', () => {
    const result = extractText([textItem('権', 100, 100, 12, 12), textItem('けん', 101, 94, 8, 12)]);

    expect(result).toBe('権\n\nけん');
  });

  it('excludes ambiguous horizontal ruby instead of interleaving it into the base text', () => {
    const result = extractText([
      textItem('国民', 100, 100, 12, 24),
      textItem('よみ', 116, 96, 5, 32),
      textItem('健康', 140, 100, 12, 24),
    ]);

    expect(result).toBe('国民健康');
  });

  it('carries attached horizontal ruby into layout text', () => {
    const layout = buildLayout([
      span('権', 100, 100, 12, 12),
      span('けん', 101, 96, 5, 10),
      span('利', 112, 100, 12, 12),
      span('り', 116, 96, 5, 5),
    ]);

    expect(layout.blocks.map((block) => block.text)).toContain('権利《けんり》');
  });

  it('matches base words through horizontal ruby attachments', () => {
    const compiled = compileSearch(['権利条約', '権利条約《けんりじょうやく》'], {});
    if (!compiled) throw new Error('expected compiled search');

    const matches = searchPage(
      [
        span('権', 100, 100, 12, 12),
        span('けん', 101, 96, 5, 10),
        span('利', 112, 100, 12, 12),
        span('り', 116, 96, 5, 5),
        span('条', 124, 100, 12, 12),
        span('じょう', 124, 96, 5, 12),
        span('約', 136, 100, 12, 12),
        span('やく', 137, 96, 5, 10),
      ],
      undefined,
      1,
      300,
      400,
      compiled,
    );

    expect(matches.map((match) => match.query)).toEqual(['権利条約', '権利条約《けんりじょうやく》']);
    expect(matches[0]).toMatchObject({ text: '権利条約', context: '権利条約' });
    expect(matches[1]).toMatchObject({
      text: '権利条約《けんりじょうやく》',
      context: '権利条約《けんりじょうやく》',
    });
  });
});
