import { decode } from '@toon-format/toon';
import { describe, expect, it } from 'vitest';
import { formatToon } from '../../src/output/toon.js';
import type { DocumentResult, PageResult } from '../../src/types/index.js';

function makePage(overrides: Partial<PageResult> & Pick<PageResult, 'page'>): PageResult {
  return {
    text: '',
    charCount: 0,
    imageCount: 0,
    textCoverage: 0,
    nonPrintableRatio: 0,
    nonPrintableCount: 0,
    quality: { nativeTextStatus: 'empty' },
    width: 612,
    height: 792,
    ...overrides,
  };
}

function makeResult(overrides: Partial<DocumentResult> = {}): DocumentResult {
  return {
    file: '/tmp/x.pdf',
    totalPages: 1,
    metadata: { title: null, author: null, subject: null, creator: null },
    pages: [makePage({ page: 1, text: 'hello world', charCount: 11, textCoverage: 0.01 })],
    ...overrides,
  };
}

describe('formatToon', () => {
  it('round-trips losslessly back to the DocumentResult via decode', () => {
    // TOON is only useful here if it stays a drop-in for `-f json`: decoding
    // the encoded string must reproduce the structured result exactly.
    const result = makeResult({
      totalPages: 2,
      metadata: { title: 'My Doc', author: 'Alice', subject: 'Q', creator: 'LaTeX' },
      overview: [
        {
          page: 1,
          charCount: 11,
          imageCount: 0,
          textCoverage: 0.01,
          nonPrintableRatio: 0,
          nonPrintableCount: 0,
          quality: { nativeTextStatus: 'ok' },
          width: 612,
          height: 792,
        },
        {
          page: 2,
          charCount: 0,
          imageCount: 3,
          textCoverage: 0,
          nonPrintableRatio: 0,
          nonPrintableCount: 0,
          quality: { nativeTextStatus: 'empty_but_visual_content' },
          width: 612,
          height: 792,
        },
      ],
      pages: [
        makePage({
          page: 1,
          text: 'hello world',
          charCount: 11,
          textCoverage: 0.01,
          spans: [{ text: 'hello world', x: 10, y: 20, width: 30, height: 12, fontSize: 12, fontName: 'g_d0_f1' }],
        }),
        makePage({ page: 2, imageCount: 3, quality: { nativeTextStatus: 'empty_but_visual_content' } }),
      ],
    });
    const decoded = decode(formatToon(result));
    expect(decoded).toEqual(result);
  });

  it('collapses a uniform spans array into a tabular header declared once', () => {
    const out = formatToon(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: 'Hi',
            charCount: 2,
            spans: [
              { text: 'Hi', x: 10, y: 20, width: 30, height: 12, fontSize: 12, fontName: 'g_d0_f1' },
              { text: 'there', x: 40, y: 20, width: 50, height: 12, fontSize: 12, fontName: 'g_d0_f1' },
            ],
          }),
        ],
      }),
    );
    // The field names appear once in the `[N]{fields}:` header, not on
    // every row — that is where the token savings come from.
    expect(out).toMatch(/spans\[2\]\{text,x,y,width,height,fontSize,fontName\}:/);
    expect(out).toContain('Hi,10,20,30,12,12,g_d0_f1');
    expect(out).toContain('there,40,20,50,12,12,g_d0_f1');
  });

  it('encodes the overview as a tabular block', () => {
    const out = formatToon(
      makeResult({
        totalPages: 2,
        overview: [
          {
            page: 1,
            charCount: 10,
            imageCount: 0,
            textCoverage: 0.1,
            nonPrintableRatio: 0,
            nonPrintableCount: 0,
            quality: { nativeTextStatus: 'ok' },
            width: 612,
            height: 792,
          },
          {
            page: 2,
            charCount: 0,
            imageCount: 5,
            textCoverage: 0.02,
            nonPrintableRatio: 0,
            nonPrintableCount: 0,
            quality: { nativeTextStatus: 'empty_but_visual_content' },
            width: 612,
            height: 792,
          },
        ],
        pages: [makePage({ page: 1, charCount: 10 }), makePage({ page: 2, imageCount: 5 })],
      }),
    );
    expect(out).toMatch(/overview\[2\]/);
  });

  it('produces fewer characters than the pretty-printed JSON on geometry-heavy output', () => {
    // The whole point of the format: on span-dense output (the case the
    // type docs flag as 5–10× the textual length) TOON should be clearly
    // smaller than the indented JSON the json formatter emits.
    const spans = Array.from({ length: 50 }, (_, i) => ({
      text: `tok${i}`,
      x: i,
      y: i * 2,
      width: 10,
      height: 12,
      fontSize: 12,
      fontName: 'g_d0_f1',
    }));
    const result = makeResult({
      pages: [makePage({ page: 1, text: 'body', charCount: 4, spans })],
    });
    const toon = formatToon(result);
    const json = JSON.stringify(result, null, 2);
    expect(toon.length).toBeLessThan(json.length);
  });
});
