// The first page of a conference paper as LaTeX two-column templates set it:
// full-width title, authors with superscript affiliation markers and the
// abstract, then two columns carrying numbered headings, a bulleted list,
// an inline equation with sub/superscripts, a booktabs results table with
// its caption above, a vector bar chart whose labels are real text, a
// footnote under a short rule, and the arXiv stamp rotated in the margin.

const T = 'Times-Roman';
const TB = 'Times-Bold';
const TI = 'Times-Italic';
const SYM = 'NotoSansJP';

const TITLE = 'Adaptive Token Pruning for Efficient Long-Document Retrieval';
const AUTHORS = [
  { name: 'Mira Okafor', mark: '1' },
  { name: 'Tomasz Lindqvist', mark: '2' },
  { name: 'Haruka Senda', mark: '1' },
];
const AFFILIATIONS = [
  { mark: '1', text: 'Department of Computer Science, Northgate University' },
  { mark: '2', text: 'Halden Research Labs' },
];
const EMAILS = '{mokafor, hsenda}@northgate.example.edu   tomasz@halden.example';
const ARXIV = 'arXiv:2611.04217v1  [cs.IR]  12 Nov 2026';
const ABSTRACT =
  'Late-interaction retrievers score every query token against every document token, which makes long documents ' +
  'expensive to index and slow to search. We present Adaptive Token Pruning (ATP), a scoring rule that drops document ' +
  'tokens whose maximum attention from a learned probe falls below a per-document threshold. ATP needs no change to ' +
  'the encoder and no re-training of the retriever. On three long-document benchmarks it halves query latency while ' +
  'keeping nDCG@10 within 0.4 points of full attention, and it outperforms static length truncation at every budget we test.';

const INTRO = [
  'Retrieval over long documents such as contracts, filings and technical manuals is increasingly served by ' +
    'late-interaction models, which keep one embedding per token. Their quality comes at a cost: index size and ' +
    'query latency grow linearly with document length, and most of the stored tokens never contribute to a match.',
  'Our contributions are as follows:',
];
const BULLETS = [
  'a pruning rule that needs only a probe vector and a threshold per document;',
  'an analysis of which tokens are pruned, showing that function words and boilerplate dominate;',
  'experiments on three benchmarks with latency measured end to end.',
];
const METHOD_BEFORE =
  'Let d be the embedding width and q a probe vector learned on a held-out query set, so the probe adds no ' +
  'cost at query time.';
const METHOD_AFTER =
  'Tokens below the threshold are removed before indexing; the remaining tokens are scored unchanged at query time. ' +
  'The threshold is the 60th percentile of the scores within each document, so short documents lose few tokens.';
// Two typeset lines for helpers.run(); `plain` is how a correct reading writes them.
const EQUATION = {
  lines: [
    ['For a token ', { text: 'i', font: TI }, ' with embedding ', { text: 'k', font: TI }, { sub: 'i' }, ' we compute'],
    [
      { text: 's', font: TI },
      { sub: 'i' },
      ' = ',
      { text: 'q', font: TI },
      { sup: 'T' },
      { text: 'k', font: TI },
      { sub: 'i' },
      ' / ',
      { text: '√', font: SYM },
      { text: 'd', font: TI },
      ' and keep the token when ',
      { text: 's', font: TI },
      { sub: 'i' },
      { text: ' ≥ τ', font: SYM },
      '.',
    ],
  ],
  plain: 'For a token i with embedding k_i we compute s_i = q^T k_i / √d and keep the token when s_i ≥ τ.',
  rule: 's_i = q^T k_i / √d ≥ τ',
};
const TABLE_CAPTION = 'Table 1: Retrieval quality and query latency on LongDocQA.';
const TABLE_HEAD = ['Method', 'nDCG@10', 'R@100', 'Latency (ms)'];
const TABLE_ROWS = [
  ['Full attention', '41.2', '58.7', '182'],
  ['Static pruning (k = 512)', '38.9', '55.1', '97'],
  ['ATP (ours)', '40.8', '58.3', '88'],
];
const FOOTNOTE_MARK = '1';
const FOOTNOTE = 'Code and probe weights: https://example.org/atp';

const FIGURE_SERIES = ['Full attention', 'ATP (ours)'];
const FIGURE_DATA = [
  { dataset: 'LongDocQA', values: [182, 88] },
  { dataset: 'MultiNews-R', values: [156, 79] },
  { dataset: 'LegalBench-S', values: [241, 121] },
];
const FIGURE_CAPTION = 'Figure 1: Median query latency (ms) per benchmark for full attention and ATP. Lower is better.';
const EXPERIMENTS = [
  'We evaluate on LongDocQA, MultiNews-R and LegalBench-S, whose documents average 3.1k, 2.4k and 6.8k tokens. All ' +
    'systems share the same encoder and the same approximate nearest-neighbour index; latency is the median over ' +
    '2,000 queries on a single GPU, including the index lookup.',
  'Figure 1 shows that ATP cuts latency roughly in half on every benchmark. Table 1 shows that the quality cost is ' +
    'small: 0.4 nDCG@10 points against full attention, while static truncation to 512 tokens loses 2.3 points and ' +
    'is still slower. The gap widens on LegalBench-S, where relevant passages often sit deep in the document.',
];
const RELATED =
  'Static truncation is the usual answer to document length. ATP is closest to attention-based pruning for ' +
  're-rankers, but it runs once, at indexing time.';

export const meta = {
  title: 'Two-column paper first page',
  stresses:
    'full-width header over two columns; superscript author markers; inline equation; vector chart with text labels; table caption above; footnote; rotated margin stamp',
  status: 'known-gap',
  families: ['reading-order', 'math', 'vector-meaning', 'vertical-rotated', 'structure'],
  issue: 241,
};

const markers = AUTHORS.map((a) => `${a.name}^${a.mark}`).join(', ');

export const truth = `
Reading order: title, authors, affiliations, e-mails, abstract, then the **whole left column**
(1 Introduction → bullets → 2 Method → equation → Table 1 → footnote) before the **right column**
(Figure 1 → caption → 3 Experiments). The two columns must not be interleaved line by line.

- Title: ${TITLE}
- Authors: ${markers}
- Affiliations: ${AFFILIATIONS.map((a) => `^${a.mark} ${a.text}`).join('; ')}
- Margin stamp (rotated 90°, reads bottom to top): \`${ARXIV.replace(/ +/gu, ' ')}\`

Abstract: ${ABSTRACT}

Contribution bullets: ${BULLETS.map((b) => `“${b}”`).join(' / ')}

Inline equation in §2 (two lines): \`${EQUATION.plain}\` — the subscripts and the superscript must stay
distinguishable (\`s_i\`, \`q^T\`, \`k_i\`), not \`si = qTki\`.

${TABLE_CAPTION}

| ${TABLE_HEAD.join(' | ')} |
| --- | ---: | ---: | ---: |
${TABLE_ROWS.map((row) => `| ${row.join(' | ')} |`).join('\n')}

Footnote ${FOOTNOTE_MARK}: ${FOOTNOTE} (its marker is a superscript after “experiments”).

${FIGURE_CAPTION} Bars (value labels are text on the page):

| Benchmark | ${FIGURE_SERIES.join(' | ')} |
| --- | ---: | ---: |
${FIGURE_DATA.map((d) => `| ${d.dataset} | ${d.values.join(' | ')} |`).join('\n')}

Page number: 1.

## Questions an agent should be able to answer

1. Which author is affiliated with ${AFFILIATIONS[1].text}? — ${AUTHORS.find((a) => a.mark === '2').name}
2. What nDCG@10 and latency does ATP reach on LongDocQA in Table 1? — ${TABLE_ROWS[2][1]} nDCG@10, ${TABLE_ROWS[2][3]} ms
3. What latency does Figure 1 report for ATP on ${FIGURE_DATA[2].dataset}? — ${FIGURE_DATA[2].values[1]} ms
4. What is the paper's arXiv identifier? — ${ARXIV.split(' ')[0]}
5. What rule decides whether a token is kept? — ${EQUATION.rule}

**Known gap (#241):** the subscripts and the superscript of the inline equation are joined as
plain characters (\`si = qTk / √d and keep the token when s ≥ τ.\`) or split off as lone \`i\` lines
(one after the equation, two more inside the Table 1 run): the body reads \`For a token i with
embedding k we compute\` / \`si = qTk / √d …\` — question 5 cannot be answered correctly from
\`read.md\`. Author and affiliation markers are joined too (\`Lindqvist2\`, \`2Halden\`),
which still lets question 1 be answered.

**Known gap (#242):** the abstract, the whole left column and the figure labels are also
reported as an 8 × 50 “layout table” of prose fragments. No warning accompanies it.

**Known gap (no issue yet):**
- The real Table 1 is detected without its header row (columns \`C1…C5\`), and it picks up a
  fifth column holding \`4 Related Work\` from the right column. The header names appear in
  the body as one line, \`nDCG@10 R@100 Latency (ms)\`, so question 2 is answerable by matching
  column order.
- The author line is emitted after the affiliation and e-mail lines.
- The chart's legend, value labels and benchmark names are emitted at the end of the right
  column, after §4, interleaved as \`Full attention / 182 / 88 / LongDocQA / ATP (ours) / 156 / 79 /
  MultiNews-R / 241 / 121 / LegalBench-S\`; the axis ticks come before the caption. Question 3
  is answerable only by assuming each pair precedes its benchmark name — the legend entry
  \`ATP (ours)\` sits next to the MultiNews-R pair, not the ATP bars. No warning covers the chart.
- The centred page number \`1\` is emitted inside the left column, between Table 1 and the axis ticks.

The left column is correctly read before the right one; the rotated arXiv stamp in the margin is
read upright at the end of the page, after the body (question 4 is answerable).
`;

const COLS = [
  { x: 54, w: 243 },
  { x: 315, w: 243 },
];
const BODY = { font: T, size: 10, lineGap: 1.6, align: 'justify' };

function centeredRun(doc, h, segments, cx, y, opts) {
  // Measure with the same rules helpers.run uses: script segments at 65%.
  let width = 0;
  for (const segment of segments) {
    const spec = typeof segment === 'string' ? { text: segment } : segment;
    const text = spec.text ?? spec.sup ?? spec.sub;
    doc.font(spec.font ?? opts.font).fontSize(spec.text === undefined ? opts.size * 0.65 : opts.size);
    width += doc.widthOfString(text);
  }
  h.run(segments, cx - width / 2, y, opts);
}

function heading(h, text, x, y) {
  h.text(text, x, y, { font: TB, size: 11 });
  return y + 17;
}

function barChart(doc, h, x, y, w, ht) {
  const max = 250;
  const plot = { left: x + 30, top: y + 18, right: x + w, bottom: y + ht - 16 };
  const colors = ['#9aa7b8', '#2f5d8a'];
  // Legend.
  let lx = plot.left + 6;
  FIGURE_SERIES.forEach((series, i) => {
    doc.rect(lx, y + 3, 8, 8).fill(colors[i]);
    doc.fillColor('black');
    const { right } = h.text(series, lx + 11, y + 2, { font: T, size: 8 });
    lx = right + 14;
  });
  // Axis and ticks.
  doc.lineWidth(0.5).strokeColor('#000');
  doc.moveTo(plot.left, plot.top).lineTo(plot.left, plot.bottom).lineTo(plot.right, plot.bottom).stroke();
  for (let v = 0; v <= max; v += 50) {
    const ty = plot.bottom - ((plot.bottom - plot.top) * v) / max;
    doc
      .moveTo(plot.left - 3, ty)
      .lineTo(plot.left, ty)
      .stroke();
    h.text(String(v), plot.left - 5, ty - 4, { font: T, size: 7.5, align: 'right' });
  }
  doc.save();
  doc.rotate(-90, { origin: [x + 4, (plot.top + plot.bottom) / 2] });
  h.text('Latency (ms)', x + 4, (plot.top + plot.bottom) / 2 - 4, { font: T, size: 8, align: 'center' });
  doc.restore();
  // Bars.
  const groupWidth = (plot.right - plot.left) / FIGURE_DATA.length;
  const barWidth = 22;
  FIGURE_DATA.forEach((group, g) => {
    const gx = plot.left + g * groupWidth + groupWidth / 2;
    group.values.forEach((value, s) => {
      const bx = gx - barWidth + s * barWidth;
      const top = plot.bottom - ((plot.bottom - plot.top) * value) / max;
      doc.rect(bx, top, barWidth - 2, plot.bottom - top).fill(colors[s]);
      doc.fillColor('black');
      h.text(String(value), bx + (barWidth - 2) / 2, top - 9, { font: T, size: 7, align: 'center' });
    });
    h.text(group.dataset, gx, plot.bottom + 4, { font: T, size: 8, align: 'center' });
  });
}

export function draw(doc, h) {
  // Margin stamp, reading bottom to top.
  doc.save();
  doc.rotate(-90, { origin: [26, 396] });
  doc.fillColor('#888');
  h.text(ARXIV, 26, 386, { font: T, size: 18, align: 'center' });
  doc.restore();
  doc.fillColor('black');

  h.text(TITLE, 306, 66, { font: TB, size: 16, align: 'center' });
  const authorSegments = AUTHORS.flatMap((a, i) => [`${i ? ',   ' : ''}${a.name}`, { sup: a.mark }]);
  centeredRun(doc, h, authorSegments, 306, 96, { font: T, size: 11.5 });
  const affSegments = AFFILIATIONS.flatMap((a, i) => [
    { sup: a.mark },
    `${a.text}${i < AFFILIATIONS.length - 1 ? '      ' : ''}`,
  ]);
  centeredRun(doc, h, affSegments, 306, 114, { font: T, size: 10 });
  h.text(EMAILS, 306, 129, { font: 'Courier', size: 8.5, align: 'center' });

  h.text('Abstract', 306, 156, { font: TB, size: 11, align: 'center' });
  h.paragraph(ABSTRACT, 90, 174, 432, { font: T, size: 9.5, lineGap: 1.4, align: 'justify' });

  // Left column.
  const L = COLS[0];
  let y = 268;
  y = heading(h, '1   Introduction', L.x, y);
  y = h.paragraph(INTRO[0], L.x, y, L.w, BODY) + 4;
  y = h.paragraph(INTRO[1], L.x, y, L.w, BODY) + 3;
  for (const bullet of BULLETS) {
    h.text('•', L.x + 6, y, { font: T, size: 10 });
    y = h.paragraph(bullet, L.x + 16, y, L.w - 16, BODY) + 2;
  }
  y += 10;
  y = heading(h, '2   Method', L.x, y);
  y = h.paragraph(METHOD_BEFORE, L.x, y, L.w, BODY);
  for (const line of EQUATION.lines) {
    h.run(line, L.x, y, { font: T, size: 10 });
    y += 13.6;
  }
  y = h.paragraph(METHOD_AFTER, L.x, y, L.w, BODY) + 12;

  h.text(TABLE_CAPTION, L.x + L.w / 2, y, { font: T, size: 9, align: 'center' });
  y += 15;
  const tableX = [L.x + 4, L.x + 140, L.x + 182, L.x + 239];
  h.rule(L.x, y, L.x + L.w, { width: 0.9 });
  y += 4;
  TABLE_HEAD.forEach((label, i) => {
    h.text(label, tableX[i], y, { font: T, size: 9, align: i === 0 ? 'left' : 'right' });
  });
  y += 13;
  h.rule(L.x, y, L.x + L.w, { width: 0.5 });
  y += 4;
  for (const row of TABLE_ROWS) {
    const font = row[0].includes('ours') ? TB : T;
    row.forEach((cell, i) => {
      h.text(cell, tableX[i], y, { font, size: 9, align: i === 0 ? 'left' : 'right' });
    });
    y += 12;
  }
  h.rule(L.x, y + 1, L.x + L.w, { width: 0.9 });

  // Footnote at the foot of the left column.
  h.rule(L.x, 712, L.x + 80, { width: 0.4 });
  h.run([{ sup: FOOTNOTE_MARK }, FOOTNOTE], L.x, 717, { font: T, size: 8 });

  // Right column.
  const R = COLS[1];
  barChart(doc, h, R.x, 268, R.w, 160);
  y = h.paragraph(FIGURE_CAPTION, R.x, 436, R.w, { font: T, size: 9, lineGap: 1.2, align: 'left' }) + 14;
  y = heading(h, '3   Experiments', R.x, y);
  // The footnote marker hangs off the first sentence's last word.
  const firstEnd = h.run(['Our experiments', { sup: FOOTNOTE_MARK }], R.x, y, { font: T, size: 10 });
  h.text(' follow prior late-interaction work.', firstEnd, y, { font: T, size: 10 });
  y += 13.6;
  for (const para of EXPERIMENTS) y = h.paragraph(para, R.x, y, R.w, BODY) + 5;
  y += 6;
  y = heading(h, '4   Related Work', R.x, y);
  h.paragraph(RELATED, R.x, y, R.w, BODY);

  h.text('1', 306, 748, { font: T, size: 10, align: 'center' });
}
