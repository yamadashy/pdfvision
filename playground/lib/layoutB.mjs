// Line-level layout helpers for cases that must control exactly which line
// is written when: column flows whose lines are emitted in an interleaved
// order, justified type set one line at a time, and text drawn as glyph
// outlines (paths, no text) the way outlined labels are exported.

/**
 * Break `text` into lines no wider than `width`. `indentOf(i)` (default: the
 * first line indented by `firstIndent`) narrows line `i` from the left.
 */
export function wrapLines(doc, text, { font, size, width, firstIndent = 0, indentOf }) {
  doc.font(font).fontSize(size);
  const indent = indentOf ?? ((i) => (i === 0 ? firstIndent : 0));
  const words = text.split(/\s+/u).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && doc.widthOfString(candidate) > width - indent(lines.length)) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.map((line, i) => ({ text: line, indent: indent(i), last: i === lines.length - 1 }));
}

/**
 * Draw one line at (x, y) — the top of its line box, as helpers.text — and
 * stretch the word spaces to fill `width` when `justify` is set and the line
 * is not a paragraph's last.
 */
export function drawLine(doc, line, x, y, { font, size, width, justify = false, color }) {
  doc.font(font).fontSize(size);
  const left = x + (line.indent ?? 0);
  const available = width - (line.indent ?? 0);
  const gaps = line.text.split(' ').length - 1;
  let wordSpacing = 0;
  if (justify && !line.last && gaps > 0) {
    wordSpacing = Math.max(0, (available - doc.widthOfString(line.text)) / gaps);
  }
  if (color) doc.fillColor(color);
  if (line.lead) {
    doc.font(line.lead.font).fontSize(size);
    doc.text(line.lead.text, x + line.lead.indent, y, { lineBreak: false });
    doc.font(font).fontSize(size);
  }
  doc.text(line.text, left, y, { lineBreak: false, wordSpacing: wordSpacing || undefined });
  if (color) doc.fillColor('black');
}

/**
 * Flow `blocks` through `regions` ({ x, top, bottom, width }, in reading
 * order) and return one placement per line without drawing anything, so a
 * case decides the content-stream order. Each line is broken at the width of
 * the region it lands in, so text runs around insets. A block is { text,
 * font, size, leading, indent?, hang?: { lines, indent }, lead?: { text, font }, gapBefore?,
 * gapAfter?, justify?, color? }. Throws when the text does not fit.
 */
export function flowColumns(doc, blocks, regions) {
  const placements = [];
  let r = 0;
  let y = regions[0].top;
  blocks.forEach((block, blockIndex) => {
    if (y > regions[r].top) y += block.gapBefore ?? 0;
    doc.font(block.font).fontSize(block.size);
    const words = block.text.split(/\s+/u).filter(Boolean);
    let lineIndex = 0;
    while (words.length > 0) {
      while (y + block.leading > regions[r].bottom + 0.01) {
        r += 1;
        if (r >= regions.length) throw new Error(`flowColumns: text does not fit (block ${blockIndex})`);
        y = regions[r].top;
      }
      const region = regions[r];
      let indent = lineIndex === 0 ? (block.indent ?? 0) : 0;
      if (block.hang && lineIndex < block.hang.lines) indent = block.hang.indent;
      let lead;
      if (lineIndex === 0 && block.lead) {
        // A run-in lead ("SUMMARY:", "(a)") in its own font, then the text.
        doc.font(block.lead.font).fontSize(block.size);
        const leadWidth = doc.widthOfString(`${block.lead.text} `);
        doc.font(block.font).fontSize(block.size);
        lead = { text: block.lead.text, font: block.lead.font, indent };
        indent += leadWidth;
      }
      // A run-in lead may leave no room for the first word; the line then carries the lead alone.
      let text = lead && doc.widthOfString(words[0]) > region.width - indent ? '' : words.shift();
      while (text !== '' && words.length > 0 && doc.widthOfString(`${text} ${words[0]}`) <= region.width - indent) {
        text += ` ${words.shift()}`;
      }
      placements.push({
        kind: 'line',
        block: blockIndex,
        lineIndex,
        region: r,
        x: region.x,
        y,
        width: region.width,
        line: { text, indent, last: words.length === 0, lead },
        font: block.font,
        size: block.size,
        justify: block.justify ?? false,
        color: block.color,
      });
      lineIndex += 1;
      y += block.leading;
    }
    y += block.gapAfter ?? 0;
  });
  return placements;
}

export function drawPlacement(doc, p) {
  drawLine(doc, p.line, p.x, p.y, { font: p.font, size: p.size, width: p.width, justify: p.justify, color: p.color });
}

/**
 * Draw `text` as filled glyph outlines from a registered TTF (no text
 * object, so nothing is extractable), with its baseline at `baseline`.
 * `angle` rotates about (x, baseline), in pdfkit's degrees. Returns the
 * advance width.
 */
export function outlineText(
  doc,
  text,
  x,
  baseline,
  { font = 'NotoSansJP', size = 8, color = 'black', align = 'left', angle = 0 } = {},
) {
  doc.font(font);
  const face = doc._font.font;
  const scale = size / face.unitsPerEm;
  const run = face.layout(text);
  const width = run.positions.reduce((sum, p) => sum + p.xAdvance, 0) * scale;
  let left = x;
  if (align === 'center') left = x - width / 2;
  else if (align === 'right') left = x - width;
  doc.save();
  if (angle) doc.rotate(angle, { origin: [x, baseline] });
  let cursor = left;
  run.glyphs.forEach((glyph, i) => {
    doc.save();
    doc.translate(cursor, baseline).scale(scale, -scale);
    doc.path(glyph.path.toSVG()).fill(color);
    doc.restore();
    cursor += run.positions[i].xAdvance * scale;
  });
  doc.restore();
  doc.fillColor('black');
  return width;
}
