// A four-page A4 status report as a word processor exports it: running
// header (report title + current section) and footer (page X of Y and a
// confidentiality note) on every page, bookmarks for the headings, a
// numbered list and a footnote on page 1, a table that breaks across pages
// 2–3 with its header row repeated under a "(continued)" caption, and an
// appendix page stored portrait with /Rotate 90 so a wide table reads
// landscape — its header and footer turned with it.

const SANS = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const SERIF = 'Times-Roman';

const REPORT = 'Fleet Electrification Programme — Q3 2026 Status Report';
const COMPANY = 'Harbourline Logistics';
const CONFIDENTIAL = 'Confidential — Harbourline Logistics internal use only';
const PAGES = 4;

const SUMMARY = [
  'The programme replaces diesel vans at our regional depots with battery-electric vehicles and installs the ' +
    'charging they need. This report covers the third quarter of 2026 and the position at 30 September.',
  'Overall the programme is on budget and four weeks behind the charger schedule set in January. Vehicle ' +
    'deliveries are ahead of plan, so the constraint for the rest of the year is charging capacity, not vehicles.',
];
const FOOTNOTE = 'Budget figures exclude grid-connection fees, which the network operators invoice separately.';
const ROLLOUT_INTRO =
  'Table 1 lists every depot in the programme with chargers planned for the end of 2026, chargers installed at ' +
  '30 September, average utilisation over September, and status. Utilisation is not reported for depots with ' +
  'fewer than four weeks of operation.';

const REGIONS = ['North', 'West', 'South', 'East'];
const DEPOT_NAMES = [
  'Aberdeen',
  'Antwerp',
  'Bremen-Nord',
  'Bristol',
  'Calais',
  'Cardiff',
  'Cork',
  'Dortmund',
  'Dublin Port',
  'Edinburgh',
  'Eindhoven',
  'Gdansk',
  'Ghent',
  'Glasgow',
  'Hamburg-Süd',
  'Hull',
  'Leeds',
  'Le Havre',
  'Lille',
  'Liverpool',
  'Lyon-Est',
  'Malmö',
  'Manchester',
  'Nantes',
  'Newcastle',
  'Nottingham',
  'Rotterdam',
  'Southampton',
  'Szczecin',
  'Utrecht',
  'Valenciennes',
  'Zeebrugge',
  'Bordeaux',
  'Brest',
  'Kiel',
  'Lübeck',
  'Plymouth',
  'Poznan',
  'Reims',
  'Rouen',
  'Aarhus',
  'Bilbao',
  'Odense',
  'Turku',
  'Wroclaw',
].sort((a, b) => a.localeCompare(b, 'en'));
const STATUS = ['Complete', 'On track', 'On track', 'Delayed', 'On track', 'Complete'];
// Deterministic, plausible numbers; two depots blocked on grid upgrades.
const DEPOTS = DEPOT_NAMES.map((name, i) => {
  const planned = 10 + ((i * 7) % 12);
  const blocked = name === 'Gdansk' || name === 'Valenciennes';
  const status = blocked ? 'Grid upgrade' : STATUS[i % STATUS.length];
  const installed = blocked ? 0 : status === 'Complete' ? planned : Math.max(4, planned - 2 - ((i * 3) % 7));
  const utilisation = installed === 0 ? '—' : `${48 + ((i * 11) % 31)}%`;
  return { name, region: REGIONS[(i * 3 + (i >> 2)) % 4], planned, installed, utilisation, status };
});
const TOTAL = {
  planned: DEPOTS.reduce((sum, d) => sum + d.planned, 0),
  installed: DEPOTS.reduce((sum, d) => sum + d.installed, 0),
};
const FINDINGS = [
  `Chargers installed rose from 212 to ${TOTAL.installed} in the quarter, against a year-end target of ${TOTAL.planned}.`,
  'Average charger utilisation reached 63%, above the 55% planning assumption.',
  'Two depots remain blocked on grid upgrades; both have dates confirmed by the network operator.',
  'Spend to date is EUR 18.4 million of the EUR 31.0 million budget.',
];
const TABLE_HEAD = ['Depot', 'Region', 'Planned', 'Installed', 'Utilisation', 'Status'];
const RISKS = [
  ['Grid capacity', 'Two depots wait on transformer upgrades scheduled for November and January.'],
  [
    'Installer availability',
    'A second installation contractor was onboarded in August to recover the four-week delay.',
  ],
  ['Cold-weather range', 'Winter range tests start in December at the three northernmost depots.'],
];

const APPENDIX = 'Appendix A — Vehicle cost comparison by model';
const VEHICLE_HEAD = [
  'Model',
  'Class',
  'Units',
  'Range (km)',
  'Battery (kWh)',
  'Price (EUR k)',
  'Energy / 100 km',
  'Maint. (EUR/yr)',
  '5-yr TCO (EUR k)',
  'CO2 saved (t/yr)',
];
const VEHICLES = [
  ['Voltra e-Van 3.5', 'Large van', '64', '310', '90', '58.4', 'EUR 7.10', '1,150', '91.2', '9.8'],
  ['Kestrel Cargo E', 'Large van', '41', '285', '75', '54.9', 'EUR 6.80', '1,240', '89.6', '9.1'],
  ['Mobion City', 'Small van', '88', '220', '50', '36.2', 'EUR 4.90', '880', '61.8', '6.2'],
  ['Arcadia eTransit', 'Large van', '22', '340', '100', '63.0', 'EUR 7.40', '1,100', '96.5', '10.4'],
  ['Mobion City LR', 'Small van', '35', '275', '64', '39.8', 'EUR 5.10', '900', '66.0', '6.5'],
  ['Northway 7.5t E', 'Light truck', '12', '230', '140', '118.0', 'EUR 14.20', '2,600', '182.4', '21.7'],
];
const VEHICLE_NOTE =
  'TCO includes purchase, energy at contracted depot tariffs, maintenance and insurance over five years at ' +
  '28,000 km per year; it excludes residual value.';

export const meta = {
  title: 'Four-page report with a continued table and a rotated appendix',
  stresses:
    'A4; running header/footer; bookmarks; numbered list and footnote; table continued across pages with a repeated header; a /Rotate 90 landscape page',
  status: 'ok',
  families: ['structure', 'tables', 'vertical-rotated', 'interactive'],
  page: { size: 'A4' },
};

const SECTIONS = ['1  Executive summary', '2  Depot rollout', '3  Risks and mitigations', APPENDIX];
const lowestTco = VEHICLES.reduce((best, v) => (Number(v[8]) < Number(best[8]) ? v : best));
const continuedDepot = DEPOTS.find((d) => d.name === 'Utrecht');

export const truth = `
${REPORT}, ${COMPANY}. Four A4 pages. Every page has a running header (\`${REPORT}\` and the
current section name) and a footer (\`${CONFIDENTIAL}\`, \`Page N of ${PAGES}\`); a good reading may
report them once as repeated chrome. Bookmarks: ${SECTIONS.map((s) => `\`${s}\``).join(', ')}, with
\`Table 1\` nested under section 2.

**Page 1 — 1 Executive summary.** ${SUMMARY.join(' ')} Key points (numbered 1–${FINDINGS.length}):

${FINDINGS.map((f, i) => `${i + 1}. ${f}`).join('\n')}

The budget sentence carries footnote 1: “${FOOTNOTE}”

**Pages 2–3 — 2 Depot rollout.** ${ROLLOUT_INTRO} Table 1 starts on page 2 and continues on page 3
under \`Table 1 (continued)\` with the header row repeated. A correct reading treats it as one
table (the repeated header is not a data row):

| ${TABLE_HEAD.join(' | ')} |
| --- | --- | ---: | ---: | ---: | --- |
${DEPOTS.map((d) => `| ${d.name} | ${d.region} | ${d.planned} | ${d.installed} | ${d.utilisation} | ${d.status} |`).join('\n')}
| **Total** | | **${TOTAL.planned}** | **${TOTAL.installed}** | | |

**Page 3 — 3 Risks and mitigations.** ${RISKS.map(([k, v]) => `${k}: ${v}`).join(' ')}

**Page 4 — ${APPENDIX}.** Stored portrait with \`/Rotate 90\`; it displays landscape and its header and
footer are turned with the page. A correct reading presents it upright:

| ${VEHICLE_HEAD.join(' | ')} |
| --- | --- | ${VEHICLE_HEAD.slice(2)
  .map(() => '---:')
  .join(' | ')} |
${VEHICLES.map((v) => `| ${v.join(' | ')} |`).join('\n')}

Note: ${VEHICLE_NOTE}

## Questions an agent should be able to answer

1. How many chargers are installed at ${continuedDepot.name} (a row on page 3), and what is its status? — ${continuedDepot.installed} of ${continuedDepot.planned} planned, ${continuedDepot.status}
2. How many chargers are installed across all depots? — ${TOTAL.installed} (of ${TOTAL.planned} planned)
3. Which vehicle model has the lowest five-year TCO, and what is it? — ${lowestTco[0]}, EUR ${lowestTco[8]}k
4. Do the budget figures include grid-connection fees? — No (footnote 1)
5. Which depots are blocked on grid upgrades? — ${DEPOTS.filter((d) => d.status === 'Grid upgrade')
  .map((d) => d.name)
  .join(' and ')}

**Current reading (ok — page 4 is covered by warnings):** questions 1, 2, 4 and 5 are answered from
\`read.md\`. Table 1 is detected on both pages with its rows intact and the header row
\`${TABLE_HEAD.join(' | ')}\` as its first row, one label per column, on page 3 as well; the
captions stay outside the table (fixed in #253, before which the caption and the header were glued
into the first data cell and the columns had no names). The two halves are still reported as two
separate tables. The running title is dropped as repeated chrome; the varying
section name in the header is kept, so page 3 shows \`3 Risks and mitigations\` twice, the first time
between \`Table 1 (continued)\` and the table's header row. The page bodies are flattened column by column under \`tabular_numeric_layout\`.

Page 4 (\`/Rotate 90\`) is read upright, exactly as the same page stored landscape would be: the
running title is dropped as repeated chrome and the section name shows twice, as on page 3. The
body is flattened column by column like pages 2–3 — each column header (\`Model\`, \`Range (km)\`,
\`5-yr TCO CO2 saved (EUR k)\` …) followed by its six values in row order. Layout table 1 merges two
header pairs (\`Price Energy / 100 km\`, \`5-yr TCO CO2 saved\`) and keeps only the last data row
whole; rows 1–5 carry the Energy-to-CO2 values with no model name. Question 3 is answerable by
pairing positions in the \`Model\` and \`5-yr TCO\` lists (the third entry of each: Mobion City,
61.8), not from the table. \`layout_table_uncertain\` names the table's render region and
\`reading_order_divergence\` says to render the page, so the agent is told to check; the render is
upright and correct.
`;

const M = 56;

function chrome(h, width, height, page, section) {
  h.text(REPORT, M, 28, { font: SANS, size: 8 });
  h.text(section, width - M, 28, { font: SANS, size: 8, align: 'right' });
  h.rule(M, 42, width - M, { width: 0.5 });
  h.rule(M, height - 44, width - M, { width: 0.5 });
  h.text(CONFIDENTIAL, M, height - 36, { font: SANS, size: 7.5 });
  h.text(`Page ${page} of ${PAGES}`, width - M, height - 36, { font: SANS, size: 7.5, align: 'right' });
}

function heading(h, text, y) {
  h.text(text, M, y, { font: BOLD, size: 14 });
  return y + 26;
}

// Rows run until the footer band, as a word processor breaks a table.
function depotTable(doc, h, rows, y, width, { continued, total, bottom = Infinity }) {
  const cols = [M + 4, M + 130, M + 250, M + 315, M + 390, M + 410];
  h.text(continued ? 'Table 1 (continued)' : 'Table 1: Depot charging deployment at 30 September 2026', M, y, {
    font: BOLD,
    size: 9,
  });
  y += 16;
  doc.rect(M, y - 3, width - 2 * M, 16).fill('#e6ebf1');
  doc.fillColor('black');
  TABLE_HEAD.forEach((label, i) => {
    h.text(label, cols[i], y, { font: BOLD, size: 8.5, align: i >= 2 && i <= 4 ? 'right' : 'left' });
  });
  y += 16;
  let drawn = 0;
  for (const d of rows) {
    if (y + 15 > bottom) break;
    drawn++;
    const cells = [d.name, d.region, String(d.planned), String(d.installed), d.utilisation, d.status];
    cells.forEach((cell, i) => {
      h.text(cell, cols[i], y, { font: SANS, size: 8.5, align: i >= 2 && i <= 4 ? 'right' : 'left' });
    });
    y += 15;
    h.rule(M, y - 3, width - M, { width: 0.2 });
  }
  if (total) {
    h.rule(M, y - 3, width - M, { width: 0.8 });
    h.text('Total', cols[0], y, { font: BOLD, size: 8.5 });
    h.text(String(TOTAL.planned), cols[2], y, { font: BOLD, size: 8.5, align: 'right' });
    h.text(String(TOTAL.installed), cols[3], y, { font: BOLD, size: 8.5, align: 'right' });
    y += 15;
  }
  return { y, drawn };
}

export function draw(doc, h) {
  const { width, height } = doc.page;
  const body = { font: SERIF, size: 11, lineGap: 2.5, align: 'justify' };

  // Page 1.
  chrome(h, width, height, 1, SECTIONS[0]);
  doc.outline.addItem(SECTIONS[0]);
  h.text(REPORT, M, 70, { font: BOLD, size: 17 });
  h.text(`${COMPANY} · Programme Office · 14 October 2026`, M, 94, { font: SANS, size: 9.5 });
  let y = heading(h, SECTIONS[0], 130);
  for (const para of SUMMARY) y = h.paragraph(para, M, y, width - 2 * M, body) + 8;
  h.text('Key points this quarter:', M, y, { font: BOLD, size: 11 });
  y += 18;
  FINDINGS.forEach((finding, i) => {
    h.text(`${i + 1}.`, M + 8, y, { font: SERIF, size: 11 });
    const text = i === FINDINGS.length - 1 ? finding.replace(/\.$/u, '') : finding;
    const end = h.paragraph(text, M + 26, y, width - 2 * M - 26, body);
    if (i === FINDINGS.length - 1) {
      // Footnote marker after the last word of the budget sentence, then the period.
      doc.font(SERIF).fontSize(11);
      const lineWidth = doc.widthOfString(text);
      const x = M + 26 + lineWidth;
      h.run([{ sup: '1' }, '.'], x, y, { font: SERIF, size: 11 });
    }
    y = end + 6;
  });
  h.rule(M, height - 80, M + 120, { width: 0.4 });
  h.run([{ sup: '1' }, ` ${FOOTNOTE}`], M, height - 74, { font: SERIF, size: 8.5 });

  // Pages 2–3: Table 1 across the break.
  h.newPage();
  chrome(h, width, height, 2, SECTIONS[1]);
  const rollout = doc.outline.addItem(SECTIONS[1]);
  rollout.addItem('Table 1: Depot charging deployment');
  y = heading(h, SECTIONS[1], 70);
  y = h.paragraph(ROLLOUT_INTRO, M, y, width - 2 * M, body) + 14;
  const { drawn } = depotTable(doc, h, DEPOTS, y, width, { continued: false, total: false, bottom: height - 60 });

  h.newPage();
  chrome(h, width, height, 3, SECTIONS[2]);
  ({ y } = depotTable(doc, h, DEPOTS.slice(drawn), 70, width, { continued: true, total: true }));
  doc.outline.addItem(SECTIONS[2]);
  y = heading(h, SECTIONS[2], y + 24);
  for (const [risk, text] of RISKS) {
    h.text(risk, M, y, { font: BOLD, size: 11 });
    y = h.paragraph(text, M + 140, y, width - 2 * M - 140, body) + 10;
  }

  // Page 4: landscape appendix stored as a rotated portrait page.
  h.newPage();
  doc.outline.addItem(APPENDIX);
  const view = h.rotateClockwise();
  chrome(h, view.width, view.height, 4, APPENDIX);
  y = heading(h, APPENDIX, 66);
  const cols = [M + 4, M + 120, M + 225, M + 290, M + 360, M + 430, M + 510, M + 590, M + 670, M + 726];
  doc.rect(M, y - 4, view.width - 2 * M, 30).fill('#e6ebf1');
  doc.fillColor('black');
  VEHICLE_HEAD.forEach((label, i) => {
    // Two-line header cells, right-aligned over numeric columns.
    const [first, second = ''] = label.includes(' (') ? [label.split(' (')[0], `(${label.split(' (')[1]}`] : [label];
    const align = i >= 2 ? 'right' : 'left';
    h.text(first, cols[i], y, { font: BOLD, size: 8.5, align });
    if (second) h.text(second, cols[i], y + 11, { font: BOLD, size: 8.5, align });
  });
  y += 32;
  for (const v of VEHICLES) {
    v.forEach((cell, i) => {
      h.text(cell, cols[i], y, { font: SANS, size: 9, align: i >= 2 ? 'right' : 'left' });
    });
    y += 18;
    h.rule(M, y - 4, view.width - M, { width: 0.2 });
  }
  h.paragraph(VEHICLE_NOTE, M, y + 10, view.width - 2 * M, { font: SERIF, size: 9.5, lineGap: 1.5 });
}
