import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';

// Standard PDF fonts cover WinAnsi only. Cases that need CJK, or symbols such
// as ∇ and −, use this TTF (a devDependency, so no network access) under the
// registered name 'NotoSansJP'; pdfkit embeds only the glyphs a case draws.
const NOTO_SANS_JP = createRequire(import.meta.url).resolve(
  '@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf',
);

// Same pinning as scripts/build-test-fixtures.mjs: a fixed creation date and
// trailer /ID make the output byte-identical across runs, so regenerating a
// case whose drawing did not change leaves the tree clean.
const FIXED_DATE = new Date('2026-01-01T00:00:00Z');
const FIXED_FILE_ID = Buffer.from('pdfvision-playground-case-id!!!!');

/** Render one case to PDF bytes by calling its `draw(doc, helpers)`. */
export async function buildCasePdf(meta, draw) {
  const doc = new PDFDocument({
    size: 'LETTER',
    margin: 0,
    info: {
      Title: meta.title,
      Author: 'pdfvision playground',
      Creator: 'pdfvision',
      CreationDate: FIXED_DATE,
      ModDate: FIXED_DATE,
    },
    autoFirstPage: false,
  });
  // pdfkit derives the trailer /ID from Math.random().
  doc._id = FIXED_FILE_ID;

  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
  });

  doc.registerFont('NotoSansJP', NOTO_SANS_JP);
  doc.addPage();
  await draw(doc, helpers(doc));
  doc.end();
  await done;
  return Buffer.concat(chunks);
}

/**
 * Drawing primitives that place text at exact coordinates. pdfkit's flowing
 * text API wraps and advances a cursor; the cases need geometry they control.
 */
function helpers(doc) {
  // pdfkit places text by the top of its line box; the baseline sits one
  // ascent below that.
  const ascent = (font, size) => {
    doc.font(font).fontSize(size);
    return (doc._font.ascender / 1000) * size;
  };

  const place = (text, x, y, { font = 'Helvetica', size = 10, align = 'left', width } = {}) => {
    doc.font(font).fontSize(size);
    const textWidth = doc.widthOfString(text);
    let left = x;
    if (align === 'right') left = x - textWidth;
    else if (align === 'center') left = x - textWidth / 2;
    doc.text(text, left, y, { lineBreak: false, width });
    return { left, right: left + textWidth, width: textWidth };
  };

  return {
    /** Text whose left edge (align: 'left'), right edge ('right') or centre ('center') is at `x`. */
    text: place,
    /**
     * A run of segments on one baseline. A segment is a string, or an object
     * `{ text }`, `{ sup }` (raised, 65% size) or `{ sub }` (lowered, 65% size),
     * any of which may carry its own `font`. Returns the x after the run.
     */
    run(segments, x, y, { font = 'Helvetica', size = 10 } = {}) {
      doc.font(font).fontSize(size);
      const baseline = y + ascent(font, size);
      let cursor = x;
      for (const segment of segments) {
        const spec = typeof segment === 'string' ? { text: segment } : segment;
        const text = spec.text ?? spec.sup ?? spec.sub;
        const segmentFont = spec.font ?? font;
        const segmentSize = spec.text === undefined ? size * 0.65 : size;
        let shift = 0;
        if (spec.sup !== undefined) shift = -size * 0.38;
        if (spec.sub !== undefined) shift = size * 0.18;
        doc.font(segmentFont).fontSize(segmentSize);
        doc.text(text, cursor, baseline + shift - ascent(segmentFont, segmentSize), { lineBreak: false });
        cursor += doc.widthOfString(text);
      }
      return cursor;
    },
    /** Wrapped prose inside a fixed-width box; returns the y below it. */
    paragraph(text, x, y, width, { font = 'Times-Roman', size = 10, lineGap = 1.5, align = 'left' } = {}) {
      doc.font(font).fontSize(size);
      doc.text(text, x, y, { width, lineGap, align });
      return doc.y;
    },
    rule(x1, y, x2, { width = 0.5 } = {}) {
      doc.moveTo(x1, y).lineTo(x2, y).lineWidth(width).stroke();
    },
  };
}
