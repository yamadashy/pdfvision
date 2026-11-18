// A Japanese ministry briefing slide (ポンチ絵) on A4 landscape, as Word or
// PowerPoint exports it: a title bar, a 現状・課題 → 対応 → 効果 flow of rounded
// boxes joined by arrows, four small native charts (bar, line, 100% stacked
// bar, donut) whose values exist only as free-floating data labels, a
// vertical band at the left edge with a rotated label, and a 出典 note.
// Ministry, programme and figures are fictional.

const R = 'NotoSansJP';
const B = 'NotoSansJP-Bold';

const W = 841.89;
const NAVY = '#1f3f6e';
const INK = '#222a35';
const GREY = '#5b6472';

const HEADER = {
  title: '地域デジタル人材育成プログラム（仮称）の概要',
  ministry: '国土産業振興省 地域政策局',
  docLabel: '資料２',
  date: '令和8年11月',
};
const LEAD = '地方のデジタル人材不足を解消するため、研修・伴走支援・講師育成を一体的に実施する。';
const BUDGET = { label: '令和9年度要求額', value: '42.5億円', note: '（新規）' };
const BAND_LABEL = '令和9年度 概算要求 重点施策';

// Issue i is answered by measure i; an arrow joins each pair on the slide.
const ISSUES = [
  ['地方ではデジタル人材が慢性的に不足', '（2026年には14.6万人が不足する見込み）'],
  ['研修機会が都市部に集中し、地方部の', '受講者数は都市部の3分の1以下'],
  ['中小企業の約半数がDXに未着手', '（相談できる専門家が身近にいない）'],
  ['地域で指導者・講師を確保できない', '（講師の約7割が首都圏在住）'],
];
const MEASURES = [
  ['① オンライン研修プラットフォームの整備', '動画教材・演習環境を無償で提供'],
  ['② 地域の大学・高専と連携した実践講座', '週末・夜間の通学型講座を全国50か所で開講'],
  ['③ 中小企業への専門家派遣（伴走支援）', '1社あたり最大6か月、課題の特定から実装まで'],
  ['④ 講師育成・認定制度の創設', '地域在住の実務家を講師として認定・登録'],
];
const EFFECTS = [
  ['2030年度までに', '支援対象者3万人を育成'],
  ['地方部の研修受講者数を', '5年間で2倍に'],
  ['中小企業のDX取組率を', '60%に引き上げ'],
];
const COLUMNS = [
  { label: '現状・課題', color: '#c0562b', fill: '#fbeee8' },
  { label: '対応（施策）', color: '#2a6ab0', fill: '#eaf1fa' },
  { label: '効果（目標）', color: '#4b7d2e', fill: '#eef5e8' },
];

const CHART_BAR = {
  title: 'デジタル人材の不足数（推計）',
  unit: '（万人）',
  data: [
    { label: '2022', value: 8.2 },
    { label: '2023', value: 9.5 },
    { label: '2024', value: 11.3 },
    { label: '2025', value: 12.8 },
    { label: '2026', value: 14.6 },
  ],
};
const CHART_LINE = {
  title: '研修受講者数の推移',
  unit: '（千人）',
  years: ['2021', '2022', '2023', '2024', '2025'],
  series: [
    { name: '都市部', color: '#2a6ab0', dash: null, values: [3.1, 3.8, 4.6, 5.2, 6.0] },
    { name: '地方部', color: '#d0792a', dash: [3, 2], values: [0.9, 1.1, 1.4, 1.6, 1.9] },
  ],
};
const CHART_STACK = {
  title: '企業規模別のDX取組状況',
  segments: [
    { name: '取組済', color: '#2a6ab0' },
    { name: '検討中', color: '#7fa7d6' },
    { name: '未着手', color: '#b9c2cf' },
  ],
  rows: [
    { label: '大企業', values: [62, 28, 10] },
    { label: '中堅企業', values: [41, 33, 26] },
    { label: '中小企業', values: [22, 30, 48] },
    { label: '小規模事業者', values: [9, 21, 70] },
  ],
};
const CHART_DONUT = {
  title: '支援対象者の内訳（目標）',
  centre: ['3万人', '目標'],
  data: [
    { name: '在職者', value: 45, color: '#2a6ab0' },
    { name: '離職者・求職者', value: 25, color: '#d0792a' },
    { name: '学生', value: 20, color: '#4b7d2e' },
    { name: 'その他', value: 10, color: '#9aa3ae' },
  ],
};
const SOURCE =
  '出典：国土産業振興省「地域デジタル人材実態調査（2026年）」、同「研修事業実績報告（2021〜2025年度）」を基に作成。2026年の不足数と目標値は事務局による試算。';
const PAGE_NO = '2';

const lines = (box) => box.join('');

export const meta = {
  title: 'Japanese ministry briefing slide (ポンチ絵) with flow boxes and four charts',
  stresses:
    'A4 landscape CJK slide; about twenty rounded boxes joined by arrows; four vector charts whose values are free data labels; 100% stacked bar and donut labels with no series link; rotated label on a vertical band',
  status: 'known-gap',
  issue: 302,
  families: ['vector-meaning', 'reading-order', 'vertical-rotated', 'scripts'],
  page: { size: 'A4', layout: 'landscape' },
};

const stackRow = (row) => row.values.map((value, i) => `${CHART_STACK.segments[i].name} ${value}%`).join(' / ');

export const truth = `
One A4 landscape slide from a fictional ministry (${HEADER.ministry}), labelled \`${HEADER.docLabel}\`,
dated ${HEADER.date}, page number \`${PAGE_NO}\` at the bottom right.

**Title bar:** ${HEADER.title}. Lead sentence: ${LEAD}
Callout at the top right: ${BUDGET.label} **${BUDGET.value}**${BUDGET.note}.

**Left band:** a pale vertical band down the left edge carries \`${BAND_LABEL}\` as real text rotated
90° counter-clockwise (reads bottom to top). It is a label for the whole slide, not part of the flow.

**Flow (three columns, left to right, joined by arrows):** each 課題 box has an arrow to the 施策
box on the same row; a large block arrow leads from the 施策 column to the 効果 column.

| ${COLUMNS[0].label} | → | ${COLUMNS[1].label} |
| --- | --- | --- |
${ISSUES.map((issue, i) => `| ${lines(issue)} | → | ${MEASURES[i][0]}：${MEASURES[i][1]} |`).join('\n')}

${COLUMNS[2].label}: ${EFFECTS.map(lines).join(' / ')}.

**Charts (bottom row, four panels, left to right).** Every value is a text data label placed next
to its bar, point or segment; nothing in the text says which label belongs to which series.

1. ${CHART_BAR.title} ${CHART_BAR.unit} — bar chart: ${CHART_BAR.data.map((d) => `${d.label} ${d.value}`).join(', ')}.
2. ${CHART_LINE.title} ${CHART_LINE.unit} — line chart, two series (legend at the top; 地方部 dashed):
${CHART_LINE.series.map((s) => `   - ${s.name}: ${s.values.map((v, i) => `${CHART_LINE.years[i]} ${v.toFixed(1)}`).join(', ')}`).join('\n')}
3. ${CHART_STACK.title} — 100% stacked horizontal bars, white percent labels inside the segments,
   legend below (${CHART_STACK.segments.map((s) => s.name).join(' / ')}):
${CHART_STACK.rows.map((row) => `   - ${row.label}: ${stackRow(row)}`).join('\n')}
4. ${CHART_DONUT.title} — donut, centre text \`${CHART_DONUT.centre.join(' ')}\`, percent labels on the ring,
   names in a legend to the right: ${CHART_DONUT.data.map((d) => `${d.name} ${d.value}%`).join(', ')}.

**Source note:** ${SOURCE}

## Questions an agent should be able to answer

1. デジタル人材の不足数が${CHART_BAR.data[3].value}万人と推計されているのは何年か？ — ${CHART_BAR.data[3].label}年
2. 2025年の地方部の研修受講者数は？ — ${CHART_LINE.series[1].values[4].toFixed(1)}千人（都市部は${CHART_LINE.series[0].values[4].toFixed(1)}千人）
3. 中小企業のうち、DXに「未着手」の割合は？ — ${CHART_STACK.rows[2].values[2]}%
4. 「${lines(ISSUES[3]).replace(/（.*$/u, '')}」という課題に対応する施策は？ — ${MEASURES[3][0]}
5. 支援対象者の内訳で最も割合が大きいのは何で、何%か？ — ${CHART_DONUT.data[0].name}、${CHART_DONUT.data[0].value}%

Partly fixed (#302, #265): \`### Chart values\` pairs three of the four charts with their series by
colour, each legend scoped to its own panel (取組済 and 在職者 share a colour across panels):
- Line chart: \`| 地方部 | 0.9 | 1.1 | 1.4 | 1.6 | 1.9 |\` under the years — question 2.
- Stacked bars: \`| 未着手 | 10% | 26% | 48% | 70% |\` under the company sizes — question 3. The
  小規模事業者 row's \`9%\` and \`21%\` come out as one text item and are left blank.
- Donut: \`在職者 | 45%\` — question 5.
- Bar chart (one series, no legend): read bar by bar inside its frame, the title first: \`(万人)\` /
  \`8.2\` / \`2022\` / … / \`14.6\` / \`2026\`, so question 1 (12.8 → 2025) is answered by adjacency.
- Flow: \`### Connections\` lists the four 課題 → 施策 arrows, so question 4 is answered from the drawing;
  the block arrow into the 効果 column joins columns, not boxes, and is not listed.

**Known gap (#302):** the layout table (\`Table 1 (6 rows × 5 columns)\`) still spans the bar, line and
stacked charts and mixes \`12.8 | 中堅企業 | 41% | 33% | 26%\` into one row, and \`vector_chart_labels\`
still names the whole chart row (the stacked chart has blanks). \`①〜④\` come back NFKC-normalised as
\`1〜4\` (intended). The rotated band label \`${BAND_LABEL}\` reads correctly.
`;

// ---------------------------------------------------------------------------
// Drawing

function roundBox(doc, x, y, w, hgt, { stroke, fill, r = 5, width = 0.8 }) {
  if (fill) doc.roundedRect(x, y, w, hgt, r).fill(fill);
  doc.roundedRect(x, y, w, hgt, r).lineWidth(width).stroke(stroke);
}

function arrow(doc, x1, y1, x2, y2, color) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 5;
  const bx = x2 - head * Math.cos(angle);
  const by = y2 - head * Math.sin(angle);
  doc.moveTo(x1, y1).lineTo(bx, by).lineWidth(1.2).stroke(color);
  doc
    .polygon(
      [x2, y2],
      [bx + 3 * Math.sin(angle), by - 3 * Math.cos(angle)],
      [bx - 3 * Math.sin(angle), by + 3 * Math.cos(angle)],
    )
    .fill(color);
}

function header(doc, h) {
  doc.rect(0, 0, W, 40).fill(NAVY);
  doc.fillColor('white');
  h.text(HEADER.title, 40, 9, { font: B, size: 18 });
  doc.roundedRect(W - 78, 10, 56, 20, 2).fill('white');
  doc.fillColor(NAVY);
  h.text(HEADER.docLabel, W - 50, 13, { font: B, size: 10, align: 'center' });
  doc.fillColor('white');
  h.text(HEADER.date, W - 88, 14, { font: R, size: 8.5, align: 'right' });

  doc.fillColor(INK);
  h.text(LEAD, 40, 50, { font: B, size: 10.5 });
  roundBox(doc, 660, 46, 170, 22, { stroke: '#c8272d', fill: '#fff4f4', r: 3, width: 1.2 });
  doc.fillColor('#c8272d');
  h.text(BUDGET.label, 668, 52, { font: B, size: 8.5 });
  h.text(BUDGET.value, 790, 49, { font: B, size: 12, align: 'right' });
  h.text(BUDGET.note, 791, 53, { font: R, size: 7.5 });
  doc.fillColor('black');
}

function leftBand(doc, h) {
  doc.rect(8, 76, 22, 488).fill('#dfe7f2');
  doc.fillColor(NAVY);
  doc.save();
  // Rotated 90° counter-clockwise about the band's centre: reads bottom to top.
  const cx = 19;
  const cy = 320;
  doc.rotate(-90, { origin: [cx, cy] });
  h.text(BAND_LABEL, cx, cy - 6, { font: B, size: 10.5, align: 'center' });
  doc.restore();
  doc.fillColor('black');
}

const COL_X = [
  { x: 40, w: 228 },
  { x: 292, w: 272 },
  { x: 594, w: 236 },
];
const FLOW_TOP = 78;
const ROW_TOP = 104;
const ROW_H = 40;
const ROW_GAP = 7;

function flow(doc, h) {
  COLUMNS.forEach((col, i) => {
    const { x, w } = COL_X[i];
    doc.roundedRect(x, FLOW_TOP, w, 20, 3).fill(col.color);
    doc.fillColor('white');
    h.text(col.label, x + w / 2, FLOW_TOP + 3, { font: B, size: 10.5, align: 'center' });
    doc.fillColor('black');
  });
  // Chevrons between the column headers.
  for (const gap of [
    [268, 292],
    [564, 594],
  ]) {
    const [a, b] = gap;
    const m = (a + b) / 2;
    doc.polygon([m - 6, FLOW_TOP + 2], [m + 4, FLOW_TOP + 10], [m - 6, FLOW_TOP + 18]).fill('#9aa3ae');
  }

  ISSUES.forEach((issue, i) => {
    const y = ROW_TOP + i * (ROW_H + ROW_GAP);
    const { x, w } = COL_X[0];
    roundBox(doc, x, y, w, ROW_H, { stroke: COLUMNS[0].color, fill: COLUMNS[0].fill });
    doc.fillColor(INK);
    h.text(issue[0], x + 8, y + 7, { font: B, size: 8.5 });
    h.text(issue[1], x + 8, y + 22, { font: R, size: 8 });

    const m = COL_X[1];
    roundBox(doc, m.x, y, m.w, ROW_H, { stroke: COLUMNS[1].color, fill: 'white' });
    doc.fillColor(COLUMNS[1].color);
    h.text(MEASURES[i][0], m.x + 8, y + 7, { font: B, size: 8.5 });
    doc.fillColor(INK);
    h.text(MEASURES[i][1], m.x + 18, y + 22, { font: R, size: 8 });
    arrow(doc, x + w + 2, y + ROW_H / 2, m.x - 2, y + ROW_H / 2, '#7a8594');
  });

  // Block arrow from the measures to the effects.
  const top = ROW_TOP;
  const bottom = ROW_TOP + 4 * ROW_H + 3 * ROW_GAP;
  const mid = (top + bottom) / 2;
  doc
    .polygon(
      [568, top + 30],
      [580, top + 30],
      [580, top + 10],
      [592, mid],
      [580, bottom - 10],
      [580, bottom - 30],
      [568, bottom - 30],
    )
    .fill('#c9d6e6');

  const effectH = 52;
  const effectGap = (bottom - top - EFFECTS.length * effectH) / (EFFECTS.length - 1);
  EFFECTS.forEach((effect, i) => {
    const y = top + i * (effectH + effectGap);
    const { x, w } = COL_X[2];
    roundBox(doc, x, y, w, effectH, { stroke: COLUMNS[2].color, fill: COLUMNS[2].fill, r: 8, width: 1.2 });
    doc.fillColor(INK);
    h.text(effect[0], x + w / 2, y + 10, { font: R, size: 9, align: 'center' });
    doc.fillColor(COLUMNS[2].color);
    h.text(effect[1], x + w / 2, y + 26, { font: B, size: 11, align: 'center' });
  });
  doc.fillColor('black');
}

// Chart panels across the bottom of the slide.
const PANEL_TOP = 308;
const PANEL_H = 250;
const PANEL_W = 190;
const PANEL_X = [40, 238, 436, 634];

function panel(doc, h, x, title) {
  roundBox(doc, x, PANEL_TOP, PANEL_W, PANEL_H, { stroke: '#b5bdc8', fill: 'white', r: 6 });
  doc.rect(x + 8, PANEL_TOP + 9, 4, 12).fill(NAVY);
  doc.fillColor(INK);
  h.text(title, x + 16, PANEL_TOP + 8, { font: B, size: 9 });
  doc.fillColor('black');
}

function barChart(doc, h, x) {
  panel(doc, h, x, CHART_BAR.title);
  doc.fillColor(GREY);
  h.text(CHART_BAR.unit, x + 12, PANEL_TOP + 30, { font: R, size: 7 });
  const left = x + 18;
  const right = x + PANEL_W - 12;
  const base = PANEL_TOP + PANEL_H - 30;
  const top = PANEL_TOP + 60;
  const max = 16;
  doc.moveTo(left, base).lineTo(right, base).lineWidth(0.8).stroke('#8a93a0');
  const slot = (right - left) / CHART_BAR.data.length;
  CHART_BAR.data.forEach((d, i) => {
    const bw = slot * 0.56;
    const bx = left + i * slot + (slot - bw) / 2;
    const by = base - ((base - top) * d.value) / max;
    doc.rect(bx, by, bw, base - by).fill(i === CHART_BAR.data.length - 1 ? '#c0562b' : '#7fa7d6');
    doc.fillColor(INK);
    h.text(String(d.value), bx + bw / 2, by - 12, { font: B, size: 8, align: 'center' });
    doc.fillColor(GREY);
    h.text(d.label, bx + bw / 2, base + 5, { font: R, size: 7.5, align: 'center' });
  });
  doc.fillColor('black');
}

function lineChart(doc, h, x) {
  panel(doc, h, x, CHART_LINE.title);
  doc.fillColor(GREY);
  h.text(CHART_LINE.unit, x + 12, PANEL_TOP + 30, { font: R, size: 7 });
  // Legend at the top right.
  CHART_LINE.series.forEach((s, i) => {
    const lx = x + 84 + i * 52;
    const ly = PANEL_TOP + 34;
    doc
      .moveTo(lx, ly)
      .lineTo(lx + 14, ly)
      .lineWidth(1.5);
    if (s.dash) doc.dash(s.dash[0], { space: s.dash[1] });
    doc.stroke(s.color);
    doc.undash();
    doc.fillColor(INK);
    h.text(s.name, lx + 17, ly - 5, { font: R, size: 7.5 });
  });
  const left = x + 22;
  const right = x + PANEL_W - 16;
  const base = PANEL_TOP + PANEL_H - 30;
  const top = PANEL_TOP + 62;
  const max = 7;
  doc.moveTo(left, base).lineTo(right, base).lineWidth(0.8).stroke('#8a93a0');
  for (let v = 1; v < max; v += 2) {
    const gy = base - ((base - top) * v) / max;
    doc.moveTo(left, gy).lineTo(right, gy).lineWidth(0.3).stroke('#dde2e8');
  }
  const step = (right - left) / (CHART_LINE.years.length - 1);
  const px = (i) => left + i * step;
  const py = (v) => base - ((base - top) * v) / max;
  CHART_LINE.years.forEach((year, i) => {
    doc.fillColor(GREY);
    h.text(year, px(i), base + 5, { font: R, size: 7.5, align: 'center' });
  });
  CHART_LINE.series.forEach((s, si) => {
    doc.moveTo(px(0), py(s.values[0]));
    s.values.forEach((v, i) => {
      if (i > 0) doc.lineTo(px(i), py(v));
    });
    doc.lineWidth(1.6);
    if (s.dash) doc.dash(s.dash[0], { space: s.dash[1] });
    doc.stroke(s.color);
    doc.undash();
    s.values.forEach((v, i) => {
      if (si === 0) doc.circle(px(i), py(v), 2.4).fill(s.color);
      else doc.rect(px(i) - 2.2, py(v) - 2.2, 4.4, 4.4).fill(s.color);
      doc.fillColor(s.color);
      // Labels above the upper series, below the lower one.
      const ly = si === 0 ? py(v) - 13 : py(v) + 5;
      h.text(v.toFixed(1), px(i), ly, { font: B, size: 7.5, align: 'center' });
    });
  });
  doc.fillColor('black');
}

function stackChart(doc, h, x) {
  panel(doc, h, x, CHART_STACK.title);
  const labelRight = x + 62;
  const left = x + 66;
  const right = x + PANEL_W - 10;
  const rowH = 22;
  const gap = 14;
  CHART_STACK.rows.forEach((row, ri) => {
    const y = PANEL_TOP + 42 + ri * (rowH + gap);
    doc.fillColor(INK);
    h.text(row.label, labelRight, y + 6, { font: R, size: 7.5, align: 'right' });
    let cursor = left;
    row.values.forEach((value, si) => {
      const w = ((right - left) * value) / 100;
      doc.rect(cursor, y, w, rowH).fill(CHART_STACK.segments[si].color);
      doc.fillColor(si === 2 ? INK : 'white');
      h.text(`${value}%`, cursor + w / 2, y + 6.5, { font: B, size: 7, align: 'center' });
      cursor += w;
    });
  });
  // Legend below the bars.
  const ly = PANEL_TOP + PANEL_H - 28;
  CHART_STACK.segments.forEach((s, i) => {
    const lx = x + 30 + i * 52;
    doc.rect(lx, ly + 1, 8, 8).fill(s.color);
    doc.fillColor(INK);
    h.text(s.name, lx + 11, ly, { font: R, size: 7.5 });
  });
  doc.fillColor('black');
}

function donutChart(doc, h, x) {
  panel(doc, h, x, CHART_DONUT.title);
  const cx = x + 64;
  const cy = PANEL_TOP + 138;
  const outer = 50;
  const inner = 28;
  let start = -Math.PI / 2;
  for (const d of CHART_DONUT.data) {
    const sweep = (2 * Math.PI * d.value) / 100;
    const steps = Math.max(8, Math.round(d.value * 1.2));
    const points = [];
    for (let k = 0; k <= steps; k++) {
      const a = start + (sweep * k) / steps;
      points.push([cx + outer * Math.cos(a), cy + outer * Math.sin(a)]);
    }
    for (let k = steps; k >= 0; k--) {
      const a = start + (sweep * k) / steps;
      points.push([cx + inner * Math.cos(a), cy + inner * Math.sin(a)]);
    }
    doc.polygon(...points.map(([px, py]) => [Number(px.toFixed(2)), Number(py.toFixed(2))])).fill(d.color);
    const mid = start + sweep / 2;
    const r = (outer + inner) / 2;
    doc.fillColor('white');
    h.text(`${d.value}%`, cx + r * Math.cos(mid), cy + r * Math.sin(mid) - 4.5, { font: B, size: 7, align: 'center' });
    start += sweep;
  }
  doc.fillColor(INK);
  h.text(CHART_DONUT.centre[0], cx, cy - 9, { font: B, size: 9.5, align: 'center' });
  h.text(CHART_DONUT.centre[1], cx, cy + 3, { font: R, size: 7, align: 'center' });
  CHART_DONUT.data.forEach((d, i) => {
    const ly = PANEL_TOP + 104 + i * 18;
    const lx = x + 122;
    doc.rect(lx, ly + 1, 8, 8).fill(d.color);
    doc.fillColor(INK);
    h.text(d.name, lx + 11, ly, { font: R, size: 7 });
  });
  doc.fillColor('black');
}

export function draw(doc, h) {
  header(doc, h);
  leftBand(doc, h);
  flow(doc, h);
  barChart(doc, h, PANEL_X[0]);
  lineChart(doc, h, PANEL_X[1]);
  stackChart(doc, h, PANEL_X[2]);
  donutChart(doc, h, PANEL_X[3]);
  doc.fillColor(GREY);
  h.text(SOURCE, 40, 566, { font: R, size: 7 });
  h.text(PAGE_NO, W - 14, 576, { font: R, size: 8, align: 'right' });
  doc.fillColor('black');
}
