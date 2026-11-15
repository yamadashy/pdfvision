// The opening page of a magazine feature: kicker, headline, standfirst and
// byline over three justified body columns; a drop cap; a pull quote set
// large across the second and third columns; an inset photo (a vector
// placeholder) with the body running around it and a caption under it; a
// tinted sidebar box in the third column whose lines share baselines with
// the second column and are written to the content stream alternately with
// it, as some layout programs do; and a "continued on page 48" jump line.

import { drawLine, drawPlacement, flowColumns, wrapLines } from '../../lib/layoutB.mjs';

const T = 'Times-Roman';
const TB = 'Times-Bold';
const TI = 'Times-Italic';
const H = 'Helvetica';
const HB = 'Helvetica-Bold';
const HO = 'Helvetica-Oblique';
const ACCENT = '#1f5f5b';

const KICKER = 'FEATURE  |  OCEANS';
const HEADLINE = ['The Kelp', 'Gardeners'];
const DECK =
  'Off the coast of Carrow Point, a crew of volunteer divers is replanting an underwater forest one rope at a time.';
const BYLINE = 'By Ines Calloway   |   Photographs by Ruben Okoro';
const PULL_QUOTE = '“We are not saving the forest. We are giving it a reason to come back on its own.”';
const PULL_CREDIT = '— Maren Tolliver, dive coordinator';
const PHOTO_CAPTION =
  'Volunteer diver Theo Lambeth ties kelp seedlings to a grow line at 9 metres, north of Carrow Point, in June.';
const JUMP = 'Continued on page 48 ›';
const FOLIO = ['46', 'HARBOR & HORIZON', 'DECEMBER 2026'];

const BODY = [
  'The first thing you notice at nine metres is the silence. The second is the urchins: thousands of them, purple and patient, grazing a seabed that ten years ago was a forest so dense that divers needed a compass to find their way out of it. Today the rock is bare enough to read the ripple marks in the sand.',
  'Maren Tolliver has been diving this reef since she was fifteen. She remembers the canopy closing over her head at slack tide, the light going green and dim, the cod hanging motionless between the stalks. When the forest began to thin in a run of warm summers, she assumed it would recover the way it always had. It did not.',
  'What followed was a slow collapse that scientists call a phase shift. Warm water weakened the kelp; the urchins that the kelp had kept in check by starving them of light and space moved in; and once the urchins held the rock, young kelp could no longer take hold. A barren, it turns out, is stable in its own way.',
  'The Carrow Point project began with six divers and a borrowed boat. Each weekend they cleared urchins from a plot the size of a tennis court, then lowered ropes seeded in a shore tank with kelp spores. The first year, almost nothing grew. The second year, the ropes came up furred with brown blades as long as a forearm.',
  'Now the group has more than two hundred volunteers, a permit from the county, and a waiting list. Their method has not changed much. Divers work in pairs, one clearing and one counting, and every rope is logged with its depth, its seed batch and the date it went into the water.',
  'The counting matters more than the clearing, says Tolliver. Without it, nobody could tell a good year from a lucky one, and the funders who now pay for the boat fuel would have moved on long ago.',
  'The logs have started to tell a story. Plots cleared in the first two seasons now hold kelp taller than a diver, and the cod have returned to the deeper edges. Plots cleared later, after a summer of record water temperatures, are patchier, and some ropes have been stripped bare again by urchins drifting in from the unmanaged reef next door.',
  'That edge is the project’s biggest worry. Clearing a plot buys time, but the barren beyond it keeps sending urchins in, and the volunteers cannot clear the whole coast. Tolliver wants the county to fund a commercial urchin harvest on the outer reef, an idea that has divided the harbour.',
  'The lobster crews who fish that reef are wary of anything that brings more boats out.',
];

const SIDEBAR_TITLE = 'BY THE NUMBERS';
const SIDEBAR_ITEMS = [
  ['14.2 hectares', 'of reef cleared of urchins since the project began in 2019.'],
  ['3,600 ropes', 'seeded with kelp spores in the shore tank at Carrow harbour.'],
  ['212 volunteers', 'trained as clearing or counting divers this season.'],
  ['61 per cent', 'of seeded ropes still carrying kelp after one full year.'],
];

export const meta = {
  title: 'Magazine feature opening page',
  stresses:
    'three justified columns; drop cap; pull quote across two columns; tinted sidebar sharing baselines with the next column and written alternately with it; text run around an inset photo; jump line',
  status: 'known-gap',
  families: ['reading-order', 'structure'],
};

export const truth = `
Reading order: kicker, headline, standfirst, byline; then the body column by column (column 1
under the drop cap, with the inset photo's caption under the photo; column 2 above and below the
pull quote and beside the photo; column 3 above the sidebar, ending in the jump line); the pull
quote and the sidebar are separate blocks that must not be woven into the body.

- Kicker: ${KICKER.replace(/ +/gu, ' ')}
- Headline: ${HEADLINE.join(' ')}
- Standfirst: ${DECK}
- Byline: ${BYLINE.replace(/ +\| +/u, ' | ')}

Body (the first paragraph opens with a drop cap “${BODY[0][0]}”):

${BODY.join('\n\n')}

${JUMP}

Pull quote: ${PULL_QUOTE} ${PULL_CREDIT}

Photo caption: ${PHOTO_CAPTION}

Sidebar **${SIDEBAR_TITLE}**:

${SIDEBAR_ITEMS.map(([figure, text]) => `- **${figure}** ${text}`).join('\n')}

Folio: \`${FOLIO.join('  ')}\`.

## Questions an agent should be able to answer

1. Who wrote the feature, and who took the photographs? — Ines Calloway; Ruben Okoro
2. How many hectares of reef have been cleared, according to the sidebar? — ${SIDEBAR_ITEMS[0][0].split(' ')[0]}
3. Who is quoted in the pull quote, and what does she say? — Maren Tolliver, dive coordinator: ${PULL_QUOTE}
4. How did the Carrow Point project start, and what did the divers do each weekend? — With six divers and a borrowed boat; each weekend they cleared urchins from a tennis-court-sized plot, then lowered ropes seeded with kelp spores in a shore tank.
5. On which page does the article continue? — ${JUMP.match(/\d+/u)[0]}

Each column is read as a column, the sidebar stays in one piece after the body (it is not woven
into column 2 even though its lines are written alternately with column 2's), and the pull quote,
caption and jump line are present. Questions 1, 2, 3 and 5 are answerable from \`read.md\`.

**Known gap (no issue yet):** the column *segments* are emitted out of reading order, with no
reading-order warning (the only warning is a \`text_overlap\` with no next step). \`read.md\` reads
column 1 down to the photo (\`…by starving them of\`), then jumps to the top of column 2
(\`weekend they cleared urchins…\`), continues through the pull quote into column 2's middle and
the whole of column 3 above the quote and the jump line, and only then gives the rest of
column 1 (\`light and space moved in; …\` / \`The Carrow Point project began with six divers and a
borrowed boat. Each\`), the bottom of column 2 (\`first two seasons now hold kelp…\`) and finally the
runaround beside the photo (\`matters more than the clearing, says Tolliver.\`), whose first line
\`The counting\` is split into \`The\` and \`counting\` lines far apart. Paragraphs that cross a segment
break are cut mid-sentence: question 4 needs \`…six divers and a borrowed boat. Each\` joined to
\`weekend they cleared urchins…\`, which \`read.md\` prints about forty lines earlier, and the
paragraph about the logs is read in the order end, middle, start.
`;

const COL_W = 164;
const COLS = [40, 224, 408];
const TOP = 214;
const BOTTOM = 736;
const LEADING = 12;
const QUOTE = { top: 330, bottom: 410 };
const PHOTO = { x: 40, y: 470, w: 252, h: 140 };
const CAPTION_BOTTOM = 650;
const SIDEBAR = { x: 408, top: 482, bottom: 736 };
const JUMP_Y = 452;
const DROP = { lines: 3, indent: 30 };

function regions() {
  const after = (y) => TOP + Math.ceil((y - TOP) / LEADING) * LEADING;
  return [
    { x: COLS[0], top: TOP, bottom: PHOTO.y - 6, width: COL_W },
    { x: COLS[0], top: after(CAPTION_BOTTOM + 4), bottom: BOTTOM, width: COL_W },
    { x: COLS[1], top: TOP, bottom: QUOTE.top - 4, width: COL_W },
    { x: COLS[1], top: after(QUOTE.bottom), bottom: PHOTO.y - 2, width: COL_W },
    {
      x: PHOTO.x + PHOTO.w + 10,
      top: after(PHOTO.y - 2),
      bottom: CAPTION_BOTTOM + 4,
      width: COLS[1] + COL_W - (PHOTO.x + PHOTO.w + 10),
    },
    { x: COLS[1], top: after(CAPTION_BOTTOM + 4), bottom: BOTTOM, width: COL_W },
    { x: COLS[2], top: TOP, bottom: QUOTE.top - 4, width: COL_W },
    { x: COLS[2], top: after(QUOTE.bottom), bottom: JUMP_Y, width: COL_W },
  ];
}

function bodyPlacements(doc) {
  const blocks = BODY.map((text, i) => ({
    text: i === 0 ? text.slice(1) : text,
    font: T,
    size: 9.5,
    leading: LEADING,
    indent: i === 0 ? 0 : 10,
    hang: i === 0 ? DROP : undefined,
    justify: true,
  }));
  return flowColumns(doc, blocks, regions());
}

function sidebarLines(doc) {
  const inner = { x: SIDEBAR.x + 10, width: COL_W - 20 };
  const lines = [
    { y: SIDEBAR.top + 12, line: { text: SIDEBAR_TITLE, indent: 0, last: true }, font: HB, size: 9, color: ACCENT },
  ];
  let y = SIDEBAR.top + 12 + LEADING * 2;
  for (const [figure, text] of SIDEBAR_ITEMS) {
    lines.push({ y, line: { text: figure, indent: 0, last: true }, font: HB, size: 11, color: ACCENT });
    y += LEADING + 2;
    for (const line of wrapLines(doc, text, { font: H, size: 8, width: inner.width })) {
      lines.push({ y, line, font: H, size: 8 });
      y += LEADING;
    }
    y += LEADING;
  }
  return lines.map((l) => ({ ...l, x: inner.x, width: inner.width }));
}

function drawHeader(doc, h) {
  doc.fillColor(ACCENT);
  h.text(KICKER, 40, 40, { font: HB, size: 8 });
  doc.fillColor('black');
  h.text(HEADLINE.join(' '), 40, 56, { font: TB, size: 44 });
  const deck = wrapLines(doc, DECK, { font: TI, size: 14, width: 470 });
  deck.forEach((line, i) => void h.text(line.text, 40, 112 + i * 17, { font: TI, size: 14 }));
  h.text(BYLINE, 40, 158 + (deck.length - 2) * 17, { font: HB, size: 8 });
  h.rule(40, 196, 572, { width: 0.6 });
}

function drawDropCap(doc) {
  doc.font(TB).fontSize(42).fillColor(ACCENT);
  doc.text(BODY[0][0], COLS[0], TOP - 6, { lineBreak: false });
  doc.fillColor('black');
}

function drawPullQuote(doc, h) {
  const x = COLS[1];
  const width = COLS[2] + COL_W - x;
  h.rule(x, QUOTE.top, x + width, { width: 1.2 });
  const lines = wrapLines(doc, PULL_QUOTE, { font: TI, size: 17, width });
  doc.fillColor(ACCENT);
  lines.forEach(
    (line, i) =>
      void doc
        .font(TI)
        .fontSize(17)
        .text(line.text, x, QUOTE.top + 9 + i * 20, { lineBreak: false }),
  );
  doc.fillColor('black');
  h.text(PULL_CREDIT, x + width, QUOTE.top + 9 + lines.length * 20 + 2, { font: H, size: 7.5, align: 'right' });
  h.rule(x, QUOTE.bottom, x + width, { width: 1.2 });
}

function drawPhoto(doc) {
  const { x, y, w, h } = PHOTO;
  doc.rect(x, y, w, h).fill('#3d7d86');
  doc.rect(x, y, w, 38).fill('#77aeb3');
  // Kelp stalks and a diver silhouette as simple shapes.
  for (let i = 0; i < 9; i += 1) {
    const sx = x + 16 + i * 28;
    doc
      .moveTo(sx, y + h)
      .bezierCurveTo(sx - 10, y + h - 50, sx + 12, y + 70, sx + 2, y + 30)
      .lineWidth(3)
      .stroke('#5b6b2a');
  }
  doc.ellipse(x + 150, y + 64, 26, 9).fill('#1d2b30');
  doc.circle(x + 120, y + 60, 7).fill('#1d2b30');
  doc.fillColor('black').strokeColor('black');
  const caption = wrapLines(doc, PHOTO_CAPTION, { font: HO, size: 7.5, width: w });
  caption.forEach((line, i) => void drawLine(doc, line, x, y + h + 5 + i * 9.5, { font: HO, size: 7.5, width: w }));
}

function drawFolio(h) {
  h.text(FOLIO[0], 40, 752, { font: HB, size: 8 });
  h.text(`${FOLIO[1]}   ${FOLIO[2]}`, 60, 752, { font: H, size: 7 });
}

export function draw(doc, h) {
  drawHeader(doc, h);
  const body = bodyPlacements(doc);
  const sidebar = sidebarLines(doc);
  drawDropCap(doc);
  // Column 1, then column 3 lines, then column 2 and the sidebar woven
  // together by baseline, the way the layout program wrote them.
  const column = (p) => (COLS.indexOf(p.x) === -1 ? 1 : COLS.indexOf(p.x));
  for (const p of body.filter((p) => column(p) === 0)) drawPlacement(doc, p);
  const second = body.filter((p) => column(p) === 1);
  const woven = [...second.map((p) => ({ ...p, order: 0 })), ...sidebar.map((p) => ({ ...p, order: 1 }))];
  woven.sort((a, b) => a.y - b.y || a.order - b.order);
  doc.rect(SIDEBAR.x, SIDEBAR.top, COL_W, SIDEBAR.bottom - SIDEBAR.top).fill('#e3efe9');
  doc.fillColor('black');
  for (const p of woven) drawPlacement(doc, p);
  for (const p of body.filter((p) => column(p) === 2)) drawPlacement(doc, p);
  h.text(JUMP, COLS[2] + COL_W, JUMP_Y + 4, { font: HB, size: 8, align: 'right' });
  drawPullQuote(doc, h);
  drawPhoto(doc);
  drawFolio(h);
}
