// A results table from an economics working paper: six numbered model
// columns under two grouped headers (each underlined by its own short rule),
// coefficient rows each followed by a standard-error row in parentheses,
// significance stars set as superscripts, two panels with their own
// observations and R² rows, fixed-effect Yes/No rows shared by both panels,
// booktabs rules, and a notes paragraph that explains the stars.

const T = 'Times-Roman';
const TB = 'Times-Bold';
const TI = 'Times-Italic';

const NUMBER = 'Table 4';
const TITLE = 'Minimum wages and teen labour-market outcomes';
const GROUPS = [
  { label: 'Log teen employment', columns: [0, 1, 2] },
  { label: 'Log weekly hours', columns: [3, 4, 5] },
];
const COLUMN_LABELS = ['(1)', '(2)', '(3)', '(4)', '(5)', '(6)'];
// Each estimate: [coefficient, stars, standard error].
const PANELS = [
  {
    title: 'Panel A. All counties',
    rows: [
      {
        label: 'Log minimum wage',
        cells: [
          ['-0.142', '***', '0.031'],
          ['-0.097', '***', '0.029'],
          ['-0.061', '**', '0.027'],
          ['-0.088', '***', '0.024'],
          ['-0.054', '**', '0.022'],
          ['-0.031', '', '0.025'],
        ],
      },
      {
        label: 'Log county population',
        cells: [
          ['0.412', '***', '0.058'],
          ['0.398', '***', '0.061'],
          ['0.377', '***', '0.063'],
          ['0.106', '*', '0.057'],
          ['0.094', '', '0.060'],
          ['0.088', '', '0.062'],
        ],
      },
    ],
    observations: ['48,912', '48,912', '48,912', '48,640', '48,640', '48,640'],
    r2: ['0.912', '0.918', '0.921', '0.743', '0.751', '0.756'],
  },
  {
    title: 'Panel B. Contiguous border-county pairs',
    rows: [
      {
        label: 'Log minimum wage',
        cells: [
          ['-0.049', '*', '0.026'],
          ['-0.041', '', '0.027'],
          ['-0.022', '', '0.030'],
          ['-0.037', '*', '0.020'],
          ['-0.029', '', '0.021'],
          ['-0.012', '', '0.023'],
        ],
      },
      {
        label: 'Log county population',
        cells: [
          ['0.351', '***', '0.072'],
          ['0.344', '***', '0.074'],
          ['0.339', '***', '0.077'],
          ['0.071', '', '0.066'],
          ['0.066', '', '0.068'],
          ['0.063', '', '0.069'],
        ],
      },
    ],
    observations: ['21,384', '21,384', '21,384', '21,208', '21,208', '21,208'],
    r2: ['0.934', '0.937', '0.939', '0.781', '0.786', '0.790'],
  },
];
const FIXED_EFFECTS = [
  { label: 'County fixed effects', values: ['Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'] },
  { label: 'Period fixed effects', values: ['Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'] },
  { label: 'State linear trends', values: ['No', 'Yes', 'Yes', 'No', 'Yes', 'Yes'] },
  { label: 'Census-division × period FE', values: ['No', 'No', 'Yes', 'No', 'No', 'Yes'] },
];
const NOTES =
  'Notes: Each column reports a separate regression of the outcome on the log of the effective minimum wage, ' +
  'using quarterly county data for 2010–2024. Panel B restricts the sample to counties that share a border with ' +
  'a county in another state and adds pair-by-period fixed effects. Standard errors, in parentheses, are clustered ' +
  'by state (Panel A) or by state and border segment (Panel B). *** p < 0.01, ** p < 0.05, * p < 0.1.';

export const meta = {
  title: 'Regression table with standard errors and stars',
  stresses:
    'coefficient rows each followed by a parenthesised standard-error row; superscript significance stars; grouped headers over numbered model columns; two panels; Yes/No fixed-effect rows; notes paragraph',
  status: 'ok',
  families: ['tables'],
  showcase: true,
  hard: 'Two-line cells (coefficient over a parenthesised standard error) with superscript stars and no rules between rows make row boundaries ambiguous, so table detectors drop or merge rows.',
};

const est = ([coef, stars, se]) => `${coef}${stars} (${se})`;

export const truth = `
**${NUMBER}: ${TITLE}**

Columns (1)–(3) are under \`${GROUPS[0].label}\`, (4)–(6) under \`${GROUPS[1].label}\`. Each estimate
is a coefficient with superscript stars on one line and its standard error in parentheses on the
line below; a correct reading keeps each standard error with its coefficient and column.

${PANELS.map(
  (panel) => `_${panel.title}_

| | ${COLUMN_LABELS.join(' | ')} |
| --- | ${COLUMN_LABELS.map(() => '---:').join(' | ')} |
${panel.rows.map((row) => `| ${row.label} | ${row.cells.map(est).join(' | ')} |`).join('\n')}
| Observations | ${panel.observations.join(' | ')} |
| R² | ${panel.r2.join(' | ')} |`,
).join('\n\n')}

_Both panels_

| | ${COLUMN_LABELS.join(' | ')} |
| --- | ${COLUMN_LABELS.map(() => ':---:').join(' | ')} |
${FIXED_EFFECTS.map((fe) => `| ${fe.label} | ${fe.values.join(' | ')} |`).join('\n')}

${NOTES}

## Questions an agent should be able to answer

1. What is the effect of the log minimum wage on log teen employment in column (3) of Panel A, with its standard error and significance? — ${est(PANELS[0].rows[0].cells[2])}, significant at the 5% level
2. Is the Panel B hours estimate in column (4) statistically significant, and at what level? — ${PANELS[1].rows[0].cells[3][0]} (${PANELS[1].rows[0].cells[3][2]}), marked \`*\`: significant at the 10% level only
3. Which columns include state linear trends? — ${FIXED_EFFECTS[2].values
  .map((v, i) => (v === 'Yes' ? COLUMN_LABELS[i] : null))
  .filter(Boolean)
  .join(', ')}
4. How many observations and what R² does column (5) of Panel B have? — ${PANELS[1].observations[4]}; ${PANELS[1].r2[4]}
5. How are the standard errors clustered in Panel B? — By state and border segment

How \`read.md\` does: the body text gives each model column top to bottom (\`(3)\` / \`-0.061**\` /
\`(0.027)\` / \`0.377***\` / …), so every estimate keeps its stars and its standard error, and
questions 1, 2 and 5 are answerable from it. The layout table has the right values in the right
columns for Panel B (question 4) but **drops Panel A's \`Log minimum wage\` coefficient row**,
fuses \`Panel B. Contiguous border-county pairs Log minimum wage\` into one label, and leaves out the
fixed-effect rows; \`layout_table_uncertain\` flags it ("6 lines with numbers inside the table belong to
no row … render that region (--render-region 72,121.99,463.94,237) before trusting the table"), and
that render shows the whole coefficient block legibly. Question 3 comes from the body, where each
column's last four values are its Yes/No fixed-effect entries in row order; \`tabular_numeric_layout\`
says to inspect the render when values matter. \`R²\` reads \`R2\` (harmless here).
`;

const LEFT = 72;
const RIGHT = 540;
const LABEL_W = 150;
const COL_W = (RIGHT - LEFT - LABEL_W) / 6;
// Numbers are aligned on the decimal point; stars hang to the right of it.
const decimalX = (i) => LEFT + LABEL_W + COL_W * i + COL_W * 0.55;
const SIZE = 9.5;
const PITCH = 12.5;

function numberAt(h, text, i, y, { stars = '', parens = false } = {}) {
  const [whole, frac = ''] = text.split('.');
  const left = parens ? `(${whole}` : whole;
  const right = frac ? `.${frac}${parens ? ')' : ''}` : parens ? ')' : '';
  h.text(left, decimalX(i), y, { font: T, size: SIZE, align: 'right' });
  if (!right && !stars) return;
  h.run([right, ...(stars ? [{ sup: stars }] : [])], decimalX(i), y, { font: T, size: SIZE });
}

function centred(h, text, i, y, font = T) {
  h.text(text, LEFT + LABEL_W + COL_W * i + COL_W / 2, y, { font, size: SIZE, align: 'center' });
}

export function draw(doc, h) {
  let y = 96;
  h.text(`${NUMBER}: ${TITLE}`, (LEFT + RIGHT) / 2, y, { font: TB, size: 11, align: 'center' });
  y += 24;
  h.rule(LEFT, y, RIGHT, { width: 1 });
  y += 5;
  for (const group of GROUPS) {
    const first = group.columns[0];
    const last = group.columns[group.columns.length - 1];
    const x1 = LEFT + LABEL_W + COL_W * first + 4;
    const x2 = LEFT + LABEL_W + COL_W * (last + 1) - 4;
    h.text(group.label, (x1 + x2) / 2, y, { font: T, size: SIZE, align: 'center' });
    h.rule(x1, y + 13, x2, { width: 0.4 });
  }
  y += 17;
  COLUMN_LABELS.forEach((label, i) => {
    centred(h, label, i, y);
  });
  y += 14;
  h.rule(LEFT, y, RIGHT, { width: 0.5 });
  y += 6;

  for (const panel of PANELS) {
    h.text(panel.title, LEFT, y, { font: TI, size: SIZE });
    y += PITCH + 3;
    for (const row of panel.rows) {
      h.text(row.label, LEFT, y, { font: T, size: SIZE });
      row.cells.forEach(([coef, stars], i) => {
        numberAt(h, coef, i, y, { stars });
      });
      y += PITCH;
      row.cells.forEach(([, , se], i) => {
        numberAt(h, se, i, y, { parens: true });
      });
      y += PITCH + 3;
    }
    h.text('Observations', LEFT, y, { font: T, size: SIZE });
    panel.observations.forEach((value, i) => {
      centred(h, value, i, y);
    });
    y += PITCH;
    h.text('R²', LEFT, y, { font: T, size: SIZE });
    panel.r2.forEach((value, i) => {
      numberAt(h, value, i, y);
    });
    y += PITCH + 4;
    h.rule(LEFT, y, RIGHT, { width: 0.4 });
    y += 6;
  }
  for (const fe of FIXED_EFFECTS) {
    h.text(fe.label, LEFT, y, { font: T, size: SIZE });
    fe.values.forEach((value, i) => {
      centred(h, value, i, y);
    });
    y += PITCH;
  }
  y += 2;
  h.rule(LEFT, y, RIGHT, { width: 1 });
  y += 8;
  doc.font(T).fontSize(8.5);
  doc.text(NOTES, LEFT, y, { width: RIGHT - LEFT, align: 'justify', lineGap: 1.2 });
}
