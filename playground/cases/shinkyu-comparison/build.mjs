// A vertical 新旧対照条文 page as attached to amending bills and ordinances:
// a landscape sheet stored as a portrait page with /Rotate 90, split by a
// horizontal rule into an upper half (改正後) and a lower half (改正前), each
// holding vertical columns that run right to left, a provision's new and old
// text starting in the same column position. Changed passages are marked
// only by vector side lines (傍線, to the right of the glyphs in vertical
// setting), unchanged provisions are abbreviated to （略）, and the added
// article leaves the 改正前 half blank.

import { verticalColumn } from '../../lib/visualC.mjs';

const R = 'NotoSansJP';
const B = 'NotoSansJP-Bold';
const SIZE = 10;
const PITCH = 18;

const TITLE = '地域図書館の振興に関する法律施行規則の一部を改正する省令　新旧対照条文';
const NOTE = '（傍線部分は改正部分）';
const PAGE_NUMBER = '- 1 -';

// Text markup: ‹…› marks an underlined (changed) passage.
// `first` / `rest`: em boxes of indentation for the first and wrapped lines.
const caption = (text) => ({ text, first: 1, rest: 1 });
const article = (text) => ({ text, first: 0, rest: 1 });
const item = (text) => ({ text, first: 1, rest: 2 });

const ROWS = [
  {
    after: [article('第一条　（略）')],
    before: [article('第一条　（略）')],
  },
  {
    after: [
      caption('（定義）'),
      article('第二条　この省令において、次の各号に掲げる用語の意義は、それぞれ当該各号に定めるところによる。'),
      item('一　（略）'),
      item('二　移動図書館　‹自動車その他の移動手段›を用いて図書館資料の閲覧及び貸出しを行う事業をいう。'),
      item('三　協議会　‹法第八条第一項›に規定する図書館協議会をいう。'),
    ],
    before: [
      caption('（定義）'),
      article('第二条　この省令において、次の各号に掲げる用語の意義は、それぞれ当該各号に定めるところによる。'),
      item('一　（略）'),
      item('二　移動図書館　‹自動車›を用いて図書館資料の閲覧及び貸出しを行う事業をいう。'),
      item('三　協議会　‹法第八条›に規定する図書館協議会をいう。'),
    ],
  },
  {
    after: [
      caption('（計画の期間）'),
      article('第三条　法第七条第一項の計画の期間は、‹五年›とする。'),
      article('２　（略）'),
    ],
    before: [
      caption('（計画の期間）'),
      article('第三条　法第七条第一項の計画の期間は、‹三年›とする。'),
      article('２　（略）'),
    ],
  },
  {
    after: [
      caption('‹（運営状況の評価の方法）›'),
      article(
        '‹第三条の二　法第八条の二の評価は、利用者の満足度、図書館資料の貸出件数その他の地域図書館の運営の状況を示す指標を用いて行うものとする。›',
      ),
    ],
    before: [],
  },
  {
    after: [article('第四条及び第五条　（略）')],
    before: [article('第四条及び第五条　（略）')],
  },
];

// Displayed (turned) sheet: 842 × 595. The table spans TABLE_TOP..TABLE_BOTTOM,
// halves split at MID; a label strip on the right names each half.
const TABLE_LEFT = 64;
const TABLE_RIGHT = 752;
const LABEL_STRIP = 24;
const TABLE_TOP = 52;
const TABLE_BOTTOM = 548;
const MID = (TABLE_TOP + TABLE_BOTTOM) / 2;
const PAD = 10;
const PER_COLUMN = Math.floor((MID - TABLE_TOP - 2 * PAD) / SIZE);

/** Characters with an underline flag, markup removed. */
function chars(text) {
  const out = [];
  let under = false;
  for (const char of text) {
    if (char === '‹') under = true;
    else if (char === '›') under = false;
    else out.push({ char, under });
  }
  return out;
}

const HANGING = new Set('、。');
const NO_START = new Set('」）');

/** Wrap one provision into columns of em boxes, with its indentation and 禁則. */
function wrap({ text, first, rest }) {
  const all = chars(text);
  const lines = [];
  let i = 0;
  while (i < all.length) {
    const indent = lines.length === 0 ? first : rest;
    let end = Math.min(i + PER_COLUMN - indent, all.length);
    while (end < all.length && end - 1 > i && NO_START.has(all[end].char)) end--;
    if (end < all.length && HANGING.has(all[end].char)) end++;
    lines.push({ indent, cells: all.slice(i, end) });
    i = end;
  }
  return lines;
}

const marked = (text) => text.replaceAll('‹', '<u>').replaceAll('›', '</u>').replaceAll('　', ' ');
const side = (provisions) =>
  provisions.length === 0 ? '_(blank)_' : provisions.map((p) => marked(p.text)).join('<br>');

export const meta = {
  title: 'Vertical 新旧対照条文 with side-lined amendments',
  stresses:
    'vertical statute comparison on a /Rotate 90 sheet; upper half 改正後 over lower half 改正前, columns right to left; changed passages marked only by vector side lines; （略） provisions; an added article with a blank old half; hanging item numbers',
  status: 'known-gap',
  issue: 261,
  page: { size: 'A4' },
  families: ['vertical-rotated', 'tables', 'vector-meaning'],
};

export const truth = `
A portrait A4 page stored with \`/Rotate 90\`; a viewer shows an 842 × 595 pt landscape sheet
holding a vertical 新旧対照条文: the title **${TITLE.replace('　', ' ')}** in the rightmost column
and ${NOTE} beside it. The table is split by a horizontal rule: the **upper half is 改正後, the
lower half 改正前**, each labelled in a narrow strip at the table's right edge. In each half the
text is vertical (glyph by glyph, the common DTP form, not an Identity-V font), columns run right
to left, and a provision's new and old text start in the same column position, so each pair sits
one above the other. ${SIZE} pt glyphs, ${PER_COLUMN} em boxes per column.

Changed passages are marked only by a vector side line (傍線) to the right of the glyphs — shown
below as <u>…</u>; the text carries no marker. Unchanged provisions are abbreviated to （略）. The
added article 第三条の二 is side-lined in full and the 改正前 half below it is empty.

| 改正後 | 改正前 |
| --- | --- |
${ROWS.map((row) => `| ${side(row.after)} | ${side(row.before)} |`).join('\n')}

Page number \`${PAGE_NUMBER}\` at the foot. A correct reading keeps 改正後 and 改正前 apart and each
provision whole, and an agent needs either the side lines or the pairing to tell what changed.
Full-width digits and brackets may come back NFKC-normalised (\`２\` → \`2\`, \`（\` → \`(\`).

## Questions an agent should be able to answer

1. 改正後の第三条で、計画の期間は何年か。改正前は何年だったか。 — 改正後は五年、改正前は三年
2. 第二条第二号「移動図書館」の定義はどう改められたか。 — 「自動車を用いて」が「自動車その他の移動手段を用いて」に改められた
3. この改正で新設される条は何か。その見出しは。 — 第三条の二（運営状況の評価の方法）
4. 第二条第三号「協議会」で引用する条文はどう変わったか。 — 「法第八条」から「法第八条第一項」へ
5. 第一条は改正されるか。 — 改正されない（両欄とも（略））

**Known gap (#261):** the rotated page is read exactly as the same drawing stored landscape: the
改正後 half comes first and the 改正前 half after it, and every body column comes back whole
(\`法第七条第一項の計画の期間は、五年と\`, \`法第八条の二の評価は、利用者の満足度、…\`), but
within each half the columns are not reassembled into provisions: labels, captions, bodies and
their one-line endings (\`する。\`, \`をいう。\`) are separated by other provisions' columns. The
rest is the vertical-text column cutting of #261: every \`(略)\` and the \`(定義)\` caption come
back one glyph per line, so 第一条 and its caption interleave as \`第 / ( / 一 / 定 / 条 / 義 / )\`; the narrow \`改正後\` / \`改正前\` labels come back one
glyph per line, both between the two halves; the item numbers detach (\`三\`, \`二 一\`); and in each half the
definition terms \`移動図書館\` / \`協議会\` stand apart from their definitions, with
\`自動車を用いて図書館資料の\` and \`法第八条に規定する図書館協議会\` displaced to the end of the 改正前
half. The side lines are not reported. \`reading_order_divergence\` fires on the title ("render
the page when exact sequence is critical"). Questions 1 to 4 are answerable from \`read.md\`, though
2 and 4 need the displaced 改正前 fragments; question 5 is not — 第一条 survives only as the
interleaved glyphs above.
`;

/** Set a half's provisions as columns from `cx` leftwards; returns the next free column centre. */
function half(doc, provisions, cx, top) {
  let x = cx;
  for (const provision of provisions) {
    for (const line of wrap(provision)) {
      verticalColumn(doc, '　'.repeat(line.indent) + line.cells.map((c) => c.char).join(''), x, top, { size: SIZE });
      // Side lines are separate vector strokes right of the changed glyphs, one per run.
      const lineX = x + SIZE / 2 + 1.8;
      let start = -1;
      line.cells.forEach((cell, i) => {
        if (cell.under && start < 0) start = i;
        if ((!cell.under || i === line.cells.length - 1) && start >= 0) {
          const end = cell.under ? i + 1 : i;
          doc
            .moveTo(lineX, top + (line.indent + start) * SIZE)
            .lineTo(lineX, top + (line.indent + end) * SIZE)
            .lineWidth(0.6)
            .stroke('black');
          start = -1;
        }
      });
      x -= PITCH;
    }
  }
  return x;
}

export function draw(doc, h) {
  const { width, height } = h.rotateClockwise();

  verticalColumn(doc, TITLE, width - 44, TABLE_TOP + SIZE * 2, { size: 12, font: B });
  verticalColumn(doc, NOTE, width - 66, TABLE_BOTTOM - [...NOTE].length * 9, { size: 9 });

  doc.rect(TABLE_RIGHT - LABEL_STRIP, TABLE_TOP, LABEL_STRIP, TABLE_BOTTOM - TABLE_TOP).fill('#e6e6e6');
  doc.fillColor('black');
  const labelX = TABLE_RIGHT - LABEL_STRIP / 2;
  verticalColumn(doc, '改正後', labelX, (TABLE_TOP + MID) / 2 - 15, { size: 10 });
  verticalColumn(doc, '改正前', labelX, (MID + TABLE_BOTTOM) / 2 - 15, { size: 10 });

  let cx = TABLE_RIGHT - LABEL_STRIP - PAD - SIZE / 2;
  for (const row of ROWS) {
    const afterEnd = half(doc, row.after, cx, TABLE_TOP + PAD);
    const beforeEnd = half(doc, row.before, cx, MID + PAD);
    cx = Math.min(afterEnd, beforeEnd) - PITCH / 2;
  }
  if (cx < TABLE_LEFT) throw new Error('shinkyu-comparison: columns overflow the table');

  doc
    .rect(TABLE_LEFT, TABLE_TOP, TABLE_RIGHT - TABLE_LEFT, TABLE_BOTTOM - TABLE_TOP)
    .lineWidth(0.8)
    .stroke('black');
  doc.moveTo(TABLE_LEFT, MID).lineTo(TABLE_RIGHT, MID).lineWidth(0.6).stroke('black');
  doc
    .moveTo(TABLE_RIGHT - LABEL_STRIP, TABLE_TOP)
    .lineTo(TABLE_RIGHT - LABEL_STRIP, TABLE_BOTTOM)
    .lineWidth(0.6)
    .stroke('black');

  h.text(PAGE_NUMBER, width / 2, height - 30, { font: R, size: 9, align: 'center' });
}
