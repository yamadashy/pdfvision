// Modelled on Table 2 of "Attention Is All You Need": a label column, two
// column groups under centred group headers, and rows that leave some of
// the four value cells empty. Training cost is given in EFLOPs (10^18) so the
// values stay plain numbers; exponents are math-superscripts' job.

const HEADERS = ['Model', 'EN-DE', 'EN-FR', 'EN-DE', 'EN-FR'];
const GROUPS = [
  { label: 'BLEU', columns: [1, 2] },
  { label: 'Training Cost (EFLOPs)', columns: [3, 4] },
];
// '' is an empty cell: nothing is drawn there.
const ROWS = [
  ['ByteNet', '23.75', '', '', ''],
  ['Deep-Att + PosUnk', '', '39.2', '', '100'],
  ['GNMT + RL', '24.6', '39.92', '23', '140'],
  ['ConvS2S', '25.16', '40.46', '9.6', '150'],
  ['MoE', '26.03', '40.56', '20', '120'],
  ['Transformer (base model)', '27.3', '38.1', '3.3', ''],
  ['Transformer (big)', '28.4', '41.8', '23', ''],
];
const CAPTION =
  'Table 2: The Transformer achieves better BLEU scores than previous models on the English-to-German and English-to-French newstest2014 tests at a fraction of the training cost.';

export const meta = {
  title: 'Table with empty cells under grouped headers',
  stresses: 'column assignment when a row leaves value cells empty; two-level header with centred group labels',
  status: 'ok',
};

const markdownRow = (cells) => `| ${cells.join(' | ')} |`;

export const truth = `
The page holds one caption paragraph and one table of ${ROWS.length} data rows.
Every value belongs to the column it is drawn under; an empty cell stays empty
and must not pull the values to its right one column left.

Column groups: **${GROUPS[0].label}** spans the first two value columns,
**${GROUPS[1].label}** the last two.

${markdownRow(HEADERS.map((header, i) => (i === 0 ? header : `${GROUPS.find((g) => g.columns.includes(i)).label} ${header}`)))}
${markdownRow(HEADERS.map((_, i) => (i === 0 ? '---' : '---:')))}
${ROWS.map(markdownRow).join('\n')}
`;

// Right edges of the four value columns.
const COLUMN_RIGHT = [300, 360, 450, 520];
const LEFT = 72;
const RIGHT = 540;

export function draw(_doc, h) {
  let y = 90;
  y = h.paragraph(CAPTION, LEFT, y, RIGHT - LEFT, { size: 10 }) + 14;

  h.rule(LEFT, y, RIGHT, { width: 1 });
  y += 6;
  for (const group of GROUPS) {
    const [first, last] = group.columns.map((column) => COLUMN_RIGHT[column - 1]);
    const centre = (first - 40 + last) / 2;
    h.text(group.label, centre, y, { align: 'center' });
    h.rule(first - 45, y + 14, last, {});
  }
  y += 18;
  h.text(HEADERS[0], LEFT, y);
  HEADERS.slice(1).forEach((header, i) => {
    h.text(header, COLUMN_RIGHT[i], y, { align: 'right' });
  });
  y += 16;
  h.rule(LEFT, y, RIGHT, {});
  y += 6;

  for (const row of ROWS) {
    h.text(row[0], LEFT, y);
    row.slice(1).forEach((cell, i) => {
      if (cell !== '') h.text(cell, COLUMN_RIGHT[i], y, { align: 'right' });
    });
    y += 15;
  }
  h.rule(LEFT, y, RIGHT, { width: 1 });
}
