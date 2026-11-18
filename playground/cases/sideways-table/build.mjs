// A wide table set sideways on a portrait page, as LaTeX's sidewaystable
// and word processors' "rotate text box" produce it: the page itself has no
// /Rotate, the running head and page number stay upright, and the caption
// and table are drawn turned 90° counter-clockwise, so their lines run up
// the page and the table's top faces the left edge. A reader turns the page
// a quarter clockwise to read it.

const W = 612;
const H = 792;
const F = 'Times-Roman';
const FB = 'Times-Bold';
const FI = 'Times-Italic';

const CAPTION =
  'Table 4.3: Field trial yields by variety and site, 2025 season (t/ha). Dashes mark plots lost to flooding.';
const HEAD_GROUPS = [
  { label: 'Lowland sites', span: [2, 4] },
  { label: 'Upland sites', span: [5, 7] },
];
const HEAD = ['Variety', 'Type', 'Ashby', 'Brenmoor', 'Carrow', 'Dunhill', 'Elsted', 'Farley', 'Mean'];
const ROWS = [
  ['Aldora', 'winter', '9.42', '8.87', '9.10', '7.64', '7.12', '7.80', '8.33'],
  ['Brisk', 'winter', '9.05', '9.21', '8.66', '7.95', '7.40', '—', '8.45'],
  ['Calder', 'winter', '10.11', '9.48', '9.73', '8.02', '7.66', '8.15', '8.86'],
  ['Dorran', 'spring', '7.88', '7.35', '7.61', '6.90', '6.42', '6.75', '7.15'],
  ['Elvet', 'spring', '8.14', '—', '7.92', '7.21', '6.88', '7.03', '7.44'],
  ['Fennick', 'spring', '7.52', '7.09', '7.30', '6.65', '6.20', '6.48', '6.87'],
  ['Galloway', 'hybrid', '10.48', '10.02', '9.95', '8.41', '8.10', '8.62', '9.26'],
  ['Hestia', 'hybrid', '9.87', '9.66', '9.40', '8.88', '8.35', '8.70', '9.14'],
];
const NOTE = 'Means are over the plots harvested. Site soils: see Appendix B.';

export const meta = {
  title: 'Wide table set sideways on a portrait page',
  stresses:
    'portrait page with no /Rotate whose caption and table are drawn turned 90° counter-clockwise; upright running head and page number; two-level header with site groups; em-dash empty cells; table note',
  status: 'known-gap',
  issue: 306,
  families: ['tables', 'vertical-rotated', 'page-geometry'],
};

export const truth = `
One portrait Letter page. Upright: the running head \`Chapter 4. Field trials\` and the page number
\`57\`. Everything else is turned 90° counter-clockwise (read by turning the page a quarter clockwise):
the caption, the table and its note.

${CAPTION}

| ${HEAD.map((h, i) => {
  const group = HEAD_GROUPS.find((g) => i >= g.span[0] && i <= g.span[1]);
  return group ? `${group.label}: ${h}` : h;
}).join(' | ')} |
| --- | --- | ${HEAD.slice(2)
  .map(() => '---:')
  .join(' | ')} |
${ROWS.map((r) => `| ${r.join(' | ')} |`).join('\n')}

${NOTE}

## Questions an agent should be able to answer

1. What did Calder yield at Brenmoor? — 9.48 t/ha
2. Which variety has the highest mean yield, and what is it? — Galloway, 9.26 t/ha
3. Which plots were lost to flooding? — Brisk at Farley and Elvet at Brenmoor
4. Is Dunhill a lowland or an upland site? — Upland
5. What is Dorran's yield at Elsted? — 6.42 t/ha

**Known gap (#306):** the sideways table is read transposed and out of order, with no warning
(\`rotated_page_read_unrotated\` covers \`/Rotate\` pages, not rotated content on an upright page). Each
table column comes out as one line, starting from the right-hand end of the table: the headers
\`Mean\` / \`Farley\` / \`Elsted\` / \`Upland sites\` / \`Dunhill\` / \`Carrow\` / \`Lowland sites\` / \`Brenmoor\`,
then six value lines (\`8.33 8.45 8.86 …\` is the Mean column), then the note, then \`Ashby\` / \`Type\` /
\`Variety\`, the Ashby values, the types, and the variety names split over two lines in the wrong order:
\`Fennick Galloway\` / \`Aldora Brisk Calder Dorran Elvet Hestia\`. No layout table is reported. Read
in that order the variety list is Fennick, Galloway, Aldora, …, which puts Calder fifth and gives
question 1 the wrong value; pairing the value lines with the headers means skipping the two group
labels. Questions 2, 3 and 5 depend on the same reconstruction; question 4 is answerable only if the
agent works out that \`Upland sites\` heads the three headers emitted before it.
`;

export function draw(doc, h) {
  h.text('Chapter 4. Field trials', 72, 40, { font: FI, size: 10 });
  h.text('57', W - 72, 40, { font: F, size: 10, align: 'right' });

  doc.save();
  // Local frame: x runs up the page from the bottom margin, y runs right from the left margin.
  doc.translate(96, H - 72).rotate(-90);
  const width = H - 144;
  h.paragraph(CAPTION, 0, 0, width, { font: F, size: 10.5 });
  const cols = [0, 78, 140, 215, 290, 365, 440, 515, 590, width];
  const right = (i) => cols[i + 1] - 12;
  let y = 40;
  h.rule(0, y, width, { width: 1 });
  y += 6;
  for (const group of HEAD_GROUPS) {
    const x1 = cols[group.span[0]] + 10;
    const x2 = right(group.span[1]);
    h.text(group.label, (x1 + x2) / 2, y, { font: FI, size: 10, align: 'center' });
    h.rule(x1, y + 14, x2, {});
  }
  y += 20;
  HEAD.forEach((label, i) => {
    if (i < 2) h.text(label, cols[i], y, { font: FB, size: 10 });
    else h.text(label, right(i), y, { font: FB, size: 10, align: 'right' });
  });
  y += 16;
  h.rule(0, y, width, {});
  y += 6;
  for (const row of ROWS) {
    row.forEach((cell, i) => {
      if (i < 2) h.text(cell, cols[i], y, { font: i === 0 ? F : FI, size: 10 });
      else h.text(cell, right(i), y, { font: i === HEAD.length - 1 ? FB : F, size: 10, align: 'right' });
    });
    y += 17;
  }
  h.rule(0, y + 2, width, { width: 1 });
  h.text(NOTE, 0, y + 10, { font: F, size: 9 });
  doc.restore();
}
