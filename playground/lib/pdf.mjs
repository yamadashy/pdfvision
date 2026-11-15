import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';

// Standard PDF fonts cover WinAnsi only. Cases that need CJK, or symbols such
// as ∇ and −, use this TTF (a devDependency, so no network access) under the
// registered names 'NotoSansJP' / 'NotoSansJP-Bold'; pdfkit embeds only the
// glyphs a case draws. assets.mjs scripts register the same files with canvas.
const requireFromHere = createRequire(import.meta.url);
export const NOTO_SANS_JP = requireFromHere.resolve(
  '@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf',
);
export const NOTO_SANS_JP_BOLD = requireFromHere.resolve(
  '@expo-google-fonts/noto-sans-jp/700Bold/NotoSansJP_700Bold.ttf',
);

// Same pinning as scripts/build-test-fixtures.mjs: a fixed creation date and
// trailer /ID make the output byte-identical across runs, so regenerating a
// case whose drawing did not change leaves the tree clean.
export const FIXED_DATE = new Date('2026-01-01T00:00:00Z');
const FIXED_FILE_ID = Buffer.from('pdfvision-playground-case-id!!!!');

/**
 * Render one case to PDF bytes by calling its `draw(doc, helpers)`, then its
 * optional `postprocess(bytes)` (see lib/pdfBytes.mjs).
 * `meta.page` (optional) sets the first page's pdfkit `size` / `layout`;
 * `meta.compress: false` stores every stream uncompressed;
 * `dir` is the case directory, for `helpers.asset`.
 */
export async function buildCasePdf(meta, draw, { dir, postprocess } = {}) {
  const doc = new PDFDocument({
    size: 'LETTER',
    ...meta.page,
    margin: 0,
    compress: meta.compress ?? true,
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
  doc.registerFont('NotoSansJP-Bold', NOTO_SANS_JP_BOLD);
  doc.addPage();
  await draw(doc, helpers(doc, dir));
  doc.end();
  await done;
  const bytes = Buffer.concat(chunks);
  if (!postprocess) return bytes;
  const once = Buffer.from(await postprocess(Buffer.from(bytes)));
  const twice = Buffer.from(await postprocess(Buffer.from(bytes)));
  if (!once.equals(twice)) throw new Error('postprocess is not deterministic: two runs gave different bytes');
  return once;
}

/**
 * Drawing primitives that place text at exact coordinates. pdfkit's flowing
 * text API wraps and advances a cursor; the cases need geometry they control.
 */
function helpers(doc, dir) {
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
    /** Start a new page; `options` (pdfkit `size` / `layout`) default to the first page's. */
    newPage(options = {}) {
      doc.addPage({ ...doc.options, ...options, margin: 0 });
    },
    /**
     * Store the current page with `/Rotate 90` (shown turned clockwise, as a
     * landscape page in a portrait document) and switch to the coordinates a
     * reader sees: origin top-left of the turned page, y down. Returns the
     * displayed `{ width, height }`.
     */
    rotateClockwise() {
      const { width, height } = doc.page;
      doc.page.dictionary.data.Rotate = 90;
      doc.transform(0, -1, 1, 0, 0, height);
      return { width: height, height: width };
    },
    /** Run `fn` with text render mode 3 (invisible), as an OCR text layer is drawn. */
    invisible(fn) {
      doc.save();
      doc.addContent('3 Tr');
      fn();
      doc.restore();
    },
    /** Bytes of a committed file under the case's `assets/` directory. */
    asset(name) {
      if (!dir) throw new Error('helpers.asset needs the case directory');
      return readFileSync(join(dir, 'assets', name));
    },
  };
}
