// A page of a government register in the US Federal Register style: a
// running head with the volume, issue, date and page number over a heavy
// rule; three dense justified columns of small serif type; run-in bold
// captions (SUMMARY:, DATES:); numbered regulatory paragraphs whose first
// lines are indented `(a)`, `(1)`, `(i)`; a section heading set in one column;
// and the print-production lines that typesetting systems leave in the text
// layer — one rotated up the left margin, one along the foot of the page.

import { drawPlacement, flowColumns } from '../../lib/layoutB.mjs';

const T = 'Times-Roman';
const TB = 'Times-Bold';
const TI = 'Times-Italic';
const H = 'Helvetica';

const HEAD = {
  left: 'Commonwealth Register / Vol. 52, No. 211 / Thursday, November 5, 2026 / Rules and Regulations',
  page: '48216',
};
const MARGIN_LINE =
  'PrtDate Nov 03 2026 18:22 Job 304118 PO 00000 Frm 00012 Fmt 4700 Sfmt 4700 E:\\CR\\FM\\05NOR1.SGM 05NOR1';
const MARGIN_STAMP = 'kmalloy on DSK7QP2VN1PROD with RULES';

// Each block: { lead?, text, kind? }. kind 'title' and 'section' are bold headings;
// 'para' is an indented paragraph; 'reg' is a regulatory paragraph whose lead is its designation.
const BLOCKS = [
  { kind: 'agency', text: 'DEPARTMENT OF COASTAL RESOURCES' },
  { kind: 'agency', text: '14 CCR Part 214' },
  { kind: 'agency', text: '[Docket No. DCR–2026–0147]' },
  { kind: 'agency', text: 'RIN 2210–AC63' },
  { kind: 'title', text: 'Small Craft Mooring Permits in Designated Harbor Areas' },
  { kind: 'plain', lead: 'AGENCY:', text: 'Department of Coastal Resources (DCR).' },
  { kind: 'plain', lead: 'ACTION:', text: 'Final rule.' },
  {
    kind: 'plain',
    lead: 'SUMMARY:',
    text: 'The Department is revising its regulations for permits to moor small craft in designated harbor areas. This rule sets a single maximum mooring length for each harbor class, requires annual inspection of ground tackle, and replaces the paper waiting list with an electronic list administered by each harbor office. The changes respond to comments received on the proposed rule and to a rise in mooring failures during winter storms.',
  },
  {
    kind: 'plain',
    lead: 'DATES:',
    text: 'This rule is effective January 4, 2027. Permits issued before that date remain valid until their stated expiration.',
  },
  {
    kind: 'plain',
    lead: 'FOR FURTHER INFORMATION CONTACT:',
    text: 'Delia Fairweather, Office of Harbor Management, Department of Coastal Resources, telephone 555–0142, email harbors@dcr.example.gov.',
  },
  { kind: 'caption', text: 'SUPPLEMENTARY INFORMATION:' },
  { kind: 'section', text: 'I. Background' },
  {
    kind: 'para',
    text: 'Part 214 governs the placement of private moorings in the forty-one harbor areas designated under section 12 of the Harbors Act. Since the rule was last revised in 2009, the number of permitted moorings has grown by roughly a third, while the area available for mooring fields has not changed. Harbor masters have reported that boats longer than the swing radius of their mooring now routinely strike neighbouring vessels at low water.',
  },
  {
    kind: 'para',
    text: 'On March 12, 2026, the Department published a proposed rule (51 CR 10422) that would have set maximum mooring lengths by harbor, required inspection of ground tackle every two years, and moved the waiting lists online. The comment period closed on May 11, 2026.',
  },
  { kind: 'section', text: 'II. Discussion of Comments' },
  {
    kind: 'para',
    text: 'The Department received 236 comments from individual boat owners, yacht clubs, two municipal harbor committees and one marine insurer. The principal issues raised are discussed below.',
  },
  {
    kind: 'reg',
    lead: '1.',
    text: 'Maximum length. Many commenters objected that a separate limit for each harbor would be hard to follow for owners who move between harbors during the season. The Department agrees and has instead adopted a single limit for each of the three harbor classes in § 214.12(b).',
  },
  {
    kind: 'reg',
    lead: '2.',
    text: 'Inspection interval. The insurer and both harbor committees urged annual rather than biennial inspection, citing the winter storms of 2024 and 2025, in which most failed moorings had not been inspected for more than eighteen months. The final rule requires annual inspection.',
  },
  {
    kind: 'reg',
    lead: '3.',
    text: 'Waiting lists. Several commenters asked that applicants already on a paper list keep their place. The final rule carries existing places over to the electronic list in the order of the original application date.',
  },
  { kind: 'section', text: 'III. Regulatory Analyses' },
  {
    kind: 'para',
    text: 'This rule is not a significant regulatory action. The Department estimates that annual inspection will cost a permit holder between $90 and $160 a year, depending on depth, and that the electronic list will save harbor offices about 1,100 staff hours a year. The rule imposes no new reporting burden beyond the inspection certificate described in § 214.12(c).',
  },
  { kind: 'para', text: 'For the reasons stated in the preamble, the Department amends 14 CCR part 214 as follows:' },
  { kind: 'section', text: '§ 214.12 Permit conditions.' },
  {
    kind: 'reg',
    lead: '(a)',
    text: 'General. A mooring permit authorizes one vessel to occupy one mooring at the location stated on the permit. The permit may not be transferred, sublet or used for a vessel other than the one named on it.',
  },
  {
    kind: 'reg',
    lead: '(b)',
    text: 'Maximum length. The overall length of the permitted vessel may not exceed—',
  },
  { kind: 'reg', depth: 1, lead: '(1)', text: 'In a Class A harbor, 12 meters;' },
  { kind: 'reg', depth: 1, lead: '(2)', text: 'In a Class B harbor, 15 meters; and' },
  {
    kind: 'reg',
    depth: 1,
    lead: '(3)',
    text: 'In a Class C harbor, 20 meters, unless the harbor master approves a longer vessel for a mooring at the outer edge of the field.',
  },
  {
    kind: 'reg',
    lead: '(c)',
    text: 'Inspection. (1) The permit holder must have the mooring inspected once in each calendar year by a diver or service company registered with the harbor office. The inspection must—',
  },
  {
    kind: 'reg',
    depth: 2,
    lead: '(i)',
    text: 'Examine the anchor, chain, shackles and pennant along their full length;',
  },
  {
    kind: 'reg',
    depth: 2,
    lead: '(ii)',
    text: 'Replace any chain whose links have lost more than one-third of their original diameter; and',
  },
  {
    kind: 'reg',
    depth: 2,
    lead: '(iii)',
    text: 'Record the condition of each component on the certificate form issued by the harbor office.',
  },
  {
    kind: 'reg',
    depth: 1,
    lead: '(2)',
    text: 'The permit holder must file the inspection certificate with the harbor office by June 1 of each year. A permit for which no certificate is filed by that date is suspended until one is filed.',
  },
  {
    kind: 'reg',
    lead: '(d)',
    text: 'Waiting list. Each harbor office maintains one electronic waiting list for the harbor. Applicants are offered a vacant mooring in the order of their application date, and an applicant who declines two offers in one season moves to the end of the list.',
  },
  { kind: 'signature', text: 'Dated: October 28, 2026.' },
  { kind: 'signature', text: 'Rafael Quintero-Haas,' },
  { kind: 'signatureTitle', text: 'Director, Office of Harbor Management.' },
  { kind: 'signature', text: '[FR Doc. 2026–24117 Filed 11–4–26; 8:45 am]' },
  { kind: 'billing', text: 'BILLING CODE 4410–22–P' },
  { kind: 'agency', text: 'DEPARTMENT OF FISHERIES AND WILDLIFE' },
  { kind: 'agency', text: '16 CCR Part 631' },
  { kind: 'agency', text: '[Docket No. DFW–2026–0388]' },
  { kind: 'title', text: 'Temporary Closure of the Northern Shellfish Beds to Recreational Harvest' },
  { kind: 'plain', lead: 'AGENCY:', text: 'Department of Fisheries and Wildlife (DFW).' },
  { kind: 'plain', lead: 'ACTION:', text: 'Temporary rule; closure.' },
  {
    kind: 'plain',
    lead: 'SUMMARY:',
    text: 'The Department is closing the Northern Shellfish Beds to recreational harvest of clams and oysters because routine sampling found paralytic shellfish toxin above the action level. The closure protects public health and will remain in place until two consecutive weekly samples fall below that level.',
  },
  {
    kind: 'plain',
    lead: 'DATES:',
    text: 'Effective 12:01 a.m. on November 6, 2026, until the Department announces the reopening.',
  },
  {
    kind: 'plain',
    lead: 'FOR FURTHER INFORMATION CONTACT:',
    text: 'Anselm Grieve, Shellfish Sanitation Program, telephone 555–0178.',
  },
  { kind: 'caption', text: 'SUPPLEMENTARY INFORMATION:' },
  {
    kind: 'para',
    text: 'Samples taken on October 27 and November 2, 2026, at stations N–4 and N–7 contained paralytic shellfish toxin at 112 and 146 micrograms per 100 grams of tissue. The action level is 80 micrograms per 100 grams. Commercial harvest in the same beds was closed by the Department of Health on November 3, 2026.',
  },
  {
    kind: 'para',
    text: 'Because the toxin poses an immediate risk to people who eat shellfish from the beds, the Department finds good cause to waive prior notice and comment and to make this rule effective less than 30 days after publication.',
  },
  { kind: 'section', text: '§ 631.40 Northern Shellfish Beds closure.' },
  {
    kind: 'reg',
    lead: '(a)',
    text: 'Closed area. The Northern Shellfish Beds are the intertidal and subtidal waters north of a line from Gannet Point light to the south end of Mire Island, including all of Tern Cove.',
  },
  { kind: 'reg', lead: '(b)', text: 'Prohibition. While this section is in effect, no person may—' },
  { kind: 'reg', depth: 1, lead: '(1)', text: 'Take or possess clams or oysters from the closed area; or' },
  { kind: 'reg', depth: 1, lead: '(2)', text: 'Land clams or oysters taken from the closed area at any port.' },
  {
    kind: 'reg',
    lead: '(c)',
    text: 'Reopening. The Department will reopen the area by notice when two consecutive weekly samples from every station are below 80 micrograms per 100 grams.',
  },
];

export const meta = {
  title: 'Government register page in three columns',
  stresses:
    'three dense justified columns; run-in bold captions; numbered paragraphs with indented first lines; a section heading in one column; rotated print-production line in the margin; running head with date and page number',
  status: 'ok',
  issue: 242,
  families: ['reading-order', 'structure'],
};

const plainBlock = (b) => {
  const pad = b.kind === 'reg' ? '  '.repeat(b.depth ?? 0) : '';
  if (['title', 'section', 'caption'].includes(b.kind)) return `**${b.text}**`;
  return `${pad}${b.lead ? `${b.lead} ` : ''}${b.text}`.trimEnd();
};

export const truth = `
Running head: \`${HEAD.left}\` — page **${HEAD.page}**.

Reading order is column 1, column 2, column 3, each top to bottom. The rotated line up the left
margin (\`${MARGIN_STAMP}\`) and the foot line (\`${MARGIN_LINE}\`) are print-production marks:
they belong to no paragraph and must not be spliced into the body.

${BLOCKS.map(plainBlock).join('\n\n')}

## Questions an agent should be able to answer

1. When does the rule take effect? — ${BLOCKS.find((b) => b.lead === 'DATES:')
  .text.split('. ')[0]
  .replace('This rule is effective ', '')}
2. What is the maximum vessel length in a Class B harbor under § 214.12(b)(2)? — 15 meters
3. What must the annual inspection do with worn chain under § 214.12(c)(1)(ii)? — Replace any chain whose links have lost more than one-third of their original diameter
4. By what date must the inspection certificate be filed, and what happens if it is not? — June 1 of each year; the permit is suspended until a certificate is filed
5. How many comments did the Department receive, and on which page and date does this text appear? — 236 comments; page ${HEAD.page}, Thursday, November 5, 2026
6. What toxin levels led to the shellfish closure, and what is the action level? — 112 and 146 micrograms per 100 grams at stations N–4 and N–7; the action level is 80 micrograms per 100 grams

Every answer is present in \`read.md\` as contiguous text within its column: lines stay in their
column although the three columns sit on separate baselines with 12 pt gutters, each indented first line
stays with its paragraph, the toxin sentence of question 6 reads in one piece, and the rotated
margin stamp is read after the body instead of inside a paragraph (#273).

No layout table is reported: the 14 × 5 "table" of prose lines from all three columns (#242)
was the three text columns read across, with one more boundary of its own where a justified line
is cut at its wide word spaces; most of its rows hold running text on both sides of a column
gutter, so it is dropped.

The columns are read one after another, each top to bottom (#274). The justified contact line
\`telephone 555–0142, email\` is set with word spaces of about 35 pt and cut at them; its pieces
used to end the column run, so the columns were read segment by segment. Now \`email\` is put
back after \`555–0142,\` and the line reads \`telephone\` / \`555–0142, email\` in its place, so
column 1 runs to \`…The final rule requires annual\` and column 2 continues with \`inspection.\`

**Known gap (no issue yet):**
- The running head is emitted page number first (\`48216\`, then the date line), which is harmless.
`;

const COLS = [42, 222, 402];
const COL_W = 168;
const TOP = 70;
const BOTTOM = 742;
const SIZE = 8.5;
const LEADING = 9.6;

function blocks() {
  return BLOCKS.map((b) => {
    const base = { font: T, size: SIZE, leading: LEADING, justify: true };
    switch (b.kind) {
      case 'agency':
        return { ...base, text: b.text, font: TB, justify: false, gapAfter: 0 };
      case 'title':
        return { ...base, text: b.text, font: TB, size: 10, leading: 11.5, justify: false, gapBefore: 4, gapAfter: 5 };
      case 'billing':
        return { ...base, text: b.text, font: TB, size: 7, justify: false, gapBefore: 3, gapAfter: 8 };
      case 'caption':
        return { ...base, text: b.text, font: TB, justify: false, gapBefore: 3 };
      case 'section':
        return { ...base, text: b.text, font: TB, justify: false, gapBefore: 4, gapAfter: 1 };
      case 'plain':
        return { ...base, text: b.text || '', lead: { text: b.lead, font: TB }, gapBefore: 3 };
      case 'para':
        return { ...base, text: b.text, indent: 8 };
      case 'reg':
        return { ...base, text: b.text, indent: 8, lead: { text: b.lead, font: b.lead.startsWith('(') ? T : TB } };
      case 'signature':
        return { ...base, text: b.text, indent: 8, justify: false, gapBefore: 2 };
      case 'signatureTitle':
        return { ...base, text: b.text, font: TI, indent: 8, justify: false };
      default:
        throw new Error(`unknown block ${b.kind}`);
    }
  });
}

export function draw(doc, h) {
  // Running head and heavy rule.
  h.text(HEAD.left, COLS[0], 44, { font: H, size: 7.5 });
  h.text(HEAD.page, COLS[2] + COL_W, 43, { font: 'Helvetica-Bold', size: 8.5, align: 'right' });
  h.rule(COLS[0], 56, COLS[2] + COL_W, { width: 2 });

  const regions = COLS.map((x) => ({ x, top: TOP, bottom: BOTTOM, width: COL_W }));
  for (const p of flowColumns(doc, blocks(), regions)) drawPlacement(doc, p);

  // Print-production marks: one rotated up the left margin, one along the foot.
  doc.save();
  doc.rotate(-90, { origin: [20, 470] });
  doc.fillColor('#555');
  h.text(MARGIN_STAMP, 20, 467, { font: H, size: 6.5, align: 'center' });
  doc.restore();
  doc.fillColor('#555');
  h.text(MARGIN_LINE, 306, 764, { font: H, size: 5.5, align: 'center' });
  doc.fillColor('black');
}
