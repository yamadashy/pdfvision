// A two-page services agreement as it comes back from a review round:
// numbered clauses with bold defined terms, a party block, a signature
// block — and redactions of three qualities. The monthly fee was redacted
// properly (text removed, box drawn); the liability cap was "redacted" with a
// black rectangle drawn over text that is still there; an early-termination
// clause was hidden by colouring it white. The reviewer also left real
// annotations: a highlight, a sticky note, a strike-out with a comment, and
// a link on the notices URL.

const R = 'Times-Roman';
const B = 'Times-Bold';
const SIZE = 10.5;
const LEAD = 14.2;

const TITLE = 'MASTER SERVICES AGREEMENT';
const PROVIDER = {
  name: 'Corvane Analytics Ltd.',
  short: 'Provider',
  address: '40 Wharf Road, Leith, Edinburgh EH6 6QX',
};
const CLIENT = {
  name: 'Blue Fern Retail, Inc.',
  short: 'Client',
  address: '1180 Mercer Street, Suite 400, Seattle, WA 98109',
};
const EFFECTIVE = 'November 1, 2026';
const FEE = 'USD 48,500'; // removed from the file; only its box remains
const CAP = 'USD 250,000'; // under a black box, still in the text
const HIDDEN =
  'Client may terminate this Agreement for convenience after month twelve (12) upon payment of an early-termination fee of USD 120,000.';
const NOTICE_URL = 'https://contracts.corvane.example/notices';
const NOTE = 'Cap is too low for a 24-month term. Ask for 2x annual fees. — J. Ortiz, Client Legal';
const STRIKE_COMMENT = 'Replace with 1.0% per month, per our standard terms.';
const SIGNATORIES = [
  {
    party: PROVIDER.name.toUpperCase(),
    name: 'Priya Natarajan',
    title: 'Chief Executive Officer',
    date: 'November 3, 2026',
  },
  { party: CLIENT.name.toUpperCase(), name: 'Marcus Oyelaran', title: 'General Counsel', date: 'November 5, 2026' },
];

// A paragraph is a list of segments: a string (regular), `{ b }` (bold), or
// `{ id, text, mode }` whose word boxes are recorded for redaction and
// markup. mode: 'removed' (box only), 'covered' (text, then a box over it),
// 'white' (white text), or undefined (plain, just tracked).
const CLAUSES = [
  { page: 1, heading: '1.  Definitions' },
  {
    num: '1.1',
    body: [{ b: '“Services”' }, ' means the data-engineering and analytics services described in Schedule A.'],
  },
  {
    num: '1.2',
    body: [
      { b: '“Deliverables”' },
      ' means all reports, dashboards and code that Provider delivers to Client in performing the Services.',
    ],
  },
  {
    num: '1.3',
    body: [
      { b: '“Confidential Information”' },
      ' means any non-public information disclosed by one party to the other, in any form, that is marked or would reasonably be understood as confidential.',
    ],
  },
  { heading: '2.  Services' },
  {
    num: '2.1',
    body: [
      'Provider shall perform the ',
      { b: 'Services' },
      ' with reasonable skill and care and in accordance with the service levels in Schedule B.',
    ],
  },
  {
    num: '2.2',
    body: [
      'Client shall give Provider timely access to the systems, data and personnel reasonably required for the Services.',
    ],
  },
  { heading: '3.  Fees and Payment' },
  {
    num: '3.1',
    body: [
      'Client shall pay Provider a fixed monthly fee of ',
      { id: 'fee', text: FEE, mode: 'removed' },
      ' (the ',
      { b: '“Fees”' },
      '), invoiced monthly in advance.',
    ],
  },
  { num: '3.2', body: ['Invoices are payable within thirty (30) days of the invoice date.'] },
  {
    num: '3.3',
    body: ['Late payments bear interest at ', { id: 'interest', text: '1.5% per month' }, ' until paid in full.'],
  },
  { heading: '4.  Term and Termination' },
  {
    num: '4.1',
    body: [
      'This Agreement starts on the Effective Date and continues for an initial term of twenty-four (24) months (the ',
      { b: '“Initial Term”' },
      ').',
    ],
  },
  {
    num: '4.2',
    body: [
      'Either party may terminate this Agreement for material breach on ',
      { id: 'notice', text: 'thirty (30) days’ written notice' },
      ' if the breach is not cured within that period.',
    ],
  },
  { num: '4.3', body: [{ id: 'hidden', text: HIDDEN, mode: 'white' }] },
  { page: 2, heading: '5.  Confidentiality' },
  {
    num: '5.1',
    body: [
      'Each party shall keep the other party’s ',
      { b: 'Confidential Information' },
      ' confidential and use it only to perform this Agreement, for the term and three (3) years after.',
    ],
  },
  { heading: '6.  Limitation of Liability' },
  {
    num: '6.1',
    body: [
      'Provider’s aggregate liability under this Agreement shall not exceed ',
      { id: 'cap', text: CAP, mode: 'covered' },
      ' in any contract year.',
    ],
  },
  {
    num: '6.2',
    body: ['Neither party is liable for indirect or consequential loss, including loss of profit, revenue or data.'],
  },
  { heading: '7.  Notices' },
  {
    num: '7.1',
    body: [
      'Notices to Provider shall be submitted through ',
      { id: 'url', text: NOTICE_URL },
      ' and notices to Client sent by courier to the address above.',
    ],
  },
  { heading: '8.  Governing Law' },
  {
    num: '8.1',
    body: [
      'This Agreement is governed by the laws of the State of Washington, and the courts of King County have exclusive jurisdiction.',
    ],
  },
];

export const meta = {
  title: 'Services agreement with redactions and review annotations',
  stresses:
    'numbered clauses with bold defined terms; a proper redaction; a black box over live text; white-on-white text; highlight, sticky note, strike-out and link annotations',
  status: 'ok',
  families: ['hidden-overlap', 'interactive', 'structure'],
};

const visible = (segments) =>
  segments
    .map((s) => {
      if (typeof s === 'string') return s;
      if (s.mode === 'removed' || s.mode === 'covered') return '█████';
      if (s.mode === 'white') return '';
      return s.b ?? s.text;
    })
    .join('');

export const truth = `
${TITLE} between **${PROVIDER.name}** (“${PROVIDER.short}”), ${PROVIDER.address}, and **${CLIENT.name}**
(“${CLIENT.short}”), ${CLIENT.address}, effective ${EFFECTIVE}. Defined terms are bold.

**What a reader sees on the page** (█ = black box; clause 4.3 is blank space):

${CLAUSES.map((c) => (c.heading ? `**${c.heading.replace(/\s+/u, ' ')}**` : `${c.num} ${visible(c.body)}`)).join('\n\n')}

Signature block (page 2):

${SIGNATORIES.map((s) => `- ${s.party} — By: (blank line) · Name: ${s.name} · Title: ${s.title} · Date: ${s.date}`).join('\n')}

**What is hidden but extractable** — a correct reading must not present these as visible text,
and should flag them, because the page shows something else:

- 6.1 cap \`${CAP}\` — still in the content stream under a filled black rectangle (failed redaction).
- 4.3 \`${HIDDEN}\` — white text on the white page (hidden clause).

**What is gone:** the 3.1 fee (\`${FEE}\` in the unredacted original) is not in the file; only the black
box is. A correct reading says the fee is redacted and does not guess.

**Annotations** (page numbers are physical):

- Highlight (page 1) over \`thirty (30) days’ written notice\` in 4.2.
- Strike-out (page 1) over \`1.5% per month\` in 3.3, comment: “${STRIKE_COMMENT}”
- Sticky note (page 2) beside 6.1: “${NOTE}”
- Link (page 2) on the URL in 7.1 → \`${NOTICE_URL}\`

## Questions an agent should be able to answer

1. What is the monthly fee? — Not disclosed: it is properly redacted (no text behind the box)
2. What is Provider's liability cap? — Shown redacted; the text under the box still reads ${CAP}, which a correct reading flags as a failed redaction rather than reporting as visible
3. Is anything in the document hidden from a human reader? — Yes: the 6.1 cap under a black box, and clause 4.3 in white text (${HIDDEN})
4. What did the reviewer say about the liability clause, and what change did they propose to late-payment interest? — “${NOTE}”; strike “1.5% per month” — “${STRIKE_COMMENT}”
5. Who signed for the Client, and when? — ${SIGNATORIES[1].name}, ${SIGNATORIES[1].title}, ${SIGNATORIES[1].date}

**Current reading (ok):** both failed redactions are still in the text, where they belong — the
file contains them — and each is flagged on its page. Page 2 reads \`shall not exceed ${CAP} in any
contract year.\` and carries \`text_under_opaque_fill\` naming exactly \`"${CAP}"\` with its bbox, so
the rest of clause 6.1 stays ordinary visible text and question 2 is answered as “shown redacted;
the hidden text reads ${CAP}”. Page 1 reads clause 4.3 as a normal clause and carries
\`text_matches_background\` naming its two lines (\`"${HIDDEN.slice(0, 57)}..."\` and
\`"early-termination fee of USD 120,000."\`) with bboxes, which answers question 3. Both warnings
point at \`--render-region\` for the listed bbox, and the render shows the black box and the blank.
The warnings sit at the end of each page, after the annotation tables, so an agent has to read to the
end of the page before quoting clause 6.1 or 4.3. (Issue #249.)

Defects without a warning: the proper redaction is only partly readable. 3.1 reads \`a fixed monthly fee of\` / \`(the “Fees”),
invoiced monthly in\` / \`advance.\` — the value is simply absent (no box is reported, there is no warning, and the line
is broken where the box sits), so question 1 gets “not stated” where the page shows a redaction:
the reading cannot establish that anything was redacted. Annotations are listed per page
with author, contents, colour and bbox, and the link with its target, so question 4 is answerable
— but the highlight and strike-out rows do not quote the text they mark (\`1.5% per month\`,
\`thirty (30) days’ written notice\`); only the strike-out's comment reveals what it is about.
Bold defined terms are not marked in the output. Question 5 is answered correctly.
`;

const LEFT = 72;
const RIGHT = 540;
const NUM_W = 30;

/** Greedy word wrap over styled segments; returns the y below and word boxes per id. */
function richParagraph(doc, segments, x, y, width) {
  const words = [];
  for (const segment of segments) {
    const spec = typeof segment === 'string' ? { text: segment } : segment;
    const text = spec.b ?? spec.text;
    const font = spec.b ? B : R;
    for (const piece of text.split(/(?<= )/u)) {
      if (piece) words.push({ text: piece, font, id: spec.id, mode: spec.mode });
    }
  }
  const boxes = {};
  let cursor = x;
  for (const word of words) {
    doc.font(word.font).fontSize(SIZE);
    const w = doc.widthOfString(word.text);
    const trimmed = doc.widthOfString(word.text.trimEnd());
    if (cursor + trimmed > x + width && cursor > x) {
      cursor = x;
      y += LEAD;
    }
    if (word.mode !== 'removed') {
      doc.fillColor(word.mode === 'white' ? 'white' : 'black');
      doc.text(word.text, cursor, y, { lineBreak: false });
      doc.fillColor('black');
    }
    if (word.id) {
      boxes[word.id] ??= [];
      const list = boxes[word.id];
      const last = list[list.length - 1];
      if (last && last.y === y) last.w = cursor + trimmed - last.x;
      else list.push({ x: cursor, y, w: trimmed, h: SIZE * 1.15 });
    }
    cursor += w;
  }
  return { y: y + LEAD, boxes };
}

function markup(doc, subtype, box, extra) {
  const x1 = box.x - 1;
  const x2 = box.x + box.w + 1;
  const top = doc.page.height - (box.y - 1);
  const bottom = doc.page.height - (box.y + box.h);
  doc.annotate(box.x - 1, box.y - 1, box.w + 2, box.h + 1, {
    Subtype: subtype,
    QuadPoints: [x1, top, x2, top, x1, bottom, x2, bottom],
    ...extra,
  });
}

function parties(h, y) {
  const lines = [
    `This ${TITLE.toLowerCase().replace(/(^|\s)\w/gu, (m) => m.toUpperCase())} (the “Agreement”) is made on ${EFFECTIVE} (the “Effective Date”) between:`,
  ];
  y = h.paragraph(lines[0], LEFT, y, RIGHT - LEFT, { font: R, size: SIZE, lineGap: 3 }) + 8;
  for (const [i, party] of [PROVIDER, CLIENT].entries()) {
    h.text(`(${i + 1})`, LEFT + 6, y, { font: R, size: SIZE });
    const end = h.run([{ text: party.name, font: B }, `, ${party.address} (`], LEFT + NUM_W, y, {
      font: R,
      size: SIZE,
    });
    h.run([{ text: `“${party.short}”`, font: B }, ');'], end, y, { font: R, size: SIZE });
    y += LEAD + 2;
  }
  return y + 8;
}

function signatureBlock(h, y) {
  SIGNATORIES.forEach((s, i) => {
    const x = LEFT + i * 250;
    h.text(s.party, x, y, { font: B, size: SIZE });
    h.text('By:', x, y + 34, { font: R, size: SIZE });
    h.rule(x + 22, y + 44, x + 210, { width: 0.6 });
    h.text(`Name: ${s.name}`, x, y + 54, { font: R, size: SIZE });
    h.text(`Title: ${s.title}`, x, y + 70, { font: R, size: SIZE });
    h.text(`Date: ${s.date}`, x, y + 86, { font: R, size: SIZE });
  });
}

export function draw(doc, h) {
  let y = 72;
  h.text(TITLE, 306, y, { font: B, size: 15, align: 'center' });
  y = parties(h, y + 34);
  const boxes = {};
  let page = 1;
  for (const clause of CLAUSES) {
    if (clause.page && clause.page !== page) {
      h.text(`Page ${page} of 2`, 306, 750, { font: R, size: 9, align: 'center' });
      h.newPage();
      page = clause.page;
      y = 72;
    }
    if (clause.heading) {
      y += 6;
      h.text(clause.heading, LEFT, y, { font: B, size: SIZE + 0.5 });
      y += LEAD + 3;
      continue;
    }
    h.text(clause.num, LEFT, y, { font: R, size: SIZE });
    const result = richParagraph(doc, clause.body, LEFT + NUM_W, y, RIGHT - LEFT - NUM_W);
    for (const [id, list] of Object.entries(result.boxes)) boxes[id] = { page, list };
    y = result.y + 5;

    // Redaction boxes and page-1/page-2 markup, placed as the clause is drawn.
    for (const { x, y: by, w } of result.boxes.fee ?? []) doc.rect(x, by - 1, w, SIZE * 1.2).fill('black');
    for (const { x, y: by, w } of result.boxes.cap ?? []) doc.rect(x - 1, by - 1, w + 2, SIZE * 1.2).fill('black');
    for (const box of result.boxes.notice ?? [])
      markup(doc, 'Highlight', box, { color: [255, 236, 61], T: new String('J. Ortiz') });
    for (const box of result.boxes.interest ?? []) {
      markup(doc, 'StrikeOut', box, {
        color: [220, 40, 40],
        T: new String('J. Ortiz'),
        Contents: new String(STRIKE_COMMENT),
      });
    }
    for (const box of result.boxes.url ?? []) doc.link(box.x, box.y, box.w, box.h, NOTICE_URL);
    if (result.boxes.cap) {
      doc.note(RIGHT + 14, result.boxes.cap[0].y - 4, 18, 18, NOTE, { T: new String('J. Ortiz') });
    }
    doc.fillColor('black');
  }
  y += 20;
  h.paragraph(
    'IN WITNESS WHEREOF, the parties have executed this Agreement on the dates written below.',
    LEFT,
    y,
    RIGHT - LEFT,
    {
      font: R,
      size: SIZE,
    },
  );
  signatureBlock(h, y + 34);
  h.text('Page 2 of 2', 306, 750, { font: R, size: 9, align: 'center' });
}
