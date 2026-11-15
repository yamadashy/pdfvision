// Two pages of an integrated-circuit datasheet. Page 1: features,
// applications and description in two columns, a pinout drawn as vectors with
// the pin names and numbers as text around the package outline, and a ruled
// absolute-maximum-ratings table. Page 2: a ruled electrical-characteristics
// table (parameter cells merged over several test-condition rows, symbols
// with subscripts, conditions that wrap, half-empty MIN/TYP/MAX cells) whose
// cells are written column by column, as some datasheet tools emit them; and
// a package outline drawing whose dimensions are glyph outlines, not text.

import { outlineText } from '../../lib/layoutB.mjs';

const H = 'Helvetica';
const HB = 'Helvetica-Bold';
const SYM = 'NotoSansJP';
const RED = '#b5121b';

const VENDOR = 'KESTREL MICRODEVICES';
const PART = 'KX4562';
const TITLE = 'KX4562 Dual 5-V Low-Noise Rail-to-Rail Operational Amplifier';
const DOC_ID = 'KMD-DS-0457B – MARCH 2026';
const FEATURES = [
  'Low input voltage noise: 12 nV/√Hz at 1 kHz',
  'Low offset voltage: ±0.3 mV (typical)',
  'Rail-to-rail input and output',
  'Supply range: 2.7 V to 5.5 V',
  'Quiescent current: 0.85 mA per amplifier',
  'Unity-gain bandwidth: 10 MHz',
  'Specified from –40°C to +125°C',
];
const APPLICATIONS = [
  'Sensor signal conditioning',
  'Audio preamplifiers',
  'Active filters',
  'Battery-powered instruments',
];
const DESCRIPTION =
  'The KX4562 is a dual CMOS operational amplifier that combines low noise with rail-to-rail input and output ' +
  'swing on a single supply from 2.7 V to 5.5 V. Its low input bias current makes it suitable for high-impedance ' +
  'sensors, and its 10-MHz bandwidth supports active filters well into the audio range. The device is offered in ' +
  'an 8-pin SOIC package and is specified over the extended industrial temperature range.';
// Pins 1–4 down the left side, 5–8 up the right side.
const PINS = [
  { number: 1, name: 'OUT A' },
  { number: 2, name: 'IN A−' },
  { number: 3, name: 'IN A+' },
  { number: 4, name: 'V−' },
  { number: 5, name: 'IN B+' },
  { number: 6, name: 'IN B−' },
  { number: 7, name: 'OUT B' },
  { number: 8, name: 'V+' },
];
const PINOUT_CAPTION = 'D Package, 8-Pin SOIC (Top View)';
const ABS_MAX = {
  head: ['', 'MIN', 'MAX', 'UNIT'],
  rows: [
    ['Supply voltage, VS = (V+) – (V−)', '0', '6', 'V'],
    ['Input voltage, any pin', '(V−) – 0.3', '(V+) + 0.3', 'V'],
    ['Input current, any pin', '–10', '10', 'mA'],
    ['Output short-circuit duration', '', 'Continuous', ''],
    ['Operating temperature, TA', '–55', '150', '°C'],
    ['Junction temperature, TJ', '', '150', '°C'],
    ['Storage temperature, Tstg', '–65', '150', '°C'],
  ],
};

// Electrical characteristics. `_X` marks a subscript; each condition row has
// [conditions (one or two lines), min, typ, max, unit].
const EC_NOTE = 'At T_A = 25°C, V_S = 5 V, R_L = 10 kΩ connected to V_S / 2 (unless otherwise noted)';
const EC = [
  { section: 'OFFSET VOLTAGE' },
  {
    parameter: ['Input offset voltage'],
    symbol: 'V_OS',
    rows: [
      [['T_A = 25°C'], '', '±0.3', '±1.5', 'mV'],
      [['T_A = –40°C to +125°C'], '', '', '±2.5', 'mV'],
    ],
  },
  {
    parameter: ['Offset voltage drift'],
    symbol: 'dV_OS/dT',
    rows: [[['T_A = –40°C to +125°C'], '', '1.2', '', 'µV/°C']],
  },
  { section: 'INPUT BIAS CURRENT' },
  {
    parameter: ['Input bias current'],
    symbol: 'I_B',
    rows: [
      [['T_A = 25°C'], '', '±1', '±10', 'pA'],
      [['T_A = –40°C to +125°C'], '', '', '±800', 'pA'],
    ],
  },
  { section: 'NOISE' },
  {
    parameter: ['Input voltage noise', 'density'],
    symbol: 'e_n',
    rows: [
      [['f = 1 kHz'], '', '12', '', 'nV/√Hz'],
      [['f = 10 kHz'], '', '9.5', '', 'nV/√Hz'],
    ],
  },
  { section: 'OUTPUT' },
  {
    parameter: ['Voltage output swing', 'from rail'],
    symbol: 'V_O',
    rows: [[['R_L = 10 kΩ to V_S / 2,', 'T_A = –40°C to +125°C'], '', '8', '25', 'mV']],
  },
  { parameter: ['Short-circuit current'], symbol: 'I_SC', rows: [[['V_S = 5 V'], '', '±50', '', 'mA']] },
  { section: 'POWER SUPPLY' },
  {
    parameter: ['Quiescent current per', 'amplifier'],
    symbol: 'I_Q',
    rows: [
      [['I_O = 0 mA'], '', '0.85', '1.1', 'mA'],
      [['I_O = 0 mA,', 'T_A = –40°C to +125°C'], '', '', '1.4', 'mA'],
    ],
  },
  {
    parameter: ['Power-supply rejection', 'ratio'],
    symbol: 'PSRR',
    rows: [[['V_S = 2.7 V to 5.5 V'], '80', '96', '', 'dB']],
  },
];

// The package drawing's dimensions, in millimetres (drawn as outlines only).
const PACKAGE = {
  bodyLength: '4.90 ±0.10',
  bodyWidth: '3.90 ±0.10',
  overallWidth: '6.00 ±0.20',
  pitch: '1.27 TYP',
  leadWidth: '0.31–0.51',
  height: '1.75 MAX',
};

export const meta = {
  title: 'Op-amp datasheet, two pages',
  stresses:
    'pinout diagram with pin names as text around a vector outline; ruled tables with merged parameter cells over several condition rows, written column by column; subscript symbols; package drawing whose dimensions are outlines with no text',
  status: 'known-gap',
  issue: 241,
  families: ['tables', 'vector-meaning', 'structure'],
};

// Truth writes subscripts as `_X`, the same markup the drawing uses.
const plainSub = (s) => s;

export const truth = `
**${TITLE}** (${VENDOR}, ${DOC_ID}).

### Page 1

Features: ${FEATURES.map((f) => `“${f}”`).join(', ')}.

Applications: ${APPLICATIONS.join(', ')}.

Description: ${DESCRIPTION}

Pinout (${PINOUT_CAPTION}) — pin names are text next to each pin of a vector package outline:

| Pin | Name |
| ---: | --- |
${PINS.map((p) => `| ${p.number} | ${p.name} |`).join('\n')}

Absolute maximum ratings:

| Parameter | MIN | MAX | UNIT |
| --- | ---: | ---: | --- |
${ABS_MAX.rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}

### Page 2

Electrical characteristics — ${plainSub(EC_NOTE)}. Parameter and symbol cells are merged over every
condition row beneath them; a correct reading keeps each MIN/TYP/MAX with its conditions:

| Parameter | Symbol | Test conditions | MIN | TYP | MAX | UNIT |
| --- | --- | --- | ---: | ---: | ---: | --- |
${EC.map((item) =>
  item.section
    ? `| **${item.section}** | | | | | | |`
    : item.rows
        .map(
          ([cond, min, typ, max, unit]) =>
            `| ${item.parameter.join(' ')} | ${plainSub(item.symbol)} | ${plainSub(cond.join(' '))} | ${min} | ${typ} | ${max} | ${unit} |`,
        )
        .join('\n'),
).join('\n')}

Package outline (SOIC-8), dimensions in millimetres, **drawn as outlines with no text layer**:
body length ${PACKAGE.bodyLength}, body width ${PACKAGE.bodyWidth}, overall width across the leads
${PACKAGE.overallWidth}, lead pitch ${PACKAGE.pitch}, lead width ${PACKAGE.leadWidth}, height ${PACKAGE.height}.
A correct reading says the drawing carries dimensions that are only visible in a render.

## Questions an agent should be able to answer

1. What is the absolute maximum supply voltage? — ${ABS_MAX.rows[0][2]} V
2. Which pin is the non-inverting input of amplifier B? — Pin ${PINS.find((p) => p.name === 'IN B+').number} (IN B+)
3. What is the maximum input offset voltage over –40°C to +125°C? — ±2.5 mV (±1.5 mV max at 25°C)
4. What is the maximum quiescent current per amplifier at 25°C, and over temperature? — 1.1 mA; 1.4 mA
5. What is the overall width of the package across the leads? — ${PACKAGE.overallWidth} mm (only in the drawing)

Page 1 reads well: the pinout comes back as a 4 × 4 layout table (\`| IN A− | 2 | 7 | OUT B |\`), so
question 2 is answerable, and the absolute-maximum table keeps its values (question 1); its layout
table drops the \`Output short-circuit duration | Continuous\` row, which the body still carries.

**Known gap (#241):** every subscript on page 2 is split off its symbol. The condition note reads
\`At T = 25°C, V = 5 V, R = 10 kΩ connected to V / 2\` followed by a stray \`A S L S\` line; symbols
read \`V\` / \`OS\`, \`dV /dT\` / \`OS\`, \`I\` / \`B\`; and conditions read \`T = 25°C\` / \`A\`, \`I = 0 mA\` / \`O\`
(a few condition lines keep theirs: \`TA = –40°C to +125°C\`, \`IO = 0 mA,\`).

**Known gap (no issue yet):**
- The electrical-characteristics table is read as separate column streams — all parameters, then
  symbols, conditions, and one list each for MIN, TYP, MAX and UNIT, with blank cells simply absent
  (MAX: \`±1.5\` / \`±2.5\` / \`±10\` / \`±800\` / \`25\` / \`1.1\` / \`1.4\`). Questions 3 and 4 are answerable only by
  matching positions across lists that have different lengths. The only layout table is a fragment
  of the last rows (\`| POWER SUPPLY Quiescent current per | I Q I = 0 mA O | | 0.85 | 1.1 | mA |\`);
  \`layout_table_uncertain\` names a render region that covers that fragment only, and
  \`reading_order_divergence\` says to render the page "when exact sequence is critical".
- The package outline's dimensions are vector outlines with no text, and nothing says so: page 2 has
  219 vector operations but no \`vector_graphics_no_native_text\` or figure warning, and the only text
  near it is \`7 Package Outline\` / \`D (SOIC-8) plastic small-outline package\`. Question 5 cannot be
  answered from \`read.md\`, and nothing points the agent to render that region.
`;

// --- drawing helpers ---------------------------------------------------------

/** Text with `_X` subscripts and Ω/√/− from the symbol font, on one baseline. */
function rich(h, text, x, y, { font = H, size = 8 } = {}) {
  const segments = [];
  for (const part of text.split(/(_[A-Za-z0-9]+)/u)) {
    if (!part) continue;
    if (part.startsWith('_')) {
      segments.push({ sub: part.slice(1) });
      continue;
    }
    for (const piece of part.split(/([Ω√−])/u)) {
      if (!piece) continue;
      segments.push(/[Ω√−]/u.test(piece) ? { text: piece, font: SYM } : piece);
    }
  }
  return h.run(segments, x, y, { font, size });
}

function richWidth(doc, text, size = 8) {
  let width = 0;
  for (const part of text.split(/(_[A-Za-z0-9]+)/u)) {
    if (!part) continue;
    if (part.startsWith('_')) {
      doc.font(H).fontSize(size * 0.65);
      width += doc.widthOfString(part.slice(1));
      continue;
    }
    for (const piece of part.split(/([Ω√−])/u)) {
      if (!piece) continue;
      doc.font(/[Ω√−]/u.test(piece) ? SYM : H).fontSize(size);
      width += doc.widthOfString(piece);
    }
  }
  return width;
}

function pageFrame(doc, h, pageNumber) {
  doc.rect(40, 30, 532, 3).fill(RED);
  doc.fillColor('black');
  h.text(VENDOR, 40, 40, { font: HB, size: 8 });
  h.text(PART, 572, 38, { font: HB, size: 11, align: 'right' });
  h.text(DOC_ID, 572, 52, { font: H, size: 6.5, align: 'right' });
  h.rule(40, 64, 572, { width: 0.5 });
  h.rule(40, 752, 572, { width: 0.5 });
  h.text('Copyright © 2026, Kestrel Microdevices', 40, 757, { font: H, size: 6.5 });
  h.text(`Product Folder Links: ${PART}`, 306, 757, { font: H, size: 6.5, align: 'center' });
  h.text(String(pageNumber), 572, 757, { font: HB, size: 7, align: 'right' });
}

function heading(h, text, x, y) {
  h.text(text, x, y, { font: HB, size: 10.5 });
  return y + 17;
}

function bullets(doc, h, items, x, y, width) {
  for (const item of items) {
    h.text('•', x, y, { font: H, size: 8.5 });
    doc.font(H).fontSize(8.5);
    const parts = item.split(/([√±])/u);
    if (parts.length === 1) {
      doc.text(item, x + 10, y, { width: width - 10, lineGap: 1 });
      y = doc.y + 3;
    } else {
      rich(h, item, x + 10, y, { size: 8.5 });
      y += 13;
    }
  }
  return y;
}

function pinout(doc, h, cx, top) {
  const bodyW = 84;
  const bodyH = 112;
  const left = cx - bodyW / 2;
  doc.lineWidth(1).rect(left, top, bodyW, bodyH).stroke();
  doc
    .circle(left + 22, top + 9, 3)
    .lineWidth(0.6)
    .stroke();
  for (let i = 0; i < 4; i += 1) {
    const y = top + 18 + i * 26;
    // Left pins 1–4 (top to bottom), right pins 8–5 (top to bottom).
    doc
      .rect(left - 16, y - 4, 16, 8)
      .lineWidth(0.6)
      .stroke();
    doc.rect(left + bodyW, y - 4, 16, 8).stroke();
    const leftPin = PINS[i];
    const rightPin = PINS[7 - i];
    h.text(String(leftPin.number), left + 6, y - 4, { font: H, size: 7.5 });
    h.text(String(rightPin.number), left + bodyW - 6, y - 4, { font: H, size: 7.5, align: 'right' });
    const lw = richWidth(doc, leftPin.name, 8);
    rich(h, leftPin.name, left - 22 - lw, y - 4.5, { size: 8 });
    rich(h, rightPin.name, left + bodyW + 22, y - 4.5, { size: 8 });
  }
  h.text(PINOUT_CAPTION, cx, top + bodyH + 12, { font: HB, size: 8, align: 'center' });
}

function absMaxTable(h, top) {
  const x = [40, 330, 410, 490, 572];
  const rowH = 14;
  let y = top;
  const line = (yy) => h.rule(x[0], yy, x[4], { width: 0.5 });
  line(y);
  ABS_MAX.head.forEach((label, i) => {
    if (label) h.text(label, (x[i] + x[i + 1]) / 2, y + 4, { font: HB, size: 7.5, align: 'center' });
  });
  y += rowH;
  line(y);
  for (const row of ABS_MAX.rows) {
    row.forEach((cell, i) => {
      if (!cell) return;
      if (i === 0) rich(h, cell, x[0] + 4, y + 3.5, { size: 7.5 });
      else rich(h, cell, (x[i] + x[i + 1]) / 2 - h.textWidth(cell) / 2, y + 3.5, { size: 7.5 });
    });
    y += rowH;
    line(y);
  }
  return y;
}

function ecTable(doc, h, top) {
  const x = [40, 150, 200, 360, 400, 440, 480, 572];
  const lineH = 10;
  const rows = [];
  let y = top + 20;
  for (const item of EC) {
    if (item.section) {
      rows.push({ section: item.section, y, height: 13 });
      y += 13;
      continue;
    }
    const groupTop = y;
    const condRows = item.rows.map(([cond, ...values]) => {
      const height = Math.max(cond.length, 1) * lineH + 4;
      const row = { cond, values, y, height };
      y += height;
      return row;
    });
    // A parameter name that wraps can make its merged cell taller than its conditions.
    const needed = item.parameter.length * lineH + 4;
    if (y - groupTop < needed) {
      condRows[condRows.length - 1].height += needed - (y - groupTop);
      y = groupTop + needed;
    }
    rows.push({ item, y: groupTop, height: y - groupTop, condRows });
  }
  const bottom = y;

  // Rules and header.
  doc.lineWidth(0.5);
  h.rule(x[0], top, x[7]);
  ['PARAMETER', 'SYMBOL', 'TEST CONDITIONS', 'MIN', 'TYP', 'MAX', 'UNIT'].forEach((label, i) => {
    h.text(label, (x[i] + x[i + 1]) / 2, top + 6, { font: HB, size: 7, align: 'center' });
  });
  h.rule(x[0], top + 20, x[7]);
  x.forEach((xx) => {
    doc.moveTo(xx, top).lineTo(xx, bottom).stroke();
  });
  for (const row of rows) {
    if (row.section) {
      doc.rect(x[0], row.y, x[7] - x[0], row.height).fill('#e8e8e8');
      doc.fillColor('black');
      h.rule(x[0], row.y + row.height, x[7]);
      continue;
    }
    h.rule(x[0], row.y + row.height, x[7]);
    // Merged parameter/symbol cells: inner rules only from the conditions column on.
    for (const cond of row.condRows.slice(1)) h.rule(x[2], cond.y, x[7]);
  }
  // Redraw verticals over the section fills.
  x.forEach((xx) => {
    doc.moveTo(xx, top).lineTo(xx, bottom).stroke();
  });
  h.rule(x[0], top, x[7]);

  // Cell text, column by column.
  for (const row of rows) {
    if (row.section) h.text(row.section, x[0] + 4, row.y + 3, { font: HB, size: 7 });
  }
  for (const row of rows.filter((r) => r.item)) {
    row.item.parameter.forEach((line, i) => {
      h.text(line, x[0] + 4, row.y + 3 + i * lineH, { font: H, size: 7.5 });
    });
  }
  for (const row of rows.filter((r) => r.item)) {
    const w = richWidth(doc, row.item.symbol, 7.5);
    rich(h, row.item.symbol, (x[1] + x[2]) / 2 - w / 2, row.y + 3, { size: 7.5 });
  }
  for (const row of rows.filter((r) => r.item)) {
    for (const cond of row.condRows) {
      cond.cond.forEach((line, i) => void rich(h, line, x[2] + 4, cond.y + 3 + i * lineH, { size: 7.5 }));
    }
  }
  for (let column = 0; column < 4; column += 1) {
    for (const row of rows.filter((r) => r.item)) {
      for (const cond of row.condRows) {
        const value = cond.values[column];
        if (!value) continue;
        const cx = (x[3 + column] + x[4 + column]) / 2;
        rich(h, value, cx - richWidth(doc, value, 7.5) / 2, cond.y + 3, { size: 7.5 });
      }
    }
  }
  return bottom;
}

/** A dimension line with arrowheads and an outlined label (no text object). */
function dimension(doc, x1, y1, x2, y2, label, { labelAt, angle = 0, size = 7 } = {}) {
  doc.lineWidth(0.4).moveTo(x1, y1).lineTo(x2, y2).stroke();
  const arrow = (ax, ay, dx, dy) => {
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    doc
      .moveTo(ax, ay)
      .lineTo(ax - ux * 5 - uy * 2, ay - uy * 5 + ux * 2)
      .lineTo(ax - ux * 5 + uy * 2, ay - uy * 5 - ux * 2)
      .closePath()
      .fill('black');
  };
  arrow(x2, y2, x2 - x1, y2 - y1);
  arrow(x1, y1, x1 - x2, y1 - y2);
  const [lx, ly] = labelAt ?? [(x1 + x2) / 2, (y1 + y2) / 2 - 3];
  outlineText(doc, label, lx, ly, { size, align: 'center', angle });
}

function packageDrawing(doc, top) {
  const mm = 17;
  const cx = 200;
  const bodyL = 4.9 * mm;
  const bodyW = 3.9 * mm;
  const overall = 6.0 * mm;
  const left = cx - bodyW / 2;
  const y0 = top + 40;
  // Top view: body plus four leads each side.
  doc.lineWidth(0.8).rect(left, y0, bodyW, bodyL).stroke();
  doc
    .circle(left + 8, y0 + 8, 3)
    .lineWidth(0.5)
    .stroke();
  for (let i = 0; i < 4; i += 1) {
    const ly = y0 + 0.8 * mm + i * 1.27 * mm;
    doc
      .rect(cx - overall / 2, ly, (overall - bodyW) / 2, 0.41 * mm)
      .lineWidth(0.5)
      .stroke();
    doc.rect(left + bodyW, ly, (overall - bodyW) / 2, 0.41 * mm).stroke();
  }
  // Extension lines and dimensions.
  dimension(doc, cx - overall / 2, y0 - 16, cx + overall / 2, y0 - 16, PACKAGE.overallWidth);
  doc
    .lineWidth(0.3)
    .moveTo(cx - overall / 2, y0 - 20)
    .lineTo(cx - overall / 2, y0)
    .stroke();
  doc
    .moveTo(cx + overall / 2, y0 - 20)
    .lineTo(cx + overall / 2, y0)
    .stroke();
  dimension(doc, left, y0 + bodyL + 16, left + bodyW, y0 + bodyL + 16, PACKAGE.bodyWidth, {
    labelAt: [cx, y0 + bodyL + 28],
  });
  doc
    .lineWidth(0.3)
    .moveTo(left, y0 + bodyL)
    .lineTo(left, y0 + bodyL + 20)
    .stroke();
  doc
    .moveTo(left + bodyW, y0 + bodyL)
    .lineTo(left + bodyW, y0 + bodyL + 20)
    .stroke();
  const vx = cx - overall / 2 - 22;
  dimension(doc, vx, y0, vx, y0 + bodyL, PACKAGE.bodyLength, { labelAt: [vx - 4, y0 + bodyL / 2], angle: -90 });
  const pitchY = y0 + 0.8 * mm + 0.2 * mm;
  const px = cx + overall / 2 + 18;
  dimension(doc, px, pitchY, px, pitchY + 1.27 * mm, PACKAGE.pitch, { labelAt: [px + 30, pitchY + 0.64 * mm + 2.5] });
  outlineText(doc, `8X ${PACKAGE.leadWidth}`, px + 8, pitchY + 3 * 1.27 * mm + 4, { size: 7 });

  // Side view.
  const sx = 400;
  const sy = y0 + 30;
  doc
    .lineWidth(0.8)
    .rect(sx, sy, bodyL, 1.45 * mm)
    .stroke();
  for (let i = 0; i < 4; i += 1) {
    const lx = sx + 0.8 * mm + i * 1.27 * mm;
    doc
      .moveTo(lx, sy + 1.45 * mm)
      .lineTo(lx, sy + 1.75 * mm)
      .lineTo(lx + 0.41 * mm, sy + 1.75 * mm)
      .lineTo(lx + 0.41 * mm, sy + 1.45 * mm)
      .lineWidth(0.5)
      .stroke();
  }
  dimension(doc, sx + bodyL + 14, sy, sx + bodyL + 14, sy + 1.75 * mm, PACKAGE.height, {
    labelAt: [sx + bodyL + 40, sy + 0.9 * mm + 2.5],
  });
  outlineText(doc, 'NOTES:', 330, y0 + bodyL + 12, { size: 7 });
  outlineText(doc, '1. ALL LINEAR DIMENSIONS ARE IN MILLIMETERS.', 330, y0 + bodyL + 22, { size: 6.5 });
  outlineText(doc, '2. BODY DIMENSIONS DO NOT INCLUDE MOLD FLASH.', 330, y0 + bodyL + 31, { size: 6.5 });
  outlineText(doc, 'D0008A', 520, top + 18, { size: 8 });
}

export function draw(doc, h) {
  h.textWidth = (text) => richWidth(doc, text, 7.5);

  // Page 1.
  pageFrame(doc, h, 1);
  doc.font(HB).fontSize(16);
  doc.text(TITLE, 40, 76, { width: 532 });
  let y = doc.y + 12;
  const colTop = y;
  let left = heading(h, '1  Features', 40, colTop);
  left = bullets(doc, h, FEATURES, 44, left, 240);
  let right = heading(h, '2  Applications', 322, colTop);
  right = bullets(doc, h, APPLICATIONS, 326, right, 246) + 8;
  right = heading(h, '3  Description', 322, right);
  doc.font(H).fontSize(8.5);
  doc.text(DESCRIPTION, 322, right, { width: 250, lineGap: 1.5, align: 'left' });
  y = Math.max(left, doc.y) + 18;
  y = heading(h, '4  Pin Configuration', 40, y);
  pinout(doc, h, 306, y + 8);
  y += 162;
  y = heading(h, '5  Absolute Maximum Ratings', 40, y);
  h.text('Over operating free-air temperature range (unless otherwise noted)', 40, y - 2, { font: H, size: 7.5 });
  absMaxTable(h, y + 12);

  // Page 2.
  h.newPage();
  pageFrame(doc, h, 2);
  y = heading(h, '6  Electrical Characteristics', 40, 78);
  rich(h, EC_NOTE, 40, y - 2, { size: 7.5 });
  const tableBottom = ecTable(doc, h, y + 12);
  y = heading(h, '7  Package Outline', 40, tableBottom + 24);
  h.text('D (SOIC-8) plastic small-outline package', 40, y - 2, { font: H, size: 7.5 });
  doc
    .lineWidth(0.5)
    .rect(40, y + 12, 532, 210)
    .stroke();
  packageDrawing(doc, y + 12);
}
