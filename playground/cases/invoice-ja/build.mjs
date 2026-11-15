// A Japanese qualified invoice (適格請求書) as small-business billing software
// prints it on A4: issuer block with a registration number, a red company
// seal stamped over the issuer name, a bordered line-item table with one
// wrapped item name and a discount line, a per-rate tax summary with ※ on
// the reduced-rate items, and the same invoice embedded as XML, as
// e-invoices carry their machine-readable twin.

import { FIXED_DATE } from '../../lib/pdf.mjs';

const R = 'NotoSansJP';
const B = 'NotoSansJP-Bold';

const ISSUER = {
  name: '株式会社みなとテック',
  lines: ['〒105-0011', '東京都港区芝公園九丁目8番7号', 'みなとビル5階', 'TEL 03-0000-1234'],
  registration: 'T9999012345678',
};
const RECIPIENT = { name: '株式会社さくら商事', honorific: '御中', attention: '経理部 ご担当者様' };
const HEADER_FIELDS = [
  ['請求書番号', 'INV-2026-0412'],
  ['発行日', '2026年10月31日'],
  ['お支払期限', '2026年11月30日'],
];
// `lines` is how the item name wraps inside its cell; `reduced` marks 軽減税率 (8%).
const ITEMS = [
  { lines: ['Webサイト保守サービス（2026年10月分）'], qty: 1, unit: '式', price: 120000 },
  { lines: ['クラウドサーバー利用料'], qty: 3, unit: '台', price: 30000 },
  {
    lines: ['業務システム改修（受発注画面の入力項目追加・', '帳票レイアウト変更・結合テスト一式）'],
    qty: 1,
    unit: '式',
    price: 350000,
  },
  { lines: ['会議用弁当（定例打合せ時）'], qty: 12, unit: '個', price: 1080, reduced: true },
  { lines: ['ペットボトル飲料（500ml）'], qty: 24, unit: '本', price: 150, reduced: true },
  { lines: ['値引き（長期契約割引）'], qty: 1, unit: '式', price: -20000 },
];
const BLANK_ROWS = 2;
const BANK = [
  ['金融機関', 'あおば銀行 芝公園支店'],
  ['口座', '普通 1234567'],
  ['口座名義', 'カ）ミナトテック'],
];
const NOTES = ['※印は軽減税率（8%）対象品目です。', 'お振込手数料は貴社にてご負担くださいますようお願い申し上げます。'];

const yen = (n) => (n < 0 ? `-${Math.abs(n).toLocaleString('en-US')}` : n.toLocaleString('en-US'));
const amount = (item) => item.qty * item.price;
const itemName = (item) => `${item.lines.join('')}${item.reduced ? ' ※' : ''}`;
// Invoice rules round tax once per rate, not per line.
const RATES = [
  { label: '10%対象', rate: 10, items: ITEMS.filter((item) => !item.reduced) },
  { label: '8%対象（軽減税率）', rate: 8, items: ITEMS.filter((item) => item.reduced) },
].map((group) => {
  const base = group.items.reduce((sum, item) => sum + amount(item), 0);
  return { ...group, base, tax: Math.floor((base * group.rate) / 100) };
});
const SUBTOTAL = RATES.reduce((sum, group) => sum + group.base, 0);
const TAX = RATES.reduce((sum, group) => sum + group.tax, 0);
const TOTAL = SUBTOTAL + TAX;
const TOTALS = [
  ['小計', SUBTOTAL],
  ['消費税', TAX],
  ['合計', TOTAL],
];

const XML_NAME = 'invoice.xml';
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice number="${HEADER_FIELDS[0][1]}" issueDate="2026-10-31" dueDate="2026-11-30" currency="JPY">
  <Seller registration="${ISSUER.registration}">${ISSUER.name}</Seller>
  <Buyer>${RECIPIENT.name}</Buyer>
${ITEMS.map(
  (item) =>
    `  <Line name="${item.lines.join('')}" quantity="${item.qty}" unitPrice="${item.price}" amount="${amount(item)}" taxRate="${item.reduced ? 8 : 10}"/>`,
).join('\n')}
${RATES.map((group) => `  <TaxSubtotal rate="${group.rate}" taxable="${group.base}" tax="${group.tax}"/>`).join('\n')}
  <Total taxExclusive="${SUBTOTAL}" tax="${TAX}" payable="${TOTAL}"/>
</Invoice>
`;

export const meta = {
  title: 'Japanese invoice (請求書) with seal and embedded XML',
  stresses:
    'CJK key-value header; bordered item table with a wrapped name and a negative line; per-rate tax summary; vector seal over the issuer name; XML attachment',
  status: 'known-gap',
  page: { size: 'A4' },
};

export const truth = `
An A4 請求書 from **${ISSUER.name}** to **${RECIPIENT.name} ${RECIPIENT.honorific}** (${RECIPIENT.attention}).
Issuer block: ${ISSUER.lines.join(' / ')}; 登録番号 \`${ISSUER.registration}\`. A red round seal (vector
outlines, no text) is stamped over the end of the issuer name; it must not hide or garble the name.

${HEADER_FIELDS.map(([key, value]) => `- ${key}: ${value}`).join('\n')}
- ご請求金額: ¥${yen(TOTAL)}（税込） — shown large near the top

| 品名 | 数量 | 単位 | 単価 | 金額 |
| --- | ---: | --- | ---: | ---: |
${ITEMS.map((item) => `| ${itemName(item)} | ${item.qty} | ${item.unit} | ${yen(item.price)} | ${yen(amount(item))} |`).join('\n')}

The third item name wraps onto two lines inside its cell; a correct reading keeps it one item
(\`${ITEMS[2].lines.join('')}\`), not two rows. Two empty ruled rows follow the items.

| 税率区分 | 対象金額（税抜） | 消費税額 |
| --- | ---: | ---: |
${RATES.map((group) => `| ${group.label} | ${yen(group.base)} | ${yen(group.tax)} |`).join('\n')}

${TOTALS.map(([key, value]) => `- ${key}: ${yen(value)}`).join('\n')}

お振込先: ${BANK.map(([key, value]) => `${key} ${value}`).join(' / ')}. 備考: ${NOTES.join(' ')}

Embedded file \`${XML_NAME}\` (application/xml) carries the same invoice; its totals match the page.

## Questions an agent should be able to answer

1. What is the amount billed, tax included? — ¥${yen(TOTAL)}
2. When is payment due? — ${HEADER_FIELDS[2][1]}
3. How much of the invoice is at the reduced 8% rate, and what is the tax on it? — ${yen(RATES[1].base)} taxable, ${yen(RATES[1].tax)} tax
4. What is the issuer's qualified-invoice registration number? — ${ISSUER.registration}
5. What exactly is billed at ${yen(ITEMS[2].price)}? — ${ITEMS[2].lines.join('')}

**Known gap (no issue yet):** in the layout table the second line of the wrapped item name is
merged into the next row: \`${ITEMS[2].lines[0]}\` stays on the ${yen(ITEMS[2].price)} row and
\`${ITEMS[2].lines[1]} ${itemName(ITEMS[3])}\` becomes the name of the ${yen(amount(ITEMS[3]))} row, so
question 5 is answered with a truncated name and the 弁当 row carries text that is not its own.
The page body, which the \`tabular_numeric_layout\` warning tells the reader not to trust for
values, lists the 金額 column as \`120,000 / 350,000 / 90,000\` — out of row order. The same
layout table also absorbs the recipient/issuer header block into its first five rows
(issuer address lines out of order, postcode/TEL/登録番号 missing from the table, present
in the body). Questions 1–4 are answerable from \`read.md\`. Full-width punctuation comes
back NFKC-normalised (\`（\` → \`(\`, \`：\` → \`:\`); that is intended.
`;

const LEFT = 50;
const RIGHT = 545;
// Column edges of the item table: name | qty | unit | unit price | amount.
const COLS = [LEFT, 330, 372, 410, 475, RIGHT];

function cellBox(doc, x1, y1, x2, y2, fill) {
  if (fill) doc.rect(x1, y1, x2 - x1, y2 - y1).fill(fill);
  doc
    .rect(x1, y1, x2 - x1, y2 - y1)
    .lineWidth(0.5)
    .stroke('#555');
  doc.fillColor('black').strokeColor('black');
}

function grid(doc, cols, y1, y2, fill) {
  for (let i = 0; i < cols.length - 1; i++) cellBox(doc, cols[i], y1, cols[i + 1], y2, fill);
}

// The seal is outlines taken from the font's glyphs, the way stamp images
// are vectorised: it shows 之印 but carries no text.
function seal(doc, cx, cy, r) {
  const red = '#d23a2f';
  doc.save();
  doc.opacity(0.85);
  doc.circle(cx, cy, r).lineWidth(1.8).stroke(red);
  doc
    .circle(cx, cy, r - 3)
    .lineWidth(0.6)
    .stroke(red);
  doc.font(B);
  const font = doc._font.font;
  // Vertical seal text: the right column (みなと) reads first, then the left (テック).
  const columns = ['みなと', 'テック'];
  const size = 9.5;
  const scale = size / font.unitsPerEm;
  columns.forEach((column, colIndex) => {
    [...column].forEach((char, rowIndex) => {
      const glyph = font.layout(char).glyphs[0];
      const x = cx + (colIndex === 0 ? 0.5 : -size - 0.5);
      const y = cy - (size * 3) / 2 + rowIndex * size + size * 0.88;
      doc.save();
      doc.translate(x, y).scale(scale, -scale);
      doc.path(glyph.path.toSVG()).fill(red);
      doc.restore();
    });
  });
  doc.restore();
  doc.fillColor('black').strokeColor('black');
}

export function draw(doc, h) {
  h.text('請求書', 297.6, 48, { font: B, size: 22, align: 'center' });

  HEADER_FIELDS.forEach(([key, value], i) => {
    const y = 92 + i * 15;
    h.text(key, 395, y, { font: R, size: 9 });
    h.text(value, RIGHT, y, { font: R, size: 9, align: 'right' });
  });

  h.text(`${RECIPIENT.name}  ${RECIPIENT.honorific}`, LEFT, 96, { font: B, size: 14 });
  h.rule(LEFT, 118, 290, { width: 0.8 });
  h.text(RECIPIENT.attention, LEFT, 124, { font: R, size: 9.5 });
  h.text('下記のとおりご請求申し上げます。', LEFT, 152, { font: R, size: 9.5 });

  doc.rect(LEFT, 172, 240, 34).fill('#eef2f7');
  doc.fillColor('black');
  h.text('ご請求金額', LEFT + 10, 184, { font: R, size: 10 });
  h.text(`¥${yen(TOTAL)}`, LEFT + 200, 178, { font: B, size: 18, align: 'right' });
  h.text('（税込）', LEFT + 202, 186, { font: R, size: 8 });
  h.rule(LEFT, 206, LEFT + 240, { width: 1.2 });

  let y = 150;
  h.text(ISSUER.name, 365, y, { font: B, size: 12 });
  y += 20;
  for (const line of ISSUER.lines) {
    h.text(line, 365, y, { font: R, size: 8.5 });
    y += 12;
  }
  h.text(`登録番号：${ISSUER.registration}`, 365, y + 2, { font: R, size: 8.5 });
  seal(doc, 487, 160, 21);

  // Item table.
  y = 236;
  const headers = ['品名', '数量', '単位', '単価', '金額'];
  grid(doc, COLS, y, y + 18, '#dfe5ee');
  headers.forEach((label, i) => {
    h.text(label, (COLS[i] + COLS[i + 1]) / 2, y + 4, { font: B, size: 9, align: 'center' });
  });
  y += 18;
  for (const item of ITEMS) {
    const height = 8 + item.lines.length * 12;
    grid(doc, COLS, y, y + height);
    item.lines.forEach((line, i) => {
      const suffix = item.reduced && i === item.lines.length - 1 ? ' ※' : '';
      h.text(`${line}${suffix}`, COLS[0] + 5, y + 4 + i * 12, { font: R, size: 9 });
    });
    const mid = y + 4;
    h.text(String(item.qty), COLS[2] - 5, mid, { font: R, size: 9, align: 'right' });
    h.text(item.unit, (COLS[2] + COLS[3]) / 2, mid, { font: R, size: 9, align: 'center' });
    h.text(yen(item.price), COLS[4] - 5, mid, { font: R, size: 9, align: 'right' });
    h.text(yen(amount(item)), COLS[5] - 5, mid, { font: R, size: 9, align: 'right' });
    y += height;
  }
  for (let i = 0; i < BLANK_ROWS; i++) {
    grid(doc, COLS, y, y + 20);
    y += 20;
  }

  // Totals on the right, per-rate breakdown on the left.
  const totalsTop = y + 14;
  TOTALS.forEach(([key, value], i) => {
    const rowTop = totalsTop + i * 20;
    const last = i === TOTALS.length - 1;
    cellBox(doc, 372, rowTop, 450, rowTop + 20, '#dfe5ee');
    cellBox(doc, 450, rowTop, RIGHT, rowTop + 20);
    h.text(key, 411, rowTop + 5, { font: last ? B : R, size: 9, align: 'center' });
    h.text(yen(value), RIGHT - 5, rowTop + 5, { font: last ? B : R, size: 9, align: 'right' });
  });

  const rateCols = [LEFT, 160, 245, 320];
  grid(doc, rateCols, totalsTop, totalsTop + 18, '#dfe5ee');
  ['税率区分', '対象金額（税抜）', '消費税額'].forEach((label, i) => {
    h.text(label, (rateCols[i] + rateCols[i + 1]) / 2, totalsTop + 4, { font: B, size: 8.5, align: 'center' });
  });
  RATES.forEach((group, i) => {
    const rowTop = totalsTop + 18 + i * 20;
    grid(doc, rateCols, rowTop, rowTop + 20);
    h.text(group.label, rateCols[0] + 5, rowTop + 5, { font: R, size: 8.5 });
    h.text(yen(group.base), rateCols[2] - 5, rowTop + 5, { font: R, size: 8.5, align: 'right' });
    h.text(yen(group.tax), rateCols[3] - 5, rowTop + 5, { font: R, size: 8.5, align: 'right' });
  });

  y = totalsTop + 90;
  h.text('【お振込先】', LEFT, y, { font: B, size: 9.5 });
  y += 16;
  for (const [key, value] of BANK) {
    h.text(key, LEFT + 10, y, { font: R, size: 9 });
    h.text(value, LEFT + 70, y, { font: R, size: 9 });
    y += 14;
  }
  y += 12;
  h.text('【備考】', LEFT, y, { font: B, size: 9.5 });
  y += 16;
  for (const note of NOTES) {
    h.text(note, LEFT + 10, y, { font: R, size: 8.5 });
    y += 13;
  }

  doc.file(Buffer.from(XML, 'utf8'), {
    name: XML_NAME,
    type: 'application/xml',
    description: '適格請求書データ (XML)',
    relationship: 'Alternative',
    creationDate: FIXED_DATE,
    modifiedDate: FIXED_DATE,
  });
}
