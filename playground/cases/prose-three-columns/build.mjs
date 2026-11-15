// Three columns of running instructions prose in the style of the IRS Form
// 1040 instructions: small sans text, run-in bold headings, and sentences
// that end in form numbers and years. Each paragraph's last line is often
// just `2026.` or `5329.`, and the wording is tuned so those lone numbers
// share a baseline across columns, as they do on the real pages.

const HEADING = 'Line 4a and 4b — IRA Distributions';
const COLUMNS = [
  [
    {
      lead: 'Exception 1.',
      text: 'Do not include in line 4b any amount you rolled over to another traditional IRA within 60 days, unless the rollover was made after the deadline for 2026.',
    },
    {
      lead: 'Exception 2.',
      text: 'If you converted part or all of a traditional IRA to a Roth IRA in 2025, enter the amount converted on line 4a and also report it on your own Form 8606.',
    },
    {
      lead: 'Exception 3.',
      text: 'A qualified charitable distribution is not taxable. Enter QCD next to line 4b and keep the statement from the trustee with your records for 2026.',
    },
  ],
  [
    {
      lead: 'More than one exception.',
      text: 'If more than one exception applies, attach a statement showing the amount of each exception instead of making an entry next to line 4b; see also your Form 5329.',
    },
    {
      lead: 'Basis.',
      text: 'If you made nondeductible contributions to any IRA, your basis is figured on the worksheet and the result is carried to line 13 of your separate Form 8606.',
    },
    {
      lead: 'Additional tax.',
      text: 'You may have to pay an additional tax if you received an early distribution and the total is more than your basis; see the instructions for Form 5329.',
    },
  ],
  [
    {
      lead: 'Required minimum.',
      text: 'If you were born before 1951 you must take a minimum distribution each year; a shortfall in any one year is reported in Part IX of Form 5329.',
    },
    {
      lead: 'Disaster relief.',
      text: 'Distributions made because of a federally declared disaster may be spread over three years; report the first part on Form 8915-F filed for 2026.',
    },
    {
      lead: 'Repayments.',
      text: 'Amounts you repay within three years are treated as a rollover and reduce the taxable amount reported on line 4b of your return for 2025 and for 2026.',
    },
  ],
];

export const meta = {
  title: 'Three-column instructions prose',
  stresses: 'multi-column running prose whose lines end in years and form numbers; no table on the page',
  status: 'known-gap',
  issue: 242,
};

const plain = (paragraph) => `${paragraph.lead} ${paragraph.text}`;

export const truth = `
A heading over three columns of prose. There is **no table** on this page: a
correct reading reports no layout table and reads the columns top to bottom,
left column first. Numbers such as \`2026.\` and \`5329.\` end sentences; they are
not values.

**${HEADING}**

${COLUMNS.map((column, i) => `_Column ${i + 1}_\n\n${column.map(plain).join('\n\n')}`).join('\n\n')}

**Known gap (#242):** the body text is read correctly, column by column, but a
3-column layout table is also reported, one row per baseline across the three
columns (\`| 2026. | next to line 4b; see also your Form 5329. | 5329. |\`), with
some prose lines missing from it, and no warning marks it as unreliable.
`;

const TOP = 72;
const LEFT = 54;
const GUTTER = 18;
const COLUMN_WIDTH = (612 - 2 * LEFT - 2 * GUTTER) / 3;
const SIZE = 8.5;
const LEADING = 10.5;

/**
 * Greedy word wrap so every column shares one baseline grid. The first line
 * starts with the bold lead-in, which is wider than the same words in the
 * regular face, so that line gets correspondingly less room.
 */
function wrap(doc, paragraph, width) {
  doc.font('Helvetica-Bold').fontSize(SIZE);
  const leadBold = doc.widthOfString(paragraph.lead);
  doc.font('Helvetica').fontSize(SIZE);
  const leadExtra = leadBold - doc.widthOfString(paragraph.lead);
  const lines = [];
  let current = '';
  for (const word of plain(paragraph).split(' ')) {
    const candidate = current ? `${current} ${word}` : word;
    const room = lines.length === 0 ? width - leadExtra : width;
    if (current && doc.widthOfString(candidate) > room) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function draw(doc, h) {
  h.text(HEADING, LEFT, TOP, { font: 'Helvetica-Bold', size: 11 });
  COLUMNS.forEach((column, c) => {
    const x = LEFT + c * (COLUMN_WIDTH + GUTTER);
    let y = TOP + 24;
    for (const paragraph of column) {
      const lines = wrap(doc, paragraph, COLUMN_WIDTH);
      lines.forEach((line, i) => {
        if (i === 0) {
          const lead = h.text(paragraph.lead, x, y, { font: 'Helvetica-Bold', size: SIZE });
          h.text(line.slice(paragraph.lead.length), lead.right, y, { size: SIZE });
        } else {
          h.text(line, x, y, { size: SIZE });
        }
        y += LEADING;
      });
      y += LEADING;
    }
  });
}
