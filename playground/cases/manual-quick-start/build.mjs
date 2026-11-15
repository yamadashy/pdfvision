// One A4 quick-start sheet for a fictional electric kettle, the page that
// ships folded in the box: an exploded line drawing (vector only) with
// numbered callout circles and leader lines, a parts list keyed by those
// numbers, the setup steps as a two-column table whose step numbers are
// large white numerals in dark cells, a warning box with a vector triangle
// icon, and one safety sentence in English, Japanese and French.

const SANS = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const JA = 'NotoSansJP';
const JA_BOLD = 'NotoSansJP-Bold';
const INK = '#1f2933';

const W = 595.28;
const LEFT = 40;
const RIGHT = W - 40;

const PRODUCT = {
  brand: 'Brightwell',
  name: 'Brightwell KT-17 Electric Kettle',
  spec: 'Model KT-17  ·  1.7 L  ·  220–240 V ~ 50/60 Hz  ·  2000 W',
};

// `at` is where the leader line ends on the drawing; `circle` is the callout.
const PARTS = [
  { n: 1, name: 'Lid', circle: [298, 138], at: [214, 152] },
  { n: 2, name: 'Lid release button', circle: [62, 118], at: [166, 133] },
  { n: 3, name: 'Removable limescale filter', circle: [312, 196], at: [268, 196] },
  { n: 4, name: 'Kettle body', circle: [312, 268], at: [232, 268] },
  { n: 5, name: 'Water level window (MIN 0.5 L / MAX 1.7 L)', circle: [62, 238], at: [139, 252] },
  { n: 6, name: 'Power switch with indicator light', circle: [62, 318], at: [93, 320] },
  { n: 7, name: '360° power base', circle: [62, 378], at: [110, 374] },
  { n: 8, name: 'Power cord (stores under the base)', circle: [318, 362], at: [292, 386] },
];

const STEPS = [
  {
    title: 'REMOVE ALL PACKAGING',
    text: 'Take the limescale filter (3) out of the spout, rinse it and the inside of the kettle body (4) with clean water, then refit the filter.',
  },
  {
    title: 'SET UP THE BASE',
    text: 'Place the power base (7) on a dry, level surface away from the edge of the worktop. Unwind only as much power cord (8) as you need.',
  },
  {
    title: 'FILL WITH WATER',
    text: 'Press the lid release button (2) to open the lid (1). Fill to between MIN (0.5 L) and MAX (1.7 L) on the water level window (5), then close the lid.',
  },
  {
    title: 'SWITCH ON',
    text: 'Seat the kettle on the base and press the power switch (6) down. The light comes on, and the kettle switches off by itself when the water boils.',
  },
  {
    title: 'DISCARD THE FIRST TWO BOILS',
    text: 'Before first use, boil a full kettle and pour the water away. Repeat once more; after that the kettle is ready for drinks.',
  },
];

const WARNING = {
  heading: 'WARNING — Risk of scalding',
  lines: [
    'Never open the lid while the water is boiling or lift the kettle off the base mid-boil.',
    'Do not fill above MAX: boiling water may be ejected from the spout.',
  ],
};

const SAFETY = [
  { code: 'EN', font: SANS, text: 'Unplug the base before cleaning and never immerse it in water.' },
  { code: 'JA', font: JA, text: 'お手入れの前に電源プラグを抜き、電源ベースを水に浸けないでください。' },
  { code: 'FR', font: SANS, text: 'Débranchez le socle avant le nettoyage et ne le plongez jamais dans l’eau.' },
];

const FOOTER_LEFT = 'Brightwell Home Appliances Ltd.  ·  support.brightwell-home.example';
const FOOTER_RIGHT = 'QSG-KT17  Rev. B  09/2026';

export const meta = {
  title: 'Kettle quick-start sheet with exploded drawing and step table',
  stresses:
    'vector exploded drawing with numbered callouts and leader lines; parts list keyed by number; step table with large numerals in dark cells drawn as their own layer; warning box with vector icon; one sentence in English, Japanese and French',
  families: ['vector-meaning', 'tables', 'reading-order', 'scripts'],
  status: 'ok',
  page: { size: 'A4' },
};

export const truth = `
One A4 quick-start sheet: **${PRODUCT.name}** (${PRODUCT.spec}).

**Diagram (vector only).** An exploded line drawing of the kettle with eight numbered black callout
circles joined to the parts by leader lines. The drawing itself carries no text; the callout
digits are text, scattered around the drawing (2, 5, 6, 7 on the left; 1, 3, 4, 8 on the right).
What each number names comes from the parts list beside it:

${PARTS.map((part) => `${part.n}. ${part.name}`).join('\n')}

**Getting started.** A two-column table: each row has a dark cell with a large white step numeral
and a cell with a capitalised title and one instruction. The numeral column is drawn as its own
layer, before the row text, as DTP layouts often emit it; a correct reading still pairs each
numeral with its own title and instruction, in order:

| Step | Title | Instruction |
| ---: | --- | --- |
${STEPS.map((step, i) => `| ${i + 1} | ${step.title} | ${step.text} |`).join('\n')}

**Warning box** (yellow triangle with an exclamation mark, vector only): ${WARNING.heading}.
${WARNING.lines.join(' ')}

**Safety sentence in three languages:**

${SAFETY.map((line) => `- ${line.code}: ${line.text}`).join('\n')}

Footer: ${FOOTER_LEFT} / ${FOOTER_RIGHT}.

## Questions an agent should be able to answer

1. What is part 6, and in which step is it used? — ${PARTS[5].name}; step 4 (${STEPS[3].title})
2. What do you do right after setting up the base? — Step 3, ${STEPS[2].title}: ${STEPS[2].text}
3. Which part do you press to open the lid, and how much water may the kettle hold at most? — Part 2, the ${PARTS[1].name.toLowerCase()}; 1.7 L (MAX)
4. What does the warning box tell you not to do? — ${WARNING.lines.join(' ')}
5. What does the French safety line say, and does it match the English one? — “${SAFETY[2].text}” — yes, it is the same instruction as “${SAFETY[0].text}”

The warning box reads as one unit (#263): \`read.md\` prints the heading \`${WARNING.heading}\`
followed directly by the box's own two sentences (\`${WARNING.lines[0]}\` / \`${WARNING.lines[1]}\`),
then the three safety lines below the box and the footer, so question 4 is answered from the
text order. It used to put the safety lines and the footer between the heading and its body;
the frame drawn around the box now keeps them together.

Everything else reads correctly. The parts list keeps each number with its name, so question 1,
the part half of question 3 and the number references inside the steps resolve from text; the
callout digits themselves come out as a bare run (\`2 1 3 5 4 6 8 7\`, top to bottom) with
nothing on the drawing to map, which is harmless here because the drawing carries
no labels of its own. The step table survives its layer order: each numeral is printed right
before its own title and instruction, 1 to 5, so questions 1 and 2 are answered in order. The
Japanese and French lines, accents and \`’\` included, are intact (question 5).
\`vector_chart_labels\` fires on the exploded drawing (its callout digits and leader marks pass for
labelled bars, and the \`Getting started\` heading under it is taken in as a label): it calls the
drawing a chart, which it is not, though rendering the region before pairing the numbers with
anything is the right next step for the callouts.
`;

function partsDrawing(doc) {
  const cx = 175;
  doc.save();
  doc.lineWidth(1.1).strokeColor(INK).lineJoin('round').lineCap('round');

  // Exploded-view axis.
  doc.save();
  doc.dash(3, { space: 3 }).lineWidth(0.5).strokeColor('#8a949e');
  doc.moveTo(cx, 112).lineTo(cx, 400).stroke();
  doc.moveTo(222, 210).lineTo(254, 196).stroke();
  doc.restore();

  // 1 Lid: dome over an elliptical rim; 2 release button on top.
  doc.ellipse(cx, 154, 50, 9).fillAndStroke('#ffffff', INK);
  doc
    .moveTo(cx - 48, 152)
    .bezierCurveTo(cx - 40, 130, cx + 40, 130, cx + 48, 152)
    .stroke();
  doc.roundedRect(cx - 9, 129, 18, 7, 2).fillAndStroke('#e4e7eb', INK);

  // 3 Limescale filter: a mesh frame pulled out of the spout.
  doc.rect(254, 180, 14, 32).stroke();
  for (let y = 184; y < 212; y += 4) doc.moveTo(254, y).lineTo(268, y).lineWidth(0.4).stroke();
  for (let x = 258; x < 268; x += 4) doc.moveTo(x, 180).lineTo(x, 212).lineWidth(0.4).stroke();
  doc.lineWidth(1.1);

  // 4 Body with handle (left) and spout (right).
  doc
    .moveTo(cx - 48, 210)
    .lineTo(cx + 48, 210)
    .lineTo(cx + 58, 330)
    .lineTo(cx - 58, 330)
    .closePath()
    .fillAndStroke('#ffffff', INK);
  doc.ellipse(cx, 210, 48, 6).stroke();
  doc
    .moveTo(cx + 48, 222)
    .lineTo(cx + 74, 204)
    .lineTo(cx + 78, 210)
    .lineTo(cx + 52, 246)
    .stroke();
  doc
    .moveTo(cx - 50, 222)
    .bezierCurveTo(cx - 95, 222, cx - 95, 322, cx - 56, 318)
    .moveTo(cx - 52, 234)
    .bezierCurveTo(cx - 80, 236, cx - 80, 306, cx - 55, 306)
    .stroke();
  // 5 Water level window with MIN/MAX ticks (ticks only; the labels are in the parts list).
  doc.roundedRect(cx - 40, 232, 8, 80, 3).fillAndStroke('#dbeafe', INK);
  for (const y of [244, 300])
    doc
      .moveTo(cx - 32, y)
      .lineTo(cx - 26, y)
      .lineWidth(0.6)
      .stroke();
  doc.lineWidth(1.1);
  // 6 Power switch at the foot of the handle.
  doc.roundedRect(cx - 84, 314, 12, 10, 2).fillAndStroke('#f97316', INK);

  // 7 Base: a shallow cylinder; 8 cord leaving it and ending in a plug.
  doc.ellipse(cx, 364, 72, 11).fillAndStroke('#ffffff', INK);
  doc
    .moveTo(cx - 72, 364)
    .lineTo(cx - 72, 376)
    .bezierCurveTo(cx - 60, 392, cx + 60, 392, cx + 72, 376)
    .lineTo(cx + 72, 364)
    .stroke();
  doc.ellipse(cx, 364, 18, 3).stroke();
  doc
    .moveTo(cx + 66, 382)
    .bezierCurveTo(cx + 90, 396, cx + 100, 380, 288, 386)
    .stroke();
  doc.roundedRect(288, 380, 14, 12, 2).fillAndStroke('#e4e7eb', INK);
  doc.moveTo(302, 383).lineTo(308, 383).moveTo(302, 389).lineTo(308, 389).stroke();
  doc.restore();
}

function callouts(doc, h) {
  for (const part of PARTS) {
    const [x, y] = part.circle;
    const [tx, ty] = part.at;
    doc.moveTo(x, y).lineTo(tx, ty).lineWidth(0.6).stroke(INK);
    doc.circle(tx, ty, 1.6).fill(INK);
    doc.circle(x, y, 9).fill(INK);
    doc.fillColor('white');
    h.text(String(part.n), x, y - 5, { font: BOLD, size: 10, align: 'center' });
    doc.fillColor('black');
  }
}

function partsList(doc, h) {
  const x = 360;
  doc.fillColor(INK);
  h.text('Parts', x, 112, { font: BOLD, size: 13 });
  h.rule(x, 132, RIGHT, { width: 0.8 });
  PARTS.forEach((part, i) => {
    const y = 146 + i * 30;
    doc.circle(x + 8, y + 5, 8).fill(INK);
    doc.fillColor('white');
    h.text(String(part.n), x + 8, y, { font: BOLD, size: 9, align: 'center' });
    doc.fillColor(INK);
    h.paragraph(part.name, x + 24, y, RIGHT - x - 24, { font: SANS, size: 9.5, lineGap: 1 });
  });
  doc.fillColor('black');
}

// The numeral column sits on its own layer in the layout file, so all five
// dark cells and their numerals reach the content stream before any row text.
function stepTable(doc, h, top) {
  const numRight = LEFT + 50;
  const rowH = 46;
  doc.fillColor(INK);
  h.text('Getting started', LEFT, top - 26, { font: BOLD, size: 13 });
  STEPS.forEach((_, i) => {
    const y = top + i * rowH;
    doc.rect(LEFT, y, numRight - LEFT, rowH - 4).fill(INK);
    doc.fillColor('white');
    h.text(String(i + 1), (LEFT + numRight) / 2, y + 8, { font: BOLD, size: 24, align: 'center' });
  });
  STEPS.forEach((step, i) => {
    const y = top + i * rowH;
    doc
      .rect(numRight, y, RIGHT - numRight, rowH - 4)
      .lineWidth(0.6)
      .stroke('#9aa5b1');
    doc.fillColor(INK);
    h.text(step.title, numRight + 10, y + 6, { font: BOLD, size: 10 });
    doc.fillColor('#323f4b');
    h.paragraph(step.text, numRight + 10, y + 19, RIGHT - numRight - 20, { font: SANS, size: 8.8, lineGap: 0.5 });
  });
  doc.fillColor('black');
  return top + STEPS.length * rowH;
}

function warningIcon(doc, x, y) {
  doc
    .moveTo(x + 16, y)
    .lineTo(x + 32, y + 28)
    .lineTo(x, y + 28)
    .closePath()
    .lineJoin('round')
    .lineWidth(1.5)
    .fillAndStroke('#facc15', INK);
  doc.rect(x + 14.6, y + 9, 2.8, 11).fill(INK);
  doc.circle(x + 16, y + 23.5, 1.7).fill(INK);
}

function warningBox(doc, h, top) {
  const height = 62;
  doc.rect(LEFT, top, RIGHT - LEFT, height).fill('#fff7d6');
  doc.rect(LEFT, top, 4, height).fill('#d97706');
  warningIcon(doc, LEFT + 16, top + 14);
  doc.fillColor(INK);
  h.text(WARNING.heading, LEFT + 62, top + 10, { font: BOLD, size: 11 });
  WARNING.lines.forEach((line, i) => {
    h.text(line, LEFT + 62, top + 28 + i * 13, { font: SANS, size: 9 });
  });
  doc.fillColor('black');
  return top + height;
}

function safetyLines(doc, h, top) {
  SAFETY.forEach((line, i) => {
    const y = top + i * 17;
    doc.roundedRect(LEFT, y, 22, 12, 2).lineWidth(0.6).stroke(INK);
    doc.fillColor(INK);
    h.text(line.code, LEFT + 11, y + 2.5, { font: BOLD, size: 7, align: 'center' });
    h.text(line.text, LEFT + 30, y + (line.font === JA ? 0.5 : 2), { font: line.font, size: 9 });
  });
  doc.fillColor('black');
}

export function draw(doc, h) {
  doc.rect(0, 0, W, 78).fill(INK);
  doc.fillColor('white');
  h.text('QUICK START GUIDE', LEFT, 22, { font: BOLD, size: 20 });
  h.text(PRODUCT.spec, LEFT, 50, { font: SANS, size: 9 });
  h.text(PRODUCT.brand.toUpperCase(), RIGHT, 22, { font: BOLD, size: 14, align: 'right' });
  h.text('KT-17 Electric Kettle', RIGHT, 42, { font: SANS, size: 10, align: 'right' });
  h.text('クイックスタートガイド', RIGHT, 56, { font: JA_BOLD, size: 8, align: 'right' });
  doc.fillColor('black');

  partsDrawing(doc);
  callouts(doc, h);
  partsList(doc, h);

  const tableBottom = stepTable(doc, h, 440);
  const boxBottom = warningBox(doc, h, tableBottom + 12);
  safetyLines(doc, h, boxBottom + 12);

  h.rule(LEFT, 814, RIGHT, { width: 0.5 });
  doc.fillColor('#616e7c');
  h.text(FOOTER_LEFT, LEFT, 820, { font: SANS, size: 7.5 });
  h.text(FOOTER_RIGHT, RIGHT, 820, { font: SANS, size: 7.5, align: 'right' });
  doc.fillColor('black');
}
