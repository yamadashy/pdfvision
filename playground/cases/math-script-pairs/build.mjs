// The notation section of a methods paper: symbols that carry a raised and a
// lowered script on one base. Tensor indices are stacked (Γ with k over ij),
// a measured ratio has stacked asymmetric bounds, ions put a charge after
// their atom count (PO₄³⁻), a step size has a script on its script (η with
// t₀), and a functional's time derivative sits a TeX italic correction away
// from its base (F, a sliver of space, m over t). Beside them sit the forms
// that must not be read as exponents: an ordinal, a superscript citation and
// a footnote marker after a word space. Scripts are set as TeX sets them:
// smaller runs on raised/lowered baselines, nothing else marks them.

const T = 'Times-Roman';
const TB = 'Times-Bold';
const TI = 'Times-Italic';
const SYM = 'NotoSansJP';

const SIZE = 11;
const LEFT = 90;

const RATIO = { value: '0.112', plus: '0.008', minus: '0.009' };
const IONS = [
  { name: 'phosphate', atoms: ['PO', '4'], charge: '3−' },
  { name: 'ammonium', atoms: ['NH', '4'], charge: '+' },
  { name: 'sulfate', atoms: ['SO', '4'], charge: '2−' },
];
const RESTART = '400';
const CITATION = '12';
const FOOTNOTE = { marker: '3', text: 'Both runs used the same random seed.' };

export const meta = {
  title: 'Paired and nested scripts',
  stresses:
    'a raised and a lowered script on one base: stacked tensor indices, stacked asymmetric bounds, an atom count followed by a charge, a script on a script, a TeX italic-correction gap before a script; an ordinal, a superscript citation and a spaced footnote marker beside them',
  families: ['math'],
  status: 'ok',
  issue: 241,
  showcase: true,
  hard: 'a base and its two scripts are three separate runs on three baselines; read in content order the charge of PO₄³⁻ joins the atom count, a stacked lower bound falls to the next line, and a script of a script reads as a second index',
};

export const truth = `
Section **2 Notation** of a methods paper. In LaTeX notation the section reads:

> The Christoffel symbols $\\Gamma^k_{ij}$ are symmetric in their lower indices $i$ and $j$; the
> curvature tensor $R^i_{jkl}$ is built from them.
>
> The measured mass ratio is $q = ${RATIO.value}^{+${RATIO.plus}}_{-${RATIO.minus}}$, the same in the 2nd run as in the first.
>
> The functional $F^m$ evolves as $F^m_t = 2\\int |R_{ij} + \\nabla_i\\nabla_j f|^2\\,dm$, as shown before.$^{${CITATION}}$
>
> The step size $\\eta_{t_0}$ is reset at the restart time $t_0 = ${RESTART}$ of each cycle.
>
> The buffer holds ${IONS.map((ion) => `${ion.name} ($\\mathrm{${ion.atoms[0]}}_${ion.atoms[1]}^{${ion.charge}}$)`)
  .join(', ')
  .replace(/, ([^,]*)$/, ' and $1')} on each GPU $^{${FOOTNOTE.marker}}$.

Footnote ${FOOTNOTE.marker}: ${FOOTNOTE.text}

Every script has to stay attached to its base and distinguishable as raised or lowered: the
charge of PO₄³⁻ must not read as part of the atom count, the lower bound of $q$ must
stay beside the upper one, and $t_0$ must read as the script of $\\eta$'s script, not as a second
index. Any unambiguous notation is fine.

## Questions an agent should be able to answer

1. Which indices of the Christoffel symbol are lower, and which is upper? — lower $i$ and $j$, upper $k$
2. What is the measured mass ratio, with its uncertainties? — ${RATIO.value} +${RATIO.plus}/−${RATIO.minus}
3. How many oxygen atoms does the phosphate ion have, and what is its charge? — 4 oxygen atoms, charge 3−
4. What is the time derivative of $F^m$ equal to? — $2\\int |R_{ij} + \\nabla_i\\nabla_j f|^2\\,dm$
5. At what time is the step size evaluated, and what is that time? — at the restart time $t_0$, ${RESTART}

All five are answered from \`read.md\` (#241): \`Γ^k_{ij}\` and \`R^i_{jkl}\` keep both scripts on
their base, \`q = ${RATIO.value}^{+${RATIO.plus}}_{−${RATIO.minus}}\` keeps its lower bound on the line,
\`PO_4^{3−}\`, \`NH_4^+\` and \`SO_4^{2−}\` keep the count and the charge apart, \`F^m_t\` reads through the
italic correction, and \`η_{t_0}\` nests \`t_0\` inside the subscript. The ordinal reads \`2^{nd}\`, the
citation \`before.^${CITATION}\`, and the footnote marker, set after a word space, stays apart from the
word (\`GPU ^${FOOTNOTE.marker}\`) rather than joining it.
`;

// ---------------------------------------------------------------------------
// A line is a list of nodes on one baseline: a string (roman), { i } italic,
// { g } symbol font, { sup, sub } scripts on the preceding box (stacked when
// both are given; each a node list, drawn at 70% size), { kern } extra space
// in points.

function put(doc, text, font, size, x, baseline) {
  doc.font(font).fontSize(size);
  doc.text(text, x, baseline - (doc._font.ascender / 1000) * size, { lineBreak: false });
  return doc.widthOfString(text);
}

function layout(doc, nodes, x, baseline, size) {
  let cursor = x;
  for (const node of nodes) {
    if (typeof node === 'string') cursor += put(doc, node, T, size, cursor, baseline);
    else if (node.i !== undefined) cursor += put(doc, node.i, TI, size, cursor, baseline);
    else if (node.g !== undefined) cursor += put(doc, node.g, SYM, size, cursor, baseline);
    else if (node.kern !== undefined) cursor += node.kern;
    else {
      const small = size * 0.7;
      const up = node.sup ? layout(doc, [node.sup].flat(), cursor, baseline - size * 0.4, small) - cursor : 0;
      const down = node.sub ? layout(doc, [node.sub].flat(), cursor, baseline + size * 0.22, small) - cursor : 0;
      cursor += Math.max(up, down) + 0.5;
    }
  }
  return cursor;
}

const sup = (s) => ({ sup: s });
const sub = (s) => ({ sub: s });

export function draw(doc, h) {
  h.text('2  Notation', LEFT, 88, { font: TB, size: 12 });
  const lines = [
    [
      'The Christoffel symbols ',
      { g: 'Γ' },
      { sup: { i: 'k' }, sub: { i: 'ij' } },
      ' are symmetric in their lower indices ',
      { i: 'i' },
      ' and ',
      { i: 'j' },
      '; the curvature tensor ',
      { i: 'R' },
      { sup: { i: 'i' }, sub: { i: 'jkl' } },
    ],
    ['is built from them.'],
    [
      'The measured mass ratio is ',
      { i: 'q' },
      ` = ${RATIO.value}`,
      { sup: `+${RATIO.plus}`, sub: [{ g: '−' }, RATIO.minus] },
      ', the same in the 2',
      sup('nd'),
      ' run as in the first.',
    ],
    [
      'The functional ',
      { i: 'F' },
      sup({ i: 'm' }),
      ' evolves as ',
      { i: 'F' },
      { kern: 1.2 },
      { sup: { i: 'm' }, sub: { i: 't' } },
      ' = 2',
      { g: '∫' },
      ' |',
      { i: 'R' },
      sub({ i: 'ij' }),
      ' + ',
      { g: '∇' },
      sub({ i: 'i' }),
      { g: '∇' },
      sub({ i: 'j' }),
      { i: 'f' },
      ' |',
      sup('2'),
      { i: ' dm' },
      ', as shown before.',
      sup(CITATION),
    ],
    [
      'The step size ',
      { g: 'η' },
      sub([{ i: 't' }, sub('0')]),
      ' is reset at the restart time ',
      { i: 't' },
      sub('0'),
      ` = ${RESTART} of each cycle.`,
    ],
    [
      'The buffer holds ',
      ...IONS.flatMap((ion, index) => [
        index === 0 ? '' : index === IONS.length - 1 ? ' and ' : ', ',
        `${ion.name} (${ion.atoms[0]}`,
        sub(ion.atoms[1]),
        sup(ion.charge === '+' ? '+' : [ion.charge[0], { g: ion.charge.slice(1) }]),
        ')',
      ]).filter((node) => node !== ''),
      ' on each GPU ',
      sup(FOOTNOTE.marker),
      '.',
    ],
  ];
  let y = 120;
  for (const line of lines) {
    layout(doc, line, LEFT, y, SIZE);
    y += 17;
  }
  h.rule(LEFT, 690, LEFT + 120);
  h.run([{ sup: FOOTNOTE.marker }, ` ${FOOTNOTE.text}`], LEFT, 698, { font: T, size: 9 });
}
