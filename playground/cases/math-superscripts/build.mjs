// Exponents, subscripts and a footnote marker drawn the way typeset papers
// draw them: as separate, smaller glyph runs on a raised or lowered baseline.
// Nothing in the content stream says "superscript"; only the geometry does.
// ∇ is not in the standard fonts' WinAnsi set, so it comes from NotoSansJP.

const I = 'Times-Italic';
const SYMBOL = 'NotoSansJP';

// Each line is a list of segments for helpers.run(); `plain` is how a
// correct reading writes the same line.
const PARAGRAPH = [
  {
    segments: [
      'The big model was trained for 2.3 · 10',
      { sup: '19' },
      ' FLOPs, about seven times the base model.',
      { sup: '1' },
    ],
    plain: 'The big model was trained for 2.3 · 10^19 FLOPs, about seven times the base model.[^1]',
  },
  {
    segments: [
      'Gradients are clipped when |',
      { text: '∇', font: SYMBOL },
      { text: 'f', font: I },
      '|',
      { sup: '2' },
      ' exceeds 10',
      { sup: '4' },
      ', and each sample is weighted by ',
      { text: 'e', font: I },
      { sup: '-f', font: I },
      '.',
    ],
    plain: 'Gradients are clipped when |∇f|^2 exceeds 10^4, and each sample is weighted by e^(-f).',
  },
  {
    segments: [
      'Residual dropout uses ',
      { text: 'P', font: I },
      { sub: 'drop' },
      ' = 0.1 for the base model and 0.3 for the big one.',
    ],
    plain: 'Residual dropout uses P_drop = 0.1 for the base model and 0.3 for the big one.',
  },
];

const TABLE_HEADER = [['Model'], ['Train steps'], ['FLOPs'], [{ text: 'P', font: I }, { sub: 'drop' }]];
const TABLE_HEADER_PLAIN = ['Model', 'Train steps', 'FLOPs', 'P_drop'];
const TABLE_ROWS = [
  { name: 'base', steps: ['1.0', '5'], flops: ['3.3', '18'], drop: '0.1' },
  { name: 'big', steps: ['3.0', '5'], flops: ['2.3', '19'], drop: '0.3' },
];
const FOOTNOTE = { marker: '1', text: 'Measured on eight P100 GPUs.' };

export const meta = {
  title: 'Superscripts and subscripts',
  stresses:
    'exponents, a superscript square, a negative exponent, a subscript, and a footnote marker drawn as raised/lowered small text',
  status: 'known-gap',
  families: ['math'],
  issue: 241,
};

const power = ([mantissa, exponent]) => `${mantissa} · 10^${exponent}`;

export const truth = `
A heading, a three-line paragraph, a small table and a footnote. Every raised or
lowered run has to stay distinguishable from the text around it — \`10^19\` must
not read as the number \`1019\`, nor the footnote marker as part of a word.
Any unambiguous notation is fine (\`10^19\`, \`10<sup>19</sup>\`, \`10¹⁹\`).

${PARAGRAPH.map((line) => `> ${line.plain}`).join('\n>\n')}

| ${TABLE_HEADER_PLAIN.join(' | ')} |
| --- | ---: | ---: | ---: |
${TABLE_ROWS.map((row) => `| ${row.name} | ${power(row.steps)} | ${power(row.flops)} | ${row.drop} |`).join('\n')}

Footnote: \`[^${FOOTNOTE.marker}]: ${FOOTNOTE.text}\`

**Known gap (#241):** raised and lowered runs are joined as ordinary characters with
no warning — \`2.3 · 1019\`, \`|∇f|2\`, \`104\`, \`e-f\`, \`model.1\` — and the subscript of
\`P_drop\` is split off its line, so the paragraph reads \`P = 0.1\` and \`drop\` lands on a
line of its own; the table header reads \`P drop\`.

In the page body the table is read row by row between its rules (\`Model\` / \`Train steps\` /
\`FLOPs\` / \`P\` / \`drop\`, then \`base\` and its values, then \`big\` and its values), and the
footnote is the last text on the page (#257: it used to be emitted between two table columns,
which were read one after another).
`;

const LEFT = 90;

export function draw(_doc, h) {
  let y = 90;
  h.text('3.2  Training cost', LEFT, y, { font: 'Times-Bold', size: 12 });
  y += 24;
  for (const line of PARAGRAPH) {
    h.run(line.segments, LEFT, y, { font: 'Times-Roman', size: 11 });
    y += 17;
  }

  y += 14;
  const columnRight = [0, 330, 420, 480];
  h.rule(LEFT, y - 4, 480, { width: 1 });
  TABLE_HEADER.forEach((segments, i) => {
    const x = i === 0 ? LEFT : columnRight[i] - 40;
    h.run(segments, x, y, { font: 'Times-Bold', size: 10 });
  });
  y += 16;
  h.rule(LEFT, y - 3, 480);
  for (const row of TABLE_ROWS) {
    h.text(row.name, LEFT, y, { font: 'Times-Roman', size: 10 });
    [row.steps, row.flops].forEach(([mantissa, exponent], i) => {
      h.run([`${mantissa} · 10`, { sup: exponent }], columnRight[i + 1] - 55, y, { font: 'Times-Roman', size: 10 });
    });
    h.text(row.drop, columnRight[3], y, { font: 'Times-Roman', size: 10, align: 'right' });
    y += 15;
  }
  h.rule(LEFT, y, 480, { width: 1 });

  h.rule(LEFT, 690, LEFT + 120);
  h.run([{ sup: FOOTNOTE.marker }, ` ${FOOTNOTE.text}`], LEFT, 698, { font: 'Times-Roman', size: 9 });
}
