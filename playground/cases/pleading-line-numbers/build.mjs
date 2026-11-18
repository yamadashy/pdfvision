// A motion on US pleading paper: numbers 1–28 down the left margin beside a
// double rule, a single rule at the right, the attorney's block in the top
// lines, the court's name centred, a caption box whose parties and case
// number are separated by a column of ")" characters, double-spaced body
// text set on the numbered lines, and a footer under a rule with the
// document's short title and page number. Two pages; the numbering restarts
// on each page. The line numbers belong to the paper (a form template), so
// the producer writes all of them before the text.

const W = 612;
const TOP = 72;
const PITCH = 24;
const LINES = 28;
const NUM_X = 48;
const TEXT_X = 90;
const RIGHT = 548;
const F = 'Times-Roman';
const FB = 'Times-Bold';

const ATTORNEY = [
  'Lena M. Okafor (SBN 318442)',
  'lokafor@okaforvance.example',
  'OKAFOR & VANCE LLP',
  '2150 Quarry Street, Suite 400',
  'Ravenmoor, Calisota 94310',
  'Telephone: (510) 555-0147',
  'Attorneys for Plaintiff',
  'MARLOWE BAKERY COOPERATIVE',
];
const COURT = ['SUPERIOR COURT OF THE STATE OF CALISOTA', 'COUNTY OF RAVENMOOR'];
const PARTIES_LEFT = [
  'MARLOWE BAKERY COOPERATIVE, a',
  'Calisota cooperative corporation,',
  '',
  '                    Plaintiff,',
  '          v.',
  '',
  'TIDEWATER OVENS, INC., a Delaware',
  'corporation; and DOES 1 through 20,',
  '',
  '                    Defendants.',
];
const PARTIES_RIGHT = [
  'Case No. RV-26-CV-01844',
  '',
  'NOTICE OF MOTION AND MOTION',
  'TO COMPEL FURTHER PRODUCTION',
  'OF DOCUMENTS; REQUEST FOR',
  'SANCTIONS',
  'Date:    January 14, 2027',
  'Time:    9:00 a.m.',
  'Dept.:   12',
  'Judge:   Hon. Teresa Alvarado-Kim',
];
const BODY_1 = [
  'TO DEFENDANT AND ITS ATTORNEYS OF RECORD:',
  '     PLEASE TAKE NOTICE that on January 14, 2027, at 9:00 a.m., or as soon',
  'thereafter as the matter may be heard, in Department 12 of the above-entitled',
  'court, Plaintiff Marlowe Bakery Cooperative will and hereby does move for an',
];
const BODY_2 = [
  'order compelling Defendant Tidewater Ovens, Inc. to produce, within 20 days,',
  'all documents responsive to Requests for Production Nos. 4 through 11, including',
  'the service logs for the twelve deck ovens delivered in March 2025.',
  '     The motion is made on the ground that Defendant’s written responses served',
  'on September 30, 2026 assert only boilerplate objections, and that Defendant has',
  'produced 214 pages out of an estimated 3,000. Plaintiff further requests monetary',
  'sanctions of $4,850 against Defendant and its counsel, jointly and severally.',
  '     The motion is based on this notice, the memorandum of points and authorities,',
  'the declaration of Lena M. Okafor and the separate statement filed herewith, the',
  'records on file in this action, and any argument presented at the hearing.',
  '',
  'Dated: November 18, 2026                OKAFOR & VANCE LLP',
  '',
  '                                                  By: /s/ Lena M. Okafor',
  '                                                  Lena M. Okafor',
  '                                                  Attorneys for Plaintiff',
];
const FOOTER = 'NOTICE OF MOTION AND MOTION TO COMPEL FURTHER PRODUCTION';
const BODY_START = 15;
const BODY = [...BODY_1, ...BODY_2];
const ON_FIRST_PAGE = LINES - BODY_START + 1;
const citeOf = (index) => (index < ON_FIRST_PAGE ? `1:${BODY_START + index}` : `2:${index - ON_FIRST_PAGE + 1}`);
const SANCTIONS_CITE = citeOf(BODY.findIndex((line) => line.startsWith('sanctions of')));

export const meta = {
  title: 'Court motion on pleading paper with line numbers',
  stresses:
    'numbers 1–28 in the left margin of every page, written before the text; double and single margin rules; attorney block on the first lines; caption box with a column of ")" between the parties and the case number; double-spaced body set on the numbered lines; footer title under a rule',
  status: 'known-gap',
  families: ['structure', 'reading-order', 'tables'],
};

export const truth = `
Two Letter pages of pleading paper. The margin numbers 1–${LINES} on each page are line references, not
content: a good reading drops them or keeps them apart from the text, and must never glue them into
sentences or amounts. Each page ends with the footer \`${FOOTER}\` and its page number.

Page 1, top lines: the attorney block — ${ATTORNEY.join(' / ')}.
Then the court: ${COURT.join(', ')}.

Caption box: on the left the parties — *Marlowe Bakery Cooperative, a Calisota cooperative
corporation, Plaintiff, v. Tidewater Ovens, Inc., a Delaware corporation; and Does 1 through 20,
Defendants*; on the right, after the column of ")": ${PARTIES_RIGHT.filter(Boolean).join(' / ')}.

Body (pages 1–2, in order):

> ${[...BODY_1, ...BODY_2]
  .filter((l) => l.trim() && !l.includes('/s/') && !/^ {20,}/u.test(l) && !l.startsWith('Dated'))
  .map((l) => l.trim())
  .join(' ')}

Signed: Dated November 18, 2026, Okafor & Vance LLP, by /s/ Lena M. Okafor, Attorneys for Plaintiff.

## Questions an agent should be able to answer

1. What is the case number, and who is the defendant? — RV-26-CV-01844; Tidewater Ovens, Inc. (and Does 1 through 20)
2. When, where and before whom is the motion heard? — January 14, 2027 at 9:00 a.m., Department 12, Hon. Teresa Alvarado-Kim
3. What is the plaintiff's attorney's State Bar number? — 318442
4. How much in sanctions is requested? — $4,850, against the defendant and its counsel jointly and severally
5. How many pages has the defendant produced, out of how many? — 214 pages out of an estimated 3,000
6. Cite, as page:line, the line that states the sanctions amount, and the line where the hearing notice begins. — ${SANCTIONS_CITE} (\`sanctions of $4,850 …\`); ${citeOf(BODY.findIndex((line) => line.includes('PLEASE TAKE NOTICE')))} (\`PLEASE TAKE NOTICE …\`)

Questions 1–5 are answerable from \`read.md\`.

**Known gap (no issue yet):** the margin numbers are emitted as lines of their own in among the text,
in runs whose position does not follow the line they number, and nothing marks them as line
references. On page 1 the numbers \`10\` … \`17\` come out as one run before \`v.\` and the start of
the body, so \`PLEASE TAKE NOTICE …\` (line 16) and \`thereafter as …\` (17) have no number near
them; \`21\` / \`22\` and \`25\` / \`26\` come out as pairs before two text lines, so the nearest preceding
number gives 1:26 for \`sanctions of $4,850 …\` (line 25) in question 6. Pleadings are cited by page and line, so this
is the reading an agent would quote. The caption box also splits the body: the right half of the
caption (\`) NOTICE OF MOTION …\` / \`) Judge: …\`) and the party roles \`Plaintiff,\` / \`Defendants.\`
are emitted between \`… or as soon\` and \`thereafter as the matter may be heard …\`, and the court's
two lines come out in reverse order (\`COUNTY OF RAVENMOOR\` before \`SUPERIOR COURT …\`). On page 2
the numbers 3–28 are one run between \`Dated: November 18, 2026\` and the firm name that shares its
line; the only warning is a \`reading_order_divergence\` naming that run.
`;

const lineY = (n) => TOP + (n - 1) * PITCH;

function paper(doc, h, pageNumber) {
  // Form template first: rules and every margin number.
  doc.lineWidth(0.6).strokeColor('black');
  doc.moveTo(72, 0).lineTo(72, 792).stroke();
  doc.moveTo(75, 0).lineTo(75, 792).stroke();
  doc
    .moveTo(RIGHT + 8, 0)
    .lineTo(RIGHT + 8, 792)
    .stroke();
  for (let n = 1; n <= LINES; n++) h.text(String(n), NUM_X + 12, lineY(n), { font: F, size: 12, align: 'right' });
  doc.moveTo(TEXT_X, 752).lineTo(RIGHT, 752).stroke();
  h.text(FOOTER, W / 2 + 10, 758, { font: F, size: 8.5, align: 'center' });
  h.text(`- ${pageNumber} -`, W / 2 + 10, 744 - 14, { font: F, size: 10, align: 'center' });
}

export function draw(doc, h) {
  paper(doc, h, 1);
  // Attorney block: single-spaced against the numbered lines, as real pleadings set it.
  ATTORNEY.forEach((line, i) => {
    h.text(line, TEXT_X, TOP + i * 12, { font: F, size: 12 });
  });
  COURT.forEach((line, i) => {
    h.text(line, W / 2 + 10, lineY(7) + i * PITCH, { font: FB, size: 12, align: 'center' });
  });

  const captionTop = lineY(9);
  PARTIES_LEFT.forEach((line, i) => {
    if (line) h.text(line, TEXT_X, captionTop + i * 12, { font: F, size: 12 });
  });
  for (let i = 0; i < PARTIES_LEFT.length; i++) h.text(')', 316, captionTop + i * 12, { font: F, size: 12 });
  doc
    .moveTo(TEXT_X, captionTop + PARTIES_LEFT.length * 12 + 2)
    .lineTo(318, captionTop + PARTIES_LEFT.length * 12 + 2)
    .stroke();
  PARTIES_RIGHT.forEach((line, i) => {
    if (line) h.text(line, 330, captionTop + i * 12, { font: i >= 2 && i <= 5 ? FB : F, size: 12 });
  });

  // Double-spaced body: one text line on each numbered line.
  BODY.slice(0, ON_FIRST_PAGE).forEach((line, i) => {
    if (line) h.text(line, TEXT_X, lineY(BODY_START + i) + 2, { font: F, size: 12 });
  });

  h.newPage();
  paper(doc, h, 2);
  BODY.slice(ON_FIRST_PAGE).forEach((line, i) => {
    if (line) h.text(line, TEXT_X, lineY(1 + i) + 2, { font: F, size: 12 });
  });
}
