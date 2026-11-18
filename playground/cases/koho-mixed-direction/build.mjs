// A page of a Japanese municipal newsletter (広報誌) mixing both writing
// directions, as 広報誌 and community papers routinely do: a horizontal
// masthead, a feature article set vertically (縦組み) in the upper half — a
// large two-column vertical headline at the right, then body columns right
// to left — and a horizontal event box with a schedule table and a
// horizontal photo caption in the lower half. Vertical glyphs are placed one
// by one (lib/visualC.mjs).

import { breakColumns, verticalColumn } from '../../lib/visualC.mjs';

const W = 595;
const R = 'NotoSansJP';
const B = 'NotoSansJP-Bold';

const MASTHEAD = { name: '広報みなと', issue: '2026年12月号', no: 'No.418' };
const HEADLINE = ['海辺の図書館、', '冬も開いています'];
const BODY = [
  '　旧漁協の倉庫を改装した「みなと海辺図書館」が、開館から一年を迎えました。窓いっぱいに海が見える閲覧席は、平日でも昼過ぎには満席になる人気ぶりです。',
  '　これまで冬の間は休館していましたが、今年度から暖房設備を整え、十二月から三月までも開館することになりました。開館時間は午前十時から午後五時まで、毎週火曜日は休館日です。',
  '　館長の浜野さんは「波の音を聞きながら本を読む時間を、冬にも楽しんでほしい」と話しています。',
  '　館内では、地元の漁師さんから聞き取った「浜のことば」をまとめた小冊子を無料で配っています。数に限りがありますので、お早めにどうぞ。',
];
const PER_COLUMN = 24;
const EVENT_TITLE = '冬のおはなし会';
const EVENTS = [
  ['12月14日（日）', '14:00〜14:40', '海の生きもの絵本', '幼児〜小学2年生'],
  ['1月11日（日）', '14:00〜14:40', '冬の星と昔話', '小学生'],
  ['2月8日（日）', '10:30〜11:30', '大人のための朗読会', '中学生以上'],
];
const EVENT_NOTE = '申込不要・参加無料。定員は各回20人（先着順）です。';
const CAPTION = '写真：海に面した閲覧席（11月撮影）';

export const meta = {
  title: 'Municipal newsletter page mixing vertical and horizontal Japanese',
  stresses:
    'horizontal masthead; vertical feature article in the upper half with a two-column vertical headline and body columns right to left; horizontal event box with a ruled schedule table and a note in the lower half; horizontal photo caption beside a photo placeholder',
  status: 'ok',
  families: ['vertical-rotated', 'scripts', 'reading-order'],
  page: { size: 'A4' },
};

export const truth = `
One A4 page. Reading order: the masthead (${MASTHEAD.name} ${MASTHEAD.issue} ${MASTHEAD.no}), the vertical
article, then the horizontal event box. The photo caption belongs to the photo placeholder beside
the box.

The article, set vertically: headline **${HEADLINE.join('')}**, then the body (columns right to left):

${BODY.map((p) => `> ${p.replace(/^　/u, '')}`).join('\n>\n')}

The event box, set horizontally: **${EVENT_TITLE}**

| 日にち | 時間 | 内容 | 対象 |
| --- | --- | --- | --- |
${EVENTS.map((row) => `| ${row.join(' | ')} |`).join('\n')}

${EVENT_NOTE}

Caption: ${CAPTION}

## Questions an agent should be able to answer

1. 図書館は冬の間、何時から何時まで開いているか。休館日は。 — 午前10時から午後5時まで。毎週火曜日が休館日
2. 図書館の建物はもともと何だったか。 — 旧漁協の倉庫
3. 小学生向けのおはなし会はいつ、何をするか。 — 1月11日（日）14:00〜14:40、「冬の星と昔話」
4. おはなし会の定員と申込方法は。 — 各回20人（先着順）、申込不要・参加無料
5. 館長は誰で、何と話しているか。 — 浜野さん。「波の音を聞きながら本を読む時間を、冬にも楽しんでほしい」

**Reads correctly:** the vertical article is read column by column, right to left, after the masthead,
and the horizontal box after it, so all five questions are answered from \`read.md\`. The headline picks
up spaces between glyph groups (\`海辺 の図書館、\` / \`冬も開いて います\`). The schedule table is not
reported as a layout table, but its rows read left to right, one line each, header first
(\`日にち 時間 内容 対象\` / \`2月8日(日) 10:30〜11:30 大人のための朗読会 中学生以上\`), and the photo
placeholder's \`(写真)\` after them (#309). The masthead still reads its right-hand date before the
title on its left.
`;

export function draw(doc, h) {
  // Masthead.
  doc.rect(0, 0, W, 58).fill('#0d47a1');
  doc.fillColor('white');
  h.text(MASTHEAD.name, 40, 14, { font: B, size: 24 });
  h.text(`${MASTHEAD.issue}　${MASTHEAD.no}`, W - 40, 26, { font: R, size: 11, align: 'right' });
  doc.fillColor('black');

  // Vertical article: headline at the right edge, body columns to its left.
  const top = 84;
  verticalColumn(doc, HEADLINE[0], W - 52, top, { size: 22, font: B });
  verticalColumn(doc, HEADLINE[1], W - 84, top + 44, { size: 22, font: B });
  const columns = BODY.flatMap((paragraph) => breakColumns(paragraph, PER_COLUMN));
  const pitch = 19;
  columns.forEach((column, i) => {
    verticalColumn(doc, column, W - 130 - i * pitch, top, { size: 11.5 });
  });
  const articleBottom = top + PER_COLUMN * 11.5 + 18;
  doc
    .lineWidth(0.8)
    .moveTo(40, articleBottom)
    .lineTo(W - 40, articleBottom)
    .stroke();

  // Lower half: a photo placeholder with a horizontal caption, and the event box.
  const lower = articleBottom + 22;
  doc.rect(40, lower, 172, 130).fill('#b0bec5');
  doc.fillColor('#455a64');
  h.text('（写真）', 126, lower + 58, { font: R, size: 10, align: 'center' });
  doc.fillColor('black');
  h.text(CAPTION, 40, lower + 136, { font: R, size: 8.5 });

  const bx = 230;
  doc
    .lineWidth(1.2)
    .roundedRect(bx, lower, W - 40 - bx, 210, 8)
    .stroke('#0d47a1');
  h.text(EVENT_TITLE, bx + 14, lower + 12, { font: B, size: 14 });
  const colX = [bx + 12, bx + 84, bx + 150, bx + 248];
  let y = lower + 44;
  ['日にち', '時間', '内容', '対象'].forEach((head, i) => {
    h.text(head, colX[i], y, { font: B, size: 9 });
  });
  doc.lineWidth(0.5).strokeColor('black');
  doc
    .moveTo(bx + 10, y + 15)
    .lineTo(W - 50, y + 15)
    .stroke();
  y += 22;
  for (const row of EVENTS) {
    row.forEach((cell, i) => {
      h.text(cell, colX[i], y, { font: R, size: 8.5 });
    });
    doc
      .moveTo(bx + 10, y + 17)
      .lineTo(W - 50, y + 17)
      .stroke();
    y += 24;
  }
  h.text(EVENT_NOTE, bx + 14, y + 10, { font: R, size: 8.5 });
  h.text('問い合わせ：みなと海辺図書館　0465-55-0193', bx + 14, y + 28, { font: R, size: 8.5 });

  h.text('4', W / 2, 810, { font: R, size: 9, align: 'center' });
}
