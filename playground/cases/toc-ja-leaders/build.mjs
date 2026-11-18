// A Japanese report's table of contents (目次), the way word-processor and
// DTP exports of government statistics bulletins lay it out: three parts
// (第1部…) with numbered chapters (1.) and parenthesised sections ((1)) at
// growing indents, dot leaders, and page numbers right-aligned in a column
// headed 頁. The producer writes every label first, then the leaders, then
// the page numbers as one separate column, so nothing but y ties a number
// to its entry.

const W = 595;
const R = 'NotoSansJP';
const B = 'NotoSansJP-Bold';

// level 0: part heading (no page number), 1: chapter, 2: section.
const ENTRIES = [
  { level: 1, label: '刊行にあたって', page: 1 },
  { level: 0, label: '第1部　地域交通の現状' },
  { level: 1, label: '1. 路線バスの輸送人員の推移', page: 3 },
  { level: 2, label: '(1) 都市部', page: 4 },
  { level: 2, label: '(2) 中山間地域', page: 7 },
  { level: 1, label: '2. 鉄道駅の利用状況', page: 11 },
  { level: 1, label: '3. 運転士の年齢構成と確保の課題（注1）', page: 15 },
  { level: 0, label: '第2部　施策の実施状況' },
  { level: 1, label: '1. デマンド交通の導入事例', page: 21 },
  { level: 2, label: '(1) 予約型乗合タクシー', page: 22 },
  { level: 2, label: '(2) 自家用有償旅客運送', page: 26 },
  { level: 2, label: '(3) 貨客混載', page: 29 },
  { level: 1, label: '2. 運賃支援制度の比較', page: 33 },
  { level: 1, label: '3. 交通系ICカードの普及率', page: 38 },
  { level: 0, label: '第3部　参考資料' },
  { level: 1, label: '1. 市町村別輸送人員一覧', page: 45 },
  { level: 1, label: '2. 用語の解説', page: 58 },
  { level: 1, label: '3. 調査票（様式第2号）', page: 61 },
];
const NOTE = '（注1）第1部3.の数値は令和7年3月末時点の速報値である。';
// A list of figures and tables after the contents, set without leaders:
// the labels are one left-aligned column and the numbers a right-aligned one.
const FIGURES = [
  { label: '図1-1　路線バス輸送人員の推移（平成27年度～令和6年度）', page: 3 },
  { label: '図1-2　人口密度別のバス停400m圏カバー率', page: 8 },
  { label: '表1-3　運転士の年齢階級別構成比', page: 16 },
  { label: '表2-1　デマンド交通の運行形態別導入数', page: 21 },
  { label: '図2-4　運賃支援の対象者と負担割合', page: 35 },
  { label: '表3-1　市町村別輸送人員（令和6年度）', page: 45 },
];

export const meta = {
  title: 'Japanese table of contents (目次) with nested numbering and leaders',
  stresses:
    'A4; part headings with no page number; chapters and parenthesised sections at growing indents; dot leaders; page numbers right-aligned under a 頁 column head; labels, leaders and page numbers written as three separate passes',
  status: 'ok',
  showcase: true,
  hard: 'labels, leaders and page numbers are written as three separate passes, so nothing but the shared baseline ties a number to its entry',
  families: ['structure', 'scripts'],
  page: { size: 'A4' },
};

const indent = (level) => ['', '', '　'][level];

export const truth = `
A4 page: the title 目次, the column head 頁 above the page numbers, ${ENTRIES.length} entries and a note.
Each entry with a page number must be read with its number; part headings (第n部) have none.

${ENTRIES.map((e) => (e.page === undefined ? `**${e.label}**` : `${indent(e.level)}${e.label} …… ${e.page}`)).join('\n\n')}

${NOTE}

Then a second list, **図表目次**, set without leaders (label at the left, page number at the right):

${FIGURES.map((f) => `${f.label} …… ${f.page}`).join('\n\n')}

## Questions an agent should be able to answer

1. 第2部の「2. 運賃支援制度の比較」は何ページから始まるか。 — 33ページ
2. 「(3) 貨客混載」はどの部・どの章に含まれ、何ページか。 — 第2部「1. デマンド交通の導入事例」の節、29ページ
3. 第1部と第3部の両方に「3.」の章がある。それぞれ何ページか。 — 第1部の3.（運転士の年齢構成…）は15ページ、第3部の3.（調査票）は61ページ
4. 用語の解説は何ページにあるか。 — 58ページ
5. 中山間地域の路線バスについての節は何ページから何ページまでか。 — 7ページから（次の項目が11ページなので）10ページまで
6. 「運転士の年齢階級別構成比」の表は何ページにあるか。 — 16ページ（表1-3）

Every entry reads as one line with its leader and page number (\`(3) 貨客混載 ・・・ 29\`), part headings
on lines of their own with no number, and the leaderless 図表目次 the same way (\`表1-3 運転士の年齢階級別構成比 16\`),
so every question is answered from the text (#301).
`;

const LEFT = 80;
const NUM_RIGHT = 515;
const LEADER_END = 492;
const PITCH = 22;

export function draw(doc, h) {
  h.text('目　次', W / 2, 70, { font: B, size: 18, align: 'center' });
  h.text('頁', NUM_RIGHT, 120, { font: R, size: 9, align: 'right' });

  const rows = [];
  let y = 140;
  for (const entry of ENTRIES) {
    if (entry.level === 0) y += 8;
    rows.push({ entry, y });
    y += PITCH;
  }

  // Pass 1: every label.
  for (const { entry, y: top } of rows) {
    const x = LEFT + [0, 14, 34][entry.level];
    const end = h.text(entry.label, x, top, { font: entry.level === 0 ? B : R, size: entry.level === 0 ? 11.5 : 10.5 });
    entry.end = end.right;
  }
  // Pass 2: leaders, as runs of ・ from the label's end to a fixed column.
  doc.fillColor('#555');
  for (const { entry, y: top } of rows) {
    if (entry.page === undefined) continue;
    doc.font(R).fontSize(10.5);
    const dot = doc.widthOfString('・');
    const start = entry.end + 6;
    const count = Math.floor((LEADER_END - start) / dot);
    h.text('・'.repeat(count), LEADER_END - count * dot, top, { font: R, size: 10.5 });
  }
  doc.fillColor('black');
  // Pass 3: the page-number column.
  for (const { entry, y: top } of rows) {
    if (entry.page !== undefined) h.text(String(entry.page), NUM_RIGHT, top, { font: R, size: 10.5, align: 'right' });
  }

  h.text(NOTE, LEFT, y + 6, { font: R, size: 8.5 });

  const listTop = y + 70;
  h.text('図表目次', LEFT, listTop - 26, { font: B, size: 11.5 });
  FIGURES.forEach((figure, i) => {
    h.text(figure.label, LEFT + 14, listTop + i * 20, { font: R, size: 10 });
  });
  FIGURES.forEach((figure, i) => {
    h.text(String(figure.page), NUM_RIGHT, listTop + i * 20, { font: R, size: 10, align: 'right' });
  });
  h.text('- i -', W / 2, 800, { font: R, size: 9, align: 'center' });
}
