// A Japanese supermarket receipt (レシート) saved as PDF from an e-receipt
// app: one 58 mm wide, tall page; item names at the left and prices pushed
// to the right edge; ※ before items taxed at the reduced 8% rate; quantity
// lines (2コ × 単198) under an item; a discount line; the total in large
// type; per-rate taxable amounts and included tax; cash tendered and
// change; a vector barcode at the foot. Prices are tax-inclusive (内税).

const W = 164;
const H = 640;
const R = 'NotoSansJP';
const B = 'NotoSansJP-Bold';

// [name, unitPrice, qty, reduced (8%)]
const ITEMS = [
  ['国産若鶏もも肉', 498, 1, true],
  ['たまご10コ', 258, 1, true],
  ['ほうれん草', 158, 2, true],
  ['食器用洗剤 詰替', 328, 1, false],
  ['ミネラルウォーター2L', 98, 3, true],
  ['ゴミ袋45L 20枚', 248, 1, false],
  ['食パン6枚切', 178, 1, true],
];
const DISCOUNT = { label: '値引（タイムセール）', on: 0, amount: 100 };
const CASH = 3000;

const lineTotal = (item) => item[1] * item[2];
const SUBTOTAL = ITEMS.reduce((s, i) => s + lineTotal(i), 0);
const TOTAL = SUBTOTAL - DISCOUNT.amount;
const REDUCED = ITEMS.filter((i) => i[3]).reduce((s, i) => s + lineTotal(i), 0) - DISCOUNT.amount;
const STANDARD = ITEMS.filter((i) => !i[3]).reduce((s, i) => s + lineTotal(i), 0);
const TAX8 = Math.floor((REDUCED * 8) / 108);
const TAX10 = Math.floor((STANDARD * 10) / 110);
const CHANGE = CASH - TOTAL;
const yen = (v) => `¥${v.toLocaleString('ja-JP')}`;

export const meta = {
  title: 'Supermarket receipt (レシート) on a 58 mm page',
  stresses:
    '164 × 640 pt page; item names left and prices right-aligned to the edge; ※ marks for reduced-rate items; quantity × unit-price lines under items; a discount applied to the line above; large total; per-rate taxable amounts and included tax; cash and change; vector barcode',
  status: 'ok',
  families: ['page-geometry', 'scripts', 'tables'],
  page: { size: [W, H] },
};

export const truth = `
One ${W} × ${H} pt page (58 mm wide). Store: まるみ屋 青葉台店, 2026年11月15日(土) 18:42, レジ03.

| Item | Qty × unit | Price | Rate |
| --- | --- | ---: | --- |
${ITEMS.map((i) => `| ${i[3] ? '※' : ''}${i[0]} | ${i[2] > 1 ? `${i[2]}コ × 単${i[1]}` : ''} | ${yen(lineTotal(i))} | ${i[3] ? '8%' : '10%'} |`).join('\n')}
| ${DISCOUNT.label} (on ${ITEMS[DISCOUNT.on][0]}) | | -${DISCOUNT.amount} | 8% |

小計 ${yen(SUBTOTAL)}, 合計 **${yen(TOTAL)}** (${ITEMS.reduce((s, i) => s + i[2], 0)}点). 8%対象 ${yen(REDUCED)}（内消費税 ${yen(TAX8)}）,
10%対象 ${yen(STANDARD)}（内消費税 ${yen(TAX10)}）. お預り ${yen(CASH)}, お釣り ${yen(CHANGE)}.
※印は軽減税率（8%）対象商品です。

## Questions an agent should be able to answer

1. 合計金額はいくらか。 — ${yen(TOTAL)}
2. ミネラルウォーターはいくつ買い、いくら払ったか。 — 3本（単価98円）、${yen(lineTotal(ITEMS[4]))}
3. 値引はどの商品に、いくら適用されたか。 — 国産若鶏もも肉に100円
4. 軽減税率（8%）の対象でない商品はどれか。 — 食器用洗剤 詰替、ゴミ袋45L 20枚
5. 8%対象の消費税額とお釣りはいくらか。 — 内消費税 ${yen(TAX8)}、お釣り ${yen(CHANGE)}

**Reads correctly:** every line of the receipt reads with its price on one line, the quantity line
under its item carrying the price (\`2コ × 単158 ¥316\`) and the discount right after the chicken
(\`値引(タイムセール) -100\`), so questions 2–4 are answered directly. The totals block reads the same
way, each label with its amount (\`(内消費税 ¥106)\`, \`お釣り ¥980\`), so questions 1 and 5 no longer
rest on pairing a run of labels with a run of amounts by counting (#301).
`;

const L = 10;
const RIGHT = W - 10;

function row(h, left, right, y, { font = R, size = 8 } = {}) {
  h.text(left, L, y, { font, size });
  if (right !== undefined) h.text(right, RIGHT, y, { font, size, align: 'right' });
}

export function draw(doc, h) {
  let y = 16;
  h.text('まるみ屋', W / 2, y, { font: B, size: 15, align: 'center' });
  y += 22;
  h.text('青葉台店', W / 2, y, { font: R, size: 9, align: 'center' });
  y += 13;
  h.text('TEL 045-555-0187', W / 2, y, { font: R, size: 7, align: 'center' });
  y += 11;
  h.text('登録番号 T7020001099128', W / 2, y, { font: R, size: 6.5, align: 'center' });
  y += 16;
  row(h, '2026年11月15日(土) 18:42', undefined, y, { size: 7 });
  y += 10;
  row(h, 'レジ03  責No.218', '#4471', y, { size: 7 });
  y += 10;
  doc
    .lineWidth(0.5)
    .dash(1.5, { space: 1.5 })
    .moveTo(L, y + 2)
    .lineTo(RIGHT, y + 2)
    .stroke()
    .undash();
  y += 10;

  ITEMS.forEach((item, index) => {
    const mark = item[3] ? '※' : '　';
    if (item[2] > 1) {
      row(h, `${mark}${item[0]}`, undefined, y);
      y += 11;
      row(h, `　　${item[2]}コ × 単${item[1]}`, yen(lineTotal(item)), y);
    } else {
      row(h, `${mark}${item[0]}`, yen(lineTotal(item)), y);
    }
    y += 11;
    if (index === DISCOUNT.on) {
      row(h, `　　${DISCOUNT.label}`, `-${DISCOUNT.amount}`, y, { size: 7.5 });
      y += 11;
    }
  });
  doc
    .lineWidth(0.5)
    .dash(1.5, { space: 1.5 })
    .moveTo(L, y + 2)
    .lineTo(RIGHT, y + 2)
    .stroke()
    .undash();
  y += 10;
  row(h, '小計', yen(SUBTOTAL), y);
  y += 14;
  row(h, `合計  ${ITEMS.reduce((s, i) => s + i[2], 0)}点`, yen(TOTAL), y, { font: B, size: 12 });
  y += 22;
  row(h, '（8%対象', `${yen(REDUCED)}）`, y, { size: 7 });
  y += 10;
  row(h, '（内消費税', `${yen(TAX8)}）`, y, { size: 7 });
  y += 10;
  row(h, '（10%対象', `${yen(STANDARD)}）`, y, { size: 7 });
  y += 10;
  row(h, '（内消費税', `${yen(TAX10)}）`, y, { size: 7 });
  y += 14;
  row(h, 'お預り', yen(CASH), y);
  y += 11;
  row(h, 'お釣り', yen(CHANGE), y, { font: B, size: 9 });
  y += 18;
  h.text('※印は軽減税率（8%）対象商品です。', L, y, { font: R, size: 6.5 });
  y += 18;

  // A barcode: deterministic bar widths, vector only.
  let x = 22;
  let seed = 7;
  while (x < W - 22) {
    seed = (seed * 37 + 11) % 101;
    const width = 0.6 + (seed % 3) * 0.7;
    doc.rect(x, y, width, 30).fill('black');
    x += width + 0.8 + (seed % 2) * 0.9;
  }
  y += 34;
  h.text('2611 1518 4203 0218', W / 2, y, { font: R, size: 7, align: 'center' });
  y += 18;
  h.text('またのご来店をお待ちしております', W / 2, y, { font: R, size: 7, align: 'center' });
}
