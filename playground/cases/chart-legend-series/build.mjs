// A page of a transit agency's annual report with three vector charts whose
// values can only be paired with their series through colour: a line chart
// with a value label at every point and a legend above it (two series cross
// halfway), a donut whose slices carry percentages while the category names
// sit only in a legend beside it, and a 100% stacked bar chart with a
// percentage in every segment and a legend over the bars. Every label is
// real text; series identity is only colour and line style.

const W = 612;
const YEARS = [2021, 2022, 2023, 2024, 2025];
const LINES = [
  { name: 'Red Line', color: '#c62828', dash: null, values: [41.2, 46.8, 49.5, 50.1, 52.3] },
  { name: 'Blue Line', color: '#1565c0', dash: [5, 3], values: [35.0, 42.1, 51.7, 55.4, 58.9] },
  { name: 'Green Line', color: '#2e7d32', dash: [1.5, 2], values: [22.4, 24.0, 23.1, 26.8, 27.5] },
];
const PAYMENT = [
  { name: 'Contactless bank card', share: 38, color: '#37474f' },
  { name: 'Transit app', share: 27, color: '#00897b' },
  { name: 'Monthly pass', share: 19, color: '#f9a825' },
  { name: 'Cash', share: 9, color: '#8e24aa' },
  { name: 'Paper ticket', share: 7, color: '#6d4c41' },
];
const PURPOSES = [
  { name: 'Work', color: '#283593' },
  { name: 'School', color: '#00838f' },
  { name: 'Shopping', color: '#ef6c00' },
  { name: 'Other', color: '#757575' },
];
const PURPOSE_ROWS = [
  { year: 2023, shares: [46, 18, 15, 21] },
  { year: 2024, shares: [43, 19, 17, 21] },
  { year: 2025, shares: [39, 20, 18, 23] },
];
const INTRO =
  'Weekday ridership grew on every line in 2025. The Blue Line, extended to Harbour Point in 2022, has carried more riders than the Red Line since its first full year of extended service. Contactless payment overtook the monthly pass in 2024, and commuting to work continues to fall as a share of all trips.';

export const meta = {
  title: 'Annual report page with a line chart, a donut and a stacked bar chart',
  stresses:
    'line chart with a value label at every point and series told apart only by colour and dash, two series crossing; donut with percentages in the slices and names only in a legend; 100% stacked bars with a percentage per segment and a legend above',
  status: 'known-gap',
  families: ['vector-meaning'],
};

const table = (header, rows) =>
  [
    `| ${header.join(' | ')} |`,
    `| ${header.map((_, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');

export const truth = `
One Letter page: a heading, an intro paragraph and three charts. The values the charts show:

**Figure 3. Average weekday boardings by line (thousands)**, a line chart; each point carries its value
in the line's colour; the legend says Red Line (solid), Blue Line (dashed), Green Line (dotted).

${table(
  ['Line', ...YEARS.map(String)],
  LINES.map((l) => [l.name, ...l.values.map((v) => v.toFixed(1))]),
)}

**Figure 4. Fare payment method, 2025 (share of trips)**, a donut; the percentages sit in the slices and
the names only in the legend, matched by colour:

${table(
  ['Method', 'Share'],
  PAYMENT.map((p) => [p.name, `${p.share}%`]),
)}

**Figure 5. Trip purpose (share of weekday trips)**, 100% stacked horizontal bars, one per year,
segments in legend order:

${table(
  ['Year', ...PURPOSES.map((p) => p.name)],
  PURPOSE_ROWS.map((r) => [String(r.year), ...r.shares.map((s) => `${s}%`)]),
)}

## Questions an agent should be able to answer

1. How many average weekday boardings did the Blue Line carry in 2023? — 51.7 thousand
2. In which year did the Blue Line first carry more riders than the Red Line? — 2023 (51.7 vs 49.5)
3. What share of 2025 trips was paid with the transit app? — 27%
4. Which payment method accounts for 9% of trips? — Cash
5. What share of weekday trips in 2025 were for school? — 20%

**Known gap (no issue yet):** the page has no warning at all, and none of the three charts can be
read without the render.
- Figure 3: the legend (\`Red Line Blue Line\` / \`Green Line\`) comes first, then the fifteen values
  sorted top to bottom with the y-axis ticks among them (\`58.9\` / \`60\` / \`55.4\` / \`51.7\` / \`52.3\` /
  …); nothing says which line a value is on or which year it is, and the \`2025\` axis label is
  emitted later, inside Figure 4. Questions 1 and 2 have no answer; \`vector_chart_labels\` does not
  fire because the chart has no bars.
- Figure 4: the slice percentages come out in an order unrelated to the legend
  (\`7%\` / \`9%\` / \`38%\` / \`19%\` / \`2025\` / \`27%\`) and the legend names follow later, so
  questions 3 and 4 have no answer.
- Figure 5: the body reads each bar's percentages in legend order, which answers question 5, but
  the page's only layout table gives the bars a shifted header: \`| Work | School Shopping | Other | | |\`
  over \`| 2025 | 39% | 20% | 18% | 23% |\`, which puts \`Work\` over the year column and labels
  39% (Work) as \`School Shopping\`. An agent that trusts the table answers question 5 with 39%.
`;

function lineChart(doc, h, x, y, w, ht) {
  const min = 15;
  const max = 65;
  const px = (i) => x + 30 + (i * (w - 50)) / (YEARS.length - 1);
  const py = (v) => y + ht - ((v - min) / (max - min)) * ht;
  doc.lineWidth(0.4).strokeColor('#cccccc');
  for (let v = 20; v <= 60; v += 10) {
    doc
      .moveTo(x + 18, py(v))
      .lineTo(x + w, py(v))
      .stroke();
    h.text(String(v), x + 12, py(v) - 4, { size: 7, align: 'right' });
  }
  doc.strokeColor('black');
  YEARS.forEach((year, i) => {
    h.text(String(year), px(i), y + ht + 6, { size: 7.5, align: 'center' });
  });
  for (const line of LINES) {
    doc.save();
    doc.lineWidth(1.6).strokeColor(line.color);
    if (line.dash) doc.dash(line.dash[0], { space: line.dash[1] });
    line.values.forEach((v, i) => {
      if (i === 0) doc.moveTo(px(i), py(v));
      else doc.lineTo(px(i), py(v));
    });
    doc.stroke();
    doc.restore();
    line.values.forEach((v, i) => {
      doc.circle(px(i), py(v), 2.2).fill(line.color);
    });
  }
  // Value labels, drawn after all lines, in the series colour; placed above the point,
  // or below it when another series' point is close above.
  for (const line of LINES) {
    doc.fillColor(line.color);
    line.values.forEach((v, i) => {
      const crowdedAbove = LINES.some((o) => o !== line && o.values[i] > v && o.values[i] - v < 4);
      h.text(v.toFixed(1), px(i), crowdedAbove ? py(v) + 4 : py(v) - 12, { size: 7, align: 'center' });
    });
  }
  doc.fillColor('black');
}

function legendRow(doc, h, items, x, y, { line = false } = {}) {
  let cursor = x;
  for (const item of items) {
    if (line) {
      doc.save();
      doc.lineWidth(1.6).strokeColor(item.color);
      if (item.dash) doc.dash(item.dash[0], { space: item.dash[1] });
      doc
        .moveTo(cursor, y + 4)
        .lineTo(cursor + 18, y + 4)
        .stroke();
      doc.restore();
      cursor += 22;
    } else {
      doc.rect(cursor, y, 8, 8).fill(item.color);
      cursor += 12;
    }
    doc.fillColor('black');
    cursor = h.text(item.name, cursor, y, { size: 8 }).right + 14;
  }
}

function annulusSlice(doc, cx, cy, r0, r1, a0, a1, color) {
  const steps = Math.max(4, Math.ceil(((a1 - a0) * 180) / Math.PI / 4));
  const point = (r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const outer = [];
  const inner = [];
  for (let s = 0; s <= steps; s++) {
    const a = a0 + ((a1 - a0) * s) / steps;
    outer.push(point(r1, a));
    inner.push(point(r0, a));
  }
  const [first, ...rest] = outer;
  doc.moveTo(...first);
  for (const p of rest) doc.lineTo(...p);
  for (const p of inner.reverse()) doc.lineTo(...p);
  doc.closePath().fill(color);
}

function donut(doc, h, cx, cy) {
  const r0 = 38;
  const r1 = 72;
  let a = 0;
  for (const slice of PAYMENT) {
    const span = (slice.share / 100) * Math.PI * 2;
    annulusSlice(doc, cx, cy, r0, r1, a, a + span, slice.color);
    const mid = a + span / 2;
    const r = (r0 + r1) / 2;
    doc.fillColor('white');
    h.text(`${slice.share}%`, cx + r * Math.sin(mid), cy - r * Math.cos(mid) - 4, {
      font: 'Helvetica-Bold',
      size: 8,
      align: 'center',
    });
    a += span;
  }
  doc.fillColor('black');
  h.text('2025', cx, cy - 5, { font: 'Helvetica-Bold', size: 10, align: 'center' });
}

export function draw(doc, h) {
  h.text('4  Ridership and fares', 54, 50, { font: 'Helvetica-Bold', size: 15 });
  let y = h.paragraph(INTRO, 54, 76, W - 108, { font: 'Helvetica', size: 9.5 }) + 16;

  h.text('Figure 3. Average weekday boardings by line (thousands)', 54, y, { font: 'Helvetica-Bold', size: 9 });
  legendRow(doc, h, LINES, 74, y + 16, { line: true });
  lineChart(doc, h, 54, y + 36, 500, 150);
  y += 222;

  h.text('Figure 4. Fare payment method, 2025 (share of trips)', 54, y, { font: 'Helvetica-Bold', size: 9 });
  donut(doc, h, 150, y + 92);
  PAYMENT.forEach((p, i) => {
    doc.rect(270, y + 40 + i * 18, 9, 9).fill(p.color);
    doc.fillColor('black');
    h.text(p.name, 286, y + 40 + i * 18, { size: 8.5 });
  });
  y += 190;

  h.text('Figure 5. Trip purpose (share of weekday trips)', 54, y, { font: 'Helvetica-Bold', size: 9 });
  legendRow(doc, h, PURPOSES, 96, y + 16);
  const barLeft = 96;
  const barWidth = 440;
  PURPOSE_ROWS.forEach((row, r) => {
    const top = y + 36 + r * 26;
    h.text(String(row.year), barLeft - 8, top + 5, { size: 8.5, align: 'right' });
    let cursor = barLeft;
    row.shares.forEach((share, i) => {
      const width = (share / 100) * barWidth;
      doc.rect(cursor, top, width, 18).fill(PURPOSES[i].color);
      doc.fillColor('white');
      h.text(`${share}%`, cursor + width / 2, top + 5, { font: 'Helvetica-Bold', size: 8, align: 'center' });
      cursor += width;
    });
    doc.fillColor('black');
  });

  h.text('Annual Ridership Report 2025', 54, 752, { size: 8 });
  h.text('11', W - 54, 752, { size: 8, align: 'right' });
}
