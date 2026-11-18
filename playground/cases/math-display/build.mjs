// A page from a physics paper in single-column preprint style: numbered
// display equations with a fraction and an integral with limits, a sum with
// limits above and below, a bracketed 2×2 covariance matrix, a three-line
// aligned derivation with one number for the block, and measured values with
// stacked asymmetric uncertainties (410 +160/−180 Mpc), with prose between
// them carrying inline symbols. Math is set the way TeX sets it: italic
// variables, Greek and operators from a separate font, scripts as smaller
// raised/lowered runs, big operators enlarged, fraction bars and matrix
// brackets as vector lines.

const T = 'Times-Roman';
const TB = 'Times-Bold';
const TI = 'Times-Italic';
const SYM = 'NotoSansJP';

const RUNNING = 'Standard-siren distances from low-redshift mergers';
const PAGE = '7';
const N_EVENTS = 47;
const EVENT = 'GW261103';
// Stacked asymmetric uncertainties: value, +upper, −lower, unit.
const MEASURED = {
  distance: { value: '410', plus: '160', minus: '180', unit: 'Mpc' },
  redshift: { value: '0.09', plus: '0.03', minus: '0.04', unit: '' },
  mass: { value: '36', plus: '5', minus: '4', unit: 'M⊙' },
  hubble: { value: '68.2', plus: '6.1', minus: '4.7', unit: 'km s⁻¹ Mpc⁻¹' },
};
const COVARIANCE = [
  ['0.042', '−0.013'],
  ['−0.013', '0.027'],
];
const OMEGA_M = '0.31';
const OMEGA_L = '0.69';

export const meta = {
  title: 'Physics paper page with display equations',
  stresses:
    'numbered display equations: fraction, integral and sum with limits, bracketed matrix, aligned multi-line derivation; stacked asymmetric uncertainties; inline Greek and scripts in prose',
  families: ['math'],
  status: 'ok',
  issue: 241,
  showcase: true,
  hard: 'display equations are runs on several baselines joined only by vector fraction bars, hanging operator glyphs and bracket strokes; read as lines they scatter across the page with their numbers among the page numbers',
};

const pm = ({ value, plus, minus, unit }) => `${value} +${plus}/−${minus}${unit ? ` ${unit}` : ''}`;

export const truth = `
Page ${PAGE} of a preprint (running head “${RUNNING}”), section **III. DISTANCE ESTIMATION**.
In LaTeX notation, the page reads:

For a flat ΛCDM background the luminosity distance of a source at redshift $z$ is

$$d_L(z) = \\frac{c\\,(1+z)}{H_0} \\int_0^{z} \\frac{dz'}{E(z')} \\qquad (1)$$

and the likelihood over the $N = ${N_EVENTS}$ events of the catalogue is

$$\\ln \\mathcal{L}(\\theta) = -\\frac{1}{2} \\sum_{k=1}^{N} \\frac{(d_k - \\mu_k(\\theta))^2}{\\sigma_k^2} \\qquad (2)$$

with $\\theta = (H_0, \\Omega_m)$. The marginal posterior covariance of $(H_0/100, \\Omega_m)$ is

$$\\Sigma = \\begin{bmatrix} ${COVARIANCE[0].join(' & ')} \\\\ ${COVARIANCE[1].join(' & ')} \\end{bmatrix} \\qquad (3)$$

Expanding the expansion rate for $z \\ll 1$:

$$\\begin{aligned} E(z)^2 &= \\Omega_m (1+z)^3 + \\Omega_\\Lambda \\\\ &= ${OMEGA_M}\\,(1+z)^3 + ${OMEGA_L} \\\\ &\\approx 1 + 0.93\\,z \\end{aligned} \\qquad (4)$$

Measured values, each a central value with stacked upper (+) and lower (−) uncertainties:
${EVENT} lies at $d_L = ${MEASURED.distance.value}^{+${MEASURED.distance.plus}}_{-${MEASURED.distance.minus}}$ Mpc
($z = ${MEASURED.redshift.value}^{+${MEASURED.redshift.plus}}_{-${MEASURED.redshift.minus}}$) with primary mass
$${MEASURED.mass.value}^{+${MEASURED.mass.plus}}_{-${MEASURED.mass.minus}}\\,M_\\odot$, and the catalogue gives
$H_0 = ${MEASURED.hubble.value}^{+${MEASURED.hubble.plus}}_{-${MEASURED.hubble.minus}}$ km s⁻¹ Mpc⁻¹.

## Questions an agent should be able to answer

1. What is the luminosity distance of ${EVENT}, with its uncertainties? — ${pm(MEASURED.distance)} (upper +${MEASURED.distance.plus}, lower −${MEASURED.distance.minus})
2. What is the lowest primary mass consistent with the quoted interval? — ${Number(MEASURED.mass.value) - Number(MEASURED.mass.minus)} M⊙ (${pm(MEASURED.mass)})
3. What is the covariance between H₀/100 and Ωm in Eq. (3)? — ${COVARIANCE[0][1]}
4. Over what range does the sum in Eq. (2) run, and what is in its denominator? — k = 1 to N (N = ${N_EVENTS}); σ_k squared
5. What does Eq. (4) give for E(z)² at low redshift? — approximately 1 + 0.93 z (from ${OMEGA_M}(1+z)³ + ${OMEGA_L})

Inline scripts are marked and stay on their line (#241). The stacked uncertainties read
\`d_L = 410^+160_−180 Mpc (z = 0.09^{+0.03}_{−0.04})\` (question 1), the mass \`36^+5_−4 M⊙\`
(question 2), and \`H_0 = 68.2^{+6.1}_{−4.7} km s^−1 Mpc^−1\`; inline symbols keep their subscripts
(\`σ_k\`, \`θ = (H_0, Ω_m)\`).

**Reads correctly (#241, display equations):** each display equation is read onto one line from its
geometry, with its number: Eq. (1) is \`d_L(z) = (c (1 + z))/H_0 ∫_0^z dz′/E(z′), (1)\` (fraction bars as
\`/\` with multi-term parts bracketed, the integral's limits as scripts), Eq. (2) is
\`ln L(θ) = − 1/2 ∑_{k=1}^N ((d_k − μ_k(θ))^2)/σ^2_k, (2)\` (question 4), the matrix is
\`Σ = [[0.042, −0.013], [−0.013, 0.027]] . (3)\` (question 3: −0.013), and the aligned derivation keeps its
rows with \`(4)\` on its middle row (question 5). The heading, page number and equations read in page
order: centred equations no longer form a column of their own. All five questions are answered from
\`read.md\`, and no warning fires.
`;

// ---------------------------------------------------------------------------
// A small box-layout engine for the equations. A node is a string (roman), or
// { i } italic, { g } symbol font, { sup, sub } scripts attached to the
// preceding box (stacked when both are given), { frac: [num, den] },
// { op, lo, hi } a big operator with limits above/below, { int, lo, hi } an
// integral with limits to its right, { bracket: rows } a matrix.

const LEFT = 90;
const RIGHT = 522;
const SIZE = 11;

function measure(doc, nodes, size) {
  return layout(doc, null, nodes, 0, 0, size);
}

/** Lay out `nodes` from x on `baseline`; draws when `h` is given. Returns { width, ascent, descent }. */
function layout(doc, h, nodes, x, baseline, size) {
  let cursor = x;
  let ascent = size * 0.7;
  let descent = size * 0.22;
  const put = (text, font, fontSize, at, base) => {
    doc.font(font).fontSize(fontSize);
    const width = doc.widthOfString(text);
    if (h) doc.text(text, at, base - (doc._font.ascender / 1000) * fontSize, { lineBreak: false });
    return width;
  };
  for (const node of nodes) {
    if (typeof node === 'string' || node.i !== undefined || node.g !== undefined) {
      const text = typeof node === 'string' ? node : (node.i ?? node.g);
      const font = typeof node === 'string' ? T : node.i !== undefined ? TI : SYM;
      cursor += put(text, font, size, cursor, baseline);
    } else if (node.sup !== undefined || node.sub !== undefined) {
      const small = size * 0.7;
      const up = node.sup !== undefined ? measure(doc, [node.sup].flat(), small).width : 0;
      const down = node.sub !== undefined ? measure(doc, [node.sub].flat(), small).width : 0;
      if (node.sup !== undefined) layout(doc, h, [node.sup].flat(), cursor + 0.5, baseline - size * 0.42, small);
      if (node.sub !== undefined) layout(doc, h, [node.sub].flat(), cursor + 0.5, baseline + size * 0.25, small);
      cursor += Math.max(up, down) + 1;
      ascent = Math.max(ascent, size * 0.95);
      descent = Math.max(descent, size * 0.45);
    } else if (node.frac) {
      const [num, den] = node.frac.map((part) => measure(doc, part, size));
      const width = Math.max(num.width, den.width) + 4;
      const axis = baseline - size * 0.3;
      layout(doc, h, node.frac[0], cursor + (width - num.width) / 2, axis - 3 - num.descent, size);
      layout(doc, h, node.frac[1], cursor + (width - den.width) / 2, axis + 3 + den.ascent, size);
      if (h)
        doc
          .moveTo(cursor, axis)
          .lineTo(cursor + width, axis)
          .lineWidth(0.5)
          .stroke();
      ascent = Math.max(ascent, size * 0.3 + 3 + num.ascent + num.descent);
      descent = Math.max(descent, -size * 0.3 + 3 + den.ascent + den.descent);
      cursor += width + 2;
    } else if (node.op) {
      const big = size * 1.6;
      doc.font(SYM).fontSize(big);
      const opWidth = doc.widthOfString(node.op);
      const lo = measure(doc, node.lo, size * 0.7);
      const hi = measure(doc, node.hi, size * 0.7);
      const width = Math.max(opWidth, lo.width, hi.width);
      put(node.op, SYM, big, cursor + (width - opWidth) / 2, baseline + size * 0.32);
      layout(doc, h, node.hi, cursor + (width - hi.width) / 2, baseline - size * 1.25, size * 0.7);
      layout(doc, h, node.lo, cursor + (width - lo.width) / 2, baseline + size * 1.05, size * 0.7);
      ascent = Math.max(ascent, size * 1.6);
      descent = Math.max(descent, size * 1.15);
      cursor += width + 3;
    } else if (node.int) {
      const big = size * 2.4;
      const w = put(node.int, SYM, big, cursor, baseline + size * 0.6);
      layout(doc, h, node.hi, cursor + w, baseline - size * 1.05, size * 0.7);
      layout(doc, h, node.lo, cursor + w - 4, baseline + size * 0.95, size * 0.7);
      cursor += w + Math.max(measure(doc, node.hi, size * 0.7).width, measure(doc, node.lo, size * 0.7).width) + 3;
      ascent = Math.max(ascent, size * 1.3);
      descent = Math.max(descent, size * 0.85);
    } else if (node.bracket) {
      const rows = node.bracket;
      const cells = rows.map((row) => row.map((cell) => measure(doc, [cell].flat(), size)));
      const colW = rows[0].map((_, c) => Math.max(...cells.map((row) => row[c].width)));
      const rowGap = size * 1.45;
      const top = baseline - size * 0.3 - (rowGap * rows.length) / 2;
      const inner = colW.reduce((a, b) => a + b, 0) + (colW.length - 1) * 14;
      const height = rowGap * rows.length;
      if (h) {
        doc.lineWidth(0.6);
        for (const [edge, dir] of [
          [cursor + 1, 1],
          [cursor + inner + 13, -1],
        ]) {
          doc
            .moveTo(edge + dir * 3, top)
            .lineTo(edge, top)
            .lineTo(edge, top + height)
            .lineTo(edge + dir * 3, top + height)
            .stroke();
        }
      }
      rows.forEach((row, r) => {
        let cx = cursor + 7;
        row.forEach((cell, c) => {
          layout(doc, h, [cell].flat(), cx + colW[c] - cells[r][c].width, top + rowGap * (r + 0.72), size);
          cx += colW[c] + 14;
        });
      });
      ascent = Math.max(ascent, baseline - top);
      descent = Math.max(descent, top + height - baseline);
      cursor += inner + 16;
    }
  }
  return { width: cursor - x, ascent, descent };
}

function display(doc, h, nodes, y, number) {
  const box = measure(doc, nodes, SIZE);
  const baseline = y + box.ascent;
  layout(doc, h, nodes, (LEFT + RIGHT) / 2 - box.width / 2, baseline, SIZE);
  if (number) h.text(`(${number})`, RIGHT, baseline - SIZE * 0.68, { font: T, size: SIZE, align: 'right' });
  return baseline + box.descent + 10;
}

// Prose with inline math: a line is a list of nodes laid out on one baseline.
function proseLine(doc, h, nodes, y, indent = 0) {
  layout(doc, h, nodes, LEFT + indent, y + SIZE * 0.7, SIZE);
  return y + 15.5;
}

const stacked = ({ value, plus, minus }) => [value, { sup: `+${plus}`, sub: { g: `−${minus}` } }];
const sup = (s) => ({ sup: s });
const sub = (s) => ({ sub: s });

export function draw(doc, h) {
  h.text(RUNNING, LEFT, 46, { font: TI, size: 9 });
  h.text(PAGE, RIGHT, 46, { font: T, size: 9, align: 'right' });

  let y = 78;
  h.text('III.  DISTANCE ESTIMATION', 306, y, { font: TB, size: 10.5, align: 'center' });
  y += 26;
  y = proseLine(
    doc,
    h,
    ['For a flat ', { g: 'Λ' }, 'CDM background the luminosity distance of a source at redshift ', { i: 'z' }, ' is'],
    y,
    14,
  );
  y += 6;
  y = display(
    doc,
    h,
    [
      { i: 'd' },
      sub({ i: 'L' }),
      '(',
      { i: 'z' },
      ') = ',
      {
        frac: [
          [{ i: 'c' }, ' (1 + ', { i: 'z' }, ')'],
          [{ i: 'H' }, sub('0')],
        ],
      },
      { int: '∫', lo: ['0'], hi: [{ i: 'z' }] },
      {
        frac: [
          [{ i: 'dz' }, { g: '′' }],
          [{ i: 'E' }, '(', { i: 'z' }, { g: '′' }, ')'],
        ],
      },
      ',',
    ],
    y,
    1,
  );
  y = proseLine(
    doc,
    h,
    [
      'where ',
      { i: 'E' },
      '(',
      { i: 'z' },
      ') is the dimensionless expansion rate. Given the measured distances ',
      { i: 'd' },
      sub({ i: 'k' }),
      ' and their',
    ],
    y,
  );
  y = proseLine(
    doc,
    h,
    [
      'standard deviations ',
      { g: 'σ' },
      sub({ i: 'k' }),
      ', the likelihood over the ',
      { i: 'N' },
      ` = ${N_EVENTS} events of the catalogue is`,
    ],
    y,
  );
  y += 12;
  y = display(
    doc,
    h,
    [
      'ln ',
      { i: 'L' },
      '(',
      { g: 'θ' },
      ') = ',
      { g: '−' },
      { frac: [['1'], ['2']] },
      { op: '∑', lo: [{ i: 'k' }, '=1'], hi: [{ i: 'N' }] },
      {
        frac: [
          [
            '(',
            { i: 'd' },
            sub({ i: 'k' }),
            { g: ' − ' },
            { g: 'μ' },
            sub({ i: 'k' }),
            '(',
            { g: 'θ' },
            '))',
            sup('2'),
          ],
          [{ g: 'σ' }, { sup: '2', sub: { i: 'k' } }],
        ],
      },
      ',',
    ],
    y,
    2,
  );
  y += 4;
  y = proseLine(
    doc,
    h,
    [
      'with ',
      { g: 'θ' },
      ' = (',
      { i: 'H' },
      sub('0'),
      ', ',
      { g: 'Ω' },
      sub({ i: 'm' }),
      ') and ',
      { g: 'μ' },
      sub({ i: 'k' }),
      ' given by Eq. (1). Sampling Eq. (2) with flat priors, the marginal posterior',
    ],
    y,
  );
  y = proseLine(doc, h, ['covariance of (', { i: 'H' }, sub('0'), '/100, ', { g: 'Ω' }, sub({ i: 'm' }), ') is'], y);
  y += 14;
  y = display(
    doc,
    h,
    [
      { g: 'Σ' },
      ' = ',
      {
        bracket: COVARIANCE.map((row) =>
          row.map((cell) => (cell.startsWith('−') ? [{ g: '−' }, cell.slice(1)] : cell)),
        ),
      },
      '.',
    ],
    y,
    3,
  );
  y += 6;
  y = proseLine(
    doc,
    h,
    [
      'The negative off-diagonal term is the familiar degeneracy between ',
      { i: 'H' },
      sub('0'),
      ' and ',
      { g: 'Ω' },
      sub({ i: 'm' }),
      '. For ',
      { i: 'z' },
      { g: ' ≪ ' },
      '1 the expansion',
    ],
    y,
  );
  y = proseLine(doc, h, ['rate simplifies to'], y);
  y += 6;

  // Aligned derivation: three lines aligned on the relation sign, one number.
  const lhsW = measure(doc, [{ i: 'E' }, '(', { i: 'z' }, ')', sup('2')], SIZE).width;
  const alignX = 230;
  const lines = [
    [
      [{ i: 'E' }, '(', { i: 'z' }, ')', sup('2')],
      [' = ', { g: 'Ω' }, sub({ i: 'm' }), ' (1 + ', { i: 'z' }, ')', sup('3'), ' + ', { g: 'Ω' }, sub({ g: 'Λ' })],
    ],
    [[], [' = ', OMEGA_M, ' (1 + ', { i: 'z' }, ')', sup('3'), ` + ${OMEGA_L}`]],
    [[], [{ g: ' ≈ ' }, '1 + 0.93 ', { i: 'z' }, '.']],
  ];
  lines.forEach(([lhs, rhs], i) => {
    const baseline = y + 12;
    if (lhs.length) layout(doc, h, lhs, alignX - lhsW, baseline, SIZE);
    layout(doc, h, rhs, alignX, baseline, SIZE);
    if (i === 1) h.text('(4)', RIGHT, baseline - SIZE * 0.68, { font: T, size: SIZE, align: 'right' });
    y += 21;
  });
  y += 10;

  h.text('A.  Results for the nearest event', LEFT, y, { font: TI, size: 10.5 });
  y += 22;
  const D = MEASURED.distance;
  const Z = MEASURED.redshift;
  const M = MEASURED.mass;
  const H0 = MEASURED.hubble;
  y = proseLine(
    doc,
    h,
    [
      `The nearest event, ${EVENT}, lies at `,
      { i: 'd' },
      sub({ i: 'L' }),
      ' = ',
      ...stacked(D),
      ` ${D.unit} (`,
      { i: 'z' },
      ' = ',
      ...stacked(Z),
      '), with a primary mass of',
    ],
    y,
    14,
  );
  y += 3;
  y = proseLine(
    doc,
    h,
    [
      ...stacked(M),
      ' ',
      { i: 'M' },
      sub({ g: '⊙' }),
      '. Combining all ',
      { i: 'N' },
      ' events through Eq. (2) gives ',
      { i: 'H' },
      sub('0'),
      ' = ',
      ...stacked(H0),
      ' km s',
      sup([{ g: '−' }, '1']),
      ' Mpc',
      sup([{ g: '−' }, '1']),
      ',',
    ],
    y,
  );
  y += 3;
  proseLine(doc, h, ['where the quoted intervals are the 68% highest-density bounds above and below the median.'], y);
}
