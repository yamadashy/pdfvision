import PDFDocument from 'pdfkit';
import { describe, expect, it } from 'vitest';
import { buildAnnotations } from '../../src/core/annotations/index.js';
import { buildRegionGlyphTextIndex, type RegionGlyphOps } from '../../src/core/graphics/regionGlyphText.js';
import { processDocument } from '../../src/core/processor.js';
import type { PageResult } from '../../src/types/index.js';

const SENTENCE = 'Late payments accrue interest at 1.5% per month until the balance is settled.';

async function buildPdf(draw: (doc: PDFKit.PDFDocument) => void): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: [612, 792], margin: 0 });
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolveDone) => doc.on('end', resolveDone));
  doc.font('Helvetica').fontSize(11).fillColor('black');
  draw(doc);
  doc.end();
  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

async function firstPage(draw: (doc: PDFKit.PDFDocument) => void): Promise<PageResult> {
  const result = await processDocument('memory://markup.pdf', {
    sourceData: await buildPdf(draw),
    noCache: true,
    annotations: true,
    links: true,
  });
  return result.pages[0];
}

/** Box of `word` inside `line` drawn at (x, y) in the current font. */
function wordBox(doc: PDFKit.PDFDocument, line: string, word: string, x: number, y: number) {
  return { x: x + doc.widthOfString(line.slice(0, line.indexOf(word))), y, w: doc.widthOfString(word), h: 13 };
}

describe('text markup annotations report the text they mark', () => {
  it('reads exactly the words under a highlight and a strike-out inside one merged text item', async () => {
    const page = await firstPage((doc) => {
      doc.text(SENTENCE, 72, 100, { lineBreak: false });
      const struck = wordBox(doc, SENTENCE, '1.5% per month', 72, 99);
      doc.strike(struck.x, struck.y, struck.w, struck.h);
      const marked = wordBox(doc, SENTENCE, 'the balance', 72, 99);
      doc.highlight(marked.x, marked.y, marked.w, marked.h);
    });

    const byType = Object.fromEntries((page.annotations ?? []).map((a) => [a.subtype, a]));
    expect(byType.StrikeOut?.markedText).toBe('1.5% per month');
    expect(byType.Highlight?.markedText).toBe('the balance');
  });

  it('reads each of two highlights on consecutive lines without bleeding into the other line', async () => {
    const page = await firstPage((doc) => {
      doc.text('The tenant shall give thirty', 72, 100, { lineBreak: false });
      doc.text('days written notice before leaving.', 72, 114, { lineBreak: false });
      const first = wordBox(doc, 'The tenant shall give thirty', 'thirty', 72, 99);
      const second = wordBox(doc, 'days written notice before leaving.', 'days written notice', 72, 113);
      doc.highlight(first.x, first.y, first.w, first.h);
      doc.highlight(second.x, second.y, second.w, second.h);
    });

    const texts = (page.annotations ?? []).map((annotation) => annotation.markedText);
    expect(texts).toEqual(['thirty', 'days written notice']);
  });

  it('leaves markedText off a highlight over blank space and off non-markup annotations', async () => {
    const page = await firstPage((doc) => {
      doc.text(SENTENCE, 72, 100, { lineBreak: false });
      doc.highlight(72, 300, 120, 13);
      doc.note(72, 99, 20, 13, 'Check the rate');
    });

    expect(page.annotations?.map((annotation) => [annotation.subtype, annotation.markedText])).toEqual([
      ['Text', undefined],
      ['Highlight', undefined],
    ]);
  });

  it('does not double letters drawn twice in place for fake bold', async () => {
    const page = await firstPage((doc) => {
      doc.text('Overdue', 72, 100, { lineBreak: false });
      doc.text('Overdue', 72, 100, { lineBreak: false });
      doc.highlight(72, 99, doc.widthOfString('Overdue'), 13);
    });

    expect(page.annotations?.[0]?.markedText).toBe('Overdue');
  });
});

describe('link text comes from the glyphs inside each link rectangle', () => {
  it('gives side-by-side navigation links their own words', async () => {
    const page = await firstPage((doc) => {
      const items = ['Sustainability', 'Money', 'Podcasts'];
      let x = 72;
      for (const label of items) {
        doc.text(label, x, 100, { lineBreak: false });
        doc.link(x, 99, doc.widthOfString(label), 13, `https://example.test/${label.toLowerCase()}`);
        x += doc.widthOfString(label) + 14;
      }
    });

    expect(page.links?.map((link) => [link.text, link.target])).toEqual([
      ['Sustainability', 'https://example.test/sustainability'],
      ['Money', 'https://example.test/money'],
      ['Podcasts', 'https://example.test/podcasts'],
    ]);
  });

  it('keeps neighbouring words and trailing punctuation out of an inline link', async () => {
    const line = 'Read the Cookie Policy. It changed.';
    const page = await firstPage((doc) => {
      doc.text(line, 72, 100, { lineBreak: false });
      const box = wordBox(doc, line, 'Cookie Policy', 72, 99);
      doc.link(box.x, box.y, box.w, box.h, 'https://example.test/cookies');
    });

    expect(page.links?.[0]?.text).toBe('Cookie Policy');
  });

  it('leaves a link over blank space without text', async () => {
    const page = await firstPage((doc) => {
      doc.text(SENTENCE, 72, 100, { lineBreak: false });
      doc.link(72, 300, 80, 13, 'https://example.test/blank');
    });

    expect(page.links?.[0]?.text).toBeUndefined();
  });
});

describe('buildRegionGlyphTextIndex', () => {
  const ops: RegionGlyphOps = {
    beginText: 1,
    setFont: 2,
    setTextMatrix: 3,
    moveText: 4,
    save: 10,
    restore: 11,
    transform: 12,
    formBegin: 13,
    formEnd: 14,
    beginAnnotation: 15,
    endAnnotation: 16,
    textShowOps: new Set([20]),
  };
  const glyph = (unicode: string, width = 500) => ({ unicode, width, isSpace: unicode === ' ' });

  it('returns nothing for the page when a visible run cannot be placed', () => {
    const index = buildRegionGlyphTextIndex(
      [1, 2, 3, 20, 3, 20],
      [
        [],
        ['F1', 10],
        [[1, 0, 0, 1, 100, 700]],
        [[glyph('A'), glyph('B')]],
        [[1, 0, 0, 1, 100, 680]],
        [[{ unicode: 'C' }]],
      ],
      ops,
      [{ x: 90, y: 80, width: 40, height: 20 }],
      792,
      0,
      0,
    );
    expect(index).toBeUndefined();
  });

  it('joins a two-quad region line by line and spaces words split by kerning gaps', () => {
    const index = buildRegionGlyphTextIndex(
      [1, 2, 3, 20, 3, 20],
      [
        [],
        ['F1', 10],
        [[1, 0, 0, 1, 100, 700]],
        [[glyph('n'), glyph('o'), -400, glyph('w')]],
        [[1, 0, 0, 1, 100, 686]],
        [[glyph('t'), glyph('h'), glyph('e'), glyph('n')]],
      ],
      ops,
      [{ x: 95, y: 80, width: 60, height: 40 }],
      792,
      0,
      0,
    );
    const quads = [
      { x: 99, y: 84, width: 20, height: 12 },
      { x: 99, y: 98, width: 16, height: 12 },
    ];
    expect(index?.textIn(quads)).toBe('no w the');
    expect(index?.textIn([{ x: 300, y: 80, width: 20, height: 20 }])).toBeUndefined();
  });

  const region = { x: 95, y: 80, width: 80, height: 20 };
  const read = (glyphs: unknown[]) =>
    buildRegionGlyphTextIndex(
      [1, 2, 3, 20],
      [[], ['F1', 10], [[1, 0, 0, 1, 100, 700]], [glyphs]],
      ops,
      [region],
      792,
      0,
      0,
    )?.textIn([region]);

  it('keeps a number inside a right-to-left line in its own order', () => {
    // Visual left-to-right order: "2013" then the Arabic word drawn right of it.
    expect(read([glyph('2'), glyph('0'), glyph('1'), glyph('3'), glyph(' '), glyph('ث'), glyph('د'), glyph('ح')])).toBe(
      'حدث 2013',
    );
  });

  it('keeps a combining mark with its base even when it is kerned back over it', () => {
    // ก + ่ (tone mark kerned back over the consonant) + า
    expect(read([glyph('ก'), -500, { unicode: '่', width: 500 }, glyph('า')])).toBe('ก่า');
  });

  it('reads a letter that a subset font draws at the space code as a letter', () => {
    expect(read([glyph('a'), { unicode: 'm', width: 500, isSpace: true }, glyph('p')])).toBe('amp');
  });

  it('ignores text drawn inside annotation appearance streams', () => {
    const index = buildRegionGlyphTextIndex(
      [15, 1, 2, 3, 20, 16, 1, 2, 3, 20],
      [
        [],
        [],
        ['F1', 10],
        [[1, 0, 0, 1, 100, 700]],
        [[glyph('X'), glyph('Y')]],
        [],
        [],
        ['F1', 10],
        [[1, 0, 0, 1, 100, 700]],
        [[glyph('O'), glyph('K')]],
      ],
      ops,
      [{ x: 95, y: 85, width: 30, height: 12 }],
      792,
      0,
      0,
    );
    expect(index?.textIn([{ x: 95, y: 85, width: 30, height: 12 }])).toBe('OK');
  });
});

describe('buildAnnotations markedText', () => {
  it('asks only for text-markup subtypes and passes their quads', () => {
    const asked: number[] = [];
    const annotations = buildAnnotations(
      [
        {
          subtype: 'Squiggly',
          rect: [100, 700, 180, 712],
          quadPoints: [100, 712, 180, 712, 100, 700, 180, 700],
        },
        { subtype: 'Square', rect: [100, 600, 180, 612] },
      ],
      792,
      0,
      0,
      {
        textUnder: (boxes) => {
          asked.push(boxes.length);
          return '  covered words ';
        },
      },
    );
    expect(asked).toEqual([1]);
    expect(annotations.map((annotation) => annotation.markedText)).toEqual(['covered words', undefined]);
  });
});
