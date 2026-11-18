// A segment-information note from a Japanese interim earnings summary (決算短信
// セグメント情報), as Excel-to-PDF output sets it: two tables, one per period,
// each a ruled grid whose header cell `消去又は全社` wraps onto a second line
// that sits by itself between the header row and the rows, and whose first
// three rows (`営業収益` and its two components) share one band with no row
// rules between them, so the grid cannot be read from its rules alone.

const R = 'NotoSansJP';

const COMPANY = '株式会社ミナミ精機';
const SEGMENTS = ['精密機器', '金融', 'その他'];
const ELIMINATION = ['消去又は', '全社'];
const TOTAL = '連結';
const UNIT = '(単位:百万円)';
const LABELS = [
  { text: '営業収益', indent: 0, values: null },
  { text: '外部顧客への営業収益', indent: 9, key: 'external' },
  { text: 'セグメント間の営業収益', indent: 9, key: 'inter' },
  { text: '計', indent: 66, key: 'revenue' },
  { text: '営業費用', indent: 0, key: 'costs' },
  { text: '営業利益', indent: 0, key: 'profit' },
];
const PERIODS = [
  {
    title: '前中間連結会計期間(2025年9月30日に終了した6ヶ月間)',
    external: [812450, 64120, 18230, 0, 894800],
    inter: [2310, 1840, 26750, -30900, 0],
  },
  {
    title: '当中間連結会計期間(2026年9月30日に終了した6ヶ月間)',
    external: [868910, 71480, 19870, 0, 960260],
    inter: [2950, 1620, 28440, -33010, 0],
  },
];
const COST_RATIO = [0.89, 0.84, 0.9];
for (const period of PERIODS) {
  period.revenue = period.external.map((value, i) => value + period.inter[i]);
  const costs = period.revenue.slice(0, 3).map((value, i) => Math.round(value * COST_RATIO[i]));
  const elimination = period.inter[3] + 410;
  costs.push(elimination);
  costs.push(costs.reduce((a, b) => a + b, 0));
  period.costs = costs;
  period.profit = period.revenue.map((value, i) => value - costs[i]);
}

const fmt = (value) =>
  value === 0 ? '-' : value < 0 ? `△${(-value).toLocaleString('en-US')}` : value.toLocaleString('en-US');

export const meta = {
  title: 'Segment information, two ruled tables',
  stresses:
    'header cell wrapped onto a second line between the header row and the rows; a label-only group row; a ruled grid whose first band holds three rows; △ negatives; two tables of one shape on a page',
  status: 'ok',
  families: ['tables', 'scripts'],
  page: { size: 'A4' },
};

const columns = [...SEGMENTS, ELIMINATION.join(''), TOTAL];

export const truth = `
${COMPANY} — (2)セグメント情報等の注記, 2 報告セグメントの収益および業績. Two tables of the same shape, one per period, ${UNIT}.
The header is \`${columns.join(' | ')}\`; \`${ELIMINATION.join('')}\` is set on two lines (\`${ELIMINATION[0]}\` / \`${ELIMINATION[1]}\`).

${PERIODS.map(
  (period) => `**${period.title}**

| | ${columns.join(' | ')} |
| --- | ---: | ---: | ---: | ---: | ---: |
${LABELS.map((label) => `| ${label.text} | ${label.key ? period[label.key].map(fmt).join(' | ') : ' |  |  |  | '} |`).join('\n')}
`,
).join('\n')}
## Questions an agent should be able to answer

1. What was the 精密機器 segment's operating profit in the current interim period? — ${fmt(PERIODS[1].profit[0])} 百万円
2. How much inter-segment revenue was eliminated in the prior interim period? — ${fmt(PERIODS[0].inter[3])} 百万円 (消去又は全社)
3. What were consolidated operating expenses in the current interim period? — ${fmt(PERIODS[1].costs[4])} 百万円
4. What is the 金融 segment's total revenue (計) in each period? — ${fmt(PERIODS[0].revenue[1])} and ${fmt(PERIODS[1].revenue[1])} 百万円

Both layout tables open on the header row with the wrapped cell joined (\`| 精密機器 | 金融 | その他 | 消去又は 全社 | 連結 |\`,
#294), then the \`営業収益\` group row, then the five value rows, each value under its segment, so every
question is answered from them. The header used to be lost: its second line \`全社\` sat between the
header row and the rows as a row of its own, which ended the header search, and the column header
of every value (\`消去又は全社\` vs \`連結\` for question 2) had to be guessed from the page body.
`;

const LEFT = 56;
const LABEL_W = 149;
const COL_W = 64.8;
const RIGHT = LEFT + LABEL_W + COL_W * 5;
const SIZE = 9;

function vline(doc, x, y1, y2) {
  doc.moveTo(x, y1).lineTo(x, y2).lineWidth(0.5).stroke();
}

function hline(doc, y) {
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.5).stroke();
}

function segmentTable(doc, h, top, period) {
  h.text(period.title, LEFT + 38, top, { font: R, size: 10.5 });
  h.text(UNIT, RIGHT - 4, top + 10, { font: R, size: SIZE, align: 'right' });
  const gridTop = top + 24;
  const headerBottom = gridTop + 25.5;
  // Rows: the first band holds 営業収益 and its two components, unruled between them.
  const bands = [headerBottom + 67.5, headerBottom + 88.5, headerBottom + 109.5, headerBottom + 132];
  for (const y of [gridTop, headerBottom, ...bands]) hline(doc, y);
  const bottom = bands[bands.length - 1];
  for (let i = 0; i <= 5; i++) vline(doc, LEFT + LABEL_W + COL_W * i, gridTop, bottom);
  // The outer verticals run only where rows are ruled, as the source sheet's borders do.
  for (const x of [LEFT, RIGHT]) {
    vline(doc, x, gridTop, headerBottom);
    vline(doc, x, bands[0], bottom);
  }
  const centre = (i) => LEFT + LABEL_W + COL_W * i + COL_W / 2;
  columns.forEach((name, i) => {
    if (i === 3) {
      h.text(ELIMINATION[0], centre(i), gridTop + 2, { font: R, size: SIZE, align: 'center' });
      h.text(ELIMINATION[1], centre(i), gridTop + 12, { font: R, size: SIZE, align: 'center' });
    } else {
      h.text(name, centre(i), gridTop + 7, { font: R, size: SIZE, align: 'center' });
    }
  });
  const rowTops = [
    headerBottom + 5.5,
    headerBottom + 28,
    headerBottom + 50.5,
    bands[0] + 5,
    bands[1] + 5,
    bands[2] + 5.5,
  ];
  LABELS.forEach((label, row) => {
    h.text(label.text, LEFT + 4.5 + label.indent, rowTops[row], { font: R, size: SIZE });
    if (!label.key) return;
    period[label.key].forEach((value, i) => {
      h.text(fmt(value), LEFT + LABEL_W + COL_W * (i + 1) - 4.5, rowTops[row], { font: R, size: SIZE, align: 'right' });
    });
  });
  return bottom;
}

export function draw(doc, h) {
  h.text(`${COMPANY} (6789) 2027年3月期 第2四半期 (中間期) 決算短信`, 539, 26, { font: R, size: 9, align: 'right' });
  h.text('(2)セグメント情報等の注記', LEFT + 4, 75, { font: R, size: 10.5 });
  h.text('2 報告セグメントの収益および業績', LEFT + 20, 92, { font: R, size: 10.5 });
  let y = 112;
  for (const period of PERIODS) {
    y = segmentTable(doc, h, y, period) + 30;
  }
}
