// A town-centre walking map from a visitor leaflet: streets drawn as thick
// strokes at several angles with their names set along them (rotated text),
// a curved riverside road and the river whose names follow the curve one
// glyph at a time, numbered markers keyed to a legend, a north arrow and a
// scale bar. Every label is real text; what is next to what exists only in
// the drawing.

const W = 792;
const H = 612;
const F = 'Helvetica';
const FB = 'Helvetica-Bold';

const STREETS = [
  { name: 'MARKET STREET', from: [60, 300], to: [520, 300], t: 0.66 },
  { name: 'Abbey Road', from: [250, 80], to: [250, 560], t: 0.72 },
  { name: 'Tanner’s Lane', from: [300, 120], to: [480, 260] },
  { name: 'Station Avenue', from: [420, 560], to: [520, 300] },
];
// A riverside road along a quadratic curve, and the river below it.
const CURVE = { p0: [70, 470], p1: [300, 360], p2: [540, 500] };
const ROAD_NAME = 'QUAYSIDE WALK';
const RIVER_NAME = 'River Wend';
const POIS = [
  { n: 1, name: 'Tourist Information', at: [200, 300] },
  { n: 2, name: 'St Bride’s Abbey', at: [250, 160] },
  { n: 3, name: 'Wendbury Museum', at: [390, 205] },
  { n: 4, name: 'Covered Market', at: [440, 300] },
  { n: 5, name: 'Railway Station', at: [430, 535] },
  { n: 6, name: 'Ferry Pier', at: [300, 436] },
];

export const meta = {
  title: 'Town walking map with rotated and curved street names',
  stresses:
    'street names rotated along strokes at 0°, 90°, about 38° and about −69°; a road and a river named along a curve one glyph at a time; numbered markers keyed to a legend; north arrow and scale bar; landscape page',
  status: 'known-gap',
  issue: 307,
  families: ['vertical-rotated', 'vector-meaning', 'page-geometry'],
  page: { size: 'LETTER', layout: 'landscape' },
};

export const truth = `
One Letter landscape page: the title **Wendbury town centre** with a map on the left and a legend on
the right. The map's labels, each read as a whole name:

- Streets: ${STREETS.map((s) => s.name).join(', ')}; the curved road ${ROAD_NAME}; the river ${RIVER_NAME}.
- Numbered markers, keyed by the legend: ${POIS.map((p) => `${p.n} ${p.name}`).join(', ')}.

What the drawing shows (only visible in the render): Tanner’s Lane runs diagonally from Abbey Road
north of Market Street towards the east end of Market Street, passing the Wendbury Museum (3); Station
Avenue leads from the east end of Market Street (by the Covered Market, 4) down to the Railway
Station (5); the Ferry Pier (6) is on Quayside Walk, on the River Wend.

## Questions an agent should be able to answer

1. What number marks the Wendbury Museum? — 3
2. What are the names of the curved road and of the river? — Quayside Walk; the River Wend
3. Which street names appear on the map? — Market Street, Abbey Road, Tanner’s Lane, Station Avenue, Quayside Walk
4. Which street leads to the Railway Station? — Station Avenue (from the east end of Market Street) — only in the drawing
5. What distance does the scale bar show? — 200 m

Questions 1, 3 and 5 are answerable from \`read.md\`: the straight street names, rotated or not, come
back whole (\`Tanner’s Lane\`, \`Station Avenue\`, \`Abbey Road\`), and the legend lines carry their
numbers except one.

**Known gap (#307):** the page has no warning. The two names set along the curve, one glyph
per text object, are cut into fragments and interleaved with other labels: \`QUAYS\` … \`Abbey Road\` /
\`6\` / \`Station Avenue\` / \`Riv e r  W\` / \`end\` / \`ID E  W A L K\`, so question 2 rests on guessing
that \`QUAYS\` and \`ID E W A L K\` are one name and \`Riv e r W\` + \`end\` another (a search for
"Quayside" or "River Wend" finds nothing). The legend is split around the map's labels (entries 1–2
before them, 3–6 after) and entry 5 comes apart (\`Railway Station\` / \`5\`). The map's own markers
are bare numbers among street names, and question 4 — which street leads where — exists only in the
drawing; nothing points the agent to render it (the page is far below \`dense_vector_graphics\`).
`;

const quad = (t) => {
  const { p0, p1, p2 } = CURVE;
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
};
const quadAngle = (t) => {
  const { p0, p1, p2 } = CURVE;
  const dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
  const dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
};

/** Text along the curve, one glyph per text object, rotated to the tangent; `offset` moves it off the line. */
function textOnCurve(doc, text, t0, offset, { font = FB, size = 10, color = 'black', spacing = 1.5 } = {}) {
  doc.font(font).fontSize(size);
  let t = t0;
  for (const char of text) {
    const [x, y] = quad(t);
    const angle = quadAngle(t);
    const nx = -Math.sin((angle * Math.PI) / 180);
    const ny = Math.cos((angle * Math.PI) / 180);
    doc.save();
    doc.translate(x + nx * offset, y + ny * offset).rotate(angle);
    doc.fillColor(color).text(char, 0, -size * 0.75, { lineBreak: false });
    doc.restore();
    // Advance t by the glyph width along the curve (numerically).
    const advance = doc.widthOfString(char) + spacing;
    let travelled = 0;
    let [px, py] = quad(t);
    while (travelled < advance && t < 1) {
      t += 0.001;
      const [qx, qy] = quad(t);
      travelled += Math.hypot(qx - px, qy - py);
      px = qx;
      py = qy;
    }
  }
  doc.fillColor('black');
}

function streetLabel(doc, h, street) {
  const [x1, y1] = street.from;
  const [x2, y2] = street.to;
  let angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  const t = street.t ?? 0.5;
  const cx = x1 + (x2 - x1) * t;
  const cy = y1 + (y2 - y1) * t;
  doc.save();
  doc.translate(cx, cy).rotate(angle);
  h.text(street.name, 0, -4, { font: FB, size: 8, align: 'center' });
  doc.restore();
}

export function draw(doc, h) {
  doc.rect(0, 0, W, H).fill('#f5f1e6');
  doc.fillColor('black');
  h.text('Wendbury town centre', 40, 28, { font: FB, size: 18 });
  doc.rect(40, 60, 520, 520).fill('#ece6d4');

  // River: a wide blue band below the curve.
  doc.save();
  doc.lineWidth(26).strokeColor('#90caf9');
  const shift = 34;
  doc
    .moveTo(CURVE.p0[0], CURVE.p0[1] + shift)
    .quadraticCurveTo(CURVE.p1[0], CURVE.p1[1] + shift, CURVE.p2[0], CURVE.p2[1] + shift)
    .stroke();
  doc.restore();

  // Roads first (all strokes), then their names.
  doc.save().lineWidth(12).strokeColor('#ffffff').lineCap('round');
  for (const s of STREETS)
    doc
      .moveTo(...s.from)
      .lineTo(...s.to)
      .stroke();
  doc
    .moveTo(...CURVE.p0)
    .quadraticCurveTo(...CURVE.p1, ...CURVE.p2)
    .stroke();
  doc.restore();

  // Markers.
  for (const p of POIS) {
    doc.circle(p.at[0], p.at[1], 8).fill('#c62828');
    doc.fillColor('white');
    h.text(String(p.n), p.at[0], p.at[1] - 4.5, { font: FB, size: 9, align: 'center' });
  }
  doc.fillColor('black');

  for (const s of STREETS) streetLabel(doc, h, s);
  textOnCurve(doc, ROAD_NAME, 0.18, 0, { size: 8 });
  textOnCurve(doc, RIVER_NAME, 0.55, 34, { font: 'Helvetica-Oblique', size: 11, color: '#0d47a1', spacing: 3 });

  // North arrow and scale bar.
  doc.moveTo(520, 110).lineTo(512, 130).lineTo(528, 130).closePath().fill('black');
  h.text('N', 520, 92, { font: FB, size: 10, align: 'center' });
  doc.lineWidth(3).moveTo(60, 560).lineTo(160, 560).stroke();
  h.text('0', 60, 544, { size: 7, align: 'center' });
  h.text('200 m', 160, 544, { size: 7, align: 'center' });

  // Legend.
  h.text('Places to visit', 590, 80, { font: FB, size: 12 });
  POIS.forEach((p, i) => {
    const y = 108 + i * 24;
    doc.circle(598, y + 5, 7).fill('#c62828');
    doc.fillColor('white');
    h.text(String(p.n), 598, y + 1, { font: FB, size: 8, align: 'center' });
    doc.fillColor('black');
    h.text(p.name, 612, y, { size: 9.5 });
  });
  h.paragraph(
    'Walking times from Tourist Information: Abbey 4 min, Museum 6 min, Station 9 min, Ferry Pier 7 min.',
    590,
    270,
    170,
    { font: F, size: 9 },
  );
}
