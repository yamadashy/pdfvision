// Six pages from a Beamer lecture deck (4:3, 128 × 96 mm): a title frame, an
// outline frame, and one frame built up over four overlay pages. On each
// overlay one more item is revealed; items not yet revealed are still drawn,
// at 15% opacity (`\setbeamercovered{transparent}`), so every overlay page
// carries the full text. An `\only<1-3>` / `\only<4>` pair swaps the formula
// under the list on the last overlay. A section navigation bar repeats at the
// top and a three-box footer with the frame counter at the bottom; the counter
// counts frames, so it stays at 3 / 24 across the four overlay pages.

const S = 'Helvetica';
const SB = 'Helvetica-Bold';
const MI = 'Times-Italic';
const MR = 'Times-Roman';
const SYM = 'NotoSansJP';

const W = 362.83;
const HT = 272.13;
const BLUE = '#2b3f8c';
const COURSE = 'Numerical Methods for PDEs';
const LECTURE = 'Lecture 5: Stability of time-stepping schemes';
const SHORT = 'Stability of time-stepping';
const AUTHOR = 'Ana Ferreira';
const INSTITUTE = 'Department of Applied Mathematics, Lisbon Polytechnic';
const DATE = '18 November 2026';
const TOTAL_FRAMES = 24;
const SECTIONS = ['Introduction', 'Explicit methods', 'Implicit methods', 'Summary'];
const OUTLINE = [
  'Model problem: the heat equation',
  'Explicit Euler and its stability limit',
  'Implicit Euler and Crank–Nicolson',
  'Choosing a step size in practice',
];
const FRAME_TITLE = 'Explicit Euler for the heat equation';
// Each item is a list of run segments; item k is revealed on overlay k.
const ITEMS = [
  ['Forward difference in time, central difference in space'],
  ['Each step costs O(', { i: 'N' }, ') — no linear system to solve'],
  ['Error is O(', { g: 'Δ' }, { i: 't' }, ' + ', { g: 'Δ' }, { i: 'x' }, { sup: '2' }, ') while the scheme is stable'],
  [
    'Stable only if ',
    { g: 'λ' },
    ' = ',
    { g: 'Δ' },
    { i: 't' },
    ' / ',
    { g: 'Δ' },
    { i: 'x' },
    { sup: '2' },
    { g: ' ≤ ' },
    '1/2',
  ],
];
const ITEM_TEXT = [
  'Forward difference in time, central difference in space',
  'Each step costs O(N) — no linear system to solve',
  'Error is O(Δt + Δx²) while the scheme is stable',
  'Stable only if λ = Δt / Δx² ≤ 1/2',
];
// \only<1-3>: the update rule; \only<4>: the step-size consequence.
const SCHEME = [
  { i: 'u' },
  { sub: [{ i: 'j' }] },
  { sup: [{ i: 'n' }, '+1'] },
  ' = ',
  { i: 'u' },
  { sub: [{ i: 'j' }] },
  { sup: [{ i: 'n' }] },
  ' + ',
  { g: 'λ' },
  ' (',
  { i: 'u' },
  { sub: [{ i: 'j' }, '+1'] },
  { sup: [{ i: 'n' }] },
  { g: ' − ' },
  '2',
  { i: 'u' },
  { sub: [{ i: 'j' }] },
  { sup: [{ i: 'n' }] },
  ' + ',
  { i: 'u' },
  { sub: [{ i: 'j' }, { g: '−' }, '1'] },
  { sup: [{ i: 'n' }] },
  ')',
];
const SCHEME_TEXT = 'u_j^{n+1} = u_j^n + λ (u_{j+1}^n − 2u_j^n + u_{j−1}^n)';
const CONSEQUENCE = [
  { g: 'Δ' },
  { i: 't' },
  { g: ' ≤ ' },
  { g: 'Δ' },
  { i: 'x' },
  { sup: ['2'] },
  ' / 2    ',
  { g: '⇒' },
  '    halving ',
  { g: 'Δ' },
  { i: 'x' },
  ' quarters ',
  { g: 'Δ' },
  { i: 't' },
];
const CONSEQUENCE_TEXT = 'Δt ≤ Δx²/2 ⇒ halving Δx quarters Δt';
const OVERLAYS = 4;

export const meta = {
  title: 'Beamer deck with a frame built up over four overlay pages',
  stresses:
    '4:3 pages; overlay pages whose unrevealed items are drawn at 15% opacity; an \\only formula swap on the last overlay; repeated navigation bar and footer with a frame counter that does not advance',
  families: ['hidden-overlap', 'page-geometry', 'structure'],
  status: 'known-gap',
  page: { size: [W, HT] },
};

export const truth = `
Six PDF pages, three frames. Every page has the section navigation bar (${SECTIONS.join(' · ')})
and a footer: ${AUTHOR} | ${SHORT} | frame counter.

- **Page 1** (frame 1 / ${TOTAL_FRAMES}) — title frame: ${COURSE}; ${LECTURE}; ${AUTHOR}, ${INSTITUTE}; ${DATE}.
- **Page 2** (frame 2 / ${TOTAL_FRAMES}) — “Outline”: ${OUTLINE.join('; ')}.
- **Pages 3–6** (all frame 3 / ${TOTAL_FRAMES}) — “${FRAME_TITLE}”, built up over ${OVERLAYS} overlays.
  Every overlay page contains the text of all four items; the ones not yet revealed are drawn at
  15% opacity and are not visible to a reader as content. What a reader sees:

${Array.from({ length: OVERLAYS }, (_, k) => {
  const shown = ITEM_TEXT.slice(0, k + 1)
    .map((t) => `“${t}”`)
    .join(', ');
  const formula = k < OVERLAYS - 1 ? `\`${SCHEME_TEXT}\`` : `\`${CONSEQUENCE_TEXT}\``;
  return `  - Page ${k + 3} (overlay ${k + 1}): items ${shown}; formula ${formula}.`;
}).join('\n')}

A correct reading tells the overlay pages apart: which items each page shows (and that the
faint ones are not yet shown), and that the formula changes on page 6.

## Questions an agent should be able to answer

1. How many slides does the excerpt contain, and how do they map to pages? — three frames over six pages; pages 3–6 are one frame revealed in four steps
2. Which bullet points can the audience see on page 4? — the first two: “${ITEM_TEXT[0]}” and “${ITEM_TEXT[1]}”
3. What formula is shown under the list on page 6, and what did pages 3–5 show there instead? — \`${CONSEQUENCE_TEXT}\`; the update rule \`${SCHEME_TEXT}\`
4. What is the stability condition for explicit Euler? — λ = Δt/Δx² ≤ 1/2
5. What frame number does the footer show on page 5? — 3 / ${TOTAL_FRAMES}

**Known gap (no issue yet):** pages 3, 4 and 5 come back with identical text and no warning,
each listing every item including the faint ones — so question 2 gets all of
\`Each step costs O(N) …\`, \`Error is O(Δt + Δx2) …\` and \`Stable only if λ = Δt / Δx2 ≤ 1/2\` on
page 4, two of which the audience cannot see yet. Worse, what *is* visible on every overlay page is
dropped as repeated chrome: the frame title \`${FRAME_TITLE}\`, the first item
\`${ITEM_TEXT[0]}\`, the navigation bar, and the footer — so the first bullet never
appears on pages 3–6, and the \`3 / ${TOTAL_FRAMES}\` counter is missing (question 5 unanswerable;
pages 1 and 2 keep \`1 / ${TOTAL_FRAMES}\` and \`2 / ${TOTAL_FRAMES}\` because their counters differ). Nothing
says the pages are overlays of one frame (question 1 only by noticing the duplicates).

Question 3 is answerable by comparing pages: page 6 ends \`Δt ≤ Δx2 / 2 ⇒ halving Δx quarters Δt\`,
pages 3–5 end with the update rule — flattened as \`unj +1 = un + λ (un − 2un + un )\` with the
subscripts \`j\` / \`j+1\` / \`j\` / \`j−1\` on later lines (#241). Question 4 is answered from the last item
(\`Δx2\` for Δx²).
`;

function navBar(doc, h, current) {
  doc.rect(0, 0, W, 13).fill(BLUE);
  let x = 8;
  SECTIONS.forEach((name, i) => {
    doc.fillColor(i === current ? '#ffffff' : '#9aa6d6');
    const box = h.text(name, x, 3.5, { font: i === current ? SB : S, size: 5.5 });
    x = box.right + 12;
  });
  doc.fillColor('black');
}

function footer(doc, h, frame) {
  const y = HT - 10;
  const third = W / 3;
  [
    ['#1d2b63', AUTHOR],
    ['#2b3f8c', SHORT],
    ['#3d56b8', `${frame} / ${TOTAL_FRAMES}`],
  ].forEach(([color, label], i) => {
    doc.rect(third * i, y, third, 10).fill(color);
    doc.fillColor('#ffffff');
    h.text(label, third * i + third / 2, y + 2.5, { font: S, size: 5.5, align: 'center' });
  });
  // Navigation symbols, drawn as small vector glyphs above the footer.
  doc.fillColor('#b8c0de');
  for (let i = 0; i < 4; i += 1) {
    const x = W - 60 + i * 13;
    doc
      .polygon([x, HT - 16], [x + 4, HT - 18.5], [x + 4, HT - 13.5])
      .fill()
      .polygon([x + 9, HT - 16], [x + 5, HT - 18.5], [x + 5, HT - 13.5])
      .fill();
  }
  doc.fillColor('black');
}

function frameTitle(doc, h, title) {
  doc.rect(0, 13, W, 22).fill('#e3e7f5');
  doc.fillColor(BLUE);
  h.text(title, 12, 19, { font: S, size: 11 });
  doc.fillColor('black');
}

/** helpers.run() parts for math/text segments. */
const runParts = (segments) =>
  segments.flatMap((s) => {
    if (typeof s === 'string') return [s];
    if (s.i) return [{ text: s.i, font: MI }];
    if (s.g) return [{ text: s.g, font: SYM }];
    if (s.sup || s.sub) {
      const key = s.sup ? 'sup' : 'sub';
      return [s[key]].flat().map((p) => {
        if (typeof p === 'string') return { [key]: p, font: MR };
        return { [key]: p.i ?? p.g, font: p.i ? MI : SYM };
      });
    }
    return [];
  });

/** One run of math/text segments on a baseline at (x, y top); returns the x after it. */
function mathRun(h, segments, x, y, size, font = MR) {
  return h.run(runParts(segments), x, y, { font, size });
}

function runWidth(doc, segments, size) {
  return runParts(segments).reduce((sum, p) => {
    if (typeof p === 'string') return sum + doc.font(MR).fontSize(size).widthOfString(p);
    const small = p.text === undefined;
    return (
      sum +
      doc
        .font(p.font)
        .fontSize(small ? size * 0.65 : size)
        .widthOfString(p.text ?? p.sup ?? p.sub)
    );
  }, 0);
}

/** Sub/superscript pairs on one symbol are set stacked, as TeX does; `h` null measures only. */
function stackedRun(doc, h, segments, x, y, size) {
  let cursor = x;
  const one = (seg) => (h ? mathRun(h, [seg], cursor, y, size) : cursor + runWidth(doc, [seg], size));
  for (let k = 0; k < segments.length; k += 1) {
    const seg = segments[k];
    const next = segments[k + 1];
    if (seg.sub && next?.sup) {
      cursor = Math.max(one(seg), one(next));
      k += 1;
    } else cursor = one(seg);
  }
  return cursor;
}

function bullet(doc, x, y, opacity) {
  doc.save();
  doc.fillColor(BLUE).fillOpacity(opacity);
  doc.polygon([x, y], [x + 4.5, y + 2.6], [x, y + 5.2]).fill();
  doc.restore();
}

export function draw(doc, h) {
  // Frame 1: title.
  navBar(doc, h, 0);
  doc.roundedRect(30, 58, W - 60, 48, 4).fill('#e3e7f5');
  doc.fillColor(BLUE);
  h.text(COURSE, W / 2, 66, { font: SB, size: 13, align: 'center' });
  h.text(LECTURE, W / 2, 86, { font: S, size: 9, align: 'center' });
  doc.fillColor('black');
  h.text(AUTHOR, W / 2, 130, { font: S, size: 9, align: 'center' });
  h.text(INSTITUTE, W / 2, 145, { font: S, size: 7, align: 'center' });
  h.text(DATE, W / 2, 172, { font: S, size: 7.5, align: 'center' });
  footer(doc, h, 1);

  // Frame 2: outline.
  h.newPage();
  navBar(doc, h, 0);
  frameTitle(doc, h, 'Outline');
  OUTLINE.forEach((line, i) => {
    doc.fillColor(BLUE);
    h.text(`${i + 1}`, 34, 58 + i * 26, { font: SB, size: 9 });
    doc.fillColor('black');
    h.text(line, 50, 58 + i * 26, { font: S, size: 9 });
  });
  footer(doc, h, 2);

  // Frame 3: four overlay pages.
  for (let overlay = 1; overlay <= OVERLAYS; overlay += 1) {
    h.newPage();
    navBar(doc, h, 1);
    frameTitle(doc, h, FRAME_TITLE);
    ITEMS.forEach((item, i) => {
      const revealed = i < overlay;
      const y = 50 + i * 21;
      bullet(doc, 20, y + 2, revealed ? 1 : 0.15);
      doc.save();
      doc.fillOpacity(revealed ? 1 : 0.15);
      mathRun(h, item, 30, y, 8.5, S);
      doc.restore();
    });
    const formula = overlay < OVERLAYS ? SCHEME : CONSEQUENCE;
    doc.roundedRect(30, 146, W - 60, 40, 3).fill('#f1f3fa');
    doc.fillColor('black');
    const width = stackedRun(doc, null, formula, 0, 0, 10);
    stackedRun(doc, h, formula, W / 2 - width / 2, 162, 10);
    footer(doc, h, 3);
  }
}
