// A city notice in "easy Japanese" (やさしい日本語) for foreign residents,
// set horizontally with furigana over every kanji word: the ruby is half
// size, centred over its base, on its own baseline in the gap between
// lines. Titles and a small table carry ruby too. Municipal notices, school
// letters and children's books are set this way.

const W = 595;
const R = 'NotoSansJP';
const B = 'NotoSansJP-Bold';

// Markup: {base|reading} is ruby.
const TITLE = '{燃|も}えるごみを{出|だ}す{日|ひ}が{変|か}わります';
const PARAGRAPHS = [
  '2027{年|ねん}4{月|がつ}から、{北町|きたまち}と{南町|みなみまち}の{燃|も}えるごみの{日|ひ}が{変|か}わります。',
  'ごみは{朝|あさ}8{時|じ}までに、{決|き}められた{場所|ばしょ}に{出|だ}してください。{前|まえ}の{日|ひ}の{夜|よる}に{出|だ}さないでください。',
  'わからないことは、{市役所|しやくしょ}の{清掃課|せいそうか}に{電話|でんわ}してください。{英語|えいご}と{中国語|ちゅうごくご}でも{話|はな}せます。',
];
const TABLE_HEAD = ['{地区|ちく}', '{今|いま}', '2027{年|ねん}4{月|がつ}から'];
const TABLE_ROWS = [
  ['{北町|きたまち}', '{月曜日|げつようび}と{木曜日|もくようび}', '{火曜日|かようび}と{金曜日|きんようび}'],
  ['{南町|みなみまち}', '{火曜日|かようび}と{金曜日|きんようび}', '{月曜日|げつようび}と{木曜日|もくようび}'],
  ['{東町|ひがしまち}', '{水曜日|すいようび}と{土曜日|どようび}', '{変|か}わりません'],
];
const CONTACT = '{清掃課|せいそうか}　{電話|でんわ} 0120-555-374（{平日|へいじつ} 9:00〜17:00）';

export const meta = {
  title: 'City notice in easy Japanese (やさしい日本語) with furigana over every kanji',
  stresses:
    'horizontal text with half-size ruby centred over each kanji word on its own baseline between lines; ruby in the title and in table cells; readings longer than their base; times and phone numbers next to ruby',
  status: 'ok',
  showcase: true,
  hard: 'Every kanji word carries half-size kana on a baseline of its own between the text lines, so a reader that groups text by baseline emits a line of stray kana above every line, or splices the readings into the sentence.',
  families: ['scripts', 'structure'],
  page: { size: 'A4' },
};

const parse = (markup) =>
  [...markup.matchAll(/\{([^|}]+)\|([^}]+)\}|([^{]+)/gu)].map((m) => (m[1] ? { ruby: [m[1], m[2]] } : m[3]));
const plain = (markup) =>
  parse(markup)
    .map((s) => (typeof s === 'string' ? s : s.ruby[0]))
    .join('');
const withRuby = (markup) =>
  parse(markup)
    .map((s) => (typeof s === 'string' ? s : `${s.ruby[0]}（${s.ruby[1]}）`))
    .join('');

export const truth = `
One A4 page. The running text, without the ruby:

**${plain(TITLE)}**

${PARAGRAPHS.map(plain).join('\n\n')}

| ${TABLE_HEAD.map(plain).join(' | ')} |
| --- | --- | --- |
${TABLE_ROWS.map((row) => `| ${row.map(plain).join(' | ')} |`).join('\n')}

${plain(CONTACT)}

Every kanji word carries furigana above it, e.g. ${withRuby(PARAGRAPHS[2])}. A good reading keeps
the base text intact and either drops the ruby or attaches it to its base; it must not insert the
kana into the sentence or emit them as lines of their own between the lines of text.

## Questions an agent should be able to answer

1. When does the collection day change, and for which districts? — From April 2027, for 北町 and 南町
2. What will 北町's burnable-garbage days be from April 2027? — 火曜日と金曜日 (Tuesday and Friday)
3. By what time must the garbage be put out? — By 8 a.m. on collection day (not the night before)
4. What phone number should residents call, and when? — 0120-555-374, weekdays 9:00–17:00 (清掃課)
5. How is 清掃課 read? — せいそうか

**Reads correctly:** every ruby run is attached to its base in place (\`燃《も》えるごみを出《だ》す…\`,
\`市役所《しやくしょ》の清掃課《せいそうか》に電話《でんわ》してください\`), no kana line is emitted between
the text lines, and the table reads row by row, one cell per line (\`北町《きたまち》\` /
\`月曜日《げつようび》と木曜日《もくようび》\` / \`火曜日《かようび》と金曜日《きんようび》\`). All five questions are
answered from \`read.md\`. Where a reading is wider than its base the base is set apart, and that gap
comes back as a space (\`北町《きたまち》と 南町《みなみまち》\`); it does not change the meaning.
`;

function rubyRun(doc, h, markup, x, y, { size = 12, font = R } = {}) {
  let cursor = x;
  const rubySize = size * 0.5;
  for (const segment of parse(markup)) {
    if (typeof segment === 'string') {
      cursor = h.text(segment, cursor, y, { font, size }).right;
      continue;
    }
    const [base, reading] = segment.ruby;
    doc.font(font).fontSize(size);
    const baseWidth = doc.widthOfString(base);
    doc.font(R).fontSize(rubySize);
    const readingWidth = doc.widthOfString(reading);
    // A reading wider than its base pushes the base apart (肩付きでなく中付き, with spacing).
    const span = Math.max(baseWidth, readingWidth);
    const baseLeft = cursor + (span - baseWidth) / 2;
    h.text(base, baseLeft, y, { font, size });
    h.text(reading, cursor + span / 2, y - rubySize - 1, { font: R, size: rubySize, align: 'center' });
    cursor += span;
  }
  return cursor;
}

export function draw(doc, h) {
  doc.rect(40, 40, W - 80, 64).fill('#e3f2fd');
  doc.fillColor('black');
  rubyRun(doc, h, TITLE, 60, 62, { size: 22, font: B });

  let y = 140;
  for (const paragraph of PARAGRAPHS) {
    // Break by hand at a ruby-safe point when the paragraph is too wide.
    const segments = parse(paragraph);
    const lines = [[]];
    let width = 0;
    doc.font(R).fontSize(13);
    for (const segment of segments) {
      const pieces = typeof segment === 'string' ? [...segment] : [segment];
      for (const piece of pieces) {
        const w =
          typeof piece === 'string'
            ? doc.widthOfString(piece)
            : Math.max(doc.widthOfString(piece.ruby[0]), doc.fontSize(6.5).widthOfString(piece.ruby[1]));
        doc.fontSize(13);
        if (width + w > W - 140) {
          lines.push([]);
          width = 0;
        }
        lines[lines.length - 1].push(piece);
        width += w;
      }
    }
    for (const line of lines) {
      const markup = line.map((p) => (typeof p === 'string' ? p : `{${p.ruby[0]}|${p.ruby[1]}}`)).join('');
      rubyRun(doc, h, markup, 70, y, { size: 13 });
      y += 30;
    }
    y += 12;
  }

  // Table with ruby in the cells.
  y += 6;
  const cols = [70, 170, 330];
  const widths = [100, 160, 195];
  const rowH = 36;
  doc.lineWidth(0.7);
  for (let r = 0; r <= TABLE_ROWS.length; r++) {
    const top = y + r * rowH;
    if (r === 0) doc.rect(cols[0], top, 455, rowH).fill('#fff3e0');
    doc.fillColor('black');
    const cells = r === 0 ? TABLE_HEAD : TABLE_ROWS[r - 1];
    cells.forEach((cell, c) => {
      doc.rect(cols[c], top, widths[c], rowH).stroke();
      rubyRun(doc, h, cell, cols[c] + 10, top + 15, { size: 12, font: r === 0 ? B : R });
    });
  }
  y += (TABLE_ROWS.length + 1) * rowH + 40;

  h.text('お問い合わせ', 70, y, { font: B, size: 11 });
  rubyRun(doc, h, CONTACT, 70, y + 24, { size: 12 });
}
