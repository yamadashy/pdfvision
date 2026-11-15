// A two-page internal memo still in review: a large diagonal, semi-
// transparent DRAFT watermark drawn behind the text on both pages, section
// headings set in letter-spaced small caps (character spacing, no space
// glyphs), a memo header block with a rubber-stamp "SAMPLE" mark rotated over
// the Date field, a short milestone table, and numbered recommendations.

const R = 'Times-Roman';
const B = 'Times-Bold';
const I = 'Times-Italic';
const H = 'Helvetica';
const HB = 'Helvetica-Bold';

const ORG = 'BRIGHTWATER LOGISTICS';
const WATERMARK = 'DRAFT';
const STAMP = 'SAMPLE';
const FIELDS = [
  ['TO:', 'Executive Committee'],
  ['FROM:', 'Lena Marsh, Director of Facilities'],
  ['CC:', 'Owen Pratt, Chief Financial Officer; Site Managers'],
  ['DATE:', 'November 12, 2026'],
  ['RE:', 'Consolidation of the Fremont and Hayward warehouses'],
];
const STAMPED_FIELD = 'DATE:';
const SAVINGS = '$1.4 million';
const ONE_OFF = '$2.1 million';
const HEADCOUNT = '18';
const SECTIONS = [
  {
    heading: 'Background',
    body: [
      'Brightwater currently runs two cross-dock warehouses eleven miles apart. Fremont handles inbound ocean freight; Hayward handles regional retail replenishment. Both leases expire in 2028, and both buildings are below 60% utilisation outside the November peak.',
      'Facilities and Finance were asked in August to assess whether a single site could absorb both flows without extending dock-to-stock times.',
    ],
  },
  {
    heading: 'Proposal',
    body: [
      `We propose to consolidate both operations into the Hayward building, which has the larger yard and can take four additional dock doors. Moving costs, racking and the dock works are estimated at ${ONE_OFF} one-off; lower rent, utilities and shuttle runs save about ${SAVINGS} a year from fiscal 2028.`,
      `The move affects ${HEADCOUNT} roles at Fremont. All affected staff will be offered positions at Hayward with a relocation allowance; we do not expect redundancies.`,
    ],
  },
];
const TABLE_HEAD = ['Milestone', 'Owner', 'Target date'];
const MILESTONES = [
  ['Committee approval', 'Executive Committee', 'December 9, 2026'],
  ['Dock works complete at Hayward', 'Facilities', 'April 30, 2027'],
  ['Fremont inbound moved to Hayward', 'Operations', 'June 15, 2027'],
  ['Fremont lease surrendered', 'Legal', 'September 30, 2027'],
];
const RECOMMENDATIONS = [
  'Approve the consolidation and the one-off budget of $2.1 million.',
  'Authorise Legal to open surrender talks with the Fremont landlord.',
  'Ask HR to brief affected staff no later than January 2027.',
];
const RISK =
  'The main risk is the November peak: if the dock works slip past April, Hayward will run the 2027 peak with its current eight doors. Operations recommends a fallback short-term lease on overflow space, budgeted within the one-off figure above.';

export const meta = {
  title: 'Two-page draft memo with a diagonal watermark and a stamp',
  stresses:
    'large rotated semi-transparent DRAFT watermark behind the text on every page; letter-spaced small-caps headings; a rotated SAMPLE stamp over a header field; short table; numbered list',
  families: ['hidden-overlap', 'encoding', 'structure'],
  status: 'ok',
};

export const truth = `
A two-page memo on ${ORG} letterhead. Behind the text of both pages, a large light-grey
**${WATERMARK}** runs diagonally from lower left to upper right; a red rotated **${STAMP}** stamp sits
over the Date field. A correct reading keeps the watermark and stamp out of the memo's lines (or
reports them separately) — they mark the document's status, they are not part of any sentence.

**MEMORANDUM**

${FIELDS.map(([label, value]) => `- ${label} ${value}`).join('\n')}

${SECTIONS.map((s) => `**${s.heading}** (letter-spaced small caps)\n\n${s.body.join('\n\n')}`).join('\n\n')}

**Timeline** (page 2)

| ${TABLE_HEAD.join(' | ')} |
| --- | --- | --- |
${MILESTONES.map((row) => `| ${row.join(' | ')} |`).join('\n')}

**Risks** — ${RISK}

**Recommendations**

${RECOMMENDATIONS.map((r, i) => `${i + 1}. ${r}`).join('\n')}

## Questions an agent should be able to answer

1. Is this memo final? — No: every page carries a ${WATERMARK} watermark, and the header is stamped ${STAMP}
2. What date is the memo, and who wrote it? — ${FIELDS[3][1]}; ${FIELDS[1][1]}
3. What are the expected annual savings and the one-off cost? — about ${SAVINGS} a year from fiscal 2028; ${ONE_OFF} one-off
4. When should the dock works at Hayward be complete, and who owns that milestone? — ${MILESTONES[1][2]}, Facilities
5. What is the second recommendation? — ${RECOMMENDATIONS[1]}

**Current reading (ok):** all five questions are answerable from \`read.md\`. The watermark does
*not* fuse into the memo's lines here: it comes out as a separate \`DRAFT\` paragraph on each page
(after the header fields on page 1, after the timeline on page 2), and the
stamp as \`S A M P L E\` between the CC and Date values. Neither is labelled as a watermark or
stamp, but their presence answers question 1. The survey's failure (\`Sample invoiceInvoice
number\`) did not reproduce with a watermark drawn behind the text at this angle and size.

Defects without a warning: the small-caps headings come back with spaces inserted by the
character spacing, and the size change splits the first letters off: \`BA C K G R O U N D\`,
\`PR O P O S A L\`, \`RE C O M M E N D AT I O N S\` — a search for “Recommendations” fails. The header
block is read as a label column then a value column (\`TO:\` … \`RE:\`, then the five values, with
\`S A M P L E\` between the third and fourth), so question 2 depends on counting. The timeline
table is not detected, but its rows are read across (\`Milestone\` / \`Committee approval\` /
\`Dock works complete at Hayward\` / …, then \`Owner\` / …, then \`Target date\` / …), so question 4 is
answered by position within the rows. The only warnings are \`text_overlap\` (“block bboxes overlap … may visually collide”), caused by
the watermark; they name no next step.
`;

const LEFT = 90;
const RIGHT = 522;

function watermark(doc) {
  doc.save();
  doc.rotate(-52, { origin: [306, 396] });
  doc.fillColor('#808080').fillOpacity(0.16);
  doc.font(HB).fontSize(150);
  const w = doc.widthOfString(WATERMARK);
  doc.text(WATERMARK, 306 - w / 2, 396 - 75, { lineBreak: false });
  doc.restore();
  doc.fillColor('black').fillOpacity(1);
}

/** Letter-spaced small caps: initial at full size, the rest as smaller capitals. */
function smallCaps(doc, text, x, y) {
  const spacing = 1.6;
  let cursor = x;
  for (const word of text.split(' ')) {
    const parts = [
      { t: word[0].toUpperCase(), size: 11 },
      { t: word.slice(1).toUpperCase(), size: 8.6 },
    ];
    for (const part of parts) {
      doc.font(R).fontSize(part.size);
      const top = y + (11 - part.size) * 0.72;
      doc.text(part.t, cursor, top, { lineBreak: false, characterSpacing: spacing });
      cursor += doc.widthOfString(part.t, { characterSpacing: spacing });
    }
    cursor += 6;
  }
}

function prose(h, text, y) {
  return h.paragraph(text, LEFT, y, RIGHT - LEFT, { font: R, size: 11, lineGap: 3, align: 'justify' }) + 9;
}

function footer(h, page) {
  h.text(`${ORG} · Internal · Page ${page} of 2`, 306, 748, { font: H, size: 8, align: 'center' });
}

export function draw(doc, h) {
  watermark(doc);
  h.text(ORG, LEFT, 60, { font: HB, size: 12 });
  h.text('Facilities & Real Estate', LEFT, 76, { font: H, size: 9 });
  h.rule(LEFT, 92, RIGHT, { width: 1.2 });
  h.text('MEMORANDUM', LEFT, 110, { font: B, size: 20 });

  let y = 148;
  const fieldBoxes = {};
  for (const [label, value] of FIELDS) {
    h.text(label, LEFT, y, { font: B, size: 11 });
    const box = h.text(value, LEFT + 64, y, { font: R, size: 11 });
    fieldBoxes[label] = { ...box, y };
    y += 20;
  }
  h.rule(LEFT, y + 2, RIGHT, { width: 0.6 });
  y += 22;

  // The stamp: a rotated red box with SAMPLE, pressed over the Date value.
  const stamped = fieldBoxes[STAMPED_FIELD];
  doc.save();
  const cx = stamped.left + 60;
  const cy = stamped.y + 6;
  doc.rotate(-12, { origin: [cx, cy] });
  doc.strokeColor('#c0392b').strokeOpacity(0.85).lineWidth(2);
  doc.roundedRect(cx - 52, cy - 15, 104, 30, 4).stroke();
  doc.fillColor('#c0392b').fillOpacity(0.85).font(HB).fontSize(18);
  const sw = doc.widthOfString(STAMP, { characterSpacing: 2 });
  doc.text(STAMP, cx - sw / 2, cy - 10, { lineBreak: false, characterSpacing: 2 });
  doc.restore();
  doc.fillColor('black').strokeColor('black').fillOpacity(1).strokeOpacity(1);

  for (const section of SECTIONS) {
    smallCaps(doc, section.heading, LEFT, y);
    y += 22;
    for (const paragraph of section.body) y = prose(h, paragraph, y);
    y += 6;
  }
  footer(h, 1);

  h.newPage();
  watermark(doc);
  y = 72;
  smallCaps(doc, 'Timeline', LEFT, y);
  y += 26;
  const cols = [LEFT, LEFT + 220, LEFT + 340];
  h.rule(LEFT, y - 4, RIGHT, { width: 0.8 });
  TABLE_HEAD.forEach((label, i) => {
    h.text(label, cols[i], y, { font: B, size: 10.5 });
  });
  y += 16;
  h.rule(LEFT, y - 2, RIGHT, { width: 0.5 });
  for (const row of MILESTONES) {
    y += 3;
    row.forEach((cell, i) => {
      h.text(cell, cols[i], y, { font: R, size: 10.5 });
    });
    y += 16;
  }
  h.rule(LEFT, y + 2, RIGHT, { width: 0.8 });
  y += 26;

  smallCaps(doc, 'Risks', LEFT, y);
  y = prose(h, RISK, y + 22) + 6;

  smallCaps(doc, 'Recommendations', LEFT, y);
  y += 22;
  RECOMMENDATIONS.forEach((text, i) => {
    h.text(`${i + 1}.`, LEFT + 6, y, { font: R, size: 11 });
    y = h.paragraph(text, LEFT + 26, y, RIGHT - LEFT - 26, { font: R, size: 11, lineGap: 3 }) + 6;
  });
  y += 24;
  h.text('Prepared by L. Marsh for discussion at the December 9 meeting. Not for circulation.', LEFT, y, {
    font: I,
    size: 10,
  });
  footer(h, 2);
}
