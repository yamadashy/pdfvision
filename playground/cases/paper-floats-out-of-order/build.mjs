// A first page of an InDesign-typeset biomedical journal article: a narrow
// metadata sidebar on the left (citation, editor, dates, copyright, funding),
// a title block and abstract across the main area, then two body columns
// with a table floated to the top of the first column and a figure floated
// to the top of the second. The content stream is written the way such
// layouts often are: body text first, then the floats, then the sidebar and
// abstract, and the title block last although it sits at the top of the page.

import { drawLine, drawPlacement, flowColumns, wrapLines } from '../../lib/layoutB.mjs';

const T = 'Times-Roman';
const TB = 'Times-Bold';
const TI = 'Times-Italic';
const H = 'Helvetica';
const HB = 'Helvetica-Bold';
const TEAL = '#1d6f7a';

const JOURNAL = 'Journal of Occupational Microbiome Research';
const KIND = 'RESEARCH ARTICLE';
const TITLE = 'Night-shift work and gut microbial diversity: a cross-sectional study of hospital staff';
const AUTHORS = [
  { name: 'Lena Marwick', mark: '1' },
  { name: 'Osei Bannerman', mark: '1,2' },
  { name: 'Priya Ramaswamy', mark: '2' },
  { name: 'Jonas Feldt', mark: '1*' },
];
const AFFILIATIONS = [
  '1 Institute of Occupational Health, Ravelin University Medical Centre, Ravelin, Norway',
  '2 Department of Microbiology, Kestrel Bay Hospital, Kestrel Bay, Ireland',
];
const CORRESPONDENCE = '* jonas.feldt@ravelin.example.no';
const ABSTRACT =
  'Circadian disruption alters host metabolism, but its association with the gut microbiome in working adults is ' +
  'poorly characterised. We sequenced stool samples from 410 nurses and porters at two hospitals, 198 of whom had ' +
  'worked rotating night shifts for at least two years. Night-shift workers had lower alpha diversity than day-shift ' +
  'colleagues (mean Shannon index 3.41 versus 3.87) after adjustment for age, sex, diet score and antibiotic use in ' +
  'the preceding year. The difference grew with years of night work and was not explained by sleep duration alone. ' +
  'These findings support including shift pattern as a covariate in microbiome studies of working populations.';

const SIDEBAR = [
  {
    label: 'Citation:',
    text: 'Marwick L, Bannerman O, Ramaswamy P, Feldt J (2026) Night-shift work and gut microbial diversity: a cross-sectional study of hospital staff. J Occup Microbiome Res 14(3): e0312.',
  },
  { label: 'Editor:', text: 'Tamsin Achterberg, Leiden Centre for Infection Biology, NETHERLANDS' },
  { label: 'Received:', text: 'May 4, 2026' },
  { label: 'Accepted:', text: 'August 19, 2026' },
  { label: 'Published:', text: 'September 30, 2026' },
  {
    label: 'Copyright:',
    text: '© 2026 Marwick et al. This is an open access article distributed under the terms of a Creative Commons Attribution licence, which permits unrestricted use and reproduction provided the original authors are credited.',
  },
  {
    label: 'Data Availability:',
    text: 'Sequence reads are deposited under accession PRJ-OMR-55821.',
  },
  {
    label: 'Funding:',
    text: 'This work was funded by the Nordic Shift Health Foundation (grant NSHF-2024-117 to JF). The funder had no role in study design or analysis.',
  },
  { label: 'Competing interests:', text: 'The authors have declared that no competing interests exist.' },
];

const TABLE_CAPTION = 'Table 1. Characteristics of participants by shift pattern.';
const TABLE_HEAD = ['', 'Day shift', 'Night shift', 'p'];
const TABLE_SUBHEAD = ['', '(n = 212)', '(n = 198)', ''];
const TABLE_ROWS = [
  ['Age, years, mean (SD)', '41.2 (9.8)', '38.6 (8.9)', '0.006'],
  ['Female, n (%)', '163 (76.9)', '149 (75.3)', '0.70'],
  ['BMI, kg/m², mean (SD)', '25.1 (3.9)', '26.4 (4.2)', '0.001'],
  ['Sleep, h/day, median', '7.1', '6.2', '<0.001'],
  ['Diet quality score', '61 (12)', '57 (13)', '0.002'],
  ['Antibiotics past year, n (%)', '31 (14.6)', '33 (16.7)', '0.57'],
];
const TABLE_NOTE = 'SD, standard deviation; BMI, body mass index.';

const FIGURE_DATA = [
  { group: 'Day shift', value: 3.87 },
  { group: 'Night < 5 y', value: 3.58 },
  { group: 'Night ≥ 5 y', value: 3.24 },
];
const FIGURE_CAPTION =
  'Fig 1. Mean Shannon diversity index by shift exposure. Night-shift workers are split by years of night work. Error bars show 95% confidence intervals.';

const BODY = [
  { heading: 'Introduction' },
  'Shift work is common in health care, and roughly one in five hospital employees in Northern Europe works a rotating pattern that includes nights. Disrupted circadian rhythm has been linked to weight gain, impaired glucose tolerance and gastrointestinal complaints, and animal studies suggest that the gut microbiota follows a daily cycle of its own that is entrained by feeding time.',
  'Human evidence is thinner. Small studies of airline crews and military personnel reported shifts in community composition after short periods of jet lag or sleep restriction, but few have examined workers exposed to night shifts over years, and fewer still have adjusted for diet, which differs systematically between shift patterns.',
  'We therefore compared stool microbial diversity between day-shift and night-shift staff at two hospitals, and asked whether any difference scaled with cumulative years of night work.',
  { heading: 'Methods' },
  { subheading: 'Study population' },
  'Nurses, healthcare assistants and porters aged 25 to 60 years were invited between January and June 2025. Night-shift workers were eligible if they had worked at least four night shifts a month for the previous two years. Exclusion criteria were inflammatory bowel disease, pregnancy, and antibiotic use in the eight weeks before sampling.',
  { subheading: 'Sample collection and sequencing' },
  'Participants collected a stool sample at home within 48 hours of a day off and returned it by courier on ice packs. DNA was extracted with a bead-beating protocol and the V4 region of the 16S rRNA gene was sequenced on a paired-end platform.',
  { subheading: 'Statistical analysis' },
  'Alpha diversity was summarised by the Shannon index on rarefied counts. Differences between shift groups were estimated by linear regression adjusted for age, sex, body mass index, diet quality score and antibiotic use in the past year. Years of night work were analysed in two bands, under five years and five years or more.',
];

export const meta = {
  title: 'Journal first page with floats out of stream order',
  stresses:
    'metadata sidebar column; title block drawn last in the content stream; table and figure floated to column tops but written after the body; footer line under the sidebar',
  status: 'known-gap',
  families: ['reading-order', 'structure'],
};

const authorLine = AUTHORS.map((a) => `${a.name}^${a.mark}`).join(', ');
const bodyPlain = BODY.map((b) => (typeof b === 'string' ? b : `**${b.heading ?? b.subheading}**`));

export const truth = `
Visual reading order: journal header, **title**, authors, affiliations, abstract, then the
sidebar (left), then the main columns — Table 1 (top of the left body column), the body of the
left column, Figure 1 (top of the right body column) and the rest of the body. The content
stream is in a different order on purpose: body text first, then Figure 1, then Table 1, then
the sidebar, the abstract, and the title block last.

- Journal: ${JOURNAL} — ${KIND}
- Title: ${TITLE}
- Authors: ${authorLine}
- Affiliations: ${AFFILIATIONS.join('; ')}; correspondence ${CORRESPONDENCE}

Abstract: ${ABSTRACT}

Sidebar:

${SIDEBAR.map((s) => `- **${s.label}** ${s.text}`).join('\n')}

${TABLE_CAPTION}

| Characteristic | Day shift (n = 212) | Night shift (n = 198) | p |
| --- | ---: | ---: | ---: |
${TABLE_ROWS.map((r) => `| ${r.join(' | ')} |`).join('\n')}

${TABLE_NOTE}

${FIGURE_CAPTION} Bar values (text labels on the bars): ${FIGURE_DATA.map((d) => `${d.group} ${d.value.toFixed(2)}`).join(', ')}.

Body, in order:

${bodyPlain.join('\n\n')}

Footer: \`${JOURNAL} | https://doi.org/10.5555/jomr.0312  September 30, 2026  1 / 11\`.

## Questions an agent should be able to answer

1. What is the article's title? — ${TITLE}
2. When was the article accepted, and who was the academic editor? — ${SIDEBAR[3].text}; ${SIDEBAR[1].text.split(',')[0]}
3. Who funded the study? — ${SIDEBAR[7].text.split(' (')[0].replace('This work was funded by the ', '')} (grant NSHF-2024-117)
4. What median daily sleep did night-shift workers report (Table 1)? — ${TABLE_ROWS[3][2]} h (day shift ${TABLE_ROWS[3][1]} h, p ${TABLE_ROWS[3][3]})
5. What Shannon index does Figure 1 show for workers with five or more years of night shifts? — ${FIGURE_DATA[2].value.toFixed(2)}

Questions 1, 2, 3 and 5 are answerable from \`read.md\`: the title is moved to the top despite
being last in the stream, every sidebar label keeps its value, and each bar value sits just
before its group label (\`3.24\` / \`Night ≥ 5 y\`).

Lines no longer cross the narrow gaps between the sidebar and the body or between the two body
columns (#273): the Introduction's second line \`one in five hospital employees in Northern Europe\`
stays in its sentence, and the left column is read whole, \`Introduction\` through \`…invited
between January and\`, before the right column.

**Known gap (no issue yet):** \`reading_order_divergence\` fires on the title and says "the body
above is that reading order, rebuilt from the layout", but the rebuilt body is still wrong
around the abstract and the floats:
- The sidebar is interleaved with the abstract line by line (\`Circadian disruption … in working\` /
  \`diversity: a cross-sectional study of\` / \`adults is poorly characterised. …\`).
- Table 1 is not detected as a table: its row labels come first, then the values column by column
  (\`41.2 (9.8)\` / \`163 (76.9) 149 (75.3)\` / \`25.1 (3.9)\` / \`7.1\` / \`61 (12)\` / \`38.6 (8.9)\` / …),
  with the first two value columns partly fused and the left column's text between the labels and
  the values. Question 4 is answerable only by counting positions in each value list (the fourth
  value of each column), which an agent cannot do safely when \`163 (76.9) 149 (75.3)\` shares a line.
- The right column is read after Table 1's values and the figure (#274), so the sentence
  \`…invited between January and\` / \`June 2025. Night-shift workers were eligible…\` is cut by
  Table 1's values, the footer date \`September 30, 2026\`, the axis ticks and the caption.
`;

const SIDE = { x: 36, w: 122 };
const MAIN = { x: 176, w: 400 };
const COL_W = 192;
const COL_A = MAIN.x;
const COL_B = MAIN.x + MAIN.w - COL_W;
const COL_TOP = 300;
const COL_BOTTOM = 728;
const TABLE_BOTTOM = 418;
const FIGURE_BOTTOM = 452;

function bodyBlocks() {
  return BODY.map((b, i) => {
    if (typeof b === 'string') {
      const previous = BODY[i - 1];
      const indent = typeof previous === 'string' ? 10 : 0;
      return { text: b, font: T, size: 9.5, leading: 11.6, indent, justify: true };
    }
    if (b.heading) return { text: b.heading, font: HB, size: 10.5, leading: 15, gapBefore: 6, color: TEAL };
    return { text: b.subheading, font: HB, size: 8.5, leading: 12, gapBefore: 3 };
  });
}

function drawBody(doc) {
  const placements = flowColumns(doc, bodyBlocks(), [
    { x: COL_A, top: TABLE_BOTTOM + 12, bottom: COL_BOTTOM, width: COL_W },
    { x: COL_B, top: FIGURE_BOTTOM + 12, bottom: COL_BOTTOM, width: COL_W },
  ]);
  for (const p of placements) drawPlacement(doc, p);
}

function drawFigure(doc, h) {
  const x = COL_B;
  const top = COL_TOP;
  const plot = { left: x + 30, right: x + COL_W - 6, top: top + 10, bottom: top + 104 };
  const max = 4.5;
  const yOf = (v) => plot.bottom - ((plot.bottom - plot.top) * v) / max;
  doc.lineWidth(0.5).strokeColor('#333');
  doc.moveTo(plot.left, plot.top).lineTo(plot.left, plot.bottom).lineTo(plot.right, plot.bottom).stroke();
  for (let v = 0; v <= 4; v += 1) {
    doc
      .moveTo(plot.left - 3, yOf(v))
      .lineTo(plot.left, yOf(v))
      .stroke();
    h.text(v.toFixed(1), plot.left - 5, yOf(v) - 3.5, { font: H, size: 6.5, align: 'right' });
  }
  doc.save();
  doc.rotate(-90, { origin: [x + 6, (plot.top + plot.bottom) / 2] });
  h.text('Shannon index', x + 6, (plot.top + plot.bottom) / 2 - 3, { font: H, size: 7, align: 'center' });
  doc.restore();
  const slot = (plot.right - plot.left) / FIGURE_DATA.length;
  FIGURE_DATA.forEach((d, i) => {
    const cx = plot.left + slot * (i + 0.5);
    const yTop = yOf(d.value);
    doc.rect(cx - 16, yTop, 32, plot.bottom - yTop).fill(i === 0 ? '#9fc5cb' : TEAL);
    doc.fillColor('black').strokeColor('#333');
    doc
      .moveTo(cx, yTop - 6)
      .lineTo(cx, yTop + 6)
      .stroke();
    doc
      .moveTo(cx - 4, yTop - 6)
      .lineTo(cx + 4, yTop - 6)
      .stroke();
    h.text(d.value.toFixed(2), cx, yTop - 15, { font: H, size: 6.5, align: 'center' });
    h.text(d.group, cx, plot.bottom + 3, { font: 'NotoSansJP', size: 6.5, align: 'center' });
  });
  doc.strokeColor('black');
  const lines = wrapLines(doc, FIGURE_CAPTION, { font: T, size: 8, width: COL_W });
  lines.forEach((line, i) => {
    drawLine(doc, line, x, top + 122 + i * 9.6, { font: T, size: 8, width: COL_W, justify: true });
  });
}

function drawTable(doc, h) {
  const x = COL_A;
  let y = COL_TOP;
  h.text(TABLE_CAPTION, x, y, { font: TB, size: 8 });
  y += 13;
  const right = [x + 112, x + 150, x + COL_W];
  doc.lineWidth(0.8);
  h.rule(x, y, x + COL_W, { width: 0.8 });
  y += 3;
  TABLE_HEAD.forEach((label, i) => {
    if (i) h.text(label, right[i - 1], y, { font: HB, size: 6.5, align: 'right' });
  });
  y += 8;
  TABLE_SUBHEAD.forEach((label, i) => {
    if (i && label) h.text(label, right[i - 1], y, { font: H, size: 6.5, align: 'right' });
  });
  y += 10;
  h.rule(x, y, x + COL_W, { width: 0.4 });
  y += 3;
  for (const row of TABLE_ROWS) {
    h.text(row[0], x, y, { font: H, size: 6.5 });
    row.slice(1).forEach((cell, i) => void h.text(cell, right[i], y, { font: H, size: 6.5, align: 'right' }));
    y += 10.5;
  }
  h.rule(x, y, x + COL_W, { width: 0.8 });
  h.text(TABLE_NOTE, x, y + 4, { font: TI, size: 6.5 });
}

function drawSidebar(doc) {
  let y = 186;
  for (const item of SIDEBAR) {
    const lines = wrapLines(doc, `${item.label} ${item.text}`, { font: H, size: 7, width: SIDE.w });
    lines.forEach((line, i) => {
      if (i === 0) {
        // The label is bold, the rest of the first line regular.
        doc.font(HB).fontSize(7);
        doc.text(item.label, SIDE.x, y, { lineBreak: false });
        const labelWidth = doc.widthOfString(`${item.label} `);
        doc.font(H).fontSize(7);
        doc.text(line.text.slice(item.label.length + 1), SIDE.x + labelWidth, y, { lineBreak: false });
      } else {
        drawLine(doc, line, SIDE.x, y, { font: H, size: 7, width: SIDE.w });
      }
      y += 8.6;
    });
    y += 6;
  }
  doc.rect(SIDE.x + SIDE.w + 8, 186, 0.6, y - 192).fill('#b9cfd2');
  doc.fillColor('black');
}

function drawAbstract(doc, h) {
  h.text('Abstract', MAIN.x, 186, { font: HB, size: 10.5 });
  const lines = wrapLines(doc, ABSTRACT, { font: T, size: 9.5, width: MAIN.w });
  lines.forEach(
    (line, i) => void drawLine(doc, line, MAIN.x, 202 + i * 11.6, { font: T, size: 9.5, width: MAIN.w, justify: true }),
  );
}

function drawFooter(h) {
  h.rule(36, 744, 576, { width: 0.4 });
  h.text(`${JOURNAL} | https://doi.org/10.5555/jomr.0312`, 36, 750, { font: H, size: 6.5 });
  h.text('September 30, 2026', 430, 750, { font: H, size: 6.5, align: 'right' });
  h.text('1 / 11', 576, 750, { font: H, size: 6.5, align: 'right' });
}

function drawTitleBlock(doc, h) {
  doc.rect(36, 36, 540, 18).fill(TEAL);
  doc.fillColor('white');
  h.text(KIND, 44, 41, { font: HB, size: 8 });
  h.text(JOURNAL, 568, 41, { font: H, size: 8, align: 'right' });
  doc.fillColor('black');
  const titleLines = wrapLines(doc, TITLE, { font: HB, size: 16, width: MAIN.w });
  titleLines.forEach((line, i) => void h.text(line.text, MAIN.x, 66 + i * 19, { font: HB, size: 16 }));
  let y = 66 + titleLines.length * 19 + 6;
  const segments = AUTHORS.flatMap((a, i) => [`${i ? ', ' : ''}${a.name}`, { sup: a.mark }]);
  h.run(segments, MAIN.x, y, { font: H, size: 9.5 });
  y += 16;
  for (const aff of AFFILIATIONS) {
    const [mark, ...rest] = aff.split(' ');
    h.run([{ sup: mark }, ` ${rest.join(' ')}`], MAIN.x, y, { font: H, size: 7 });
    y += 9;
  }
  h.text(CORRESPONDENCE, MAIN.x, y + 2, { font: H, size: 7 });
}

export function draw(doc, h) {
  drawBody(doc);
  drawFigure(doc, h);
  drawTable(doc, h);
  drawSidebar(doc);
  drawAbstract(doc, h);
  drawFooter(h);
  drawTitleBlock(doc, h);
}
