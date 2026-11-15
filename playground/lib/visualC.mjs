// Vertical Japanese typesetting (縦組み) for playground cases, done the way
// most real vertical PDFs from DTP and word processors are: every glyph is
// its own horizontal-mode text object placed down the column, columns run
// right to left, and the text is emitted in reading order. Punctuation,
// brackets, the long-vowel mark and ellipses use the font's OpenType `vert`
// variants (the ToUnicode map still says 、「」ー…); Latin runs are turned
// sideways and two-digit numbers are set 縦中横. pdfkit cannot write a
// vertical-mode (Identity-V) font, so that second real-world form is out of
// reach here.

const R = 'NotoSansJP';
// Noto Sans JP's em box sits 0.88 em above the baseline to 0.12 em below.
const EM_TOP = 0.88;
// Glyphs whose `vert` variant does not exist in Noto Sans JP and that real
// vertical setting turns a quarter clockwise instead.
const ROTATED = new Set(['—', '–', '-', '~', '(', ')', '[', ']', ':', ';']);

function placeUpright(doc, char, cx, emTop, size, font) {
  doc.font(font).fontSize(size);
  const top = emTop + EM_TOP * size - (doc._font.ascender / 1000) * size;
  const width = doc.widthOfString(char, { features: ['vert'] });
  doc.text(char, cx - width / 2, top, { lineBreak: false, features: ['vert'] });
}

/** `text` turned 90° clockwise, centred on the column, starting at `emTop`; returns its length down the column. */
function placeSideways(doc, text, cx, emTop, size, font) {
  doc.font(font).fontSize(size);
  const length = doc.widthOfString(text);
  doc.save();
  doc.translate(cx, emTop).rotate(90);
  // Local x runs down the page and local -y towards the right of the column;
  // centre the em box (0.88 above to 0.12 below the baseline) on the column.
  const baseline = size * 0.38;
  doc.text(text, 0, baseline - (doc._font.ascender / 1000) * size, { lineBreak: false });
  doc.restore();
  return length;
}

function placeTateChuYoko(doc, text, cx, emTop, size, font) {
  doc.font(font).fontSize(size);
  let tcySize = size;
  const natural = doc.widthOfString(text);
  if (natural > size * 0.96) tcySize = (size * size * 0.96) / natural;
  doc.fontSize(tcySize);
  const width = doc.widthOfString(text);
  const top = emTop + (size - tcySize) / 2 + EM_TOP * tcySize - (doc._font.ascender / 1000) * tcySize;
  doc.text(text, cx - width / 2, top, { lineBreak: false });
}

/**
 * Set one vertical column centred on `cx`, its first em box starting at
 * `top`. `segments` is a string (one upright glyph per character) or an
 * array of strings and objects:
 *   { tcy: '12' }            縦中横: set horizontally inside one em
 *   { sideways: 'NPO' }      Latin turned 90° clockwise
 *   { ruby: ['灯台', 'とうだい'] }  base glyphs with half-size ruby on the right
 *   { skip: n }              n empty em boxes (indentation)
 * Options: `size`, `font`, `latinFont` (for sideways runs), `pitch` (em
 * advance, default `size`). Returns the y below the last glyph.
 */
export function verticalColumn(doc, segments, cx, top, { size = 10, font = R, latinFont, pitch } = {}) {
  const step = pitch ?? size;
  let y = top;
  const list = typeof segments === 'string' ? [segments] : segments;
  for (const segment of list) {
    if (typeof segment === 'string') {
      for (const char of segment) {
        if (char === '　' || char === ' ') {
          y += step;
          continue;
        }
        if (ROTATED.has(char)) placeSideways(doc, char, cx, y + (step - size) / 2, size, font);
        else placeUpright(doc, char, cx, y, size, font);
        y += step;
      }
    } else if (segment.skip !== undefined) {
      y += segment.skip * step;
    } else if (segment.tcy !== undefined) {
      placeTateChuYoko(doc, segment.tcy, cx, y, size, latinFont ?? font);
      y += step;
    } else if (segment.sideways !== undefined) {
      y += placeSideways(doc, segment.sideways, cx, y, size, latinFont ?? font);
    } else if (segment.ruby !== undefined) {
      const [base, reading] = segment.ruby;
      const baseChars = [...base];
      const readingChars = [...reading];
      const start = y;
      for (const char of baseChars) {
        placeUpright(doc, char, cx, y, size, font);
        y += step;
      }
      // Ruby is centred on its base; a reading longer than the base overhangs evenly.
      const rubySize = size * 0.5;
      const span = baseChars.length * step;
      const rubyPitch = Math.max(rubySize, Math.min(span / readingChars.length, size));
      const rubyTop = start + (span - rubyPitch * readingChars.length) / 2;
      readingChars.forEach((char, i) => {
        placeUpright(
          doc,
          char,
          cx + size / 2 + rubySize / 2 + 0.3,
          rubyTop + i * rubyPitch + (rubyPitch - rubySize) / 2,
          rubySize,
          font,
        );
      });
    }
  }
  return y;
}

/** Number of em boxes a segment list occupies (sideways runs counted by measured length). */
export function verticalLength(doc, segments, { size = 10, font = R, latinFont } = {}) {
  let ems = 0;
  for (const segment of typeof segments === 'string' ? [segments] : segments) {
    if (typeof segment === 'string') ems += [...segment].length;
    else if (segment.skip !== undefined) ems += segment.skip;
    else if (segment.tcy !== undefined) ems += 1;
    else if (segment.ruby !== undefined) ems += [...segment.ruby[0]].length;
    else if (segment.sideways !== undefined) {
      doc.font(latinFont ?? font).fontSize(size);
      ems += doc.widthOfString(segment.sideways) / size;
    }
  }
  return ems;
}

// 行頭禁則: the comma and full stop hang below the column end (ぶら下げ);
// closing brackets, small kana and the long-vowel mark pull the previous
// character over to the next column instead (追い出し).
const HANGING = new Set('、。，．');
const NO_LINE_START = new Set('」』）〕】ゝゞーぁぃぅぇぉっゃゅょァィゥェォッャュョ…');

/**
 * Break a paragraph of plain text into columns of `perColumn` em boxes. The
 * first column starts after `firstIndent` empty boxes and later ones after
 * `restIndent` (字下げ / hanging indentation). Returns an array of column
 * strings including the leading full-width spaces.
 */
export function breakColumns(text, perColumn, { firstIndent = 0, restIndent = 0 } = {}) {
  const chars = [...text];
  const columns = [];
  let i = 0;
  while (i < chars.length) {
    const indent = columns.length === 0 ? firstIndent : restIndent;
    let end = Math.min(i + perColumn - indent, chars.length);
    while (end < chars.length && end - 1 > i && NO_LINE_START.has(chars[end])) end--;
    if (end < chars.length && HANGING.has(chars[end])) end++;
    columns.push('　'.repeat(indent) + chars.slice(i, end).join(''));
    i = end;
  }
  return columns;
}

/**
 * `breakColumns` for a segment list (see `verticalColumn`): ruby groups and
 * 縦中横 numbers never split. Returns one segment list per column.
 */
export function breakSegmentColumns(segments, perColumn, { firstIndent = 0, restIndent = 0 } = {}) {
  const units = [];
  for (const segment of typeof segments === 'string' ? [segments] : segments) {
    if (typeof segment === 'string') for (const char of segment) units.push({ ems: 1, char, segment: char });
    else if (segment.ruby !== undefined) units.push({ ems: [...segment.ruby[0]].length, segment });
    else units.push({ ems: 1, segment });
  }
  const columns = [];
  let i = 0;
  while (i < units.length) {
    const indent = columns.length === 0 ? firstIndent : restIndent;
    let room = perColumn - indent;
    let end = i;
    while (end < units.length && room - units[end].ems >= 0) room -= units[end++].ems;
    while (end < units.length && end - 1 > i && NO_LINE_START.has(units[end].char)) end--;
    if (end < units.length && HANGING.has(units[end].char)) end++;
    const column = indent > 0 ? [{ skip: indent }] : [];
    for (const unit of units.slice(i, end)) {
      const last = column[column.length - 1];
      if (typeof unit.segment === 'string' && typeof last === 'string') column[column.length - 1] = last + unit.segment;
      else column.push(unit.segment);
    }
    columns.push(column);
    i = end;
  }
  return columns;
}

/** The plain text of a segment list; ruby contributes its base only. */
export function segmentText(segments) {
  return (typeof segments === 'string' ? [segments] : segments)
    .map((segment) => {
      if (typeof segment === 'string') return segment;
      if (segment.ruby !== undefined) return segment.ruby[0];
      return segment.tcy ?? segment.sideways ?? '';
    })
    .join('');
}
