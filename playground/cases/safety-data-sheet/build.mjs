// Two pages of a safety data sheet (SDS) in the 16-section GHS format: the
// hazard pictograms are red-bordered diamonds drawn as vector paths with no
// text, the composition table gives chemical formulas with real subscripts,
// the physical-properties table mixes units (°C, g/cm³, kPa), and the
// stability section names ions with superscript charges. Section headings
// are white text on dark bars, and every page repeats the product line and
// "Page n of 2".

const W = 612;
const F = 'Helvetica';
const FB = 'Helvetica-Bold';
const NJ = 'NotoSansJP';

const PRODUCT = 'KALKO HX-40 Descaler';
const SUPPLIER = 'Brightwater Chemical Supply Ltd, Unit 7 Fenwick Park, Harlow CM20 9QX';
const EMERGENCY = '+44 1279 555 0199 (24 h)';
const PICTOGRAMS = ['GHS05 corrosion', 'GHS07 exclamation mark'];
const H_STATEMENTS = [
  ['H290', 'May be corrosive to metals.'],
  ['H314', 'Causes severe skin burns and eye damage.'],
  ['H335', 'May cause respiratory irritation.'],
];
const P_STATEMENTS = [
  ['P280', 'Wear protective gloves, eye protection and face protection.'],
  ['P301+P330+P331', 'IF SWALLOWED: rinse mouth. Do NOT induce vomiting.'],
  ['P305+P351+P338', 'IF IN EYES: rinse cautiously with water for several minutes.'],
];
// Formula segments: string = normal, { sub } = subscript, { sup } = superscript.
const COMPONENTS = [
  {
    name: 'Sulfamic acid',
    cas: '5329-14-6',
    formula: ['H', { sub: '3' }, 'NSO', { sub: '3' }],
    plain: 'H3NSO3',
    pct: '15–20%',
  },
  {
    name: 'Citric acid',
    cas: '77-92-9',
    formula: ['C', { sub: '6' }, 'H', { sub: '8' }, 'O', { sub: '7' }],
    plain: 'C6H8O7',
    pct: '5–10%',
  },
  {
    name: 'Sodium dodecyl sulfate',
    cas: '151-21-3',
    formula: ['NaC', { sub: '12' }, 'H', { sub: '25' }, 'SO', { sub: '4' }],
    plain: 'NaC12H25SO4',
    pct: '1–3%',
  },
];
const PROPERTIES = [
  ['Appearance', 'Clear, pale green liquid'],
  ['pH', '1.2 (1% solution in water, 20 °C)'],
  ['Relative density', ['1.18 g/cm', { sup: '3' }, ' at 20 °C'], '1.18 g/cm³ at 20 °C'],
  ['Boiling point', '102 °C'],
  ['Vapour pressure', '2.3 kPa at 20 °C'],
  ['Flash point', 'Not applicable (aqueous)'],
  ['Solubility in water', 'Completely miscible'],
];

export const meta = {
  title: 'Safety data sheet (SDS) with hazard pictograms and chemical formulas',
  stresses:
    'GHS hazard pictograms as text-free vector diamonds; signal word and H/P statement codes; composition table with chemical formulas set with real subscripts and CAS numbers; units with superscripts; ions with superscript charges in prose; white-on-dark section bars; repeated product line and page count',
  status: 'known-gap',
  issue: 265,
  families: ['vector-meaning', 'math', 'tables', 'structure'],
};

const propText = (p) => (typeof p[1] === 'string' ? p[1] : p[2]);

export const truth = `
Two Letter pages of an SDS for **${PRODUCT}**, sections 1–3 on page 1 and 9–10 on page 2.

**1. Identification** — Product: ${PRODUCT}; use: descaling of kettles and coffee machines; supplier:
${SUPPLIER}; emergency telephone ${EMERGENCY}.

**2. Hazard identification** — Pictograms (drawn, no text): **${PICTOGRAMS.join('** and **')}**. Signal word
**Danger**. ${H_STATEMENTS.map(([c, t]) => `${c} ${t}`).join(' ')} ${P_STATEMENTS.map(([c, t]) => `${c} ${t}`).join(' ')}

**3. Composition**

| Component | CAS No. | Formula | Concentration |
| --- | --- | --- | --- |
${COMPONENTS.map((c) => `| ${c.name} | ${c.cas} | ${c.plain} (subscript digits) | ${c.pct} |`).join('\n')}

**9. Physical and chemical properties**

| Property | Value |
| --- | --- |
${PROPERTIES.map((p) => `| ${p[0]} | ${propText(p)} |`).join('\n')}

**10. Stability and reactivity** — Reacts with metals to release hydrogen (H₂). Incompatible with bases,
hypochlorites (OCl⁻) and sulfites (SO₃²⁻); mixing with hypochlorite bleach releases chlorine (Cl₂).

## Questions an agent should be able to answer

1. What is the CAS number and concentration of citric acid? — 77-92-9, 5–10%
2. What is the chemical formula of sulfamic acid? — H₃NSO₃
3. Which hazard pictograms does the label show? — GHS05 (corrosion) and GHS07 (exclamation mark)
4. What is the product's density? — 1.18 g/cm³ at 20 °C
5. Which ion's name and charge appear for sulfites, and what gas does mixing with bleach release? — SO₃²⁻ (sulfite, charge 2−); chlorine (Cl₂)
6. What does hazard statement H335 say, and which statement is H314? — H335: May cause respiratory irritation; H314: Causes severe skin burns and eye damage

Questions 1, 2, 4, 5 and 6 are answerable from \`read.md\`: the composition table reads row by row with the
subscripts marked (\`H_3NSO_3\`, \`NaC_12H_25SO_4\`), the density keeps its superscript
(\`1.18 g/cm^3\`), the ions keep their charges apart from their atom counts (\`OCl^−\`, \`SO_3^{2−}\`,
#241), and the two-column lists read as rows: each H- and P-statement code on one line
with its text (\`H335 May cause respiratory irritation.\`), as are section 1's labels with their values
and section 9's properties (#301).

**Known gap:** the hazard pictograms leave no trace and nothing warns, so question 3 has no answer
(the signal word and H-statements hint at corrosion, not at which pictograms are printed).
`;

function bar(doc, h, title, y) {
  doc.rect(48, y, W - 96, 16).fill('#263238');
  doc.fillColor('white');
  h.text(title, 54, y + 3.5, { font: FB, size: 9.5 });
  doc.fillColor('black');
  return y + 24;
}

function chrome(doc, h, page) {
  h.text(`SAFETY DATA SHEET — ${PRODUCT}`, 48, 30, { font: FB, size: 10 });
  h.text('Revision 3 · 02/11/2026', W - 48, 30, { font: F, size: 8, align: 'right' });
  doc
    .lineWidth(0.6)
    .moveTo(48, 44)
    .lineTo(W - 48, 44)
    .stroke();
  h.text(`Page ${page} of 2`, W - 48, 760, { font: F, size: 8, align: 'right' });
}

function diamond(doc, cx, cy, draw) {
  const r = 30;
  doc.save();
  doc
    .moveTo(cx, cy - r)
    .lineTo(cx + r, cy)
    .lineTo(cx, cy + r)
    .lineTo(cx - r, cy)
    .closePath();
  doc.lineWidth(4).fillAndStroke('white', '#d50000');
  doc.restore();
  doc.save();
  draw(cx, cy);
  doc.restore();
  doc.fillColor('black').strokeColor('black');
}

function corrosion(doc) {
  return (cx, cy) => {
    // Two tilted test tubes dripping onto a bar and a hand: a simplified GHS05.
    doc
      .save()
      .translate(cx - 12, cy - 14)
      .rotate(-30)
      .rect(0, 0, 6, 14)
      .fill('black')
      .restore();
    doc
      .save()
      .translate(cx + 6, cy - 16)
      .rotate(30)
      .rect(0, 0, 6, 14)
      .fill('black')
      .restore();
    doc.rect(cx - 14, cy - 2, 2, 5).fill('black');
    doc.rect(cx + 10, cy - 2, 2, 5).fill('black');
    doc.rect(cx - 18, cy + 6, 14, 4).fill('black');
    doc
      .moveTo(cx + 2, cy + 10)
      .lineTo(cx + 18, cy + 4)
      .lineTo(cx + 18, cy + 12)
      .lineTo(cx + 2, cy + 14)
      .closePath()
      .fill('black');
  };
}

function exclamation(doc) {
  return (cx, cy) => {
    doc
      .moveTo(cx - 4, cy - 18)
      .lineTo(cx + 4, cy - 18)
      .lineTo(cx + 2, cy + 6)
      .lineTo(cx - 2, cy + 6)
      .closePath()
      .fill('black');
    doc.circle(cx, cy + 13, 3.5).fill('black');
  };
}

export function draw(doc, h) {
  chrome(doc, h, 1);
  let y = 56;
  y = bar(doc, h, 'SECTION 1: Identification', y);
  const ident = [
    ['Product name', PRODUCT],
    ['Recommended use', 'Descaling of kettles and coffee machines. For consumer use.'],
    ['Supplier', SUPPLIER],
    ['Emergency telephone', EMERGENCY],
  ];
  for (const [k, v] of ident) {
    h.text(k, 54, y, { font: FB, size: 9 });
    h.text(v, 170, y, { font: F, size: 9 });
    y += 14;
  }
  y += 8;
  y = bar(doc, h, 'SECTION 2: Hazard identification', y);
  h.text('Label elements', 54, y, { font: FB, size: 9 });
  diamond(doc, 210, y + 36, corrosion(doc));
  diamond(doc, 290, y + 36, exclamation(doc));
  h.text('Signal word:', 360, y + 22, { font: FB, size: 10 });
  h.text('Danger', 430, y + 22, { font: FB, size: 12 });
  y += 80;
  h.text('Hazard statements', 54, y, { font: FB, size: 9 });
  y += 13;
  for (const [code, text] of H_STATEMENTS) {
    h.text(code, 64, y, { font: FB, size: 9 });
    h.text(text, 160, y, { font: F, size: 9 });
    y += 12;
  }
  y += 4;
  h.text('Precautionary statements', 54, y, { font: FB, size: 9 });
  y += 13;
  for (const [code, text] of P_STATEMENTS) {
    h.text(code, 64, y, { font: FB, size: 9 });
    h.text(text, 160, y, { font: F, size: 9 });
    y += 12;
  }
  y += 12;
  y = bar(doc, h, 'SECTION 3: Composition / information on ingredients', y);
  const cols = [54, 220, 320, 460];
  ['Component', 'CAS No.', 'Formula', 'Concentration'].forEach((t, i) => {
    h.text(t, cols[i], y, { font: FB, size: 9 });
  });
  doc
    .lineWidth(0.5)
    .moveTo(48, y + 13)
    .lineTo(W - 48, y + 13)
    .stroke();
  y += 19;
  for (const c of COMPONENTS) {
    h.text(c.name, cols[0], y, { font: F, size: 9 });
    h.text(c.cas, cols[1], y, { font: F, size: 9 });
    h.run(c.formula, cols[2], y, { font: F, size: 9 });
    h.text(c.pct, cols[3], y, { font: F, size: 9 });
    y += 16;
  }
  doc
    .moveTo(48, y)
    .lineTo(W - 48, y)
    .stroke();

  h.newPage();
  chrome(doc, h, 2);
  y = 56;
  y = bar(doc, h, 'SECTION 9: Physical and chemical properties', y);
  for (const p of PROPERTIES) {
    h.text(p[0], 54, y, { font: FB, size: 9 });
    if (typeof p[1] === 'string') h.text(p[1], 200, y, { font: F, size: 9 });
    else h.run(p[1], 200, y, { font: F, size: 9 });
    doc
      .lineWidth(0.3)
      .strokeColor('#bbb')
      .moveTo(48, y + 13)
      .lineTo(W - 48, y + 13)
      .stroke()
      .strokeColor('black');
    y += 17;
  }
  y += 10;
  y = bar(doc, h, 'SECTION 10: Stability and reactivity', y);
  h.run(['Reacts with metals to release hydrogen (H', { sub: '2' }, ').'], 54, y, { font: F, size: 9.5 });
  y += 15;
  h.run(
    [
      'Incompatible with bases, hypochlorites (OCl',
      { sup: '−', font: NJ },
      ') and sulfites (SO',
      { sub: '3' },
      { sup: '2−', font: NJ },
      '); mixing with hypochlorite bleach releases chlorine (Cl',
      { sub: '2' },
      ').',
    ],
    54,
    y,
    { font: F, size: 9.5 },
  );
}
