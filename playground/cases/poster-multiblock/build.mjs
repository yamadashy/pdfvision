// An academic conference poster on one A0 landscape page: a full-width title
// banner with authors, affiliations and a QR-code-like square; four columns of
// titled blocks of unequal height (Introduction, Methods, Results, Conclusions,
// References, Acknowledgements); two vector charts whose tick labels, legend
// and value labels are real text; and a results table.

import { drawLine, wrapLines } from '../../lib/layoutB.mjs';

const H = 'Helvetica';
const HB = 'Helvetica-Bold';
const HO = 'Helvetica-Oblique';
const NAVY = '#183a5a';
const ORANGE = '#e07a1f';

const PAGE = { width: 3370, height: 2384 };
const TITLE = 'Thermal drones spot heat stress in dairy cattle before it shows';
const AUTHORS = [
  { name: 'Aoife Brennan', mark: '1' },
  { name: 'Kwame Asante', mark: '2' },
  { name: 'Sofia Lindgren', mark: '1' },
  { name: 'Rahul Menon', mark: '1,3' },
];
const AFFILIATIONS = [
  '1 School of Agriculture and Food Science, Corrib Valley University',
  '2 Institute for Precision Livestock, Tamale Polytechnic',
  '3 Northfield Dairy Research Farm',
];
const CONFERENCE = 'International Conference on Precision Livestock Farming · Ghent · 2026';
const QR_CAPTION = 'Paper and code';

const BLOCKS = [
  [
    {
      title: 'Introduction',
      body: [
        'Heat stress costs dairy farms milk yield, fertility and animal welfare, and it is getting more common as summers warm. Farmers usually notice it from panting or crowding at water troughs, by which time the cow has already lost condition.',
        'Body-surface temperature rises earlier, but handheld thermometers do not scale to a herd of several hundred animals on pasture.',
        {
          bullets: [
            'Can a drone with a thermal camera find heat-stressed cows earlier than visual checks?',
            'Does it work across farms with different breeds and pasture layouts?',
          ],
        },
      ],
    },
    {
      title: 'Methods',
      body: [
        'We flew a quadcopter carrying a radiometric thermal camera over three pasture-based farms twice a day for 62 days in the summer of 2025, a total of 371 flights.',
        'A detector located each cow in the thermal frames and read the maximum temperature over the eye and the muzzle. A cow was flagged when either reading rose 1.2 °C above her own rolling 7-day baseline.',
        'Flags were compared with heat-stress events recorded by trained observers using a panting score, who did not see the drone results.',
      ],
    },
  ],
  [
    {
      title: 'Results',
      body: [
        'The drone flagged 87% of the observer-confirmed heat-stress events, with a median lead time of 38 minutes before the first visible panting.',
        { figure: 'bars' },
        'Detection was lowest on the Kilbrack farm, where tree cover hid cows from the camera during the afternoon flight.',
      ],
    },
  ],
  [
    {
      title: 'Results (continued)',
      body: [
        { figure: 'lines' },
        'Eye temperature separated stressed from unstressed cows better than muzzle temperature at every hour of the day.',
        { table: true },
      ],
    },
  ],
  [
    {
      title: 'Conclusions',
      body: [
        {
          bullets: [
            'Thermal drones detect heat stress earlier than visual checks.',
            'Eye temperature against each cow’s own baseline is the most reliable signal.',
            'Tree cover is the main source of missed events; flight timing can reduce it.',
          ],
        },
      ],
    },
    {
      title: 'References',
      small: true,
      body: [
        '[1] Hale, M. & Ortiz, P. (2023). Heat load and milk yield in pasture dairy herds. J. Dairy Sci. Practice 12, 44–58.',
        '[2] Okonkwo, T. et al. (2024). Infrared thermography of the bovine eye. Vet. Imaging Rev. 9, 101–113.',
        '[3] Varga, L. (2025). Small-object detection in aerial thermal video. Remote Sens. Agric. 5, 7–19.',
      ],
    },
    {
      title: 'Acknowledgements',
      small: true,
      body: [
        'Funded by the Corrib Valley Agri-Innovation Fund (grant CVA-2024-031). We thank the three host farms and the observers who scored 9,200 cow-hours.',
      ],
    },
  ],
];

const BAR_DATA = {
  title: 'Figure 1. Detection rate by farm',
  axis: 'Events detected (%)',
  series: ['Drone', 'Visual check'],
  groups: [
    { farm: 'Northfield', values: [91, 64] },
    { farm: 'Ardmore', values: [89, 58] },
    { farm: 'Kilbrack', values: [78, 61] },
  ],
};
const LINE_DATA = {
  title: 'Figure 2. Separation of stressed and unstressed cows (AUC) by time of day',
  axis: 'AUC',
  hours: ['07:00', '10:00', '13:00', '16:00', '19:00'],
  series: [
    { name: 'Eye', values: [0.84, 0.88, 0.93, 0.91, 0.86] },
    { name: 'Muzzle', values: [0.71, 0.75, 0.8, 0.78, 0.73] },
  ],
};
const TABLE = {
  title: 'Table 1. Event-level detection (all farms)',
  head: ['Method', 'Precision', 'Recall', 'F1'],
  rows: [
    ['Visual check', '0.95', '0.61', '0.74'],
    ['Collar sensor', '0.72', '0.69', '0.70'],
    ['Drone, muzzle', '0.76', '0.79', '0.77'],
    ['Drone, eye', '0.83', '0.87', '0.85'],
  ],
};

export const meta = {
  title: 'Conference poster, A0 landscape',
  stresses:
    'A0 page; full-width banner over four columns of titled blocks of unequal height; vector charts with text tick labels, legends and value labels; table inside a column; QR-like vector square',
  status: 'known-gap',
  issue: 242,
  families: ['reading-order', 'page-geometry', 'vector-meaning', 'tables'],
  page: { size: [PAGE.width, PAGE.height] },
};

const plainBody = (item) => {
  if (typeof item === 'string') return item;
  if (item.bullets) return item.bullets.map((b) => `- ${b}`).join('\n');
  if (item.figure === 'bars')
    return `${BAR_DATA.title} (${BAR_DATA.axis}):\n\n| Farm | ${BAR_DATA.series.join(' | ')} |\n| --- | ---: | ---: |\n${BAR_DATA.groups.map((g) => `| ${g.farm} | ${g.values.join(' | ')} |`).join('\n')}`;
  if (item.figure === 'lines')
    return `${LINE_DATA.title}:\n\n| Series | ${LINE_DATA.hours.join(' | ')} |\n| --- | ${LINE_DATA.hours.map(() => '---:').join(' | ')} |\n${LINE_DATA.series.map((s) => `| ${s.name} | ${s.values.map((v) => v.toFixed(2)).join(' | ')} |`).join('\n')}`;
  if (item.table)
    return `${TABLE.title}:\n\n| ${TABLE.head.join(' | ')} |\n| --- | ---: | ---: | ---: |\n${TABLE.rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}`;
  return '';
};

export const truth = `
**${TITLE}**

${AUTHORS.map((a) => `${a.name}^${a.mark}`).join(', ')} — ${AFFILIATIONS.join('; ')}. ${CONFERENCE}.
A QR-code-like square (vector, no text) at the right of the banner, captioned “${QR_CAPTION}”.

Reading order: the banner, then each column top to bottom, left to right. Each block's text must
stay inside its block; chart labels belong to their figure.

${BLOCKS.map((column, c) => `_Column ${c + 1}_\n\n${column.map((block) => `**${block.title}**\n\n${block.body.map(plainBody).join('\n\n')}`).join('\n\n')}`).join('\n\n')}

## Questions an agent should be able to answer

1. What precision, recall and F1 does the eye-temperature drone method reach? — ${TABLE.rows[3].slice(1).join(', ')}
2. Which farm had the lowest drone detection rate, and why? — ${BAR_DATA.groups[2].farm} (${BAR_DATA.groups[2].values[0]}%); tree cover hid cows during the afternoon flight
3. How much earlier than visible panting did the drone flag heat stress? — A median of 38 minutes
4. What eye-temperature AUC does Figure 2 show at 13:00? — ${LINE_DATA.series[0].values[2].toFixed(2)}
5. Which institution is Kwame Asante affiliated with, and who funded the work? — ${AFFILIATIONS[1].slice(2)}; the Corrib Valley Agri-Innovation Fund (grant CVA-2024-031)

Questions 1, 3 and 5 are answerable from \`read.md\`; question 2's farm and reason come from the
prose (\`Detection was lowest on the Kilbrack farm, where tree cover…\`).

**Known gap (#242):** layout table 2 (4 × 6) fuses Table 1 with Methods prose on
the left and the Acknowledgements on the right (\`| We flew a quadcopter carrying a radiometric |
Collar sensor | 0.72 | 0.69 | 0.70 | Funded by the Corrib Valley Agri-Innovation Fund (grant |\`); its
\`Visual check\` row has lost its label, which \`layout_table_uncertain\` now points out (a row with values
but no label, overlapped by label text). Layout table 1 (2 × 7) is prose and chart labels from all four
columns; \`layout_table_uncertain\` flags that one too.

**Known gap (no issue yet):**
- Chart labels are scattered through two columns' text with no warning that names the figures:
  Figure 2's values come as \`Eye\` / \`1.0\` / \`0.9\` / \`0.84\` / … / \`Muzzle\` / \`0.93\` / \`0.88\` / \`0.80\` / \`0.75\` /
  \`10:00\` / \`13:00\`, interleaved with Table 1's columns, so question 4 (0.93 for Eye at 13:00) cannot be
  attributed; only the generic \`tabular_numeric_layout\` says to inspect the render "when values
  matter". Figure 1's bar values are split around \`Ardmore\` and \`Kilbrack\` (\`89\` / \`64\` / \`Ardmore\` /
  … / \`78\` / \`58\` / \`Kilbrack\` / … / \`61\`), so the Kilbrack drone rate (78%) is not recoverable either.
- The third affiliation, \`3 Northfield Dairy Research Farm\`, is spliced into the Results column, between
  \`Ardmore\` and \`87%\`.
- The widely justified first line of Results is broken into single words scattered through the
  column: \`The\` / \`drone\` … \`flagged\` … \`87%\` / \`of\` … \`the\`, so “87% of events” only survives as fragments.
- Table 1's F1 column is read after the References, interleaved line by line with the Acknowledgements.
`;

const MARGIN = 90;
const GUTTER = 70;
const COLUMN_W = (PAGE.width - 2 * MARGIN - 3 * GUTTER) / 4;
const BODY = { font: H, size: 38, leading: 50 };
const SMALL = { font: H, size: 30, leading: 39 };

function banner(doc, h) {
  doc.rect(0, 0, PAGE.width, 400).fill(NAVY);
  doc.fillColor('white');
  h.text(TITLE, PAGE.width / 2, 70, { font: HB, size: 84, align: 'center' });
  const segments = AUTHORS.flatMap((a, i) => [`${i ? ',   ' : ''}${a.name}`, { sup: a.mark }]);
  // Centre the author run by measuring it first.
  let width = 0;
  for (const s of segments) {
    const text = typeof s === 'string' ? s : s.sup;
    doc.font(H).fontSize(typeof s === 'string' ? 44 : 44 * 0.65);
    width += doc.widthOfString(text);
  }
  h.run(segments, PAGE.width / 2 - width / 2, 190, { font: H, size: 44 });
  AFFILIATIONS.forEach((aff, i) => {
    const [mark, ...rest] = aff.split(' ');
    doc.font(H).fontSize(30);
    const w = doc.widthOfString(` ${rest.join(' ')}`) + doc.font(H).fontSize(19.5).widthOfString(mark);
    h.run([{ sup: mark }, ` ${rest.join(' ')}`], PAGE.width / 2 - w / 2, 258 + i * 38, { font: H, size: 30 });
  });
  doc.fillColor('white');
  h.text(CONFERENCE, MARGIN, 40, { font: H, size: 24 });
  // A QR-like square: a deterministic module pattern with three finder squares.
  const qx = PAGE.width - MARGIN - 230;
  const qy = 70;
  const module = 9;
  doc.rect(qx - 12, qy - 12, 25 * module + 24, 25 * module + 24).fill('white');
  let state = 7;
  for (let r = 0; r < 25; r += 1) {
    for (let c = 0; c < 25; c += 1) {
      state = (state * 1103515245 + 12345) % 2147483648;
      const finder = (r < 7 && c < 7) || (r < 7 && c > 17) || (r > 17 && c < 7);
      if (finder) continue;
      if (state % 3 === 0) doc.rect(qx + c * module, qy + r * module, module, module).fill('black');
    }
  }
  for (const [fr, fc] of [
    [0, 0],
    [0, 18],
    [18, 0],
  ]) {
    doc.rect(qx + fc * module, qy + fr * module, 7 * module, 7 * module).fill('black');
    doc.rect(qx + (fc + 1) * module, qy + (fr + 1) * module, 5 * module, 5 * module).fill('white');
    doc.rect(qx + (fc + 2) * module, qy + (fr + 2) * module, 3 * module, 3 * module).fill('black');
  }
  doc.fillColor('white');
  h.text(QR_CAPTION, qx + (25 * module) / 2, qy + 25 * module + 20, { font: H, size: 22, align: 'center' });
  doc.fillColor('black');
}

function paragraph(doc, text, x, y, style) {
  const lines = wrapLines(doc, text, { font: style.font, size: style.size, width: COLUMN_W });
  lines.forEach(
    (line, i) =>
      void drawLine(doc, line, x, y + i * style.leading, {
        font: style.font,
        size: style.size,
        width: COLUMN_W,
        justify: true,
      }),
  );
  return y + lines.length * style.leading + style.leading * 0.5;
}

function bulletList(doc, items, x, y) {
  for (const item of items) {
    doc.circle(x + 8, y + 15, 6).fill(ORANGE);
    doc.fillColor('black');
    const lines = wrapLines(doc, item, { font: BODY.font, size: BODY.size, width: COLUMN_W - 34 });
    lines.forEach(
      (line, i) => void drawLine(doc, line, x + 34, y + i * BODY.leading, { ...BODY, width: COLUMN_W - 34 }),
    );
    y += lines.length * BODY.leading + 12;
  }
  return y + 10;
}

function barChart(doc, h, x, y) {
  const plot = { left: x + 90, right: x + COLUMN_W - 10, top: y + 70, bottom: y + 470 };
  const colors = [ORANGE, '#9aa9b8'];
  let lx = plot.left;
  BAR_DATA.series.forEach((name, i) => {
    doc.rect(lx, y + 14, 26, 26).fill(colors[i]);
    doc.fillColor('black');
    lx = h.text(name, lx + 36, y + 14, { font: H, size: 26 }).right + 40;
  });
  const yOf = (v) => plot.bottom - ((plot.bottom - plot.top) * v) / 100;
  doc.lineWidth(2).strokeColor('#333');
  doc.moveTo(plot.left, plot.top).lineTo(plot.left, plot.bottom).lineTo(plot.right, plot.bottom).stroke();
  for (let v = 0; v <= 100; v += 25) {
    doc
      .moveTo(plot.left - 10, yOf(v))
      .lineTo(plot.left, yOf(v))
      .stroke();
    h.text(String(v), plot.left - 16, yOf(v) - 12, { font: H, size: 24, align: 'right' });
  }
  doc.save();
  doc.rotate(-90, { origin: [x + 14, (plot.top + plot.bottom) / 2] });
  h.text(BAR_DATA.axis, x + 14, (plot.top + plot.bottom) / 2 - 12, { font: H, size: 24, align: 'center' });
  doc.restore();
  const slot = (plot.right - plot.left) / BAR_DATA.groups.length;
  BAR_DATA.groups.forEach((g, gi) => {
    const cx = plot.left + slot * (gi + 0.5);
    g.values.forEach((value, si) => {
      const bx = cx - 70 + si * 72;
      doc.rect(bx, yOf(value), 66, plot.bottom - yOf(value)).fill(colors[si]);
      doc.fillColor('black');
      h.text(`${value}`, bx + 33, yOf(value) - 32, { font: HB, size: 24, align: 'center' });
    });
    h.text(g.farm, cx, plot.bottom + 12, { font: H, size: 26, align: 'center' });
  });
  doc.strokeColor('black');
  const end = paragraph(doc, BAR_DATA.title, x, plot.bottom + 60, { font: HO, size: 26, leading: 33 });
  return end;
}

function lineChart(doc, h, x, y) {
  const plot = { left: x + 100, right: x + COLUMN_W - 30, top: y + 70, bottom: y + 460 };
  const min = 0.6;
  const max = 1.0;
  const yOf = (v) => plot.bottom - ((plot.bottom - plot.top) * (v - min)) / (max - min);
  const xOf = (i) => plot.left + 30 + ((plot.right - plot.left - 60) * i) / (LINE_DATA.hours.length - 1);
  const colors = [ORANGE, NAVY];
  let lx = plot.left;
  LINE_DATA.series.forEach((s, i) => {
    doc
      .moveTo(lx, y + 27)
      .lineTo(lx + 40, y + 27)
      .lineWidth(5)
      .stroke(colors[i]);
    doc.fillColor('black');
    lx = h.text(s.name, lx + 50, y + 14, { font: H, size: 26 }).right + 40;
  });
  doc.lineWidth(2).strokeColor('#333');
  doc.moveTo(plot.left, plot.top).lineTo(plot.left, plot.bottom).lineTo(plot.right, plot.bottom).stroke();
  for (let v = 0.6; v <= 1.0001; v += 0.1) {
    doc
      .moveTo(plot.left - 10, yOf(v))
      .lineTo(plot.left, yOf(v))
      .stroke();
    h.text(v.toFixed(1), plot.left - 16, yOf(v) - 12, { font: H, size: 24, align: 'right' });
  }
  LINE_DATA.hours.forEach(
    (hour, i) => void h.text(hour, xOf(i), plot.bottom + 12, { font: H, size: 24, align: 'center' }),
  );
  doc.save();
  doc.rotate(-90, { origin: [x + 14, (plot.top + plot.bottom) / 2] });
  h.text(LINE_DATA.axis, x + 14, (plot.top + plot.bottom) / 2 - 12, { font: H, size: 24, align: 'center' });
  doc.restore();
  LINE_DATA.series.forEach((s, si) => {
    s.values.forEach((v, i) => void (i === 0 ? doc.moveTo(xOf(i), yOf(v)) : doc.lineTo(xOf(i), yOf(v))));
    doc.lineWidth(5).stroke(colors[si]);
    s.values.forEach((v, i) => {
      doc.circle(xOf(i), yOf(v), 9).fill(colors[si]);
      doc.fillColor('black');
      h.text(v.toFixed(2), xOf(i), yOf(v) + (si === 0 ? -42 : 16), { font: H, size: 22, align: 'center' });
    });
  });
  doc.strokeColor('black');
  return paragraph(doc, LINE_DATA.title, x, plot.bottom + 60, { font: HO, size: 26, leading: 33 });
}

function table(doc, h, x, y) {
  y = paragraph(doc, TABLE.title, x, y, { font: HO, size: 26, leading: 33 }) - 6;
  const cols = [x, x + 300, x + 450, x + 600, x + COLUMN_W];
  h.rule(x, y, x + COLUMN_W, { width: 3 });
  y += 10;
  TABLE.head.forEach(
    (label, i) =>
      void h.text(label, i === 0 ? cols[0] + 6 : cols[i + 1] - 10, y, {
        font: HB,
        size: 26,
        align: i === 0 ? 'left' : 'right',
      }),
  );
  y += 40;
  h.rule(x, y, x + COLUMN_W, { width: 1.5 });
  y += 10;
  for (const row of TABLE.rows) {
    const font = row[0] === 'Drone, eye' ? HB : H;
    row.forEach(
      (cell, i) =>
        void h.text(cell, i === 0 ? cols[0] + 6 : cols[i + 1] - 10, y, {
          font,
          size: 26,
          align: i === 0 ? 'left' : 'right',
        }),
    );
    y += 40;
  }
  h.rule(x, y, x + COLUMN_W, { width: 3 });
  return y + 30;
}

export function draw(doc, h) {
  doc.rect(0, 0, PAGE.width, PAGE.height).fill('#f6f4ef');
  doc.fillColor('black');
  banner(doc, h);
  BLOCKS.forEach((column, c) => {
    const x = MARGIN + c * (COLUMN_W + GUTTER);
    let y = 470;
    for (const block of column) {
      const style = block.small ? SMALL : BODY;
      const top = y;
      doc.rect(x - 20, y, COLUMN_W + 40, 70).fill(NAVY);
      doc.fillColor('white');
      h.text(block.title, x, y + 17, { font: HB, size: 40 });
      doc.fillColor('black');
      y += 100;
      for (const item of block.body) {
        if (typeof item === 'string') y = paragraph(doc, item, x, y, style);
        else if (item.bullets) y = bulletList(doc, item.bullets, x, y);
        else if (item.figure === 'bars') y = barChart(doc, h, x, y) + 10;
        else if (item.figure === 'lines') y = lineChart(doc, h, x, y) + 10;
        else if (item.table) y = table(doc, h, x, y + 10);
      }
      doc
        .rect(x - 20, top, COLUMN_W + 40, y - top)
        .lineWidth(2)
        .stroke('#c9d3dc');
      doc.strokeColor('black');
      y += 50;
    }
  });
}
