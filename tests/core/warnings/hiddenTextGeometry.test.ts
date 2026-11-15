import { createCanvas } from '@napi-rs/canvas';
import PDFDocument from 'pdfkit';
import { describe, expect, it } from 'vitest';
import { collectOpaqueFillTextEvidence, type OpaqueFillTextOps } from '../../../src/core/graphics/opaqueFillText.js';
import { processDocument } from '../../../src/core/processor.js';
import type { PageWarning } from '../../../src/types/index.js';

const LINE = 'Liability under this Agreement shall not exceed USD 250,000 in any contract year.';

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

async function warningsFor(draw: (doc: PDFKit.PDFDocument) => void): Promise<PageWarning[]> {
  const result = await processDocument('memory://hidden-text.pdf', { sourceData: await buildPdf(draw), noCache: true });
  return result.pages[0].warnings ?? [];
}

function codes(warnings: readonly PageWarning[]): string[] {
  return warnings.map((warning) => warning.code);
}

/** x of `prefix`'s end and the width of `word` on LINE drawn at x=72, 11pt Helvetica. */
function wordBox(doc: PDFKit.PDFDocument, word: string): { x: number; width: number } {
  const prefix = LINE.slice(0, LINE.indexOf(word));
  return { x: 72 + doc.widthOfString(prefix), width: doc.widthOfString(word) };
}

function darkPng(): Buffer {
  const canvas = createCanvas(8, 8);
  const context = canvas.getContext('2d');
  context.fillStyle = '#202020';
  context.fillRect(0, 0, 8, 8);
  return canvas.toBuffer('image/png');
}

describe('text_under_opaque_fill per-glyph coverage', () => {
  it('names the covered words when a box hides part of a single text-show line', async () => {
    const warnings = await warningsFor((doc) => {
      doc.text(LINE, 72, 100, { lineBreak: false });
      const { x, width } = wordBox(doc, 'USD 250,000');
      doc.rect(x - 1, 99, width + 2, 13).fill('black');
    });

    const warning = warnings.find((item) => item.code === 'text_under_opaque_fill');
    expect(warning?.severity).toBe('error');
    expect(warning?.message).toContain('1 extracted native text passage is covered');
    expect(warning?.message).toContain('"USD 250,000" (bbox ');
    expect(warning?.message).not.toContain('Liability');
    expect(warning?.message).not.toContain('contract year');
  });

  it('still reports a box over a whole line', async () => {
    const warnings = await warningsFor((doc) => {
      doc.text('Employee SSN: 123-45-6789', 72, 100, { lineBreak: false });
      doc.rect(70, 98, doc.widthOfString('Employee SSN: 123-45-6789') + 4, 15).fill('black');
    });

    expect(warnings.find((item) => item.code === 'text_under_opaque_fill')?.message).toContain(
      '"Employee SSN: 123-45-6789"',
    );
  });

  it('ignores underlines, strike-throughs, a box beside the text, and a box over two letters', async () => {
    const warnings = await warningsFor((doc) => {
      doc.text(LINE, 72, 100, { lineBreak: false });
      const width = doc.widthOfString(LINE);
      doc.rect(72, 110, width, 0.8).fill('black');
      doc.rect(72, 104.5, width, 1).fill('black');
      doc.rect(72 + width + 6, 99, 40, 13).fill('black');
      doc.text('Reference ID', 72, 140, { lineBreak: false });
      doc.rect(72, 139, doc.widthOfString('Re'), 13).fill('black');
    });

    expect(codes(warnings)).not.toContain('text_under_opaque_fill');
  });

  it('ignores a dark banner painted before its text and text repainted over a later box', async () => {
    const warnings = await warningsFor((doc) => {
      doc.rect(60, 95, 300, 20).fill('#102a43');
      doc.fillColor('white').text('Section 4 - Termination', 72, 100, { lineBreak: false });
      doc.fillColor('black').text('Knockout heading text', 72, 160, { lineBreak: false });
      doc.rect(70, 158, 200, 15).fill('black');
      doc.fillColor('white').text('Knockout heading text', 72, 160, { lineBreak: false });
    });

    expect(codes(warnings)).not.toContain('text_under_opaque_fill');
    expect(codes(warnings)).not.toContain('text_matches_background');
  });
});

describe('text_matches_background', () => {
  it('names white text on a white page', async () => {
    const warnings = await warningsFor((doc) => {
      doc.text('Visible clause 4.2 stays readable.', 72, 100, { lineBreak: false });
      doc.fillColor('white').text('Hidden early-termination fee of USD 120,000.', 72, 120, { lineBreak: false });
    });

    const warning = warnings.find((item) => item.code === 'text_matches_background');
    expect(warning?.severity).toBe('error');
    expect(warning?.message).toContain('"Hidden early-termination fee of USD 120,000."');
    expect(warning?.message).not.toContain('Visible clause');
  });

  it('names text matching a known opaque box behind it, and fully transparent text', async () => {
    const warnings = await warningsFor((doc) => {
      doc.rect(60, 90, 400, 30).fill('#336699');
      doc.fillColor('#336699').text('Blue on blue secret', 72, 100, { lineBreak: false });
      doc.save().fillOpacity(0).fillColor('black').text('Transparent secret', 72, 200, { lineBreak: false }).restore();
    });

    const message = warnings.find((item) => item.code === 'text_matches_background')?.message;
    expect(message).toContain('2 extracted native text passages');
    expect(message).toContain('"Blue on blue secret"');
    expect(message).toContain('"Transparent secret"');
  });

  it('ignores ordinary contrast: shaded cells, banners, light watermarks, translucent highlights', async () => {
    const warnings = await warningsFor((doc) => {
      doc.rect(72, 95, 200, 20).fill('#eeeeee');
      doc.fillColor('black').text('Shaded table cell', 76, 100, { lineBreak: false });
      doc.rect(72, 135, 200, 20).fill('#0b3d91');
      doc.fillColor('white').text('White on navy banner', 76, 140, { lineBreak: false });
      doc.rect(72, 175, 200, 20).fill('#ffd400');
      doc.fillColor('#1a1a1a').text('Text on yellow band', 76, 180, { lineBreak: false });
      doc.fillColor('#dddddd').fontSize(30).text('DRAFT WATERMARK', 72, 240, { lineBreak: false });
      doc.fontSize(11).fillColor('black').text('Highlighted sentence', 76, 320, { lineBreak: false });
      doc.save().fillOpacity(0.4).rect(74, 318, 120, 14).fill('#ffff00').restore();
      doc.highlight(74, 340, 120, 14);
    });

    expect(codes(warnings)).not.toContain('text_matches_background');
    expect(codes(warnings)).not.toContain('text_under_opaque_fill');
  });

  it('ignores white text over an image, a gradient, or a non-rectangular dark shape', async () => {
    const warnings = await warningsFor((doc) => {
      doc.image(darkPng(), 60, 90, { width: 300, height: 30 });
      doc.fillColor('white').text('Caption over photo', 72, 100, { lineBreak: false });
      const gradient = doc.linearGradient(60, 150, 360, 150);
      gradient.stop(0, '#000000').stop(1, '#333333');
      doc.rect(60, 140, 300, 30).fill(gradient);
      doc.fillColor('white').text('Caption over gradient', 72, 150, { lineBreak: false });
      doc.roundedRect(60, 190, 300, 30, 8).fill('#111111');
      doc.fillColor('white').text('Caption in rounded badge', 72, 200, { lineBreak: false });
      doc.circle(200, 260, 30).fill('black');
      doc.fillColor('white').text('Dot label', 180, 255, { lineBreak: false });
    });

    expect(codes(warnings)).not.toContain('text_matches_background');
  });

  it('ignores a white halo copy painted under the same visible text', async () => {
    const warnings = await warningsFor((doc) => {
      doc.fillColor('white').text('Map label with halo', 72, 100, { lineBreak: false });
      doc.fillColor('black').text('Map label with halo', 72, 100, { lineBreak: false });
    });

    expect(codes(warnings)).not.toContain('text_matches_background');
  });
});

describe('glyph placement from the operator list', () => {
  const OP = {
    save: 1,
    restore: 2,
    transform: 3,
    formBegin: 4,
    formEnd: 5,
    setGState: 6,
    setFillRGBColor: 7,
    constructPath: 8,
    showText: 9,
    fill: 10,
    beginText: 11,
    setFont: 12,
    setTextMatrix: 13,
    moveText: 14,
    setCharSpacing: 15,
    setHScale: 16,
  } as const;
  const ops: OpaqueFillTextOps = {
    save: OP.save,
    restore: OP.restore,
    transform: OP.transform,
    formBegin: OP.formBegin,
    formEnd: OP.formEnd,
    beginGroup: 90,
    endGroup: 91,
    beginAnnotation: 92,
    endAnnotation: 93,
    beginMarkedContent: 94,
    beginMarkedContentProps: 95,
    endMarkedContent: 96,
    setGState: OP.setGState,
    setFillTransparent: 97,
    constructPath: OP.constructPath,
    clipOps: new Set(),
    fillColorOps: new Set([OP.setFillRGBColor]),
    pathFillOps: new Set([OP.fill]),
    textShowOps: new Set([OP.showText]),
    beginText: OP.beginText,
    setFont: OP.setFont,
    setTextMatrix: OP.setTextMatrix,
    moveText: OP.moveText,
    setCharSpacing: OP.setCharSpacing,
    setHScale: OP.setHScale,
  };
  const glyph = (unicode: string, width = 500) => ({ unicode, width, isSpace: unicode === ' ' });

  it('replays Tm, Td, TJ adjustments, Tc and Tz the way pdf.js paints them', () => {
    const evidence = collectOpaqueFillTextEvidence(
      [
        OP.beginText,
        OP.setFont,
        OP.setTextMatrix,
        OP.moveText,
        OP.setCharSpacing,
        OP.setHScale,
        OP.showText,
        OP.setFillRGBColor,
        OP.constructPath,
      ],
      [
        [],
        ['F1', 10],
        [[1, 0, 0, 1, 100, 700]],
        [20, 0],
        [1],
        [50],
        [[glyph('A'), -1000, glyph('B')]],
        ['#000000'],
        [OP.fill, [[0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 4]], [0, 0, 1, 1]],
      ],
      ops,
      792,
      0,
      0,
    );

    const [a, b] = evidence?.glyphRuns?.[0] ?? [];
    // A: x = 120, advance (500/1000*10 + Tc 1) * Tz 0.5 = 3; TJ -1000 moves +10 * 0.5 = 5.
    expect(a.box.x).toBeCloseTo(120);
    expect(a.box.width).toBeCloseTo(3);
    expect(b.box.x).toBeCloseTo(128);
    // Baseline at y=700 → 92 from the top; the cell runs from descent to ascent.
    expect(a.box.y + a.box.height).toBeCloseTo(92 + 2.2);
  });

  it('leaves runs unplaced when no font size or advance width is known', () => {
    const evidence = collectOpaqueFillTextEvidence(
      [OP.showText, OP.setFillRGBColor, OP.constructPath],
      [
        [[{ unicode: 'S' }, { unicode: 'S' }, { unicode: 'N' }]],
        ['#000000'],
        [OP.fill, [[0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 4]], [0, 0, 1, 1]],
      ],
      ops,
      792,
      0,
      0,
    );

    expect(evidence?.textRuns).toEqual(['SSN']);
    expect(evidence?.glyphRuns).toBeUndefined();
  });
});
