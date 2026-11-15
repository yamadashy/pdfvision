// An income statement in the 10-Q style: section label rows with no values,
// sub-labels that repeat under different sections, and a two-level header
// (period over year) above four right-aligned value columns.

const PERIODS = ['Three Months Ended', 'Twelve Months Ended'];
const YEARS = ['2024', '2023'];
const TITLE = 'CONDENSED CONSOLIDATED STATEMENTS OF OPERATIONS';
const UNITS = '(In millions, except per-share amounts)';
// depth 0 = section or top-level line, 1 = sub-label, 2 = subtotal.
const ROWS = [
  { label: 'Net sales:', depth: 0 },
  { label: 'Products', depth: 1, values: ['69,958', '67,184', '294,866', '298,085'], currency: true },
  { label: 'Services', depth: 1, values: ['24,972', '22,314', '96,169', '85,200'] },
  { label: 'Total net sales', depth: 2, values: ['94,930', '89,498', '391,035', '383,285'] },
  { label: 'Cost of sales:', depth: 0 },
  { label: 'Products', depth: 1, values: ['44,566', '42,586', '185,233', '189,282'] },
  { label: 'Services', depth: 1, values: ['6,485', '6,485', '25,119', '24,855'] },
  { label: 'Total cost of sales', depth: 2, values: ['51,051', '49,071', '210,352', '214,137'] },
  { label: 'Gross margin', depth: 0, values: ['43,879', '40,427', '180,683', '169,148'] },
  { label: 'Earnings per share:', depth: 0 },
  { label: 'Basic', depth: 1, values: ['0.97', '1.47', '6.11', '6.16'], currency: true },
  { label: 'Diluted', depth: 1, values: ['0.97', '1.46', '6.08', '6.13'], currency: true },
];

export const meta = {
  title: 'Statement with section rows and a two-level header',
  stresses: 'repeated sub-labels under section rows; period header spanning two year columns; `$` as its own glyph',
  status: 'ok',
  families: ['tables'],
  showcase: true,
  hard: 'Sub-labels such as `Products` and `Services` repeat under value-less section rows, so a row only means something if the section row above it stays in place.',
};

const columnNames = PERIODS.flatMap((period) => YEARS.map((year) => `${period} ${year}`));
const qualified = (() => {
  let section = '';
  return ROWS.map((row) => {
    if (!row.values) section = row.label.replace(/:$/u, '');
    return row.depth === 1 ? `${section} — ${row.label}` : row.label;
  });
})();

export const truth = `
${TITLE} ${UNITS}. Four value columns: ${columnNames.map((name) => `\`${name}\``).join(', ')}.
\`${PERIODS[0]}\` spans the first two, \`${PERIODS[1]}\` the last two.

\`Products\` and \`Services\` each appear twice and \`Basic\`/\`Diluted\` once, always under the
section row above them. A correct reading keeps the section rows in order so each
sub-label can be attributed (qualified here for clarity):

| Line item | ${columnNames.join(' | ')} |
| --- | ---: | ---: | ---: | ---: |
${ROWS.map((row, i) =>
  row.values
    ? `| ${qualified[i]} | ${row.values.map((value) => (row.currency ? `$ ${value}` : value)).join(' | ')} |`
    : null,
)
  .filter(Boolean)
  .join('\n')}

Section label rows (no values): ${ROWS.filter((row) => !row.values)
  .map((row) => `\`${row.label}\``)
  .join(', ')}.
`;

const LEFT = 72;
const COLUMN_RIGHT = [345, 410, 485, 550];
const CURRENCY_X = [292, 357, 432, 497];

export function draw(_doc, h) {
  let y = 80;
  h.text(TITLE, 306, y, { font: 'Helvetica-Bold', size: 11, align: 'center' });
  y += 16;
  h.text(UNITS, 306, y, { size: 9, align: 'center' });
  y += 26;

  PERIODS.forEach((period, p) => {
    const left = CURRENCY_X[p * 2];
    const right = COLUMN_RIGHT[p * 2 + 1];
    h.text(period, (left + right) / 2, y, { font: 'Helvetica-Bold', size: 9, align: 'center' });
    h.rule(left, y + 13, right);
  });
  y += 17;
  COLUMN_RIGHT.forEach((right, i) => {
    h.text(YEARS[i % 2], right, y, { font: 'Helvetica-Bold', size: 9, align: 'right' });
  });
  y += 13;
  h.rule(CURRENCY_X[0], y, COLUMN_RIGHT[3]);
  y += 6;

  for (const row of ROWS) {
    const font = row.depth === 2 || (row.depth === 0 && row.values) ? 'Helvetica-Bold' : 'Helvetica';
    h.text(row.label, LEFT + row.depth * 12, y, { font });
    row.values?.forEach((value, i) => {
      if (row.currency) h.text('$', CURRENCY_X[i], y, { font });
      h.text(value, COLUMN_RIGHT[i], y, { font, align: 'right' });
    });
    y += 16;
  }
}
