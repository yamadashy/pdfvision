// A two-page personal bank statement: a summary box, then a transaction
// table with no vertical rules and zebra-striped rows, where every row has
// either a withdrawal or a deposit (the other cell empty) and a running
// balance, some descriptions wrap onto a second line with a reference, and
// the table continues on page 2 under a repeated header after a "Balance
// brought forward" row. The balances are computed from the amounts, so the
// statement is internally consistent.

const W = 612;
const F = 'Helvetica';
const FB = 'Helvetica-Bold';

const OPENING = 2418.37;
// [date, description, second line or '', amount (negative = withdrawal)]
const TX = [
  ['Oct 01', 'Rent — Linden Court Lettings', 'Standing order ref LCL-0412', -1150.0],
  ['Oct 01', 'Salary — Harrowgate Instruments Ltd', '', 3285.4],
  ['Oct 03', 'Card purchase — Fenmore Grocers', 'Card ending 7731', -86.12],
  ['Oct 04', 'Direct debit — Northwave Energy', 'Ref NWE 55190023', -94.5],
  ['Oct 07', 'Transfer from J. Okonjo', 'Concert tickets', 60.0],
  ['Oct 08', 'Card purchase — Pelham Rail', '', -42.8],
  ['Oct 10', 'ATM withdrawal — High St branch', '', -100.0],
  ['Oct 12', 'Direct debit — Cobalt Mobile', 'Ref CM-77810', -18.0],
  ['Oct 14', 'Card refund — Pelham Rail', 'Delay repay', 12.4],
  ['Oct 15', 'Card purchase — Fenmore Grocers', 'Card ending 7731', -73.65],
  ['Oct 17', 'Transfer to Savings 40-11-22 88301245', '', -500.0],
  ['Oct 19', 'Card purchase — Thistle & Page Books', '', -24.99],
  ['Oct 21', 'Direct debit — Brook Valley Water', 'Ref BVW 1100387', -31.2],
  ['Oct 22', 'Interest paid', '', 1.83],
  ['Oct 24', 'Card purchase — Fenmore Grocers', 'Card ending 7731', -91.07],
  ['Oct 25', 'Faster payment — Marsh Dental Practice', 'Inv 20931', -65.0],
  ['Oct 27', 'Card purchase — Kestrel Fuel', 'Card ending 7731', -58.34],
  ['Oct 28', 'Transfer from HMRC', 'Tax refund 2025-26', 214.6],
  ['Oct 30', 'Card purchase — Lantern Cinema', '', -23.5],
  ['Oct 31', 'Monthly account fee', '', -5.0],
];
const PAGE1_ROWS = 12;

const money = (v) => v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const balances = [];
{
  let running = OPENING;
  for (const t of TX) {
    running = Math.round((running + t[3]) * 100) / 100;
    balances.push(running);
  }
}
const CLOSING = balances[balances.length - 1];
const PAID_OUT = -TX.filter((t) => t[3] < 0).reduce((s, t) => s + t[3], 0);
const PAID_IN = TX.filter((t) => t[3] > 0).reduce((s, t) => s + t[3], 0);

export const meta = {
  title: 'Two-page bank statement with a running balance',
  stresses:
    'transaction table with no vertical rules and zebra-striped rows; every row leaves either Paid out or Paid in empty; running balance column; descriptions wrapping onto a reference line; table continued on page 2 with a repeated header and a balance-brought-forward row; summary box',
  status: 'known-gap',
  families: ['tables', 'structure'],
};

export const truth = `
Two Letter pages. Account holder Ms R. Adeyemi, account 40-11-22 ••••4417, statement period 1–31 October
2026. Summary: opening balance £${money(OPENING)}, paid in £${money(PAID_IN)}, paid out £${money(PAID_OUT)},
closing balance £${money(CLOSING)}.

Transactions (page 1 holds the first ${PAGE1_ROWS}; page 2 starts with *Balance brought forward
£${money(balances[PAGE1_ROWS - 1])}*). Each amount belongs in exactly one of the two amount columns:

| Date | Description | Paid out | Paid in | Balance |
| --- | --- | ---: | ---: | ---: |
${TX.map((t, i) => `| ${t[0]} | ${t[1]}${t[2] ? ` (${t[2]})` : ''} | ${t[3] < 0 ? money(-t[3]) : ''} | ${t[3] > 0 ? money(t[3]) : ''} | ${money(balances[i])} |`).join('\n')}

## Questions an agent should be able to answer

1. How much was the Oct 14 Pelham Rail transaction, and was it money in or out? — £12.40 paid in (a refund)
2. What was the balance after the transfer to savings on Oct 17? — £${money(balances[10])}
3. What was the closing balance, and the balance brought forward to page 2? — £${money(CLOSING)}; £${money(balances[PAGE1_ROWS - 1])}
4. How much was spent at Fenmore Grocers in October? — £${money(86.12 + 73.65 + 91.07)} (86.12 + 73.65 + 91.07)
5. What is the reference of the Northwave Energy direct debit? — NWE 55190023

Questions 2–5 are answerable from \`read.md\`, and page 2 is read well: its rows are a 15 × 5 layout
table with every amount in its own column (\`| Oct 22 | Interest paid | | 1.83 | 3,656.74 |\`), the
wrapped references on rows of their own, and a \`layout_table_uncertain\` warning that names the region.

**Known gap (no issue yet):** page 1 — the same table, under the same header, with twelve rows — is not
detected as a table and nothing warns. Its body gives each row as date / description / one amount /
balance (\`Oct 14\` / \`Card refund — Pelham Rail\` / \`Delay repay\` / \`12.40\` / \`4,284.75\`), so whether
an amount was paid out or paid in is lost; it can only be worked out by differencing consecutive
balances. Question 1 (and any question about the money in or out on page 1, such as the Oct 07
transfer) needs that arithmetic; an agent that sums "the amounts" for spending counts the salary and
the refund too. Some wrapped references are also emitted after the amounts instead of under the
description (\`94.50\` / \`4,373.15\` / \`Ref NWE 55190023\`).
`;

const COLS = { date: 54, desc: 104, out: 410, in: 476, bal: 556 };

function header(doc, h, y) {
  doc.rect(48, y, W - 96, 18).fill('#1b3a5c');
  doc.fillColor('white');
  h.text('Date', COLS.date, y + 5, { font: FB, size: 8.5 });
  h.text('Description', COLS.desc, y + 5, { font: FB, size: 8.5 });
  h.text('Paid out', COLS.out, y + 5, { font: FB, size: 8.5, align: 'right' });
  h.text('Paid in', COLS.in, y + 5, { font: FB, size: 8.5, align: 'right' });
  h.text('Balance', COLS.bal, y + 5, { font: FB, size: 8.5, align: 'right' });
  doc.fillColor('black');
  return y + 22;
}

function rows(doc, h, from, to, y) {
  for (let i = from; i < to; i++) {
    const t = TX[i];
    const height = t[2] ? 26 : 16;
    if (i % 2 === 1) doc.rect(48, y - 3, W - 96, height).fill('#eef2f6');
    doc.fillColor('black');
    h.text(t[0], COLS.date, y, { font: F, size: 8.5 });
    h.text(t[1], COLS.desc, y, { font: F, size: 8.5 });
    if (t[2]) h.text(t[2], COLS.desc + 8, y + 10, { font: F, size: 7.5 });
    h.text(money(Math.abs(t[3])), t[3] < 0 ? COLS.out : COLS.in, y, { font: F, size: 8.5, align: 'right' });
    h.text(money(balances[i]), COLS.bal, y, { font: F, size: 8.5, align: 'right' });
    y += height;
  }
  return y;
}

function chrome(_doc, h, page) {
  h.text('Kingsmere Bank', 48, 36, { font: FB, size: 16 });
  h.text('Current Account statement', 48, 56, { font: F, size: 9 });
  h.text(`Page ${page} of 2`, W - 48, 36, { font: F, size: 8.5, align: 'right' });
  h.text('Kingsmere Bank plc. Registered in England No. 0471182. Calls may be recorded.', W / 2, 760, {
    font: F,
    size: 7,
    align: 'center',
  });
}

export function draw(doc, h) {
  chrome(doc, h, 1);
  h.text('Ms R. Adeyemi', 48, 92, { font: FB, size: 10 });
  ['14 Quarry Mews', 'Ashbourne DE6 2QT'].forEach((l, i) => {
    h.text(l, 48, 106 + i * 12, { font: F, size: 9 });
  });
  const kv = [
    ['Sort code / account', '40-11-22  ••••4417'],
    ['Statement period', '1 Oct 2026 – 31 Oct 2026'],
  ];
  kv.forEach(([k, v], i) => {
    h.text(k, 330, 92 + i * 14, { font: F, size: 8.5 });
    h.text(v, W - 48, 92 + i * 14, { font: FB, size: 8.5, align: 'right' });
  });

  doc
    .lineWidth(0.8)
    .rect(48, 150, W - 96, 52)
    .stroke('#1b3a5c');
  const summary = [
    ['Opening balance', OPENING],
    ['Paid in', PAID_IN],
    ['Paid out', PAID_OUT],
    ['Closing balance', CLOSING],
  ];
  summary.forEach(([k, v], i) => {
    const x = 60 + i * 128;
    h.text(k, x, 160, { font: F, size: 8.5 });
    h.text(`£${money(v)}`, x, 178, { font: FB, size: 12 });
  });

  let y = header(doc, h, 222);
  y = rows(doc, h, 0, PAGE1_ROWS, y);
  h.text('Continued on next page', W - 48, y + 8, { font: 'Helvetica-Oblique', size: 8, align: 'right' });

  h.newPage();
  chrome(doc, h, 2);
  y = header(doc, h, 92);
  h.text('Balance brought forward', COLS.desc, y, { font: FB, size: 8.5 });
  h.text(money(balances[PAGE1_ROWS - 1]), COLS.bal, y, { font: FB, size: 8.5, align: 'right' });
  y += 18;
  y = rows(doc, h, PAGE1_ROWS, TX.length, y);
  doc
    .lineWidth(0.8)
    .moveTo(48, y + 2)
    .lineTo(W - 48, y + 2)
    .stroke();
  h.text('Closing balance', COLS.desc, y + 8, { font: FB, size: 9 });
  h.text(money(CLOSING), COLS.bal, y + 8, { font: FB, size: 9, align: 'right' });
}
