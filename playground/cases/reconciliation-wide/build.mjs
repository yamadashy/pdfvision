// A GAAP to non-GAAP reconciliation as earnings releases print it on a
// landscape page: a label column and two period groups of three columns
// (As Reported / Adjustments / As Adjusted) under a three-level centred
// header with rules, `$` set as its own glyph on the first and total rows,
// parenthesised negatives, `—` for nothing, footnote markers hung off
// some values, a per-share row, and the footnotes as wrapped prose.

const SANS = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const SERIF = 'Times-Roman';

const COMPANY = 'NORTHBRIDGE SYSTEMS, INC.';
const TITLE = 'RECONCILIATION OF GAAP TO NON-GAAP FINANCIAL MEASURES';
const UNITS = '(Unaudited; in thousands, except per-share amounts)';
const PERIODS = ['Three Months Ended', 'Nine Months Ended'];
const DATE = 'September 30, 2026';
const COLUMNS = ['As Reported', 'Adjustments', 'As Adjusted'];
const FOOTNOTES = {
  a: 'Stock-based compensation expense, which is excluded because it is a non-cash expense that varies with the price of our common stock and the timing of grants.',
  b: 'Restructuring charges consist of severance and facility exit costs under the plan announced in May 2026; general and administrative adjustments also include acquisition-related legal and advisory fees.',
  c: 'Income tax effect of the non-GAAP adjustments, calculated using a long-term projected non-GAAP tax rate of 16%.',
};

// Inputs per period: [reported, adjustment, marks]. Derived rows are computed.
const INPUT = [
  {
    revenue: [412580, 0],
    cost: [158920, -6410, 'a'],
    rd: [88140, -14220, 'a'],
    sm: [97310, -11860, 'a'],
    ga: [41780, -9350, 'ab'],
    restructuring: [27240, -27240, 'b'],
    other: [3120, 0],
    tax: [1450, 9870, 'c'],
    shares: 148200,
  },
  {
    revenue: [1186240, 0],
    cost: [461330, -18870, 'a'],
    rd: [259600, -41050, 'a'],
    sm: [284170, -33940, 'a'],
    ga: [125410, -27600, 'ab'],
    restructuring: [38620, -38620, 'b'],
    other: [8940, 0],
    tax: [6210, 31420, 'c'],
    shares: 147650,
  },
];

function periodRows(p) {
  const triple = ([reported, adjustment, marks = '']) => ({
    values: [reported, adjustment, reported + adjustment],
    marks,
  });
  const sum = (...rows) => ({ values: [0, 1, 2].map((i) => rows.reduce((acc, r) => acc + r.values[i], 0)), marks: '' });
  const minus = (a, b) => ({ values: a.values.map((v, i) => v - b.values[i]), marks: '' });
  const revenue = triple(p.revenue);
  const cost = triple(p.cost);
  const gross = minus(revenue, cost);
  const rd = triple(p.rd);
  const sm = triple(p.sm);
  const ga = triple(p.ga);
  const restructuring = triple(p.restructuring);
  const opex = sum(rd, sm, ga, restructuring);
  const operating = minus(gross, opex);
  const other = triple(p.other);
  const tax = triple(p.tax);
  const net = minus(sum(operating, other), tax);
  const eps = { values: net.values.map((v) => v / p.shares), marks: '', decimals: 2 };
  const shares = { values: [p.shares, 0, p.shares], marks: '' };
  return { revenue, cost, gross, rd, sm, ga, restructuring, opex, operating, other, tax, net, eps, shares };
}

// style: 'currency' rows carry `$`; 'total' rows are bold with a rule above.
const ROWS = [
  { key: 'revenue', label: 'Revenue', style: 'currency' },
  { key: 'cost', label: 'Cost of revenue' },
  { key: 'gross', label: 'Gross profit', style: 'total' },
  { key: 'rd', label: 'Research and development', indent: true },
  { key: 'sm', label: 'Sales and marketing', indent: true },
  { key: 'ga', label: 'General and administrative', indent: true },
  { key: 'restructuring', label: 'Restructuring charges', indent: true },
  { key: 'opex', label: 'Total operating expenses', style: 'total' },
  { key: 'operating', label: 'Operating income (loss)', style: 'total' },
  { key: 'other', label: 'Other income, net' },
  { key: 'tax', label: 'Provision for income taxes' },
  { key: 'net', label: 'Net income (loss)', style: 'currency-total' },
  { key: 'eps', label: 'Net income (loss) per share — diluted', style: 'currency-total' },
  { key: 'shares', label: 'Weighted-average shares — diluted' },
];
const DATA = INPUT.map(periodRows);

function format(value, decimals = 0) {
  if (value === 0) return '—';
  const abs = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return value < 0 ? `(${abs})` : abs;
}
const cell = (row, period, col) => {
  const entry = DATA[period][row.key];
  return format(entry.values[col], entry.decimals);
};
const marksFor = (row, period, col) => (col === 1 ? DATA[period][row.key].marks : '');

export const meta = {
  title: 'Landscape GAAP to non-GAAP reconciliation',
  stresses:
    'Letter landscape; three-level centred header over two column groups; `$` as its own glyph; parenthesised negatives; `—` placeholders; footnote markers on values; per-share decimals; wrapped footnotes',
  status: 'ok',
  families: ['tables', 'page-geometry'],
  showcase: true,
  hard: 'A three-level centred header spans two column groups on a landscape page, with `$`, parenthesised negatives, `—` placeholders and footnote markers each set as separate glyphs that must be reattached to the right value.',
  page: { size: 'LETTER', layout: 'landscape' },
};

const columnNames = PERIODS.flatMap((period) => COLUMNS.map((name) => `${period} ${DATE} — ${name}`));
const withMarks = (row, period, col) => {
  const marks = [...marksFor(row, period, col)].map((m) => `(${m})`).join('');
  const dollar = row.style?.startsWith('currency') && col !== 1 && cell(row, period, col) !== '—' ? '$ ' : '';
  return `${dollar}${cell(row, period, col)}${marks ? ` ${marks}` : ''}`;
};
const q = DATA[0];
const nine = DATA[1];

export const truth = `
${COMPANY} — ${TITLE} ${UNITS}.

Header: \`${PERIODS[0]}\` spans the first three value columns and \`${PERIODS[1]}\` the last three; each
group has the date line \`${DATE}\` under it, then the column names ${COLUMNS.map((c) => `\`${c}\``).join(', ')}.
A correct reading attributes every value to period **and** column (qualified names below).
\`(…)\` is negative; \`—\` means zero/not applicable; \`(a)\`–\`(c)\` are footnote markers on the value
to their left, not values.

| Line item | ${columnNames.join(' | ')} |
| --- | ${columnNames.map(() => '---:').join(' | ')} |
${ROWS.map((row) => `| ${row.label} | ${[0, 1].flatMap((p) => [0, 1, 2].map((c) => withMarks(row, p, c))).join(' | ')} |`).join('\n')}

Footnotes:

${Object.entries(FOOTNOTES)
  .map(([mark, text]) => `- (${mark}) ${text}`)
  .join('\n')}

## Questions an agent should be able to answer

1. What was non-GAAP (As Adjusted) operating income for the three months ended ${DATE}? — $${format(q.operating.values[2])} thousand
2. What was GAAP diluted net income (loss) per share for the nine months? — $${format(nine.eps.values[0], 2)}
3. How much stock-based compensation was excluded from research and development in the nine months? — ${format(-nine.rd.values[1])} thousand (shown as ${format(nine.rd.values[1])} (a))
4. Which footnotes apply to the general and administrative adjustment, and what do they cover? — (a) stock-based compensation and (b) restructuring / acquisition-related costs
5. Was the quarter's GAAP operating result a profit or a loss? — a loss of ${format(-q.operating.values[0])} thousand, shown as ${format(q.operating.values[0])}

**Current reading (ok — covered by warnings):** the layout table gets the three-level header right
(group, date, column names over the right columns), keeps \`$\` with its value, keeps \`(…)\` and
\`—\`, and attaches \`(a)\`/\`(b)\`/\`(c)\` to the value they follow. Questions 1, 2, 3 and 5 are answered
from it. Two rows lose their label and their first value: \`|  |  | (9,350) (a)(b) | 32,430 | …\` is
General and administrative without \`${cell(ROWS[5], 0, 0)}\`, and \`|  |  | (27,240) (b) | — | …\` is
Restructuring charges without \`${cell(ROWS[6], 0, 0)}\` — the two rows whose adjustment carries a
\`(b)\` marker. Question 4 is answerable only by row order. The table carries
\`layout_table_uncertain\` (“2 lines with numbers inside the table belong to no row … render that
region before trusting the table”), and the column-by-column page body carries
\`tabular_numeric_layout\`; in that body the \`—\` placeholders of the Adjustments columns are
pulled out of row order.
`;

const LABEL_X = 40;

export function draw(_doc, h) {
  // Six value columns; the last group's right edge sits at the page margin.
  const rights = [322, 407, 492, 582, 667, 752];
  const width = 74;
  let y = 40;
  h.text(COMPANY, 396, y, { font: BOLD, size: 11, align: 'center' });
  y += 15;
  h.text(TITLE, 396, y, { font: BOLD, size: 10, align: 'center' });
  y += 14;
  h.text(UNITS, 396, y, { font: SANS, size: 8.5, align: 'center' });
  y += 26;

  PERIODS.forEach((period, p) => {
    const left = rights[p * 3] - width;
    const right = rights[p * 3 + 2];
    h.text(period, (left + right) / 2, y, { font: BOLD, size: 8.5, align: 'center' });
    h.rule(left, y + 12, right, { width: 0.6 });
    h.text(DATE, (left + right) / 2, y + 15, { font: BOLD, size: 8.5, align: 'center' });
    h.rule(left, y + 27, right, { width: 0.6 });
    COLUMNS.forEach((name, c) => {
      h.text(name, rights[p * 3 + c], y + 31, { font: BOLD, size: 8, align: 'right' });
      h.rule(rights[p * 3 + c] - width + 6, y + 42, rights[p * 3 + c], { width: 0.6 });
    });
  });
  y += 50;

  for (const row of ROWS) {
    const bold = row.style === 'total' || row.style === 'currency-total';
    const font = bold ? BOLD : SANS;
    if (row.style === 'total' || row.key === 'net') {
      rights.forEach((right) => {
        h.rule(right - width + 6, y - 3, right, { width: 0.5 });
      });
    }
    h.text(row.label, LABEL_X + (row.indent ? 12 : 0), y, { font, size: 8.5 });
    [0, 1].forEach((p) => {
      [0, 1, 2].forEach((c) => {
        const right = rights[p * 3 + c];
        const text = cell(row, p, c);
        // Parenthesised negatives hang their ")" past the column edge, as typeset statements do.
        const hang = text.endsWith(')') ? 3 : 0;
        h.text(text, right + hang, y, { font, size: 8.5, align: 'right' });
        if (row.style?.startsWith('currency') && c !== 1 && text !== '—') {
          h.text('$', right - width + 8, y, { font, size: 8.5 });
        }
        const marks = marksFor(row, p, c);
        if (marks) {
          h.text([...marks].map((m) => `(${m})`).join(''), right + hang + 2, y + 0.5, { font: SANS, size: 6.5 });
        }
      });
    });
    y += row.style === 'currency-total' ? 17 : 15;
    if (row.key === 'eps') y += 2;
  }
  rights.forEach((right) => {
    h.rule(right - width + 6, y - 3, right, { width: 1.2 });
  });

  y += 16;
  for (const [mark, text] of Object.entries(FOOTNOTES)) {
    h.text(`(${mark})`, LABEL_X, y, { font: SERIF, size: 8.5 });
    y = h.paragraph(text, LABEL_X + 18, y, 400, { font: SERIF, size: 8.5, lineGap: 1 }) + 5;
  }
}
