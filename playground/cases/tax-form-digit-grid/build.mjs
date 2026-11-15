// The first page of a Japanese income-tax return as tax software prints a
// filled one: the form template (ruled digit grids, coloured section bands
// whose labels are stacked one character per line, circled line numbers,
// checkboxes, fine print) drawn first, then the taxpayer's values overlaid,
// one digit per box. Static page content, not AcroForm. All people, places
// and numbers are fictional.

import { verticalColumn } from '../../lib/visualC.mjs';

const R = 'NotoSansJP';
const B = 'NotoSansJP-Bold';

const TITLE = '令和８年分の所得税及び復興特別所得税の確定申告書';
const OFFICE = '緑ヶ丘';
const FILED = { year: '９', month: '３', day: '１０' };
const TAXPAYER = {
  address: '東京都緑ヶ丘市青葉台二丁目１４番３号',
  furigana: 'アオキ　ミサキ',
  name: '青木　美咲',
  myNumber: '417203985610',
  occupation: '会社員',
  birth: '昭和６３年７月２２日',
  phone: '０４２－５５５－０１８７',
  sex: '女',
};
// `code` is the printed line marker; amounts are yen.
const SECTIONS = [
  {
    band: ['収入金額等'],
    color: '#dce8f5',
    rows: [
      { label: '給与', code: 'ア', amount: 6240000 },
      { label: '配当', code: 'イ', amount: 48000 },
      { label: '雑（その他）', code: 'ウ', amount: 135000 },
    ],
  },
  {
    band: ['所得金額等'],
    color: '#dff0e0',
    rows: [
      { label: '給与', code: '①', amount: 4552000 },
      { label: '配当', code: '②', amount: 48000 },
      { label: '雑', code: '③', amount: 95000 },
      { label: '合計（①から③まで）', code: '④', amount: 4695000 },
    ],
  },
  {
    // Too long for one stack: two columns, read right to left.
    band: ['所得から差し', '引かれる金額'],
    color: '#fbe7d4',
    rows: [
      { label: '社会保険料控除', code: '⑤', amount: 912000 },
      { label: '生命保険料控除', code: '⑥', amount: 40000 },
      { label: '基礎控除', code: '⑦', amount: 480000 },
      { label: '合計（⑤から⑦まで）', code: '⑧', amount: 1432000 },
    ],
  },
];
const TAX = {
  band: ['税金の計算'],
  color: '#f8dfe6',
  rows: [
    { label: '課税される所得金額（④－⑧）', code: '⑨', amount: 3263000 },
    { label: '上の⑨に対する税額', code: '⑩', amount: 228800 },
    { label: '配当控除', code: '⑪', amount: 4800 },
    { label: '差引所得税額（⑩－⑪）', code: '⑫', amount: 224000 },
    { label: '復興特別所得税額（⑫×2.1%）', code: '⑬', amount: 4704 },
    { label: '所得税及び復興特別所得税の額', code: '⑭', amount: 228704 },
    { label: '源泉徴収税額', code: '⑮', amount: 251300 },
    { label: '申告納税額（⑭－⑮）', code: '⑯', amount: null },
    { label: '還付される税金', code: '⑰', amount: 22596 },
  ],
};
const ACCOUNT_KINDS = ['普通', '当座', '納税準備', '貯蓄'];
const BANK = { name: 'みどり信用金庫', branch: '青葉台支店', kind: '普通', number: '0381624' };
const FILING_KINDS = ['青色', '分離', '損失', '修正'];
const NOTES = [
  '※ 金額の頭には「￥」を付けないでください。',
  '○ 源泉徴収票など、申告書に添付する書類は、提出又は提示してください。',
  '○ 還付される税金の受取場所は、申告者本人名義の口座に限ります。',
];

const GRID = 9;
const BOX = 13;
const ROW = 19;

const yen = (n) => n.toLocaleString('en-US');
const ALL_ROWS = [...SECTIONS.flatMap((s) => s.rows), ...TAX.rows];
const amountOf = (code) => ALL_ROWS.find((row) => row.code === code).amount;

export const meta = {
  title: 'Tax-return form (確定申告書) with digit grids',
  stresses:
    'one digit per ruled box; coloured section bands with labels stacked one character per line; circled line numbers; レ ticks in checkboxes; furigana above the name; template drawn first, values overlaid after; fine print',
  status: 'ok',
  page: { size: 'A4' },
  families: ['tables', 'vertical-rotated', 'structure'],
  showcase: true,
  hard: 'Every amount is a row of single digits in ruled boxes, overlaid after the template, so nothing but geometry ties a number to its label or its stacked section band.',
};

export const truth = `
An A4 page laid out like the first sheet of a Japanese income-tax return, printed filled in by
tax software: the template (ruled boxes, labels, bands) is drawn first and the taxpayer's values
are overlaid afterwards, each digit centred in its own box. Not an AcroForm. Fictional data.

**${TITLE}** — 提出先 ${OFFICE}税務署長, 提出日 令和${FILED.year}年${FILED.month}月${FILED.day}日.

- 住所: ${TAXPAYER.address}
- フリガナ: ${TAXPAYER.furigana.replace('　', ' ')} (small, above the name) / 氏名: ${TAXPAYER.name.replace('　', ' ')}
- 個人番号: \`${TAXPAYER.myNumber}\` — twelve boxes, one digit each
- 職業: ${TAXPAYER.occupation}; 生年月日: ${TAXPAYER.birth}; 電話番号: ${TAXPAYER.phone}; 性別: ${TAXPAYER.sex} (レ in the 女 box)
- 申告の種類 checkboxes (${FILING_KINDS.join(' / ')}): none ticked

Section bands on the left of each block carry labels stacked one character per line
(${[...SECTIONS, TAX].map((s) => s.band.join('')).join('、')}; the third is two stacked columns read
right to left). Amounts sit right-aligned in ${GRID}-box digit grids with a heavier rule every three
boxes from the right; ⑯ is left empty.

| 区分 | 項目 | 番号 | 金額 |
| --- | --- | --- | ---: |
${[...SECTIONS, TAX]
  .flatMap((s) =>
    s.rows.map(
      (row) => `| ${s.band.join('')} | ${row.label} | ${row.code} | ${row.amount === null ? '' : yen(row.amount)} |`,
    ),
  )
  .join('\n')}

還付される税金の受取場所: ${BANK.name} ${BANK.branch}; 預金の種類 ${ACCOUNT_KINDS.join(' / ')} with レ in
**${BANK.kind}**; 口座番号 \`${BANK.number}\`.

Fine print at the foot: ${NOTES.join(' ')}

A correct reading keeps every amount whole and on its own row label (\`給与 ① 4,552,000\` or the
digits without separators), and never runs the stacked band characters into the row labels.
Circled numbers may come back NFKC-normalised (\`①\` → \`1\`).

## Questions an agent should be able to answer

1. 還付される税金はいくらか。 — ${yen(amountOf('⑰'))}円
2. 所得金額等の合計（④）はいくらか。 — ${yen(amountOf('④'))}円
3. 源泉徴収税額はいくらか。 — ${yen(amountOf('⑮'))}円
4. 還付金はどの口座に振り込まれるか。 — ${BANK.name} ${BANK.branch}、${BANK.kind}預金、口座番号 ${BANK.number}
5. 申告者の氏名の読みは何か。 — ${TAXPAYER.furigana.replace('　', ' ')}

**Current reading (ok, via warnings):** the page body reads the header fields label by label
(\`氏 名\` / \`青木 美咲\`) and the income and deduction rows row by row (\`合計(1から3まで)\` / \`4\` /
\`4 6 9 5 0 0 0\`), except that \`給与 ア\`'s \`6 2 4 0 0 0 0\` comes after \`合計(5から7まで)\`; it used to
follow the drawing order of template and overlay, with every amount far from its label. The layout table pairs most of them correctly — \`| 給与 | ア | 6 2 4 0 0 0 0 | 課税される所得金額(4-8) 9 | | 3 2 6 3 0 0 0 |\`,
\`| 源泉徴収税額 | 15 | 2 5 1 3 0 0 |\`, \`| 還付される税金 | 17 | 2 2 5 9 6 |\` — and the stacked band
labels are rebuilt as words (\`収入金額等\`, \`所得から差し\` / \`引かれる金額\`), never spliced into the
rows. But the 所得金額等 rows ① to ④ lose their labels and line numbers in the table
(\`| | | 4 6 9 5 0 0 0 | …\`), and 申告納税額 ⑯ is missing from it. \`layout_table_uncertain\` says
exactly that (“8 lines with numbers inside the table belong to no row … render that region
(--render-region …) before trusting the table”) and \`dense_vector_graphics\` says to inspect the
render. All five questions are answered from \`read.md\` (\`預金の種類 レ普通\`, \`アオキ ミサキ\`, and
question 2 from the body row \`合計(1から3まで)\` / \`4\` / \`4 6 9 5 0 0 0\`, which the table lacks). Circled numbers come back NFKC-normalised
(\`④\` → \`4\`).
`;

function box(doc, x, y, w, h, { width = 0.5, color = '#d9822b' } = {}) {
  doc.rect(x, y, w, h).lineWidth(width).stroke(color);
}

/** A row of `count` digit boxes; a heavier rule every three boxes from the right. */
function digitGrid(doc, x, y, count, { height = ROW - 4, groups = true } = {}) {
  box(doc, x, y, count * BOX, height, { width: 0.9 });
  for (let i = 1; i < count; i++) {
    const heavy = groups && (count - i) % 3 === 0;
    doc
      .moveTo(x + i * BOX, y)
      .lineTo(x + i * BOX, y + height)
      .lineWidth(heavy ? 0.9 : 0.35);
    if (!heavy) doc.dash(1, { space: 1 });
    doc.stroke('#d9822b');
    doc.undash();
  }
}

/** Digits of `value`, one per box, right-aligned in a grid of `count` boxes. */
function digits(doc, value, x, y, count, { height = ROW - 4, size = 10 } = {}) {
  const chars = [...String(value)];
  const offset = count - chars.length;
  doc.font(R).fontSize(size).fillColor('black');
  chars.forEach((char, i) => {
    const cx = x + (offset + i + 0.5) * BOX;
    const w = doc.widthOfString(char);
    doc.text(char, cx - w / 2, y + (height - size * 1.45) / 2, { lineBreak: false });
  });
}

/** A section with its stacked band label; returns the y below it and the grid positions. */
function sectionTemplate(doc, h, section, x, y, width) {
  const bandW = 20;
  const height = section.rows.length * ROW;
  doc.rect(x, y, bandW, height).fill(section.color);
  doc.fillColor('black');
  box(doc, x, y, width, height, { width: 0.9 });
  const columns = section.band.length;
  const longest = Math.max(...section.band.map((label) => [...label].length));
  const size = Math.min(9, (height - 8) / longest);
  section.band.forEach((label, i) => {
    const cx = x + bandW / 2 + ((columns - 1) / 2 - i) * (size + 1);
    verticalColumn(doc, label, cx, y + (height - [...label].length * size) / 2, { size });
  });
  const grids = [];
  section.rows.forEach((row, i) => {
    const rowY = y + i * ROW;
    if (i > 0)
      doc
        .moveTo(x + bandW, rowY)
        .lineTo(x + width, rowY)
        .lineWidth(0.35)
        .stroke('#d9822b');
    h.text(row.label, x + bandW + 4, rowY + 5, { font: R, size: 7.5 });
    const gridX = x + width - GRID * BOX - 3;
    h.text(row.code, gridX - 8, rowY + 3.5, { font: R, size: 9, align: 'center' });
    digitGrid(doc, gridX, rowY + 2, GRID);
    grids.push({ row, x: gridX, y: rowY + 2 });
  });
  return { bottom: y + height, grids };
}

function checkbox(doc, h, label, x, y) {
  box(doc, x, y, 8, 8, { width: 0.6, color: '#555' });
  h.text(label, x + 10, y - 0.5, { font: R, size: 7.5 });
  return { x, y };
}

export function draw(doc, h) {
  const W = doc.page.width;
  doc.fillColor('#b35d10');
  h.text(TITLE, W / 2, 34, { font: B, size: 13, align: 'center' });
  doc.fillColor('black');

  // Header: office and filing date.
  h.text('税務署長', 120, 66, { font: R, size: 8 });
  h.text('年', 210, 66, { font: R, size: 8 });
  h.text('月', 240, 66, { font: R, size: 8 });
  h.text('日', 270, 66, { font: R, size: 8 });
  h.rule(40, 78, 290, { width: 0.4 });

  // Personal block template.
  const personal = [
    { label: '住　所', y: 86, height: 26 },
    { label: '個人番号', y: 112, height: 22 },
    { label: 'フリガナ', y: 134, height: 14 },
    { label: '氏　名', y: 148, height: 24 },
    { label: '職業・生年月日', y: 172, height: 18 },
    { label: '電話番号', y: 190, height: 18 },
  ];
  for (const field of personal) {
    box(doc, 30, field.y, 535, field.height, { width: 0.7 });
    doc.rect(30, field.y, 60, field.height).fill('#f6ead9');
    box(doc, 30, field.y, 60, field.height, { width: 0.7 });
    doc.fillColor('black');
    h.text(field.label, 35, field.y + field.height / 2 - 5, { font: R, size: 7.5 });
  }
  digitGrid(doc, 96, 115, 12, { height: 16, groups: false });
  const sexBoxes = { 男: checkbox(doc, h, '男', 430, 177), 女: checkbox(doc, h, '女', 460, 177) };
  h.text('申告の種類', 400, 66, { font: R, size: 7.5 });
  FILING_KINDS.forEach((kind, i) => {
    checkbox(doc, h, kind, 448 + i * 30, 66);
  });

  // Main blocks: income and deductions on the left, tax on the right.
  const placed = [];
  let y = 220;
  for (const section of SECTIONS) {
    const { bottom, grids } = sectionTemplate(doc, h, section, 30, y, 266);
    placed.push(...grids);
    y = bottom + 6;
  }
  const tax = sectionTemplate(doc, h, TAX, 300, 220, 265);
  placed.push(...tax.grids);

  // Refund account.
  const bankTop = tax.bottom + 10;
  box(doc, 300, bankTop, 265, 74, { width: 0.9 });
  doc.rect(300, bankTop, 265, 14).fill('#eef3f8');
  doc.fillColor('black');
  h.text('還付される税金の受取場所', 306, bankTop + 2.5, { font: R, size: 7.5 });
  h.text('銀行・金庫・組合', 306, bankTop + 20, { font: R, size: 7 });
  h.text('本店・支店', 440, bankTop + 20, { font: R, size: 7 });
  h.text('預金の種類', 306, bankTop + 40, { font: R, size: 7 });
  const kindBoxes = {};
  ACCOUNT_KINDS.forEach((kind, i) => {
    kindBoxes[kind] = checkbox(doc, h, kind, 350 + i * 50, bankTop + 40);
  });
  h.text('口座番号', 306, bankTop + 58, { font: R, size: 7 });
  digitGrid(doc, 350, bankTop + 55, 7, { height: 15, groups: false });

  // Fine print.
  NOTES.forEach((note, i) => {
    h.text(note, 30, 760 + i * 11, { font: R, size: 6.5 });
  });

  // Overlay: the taxpayer's values, printed after the template.
  h.text(OFFICE, 115, 64, { font: R, size: 10, align: 'right' });
  h.text(FILED.year, 205, 64, { font: R, size: 10, align: 'right' });
  h.text(FILED.month, 235, 64, { font: R, size: 10, align: 'right' });
  h.text(FILED.day, 265, 64, { font: R, size: 10, align: 'right' });
  h.text(TAXPAYER.address, 96, 93, { font: R, size: 10 });
  digits(doc, TAXPAYER.myNumber, 96, 115, 12, { height: 16 });
  h.text(TAXPAYER.furigana, 96, 136, { font: R, size: 7 });
  h.text(TAXPAYER.name, 96, 151, { font: R, size: 13 });
  h.text(TAXPAYER.occupation, 96, 176, { font: R, size: 9 });
  h.text(TAXPAYER.birth, 220, 176, { font: R, size: 9 });
  h.text(TAXPAYER.phone, 96, 194, { font: R, size: 9 });
  const tick = (target) => h.text('レ', target.x + 0.5, target.y - 2.5, { font: B, size: 9 });
  tick(sexBoxes[TAXPAYER.sex]);
  for (const grid of placed) {
    if (grid.row.amount !== null) digits(doc, grid.row.amount, grid.x, grid.y, GRID);
  }
  h.text(BANK.name, 372, bankTop + 19, { font: R, size: 9 });
  h.text(BANK.branch, 485, bankTop + 19, { font: R, size: 9 });
  tick(kindBoxes[BANK.kind]);
  digits(doc, BANK.number, 350, bankTop + 55, 7, { height: 15 });
}
