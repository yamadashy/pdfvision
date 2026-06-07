import { decode } from '@toon-format/toon';
import { describe, expect, it } from 'vitest';
import { formatToon } from '../../src/output/toon.js';
import type { DocumentResult, PageResult } from '../../src/types/index.js';

function makePage(overrides: Partial<PageResult> & Pick<PageResult, 'page'>): PageResult {
  return {
    text: '',
    charCount: 0,
    imageCount: 0,
    vectorCount: 0,
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
          vectorCount: 0,
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
          vectorCount: 7,
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
      outline: [
        {
          title: 'Intro',
          type: 'destination',
          target: 'section.1',
          page: 1,
          items: [{ title: 'Website', type: 'url', target: 'https://example.com' }],
        },
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
            vectorCount: 0,
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
            vectorCount: 2,
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

  it('round-trips document and page labels through the TOON data model', () => {
    const result = makeResult({
      pageLabels: ['i', '1'],
      overview: [
        {
          page: 1,
          pageLabel: 'i',
          charCount: 11,
          imageCount: 0,
          vectorCount: 0,
          textCoverage: 0.01,
          nonPrintableRatio: 0,
          nonPrintableCount: 0,
          quality: { nativeTextStatus: 'ok' },
          width: 612,
          height: 792,
        },
      ],
      pages: [makePage({ page: 1, pageLabel: 'i', text: 'hello world', charCount: 11, textCoverage: 0.01 })],
    });

    const decoded = decode(formatToon(result));
    expect(decoded).toEqual(result);
  });

  it('round-trips attachment metadata through the TOON data model', () => {
    const result = makeResult({
      attachments: [{ name: 'supplement.txt', description: 'Extra file', size: 123 }],
    });

    const decoded = decode(formatToon(result));
    expect(decoded).toEqual(result);
  });

  it('round-trips viewer settings through the TOON data model', () => {
    const result = makeResult({
      viewer: {
        pageMode: 'UseOutlines',
        openAction: { type: 'destination', page: 1, target: '[{"name":"Fit"}]' },
        permissions: { flags: [4, 16], allowed: ['print', 'copy'] },
      },
    });

    const decoded = decode(formatToon(result));
    expect(decoded).toEqual(result);
  });

  it('round-trips PDF layers through the TOON data model', () => {
    const result = makeResult({
      layers: {
        name: 'Layer config',
        order: ['4R', { name: 'Nested group', order: ['5R'] }],
        groups: [
          {
            id: '4R',
            name: 'Visible layer',
            visible: true,
            intent: ['View'],
            usage: { viewState: 'ON', printState: 'ON' },
          },
        ],
      },
    });

    const decoded = decode(formatToon(result));
    expect(decoded).toEqual(result);
  });

  it('round-trips tagged PDF structure through the TOON data model', () => {
    const result = makeResult({
      pages: [
        makePage({
          page: 1,
          text: 'hello',
          charCount: 5,
          structure: {
            role: 'Root',
            children: [
              {
                role: 'Figure',
                alt: 'A compass on the cover',
                children: [{ type: 'content', id: 'p1_mc0' }],
              },
            ],
          },
        }),
      ],
    });

    const decoded = decode(formatToon(result));
    expect(decoded).toEqual(result);
  });

  it('round-trips visual regions through the TOON data model', () => {
    const result = makeResult({
      pages: [
        makePage({
          page: 1,
          text: 'figure',
          charCount: 6,
          visualRegions: [
            {
              id: 'p1-vr0',
              kind: 'raster',
              x: 36,
              y: 72,
              width: 240,
              height: 180,
              areaRatio: 0.089,
              sourceCount: 1,
              sources: [{ type: 'imageBox', index: 0 }],
              reason: 'raster image covers 8.9% of the page',
            },
          ],
        }),
      ],
    });

    const decoded = decode(formatToon(result));
    expect(decoded).toEqual(result);
  });

  it('omits optional fields that are undefined instead of emitting them as null', () => {
    // The TOON encoder renders an `undefined` property value as an explicit
    // `null`, while the json formatter (JSON.stringify) drops it. A fresh
    // PageResult carries `image: undefined`; after a cache round-trip the key
    // is gone entirely. formatToon must normalize through the JSON data model
    // so its output matches `-f json` and doesn't flip with cache state.
    const result = makeResult({
      pages: [makePage({ page: 1, text: 'hi', charCount: 2, image: undefined })],
    });
    const out = formatToon(result);
    expect(out).not.toContain('image:');
    // and the absent key must not reappear after decoding
    const decoded = decode(out) as { pages: Record<string, unknown>[] };
    expect('image' in decoded.pages[0]).toBe(false);
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
