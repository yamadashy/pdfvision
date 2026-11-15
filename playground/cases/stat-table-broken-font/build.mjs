// A table from a national statistics release, landscape: a two-level header
// (year over number / median income / margin of error, plus a change group),
// a units line, indented stub rows under section labels, `*` significance
// marks, a `Z` placeholder and numbered footnotes. Every numeral inside the
// table is set in a separate figure font that was embedded without a usable
// ToUnicode map — the page looks perfect, but the digits extract as glyph ids.
// Labels, title and notes are in a standard font and extract normally, which
// is what makes the damage easy to miss (`Under  years`).

import { removeToUnicode } from '../../lib/pdfBytes.mjs';

const H = 'Helvetica';
const HB = 'Helvetica-Bold';
const FIG = 'NotoSansJP';
const FIGURE_CHARS = /([0-9$,.±−]+)/u;

const TITLE = 'Table A-2. Households and Median Household Income by Selected Characteristics: 2025 and 2026';
const UNITS =
  '(Numbers in thousands. Income in 2026 dollars. Households as of March of the following year. For information on confidentiality protection, sampling error, and definitions, see the technical notes.)';
const SOURCE = 'Source: Office for Household Statistics, Annual Social and Economic Survey, 2026 and 2027 releases.';
const FOOTNOTES = [
  '* An asterisk following the percent change indicates that the change is statistically different from zero at the 90 percent confidence level.',
  'Z Represents or rounds to zero.',
  '¹ A margin of error (MOE) is a measure of an estimate’s variability. The larger the MOE in relation to the size of the estimate, the less reliable the estimate.',
  '² Householders aged 15 to 24 years are shown separately because their estimates are less reliable.',
];

// [label, depth, values?] — values: [number25, median25, moe25, number26, median26, moe26, change, changeMoe]
const ROWS = [
  ['All households', 0, ['132,216', '80,610', '820', '133,489', '81,940', '710', '*1.6', '1.2']],
  ['Type of Household', 0],
  ['Family households', 1, ['85,012', '104,250', '1,040', '85,640', '105,380', '980', '1.1', '1.3']],
  ['Married-couple', 2, ['62,410', '122,870', '1,150', '62,795', '124,410', '1,210', '1.3', '1.4']],
  [
    'Female householder, no spouse present',
    2,
    ['15,206', '56,030', '1,320', '15,388', '55,170', '1,410', '−1.5', '3.3'],
  ],
  ['Male householder, no spouse present', 2, ['7,396', '80,480', '2,010', '7,457', '80,480', '2,240', 'Z', '3.6']],
  ['Nonfamily households', 1, ['47,204', '47,060', '640', '47,849', '48,310', '700', '*2.7', '2.0']],
  ['Age of Householder', 0],
  ['Under 65 years', 1, ['94,820', '95,140', '930', '94,912', '97,010', '880', '*2.0', '1.3']],
  ['15 to 24 years²', 2, ['6,388', '52,950', '2,300', '6,301', '53,460', '2,410', '1.0', '6.3']],
  ['25 to 34 years', 2, ['21,512', '89,200', '1,480', '21,644', '91,080', '1,520', '2.1', '2.4']],
  ['35 to 44 years', 2, ['22,975', '110,430', '1,690', '23,210', '112,980', '1,620', '*2.3', '2.0']],
  ['45 to 54 years', 2, ['21,384', '115,120', '1,830', '21,206', '116,050', '1,910', '0.8', '2.3']],
  ['55 to 64 years', 2, ['22,561', '90,740', '1,510', '22,551', '91,310', '1,560', '0.6', '2.4']],
  ['65 years and older', 1, ['37,396', '56,680', '840', '38,577', '55,990', '760', '−1.2', '2.0']],
  ['Region', 0],
  ['Northeast', 1, ['23,108', '86,520', '1,620', '23,240', '87,110', '1,700', '0.7', '2.7']],
  ['Midwest', 1, ['28,031', '77,810', '1,190', '28,190', '79,640', '1,240', '*2.4', '2.1']],
  ['South', 1, ['51,407', '73,940', '960', '52,076', '75,020', '890', '1.5', '1.7']],
  ['West', 1, ['29,670', '89,350', '1,380', '29,983', '90,060', '1,420', '0.8', '2.1']],
];
const GROUPS = [
  { label: '2025', span: [0, 2] },
  { label: '2026', span: [3, 5] },
  { label: 'Percent change in real median income (2026 less 2025)', span: [6, 7] },
];
const SUBHEADS = ['Number', 'Estimate', 'MOE¹ (±)', 'Number', 'Estimate', 'MOE¹ (±)', 'Estimate', 'MOE¹ (±)'];
const MEDIAN_GROUPS = [
  { label: 'Median income (dollars)', span: [1, 2] },
  { label: 'Median income (dollars)', span: [4, 5] },
];

export const meta = {
  title: 'Statistical release table with a figure font that has no ToUnicode',
  stresses:
    'landscape; two-level header with a change group; units line; indented stub rows; `*` and `Z` marks; every numeral in a subset font with its ToUnicode CMap removed',
  families: ['encoding', 'tables', 'page-geometry'],
  status: 'ok',
  showcase: true,
  hard: 'The figure font has no ToUnicode map, so every value extracts as raw glyph indices while the page renders perfectly and the labels around the values extract normally.',
  page: { size: 'LETTER', layout: 'landscape' },
  compress: false,
};

const columnNames = [
  '2025 Number',
  '2025 Median income Estimate',
  '2025 Median income MOE (±)',
  '2026 Number',
  '2026 Median income Estimate',
  '2026 Median income MOE (±)',
  'Change Estimate (%)',
  'Change MOE (±)',
];
const row = (label) => ROWS.find((r) => r[0] === label)[2];

export const truth = `
${TITLE}

${UNITS}

Every numeral inside the table — values, the \`65\`/\`15 to 24\` in the age labels, the years
in the header — is drawn in a figure font embedded without a ToUnicode map, so its text is
not recoverable from the file; the page renders correctly. Title, units line, labels
and notes are in Helvetica. A correct reading either recovers the values (from the render or
OCR) or says plainly that they cannot be read from the text layer.

| Characteristic | ${columnNames.join(' | ')} |
| --- | ${columnNames.map(() => '---:').join(' | ')} |
${ROWS.map(([label, depth, values]) =>
  values
    ? `| ${'  '.repeat(depth)}${label} | ${values.join(' | ')} |`
    : `| **${label}** | ${columnNames.map(() => '').join(' | ')} |`,
).join('\n')}

${FOOTNOTES.join('\n')}

${SOURCE}

## Questions an agent should be able to answer

1. What was median household income for all households in 2026, and its margin of error? — $${row('All households')[4]} ± ${row('All households')[5]}
2. Did real median income change significantly for householders 65 years and older? — No: ${row('65 years and older')[6]}% with MOE ${row('65 years and older')[7]}, no asterisk
3. Which household types and age groups had a statistically significant increase? — All households, nonfamily households, under 65 years, 35 to 44 years (and the Midwest region)
4. How many households (in thousands) had a householder under 65 in 2026? — ${row('Under 65 years')[3]}
5. What does \`Z\` mean in the male-householder row? — The change represents or rounds to zero

**Current reading (ok — the warning carries it):** \`read.md\` keeps the title, units line, labels
and notes, but every figure-font run is gone: the values are dropped as non-printable glyph
indices, the age labels lose their numbers (\`Under years\`, \`to years^2\`, \`years and older\`),
the change-group header reads \`income (\` / \`less\` / \`)\`, and only the \`*\` marks and \`Z\` survive,
detached from their rows. No question is answerable from the text, and none is answered
*wrongly*: the page header carries \`nonPrint: 26% (552)\` and \`native: mixed_glyph_indices\`, and
\`glyph_garbage_text\` says “inspect the render or run OCR before trusting extracted text”. The
render is exact, so an agent that follows the warning answers all five.
`;

const PAGE_W = 792;
const LEFT = 40;
const RIGHT = PAGE_W - 40;
const STUB_W = 210;
const COL_W = (RIGHT - LEFT - STUB_W) / 8;
const colRight = (i) => LEFT + STUB_W + COL_W * (i + 1) - 6;

/** Helvetica text with every run of figures in the figure font. */
function mixed(h, text, x, y, { font = H, size = 8, align = 'left' } = {}, doc) {
  const parts = text
    .split(FIGURE_CHARS)
    .filter(Boolean)
    .map((part) => (FIGURE_CHARS.test(part) && /[0-9]/u.test(part) ? { text: part, font: FIG } : { text: part, font }));
  const width = parts.reduce((sum, p) => sum + doc.font(p.font).fontSize(size).widthOfString(p.text), 0);
  const left = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
  h.run(parts, left, y, { font, size });
}

function wrapped(h, text, x, y, width, size) {
  return h.paragraph(text, x, y, width, { font: H, size, lineGap: 1 });
}

export function draw(doc, h) {
  let y = 34;
  h.text(TITLE, LEFT, y, { font: HB, size: 11 });
  y = wrapped(h, UNITS, LEFT, y + 16, RIGHT - LEFT, 8) + 8;

  h.rule(LEFT, y, RIGHT, { width: 1 });
  const headerTop = y + 4;
  for (const group of GROUPS) {
    const l = colRight(group.span[0]) - COL_W + 10;
    const r = colRight(group.span[1]);
    const lines =
      group.label.length > 20 ? ['Percent change in real median', 'income (2026 less 2025)'] : [group.label];
    lines.forEach((line, i) => {
      mixed(h, line, (l + r) / 2, headerTop + i * 9, { font: HB, size: 7.5, align: 'center' }, doc);
    });
    h.rule(l, headerTop + lines.length * 9 + 2, r, { width: 0.5 });
  }
  for (const group of MEDIAN_GROUPS) {
    const l = colRight(group.span[0]) - COL_W + 10;
    const r = colRight(group.span[1]);
    h.text(group.label, (l + r) / 2, headerTop + 23, { font: H, size: 7.5, align: 'center' });
    h.rule(l, headerTop + 33, r, { width: 0.5 });
  }
  h.text('Characteristic', LEFT, headerTop + 37, { font: HB, size: 7.5 });
  SUBHEADS.forEach((label, i) => {
    mixed(h, label, colRight(i), headerTop + 37, { size: 7.5, align: 'right' }, doc);
  });
  y = headerTop + 50;
  h.rule(LEFT, y, RIGHT, { width: 0.6 });
  y += 5;

  for (const [label, depth, values] of ROWS) {
    if (!values) {
      y += 3;
      h.text(label, LEFT, y, { font: HB, size: 8 });
      y += 12;
      continue;
    }
    mixed(h, label, LEFT + depth * 10, y, { font: depth === 0 ? HB : H, size: 8 }, doc);
    values.forEach((value, i) => {
      mixed(h, value, colRight(i), y, { size: 8, align: 'right' }, doc);
    });
    y += 12;
  }
  h.rule(LEFT, y + 1, RIGHT, { width: 1 });
  y += 8;
  for (const note of FOOTNOTES) y = wrapped(h, note, LEFT, y, RIGHT - LEFT, 7) + 1;
  wrapped(h, SOURCE, LEFT, y + 3, RIGHT - LEFT, 7);
}

export const postprocess = (bytes) => removeToUnicode(bytes, { font: 'NotoSansJP' });
