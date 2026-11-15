// A results page from an older journal article, as 3B2/Arbortext-era
// toolchains set it: Times for the text, and every mathematical sign (minus,
// <, >, ±, ×, =) taken from a separate symbol font. That font's ToUnicode
// CMap maps the signs to the wrong characters, as those publishers' fonts
// did: the page renders correctly, but `−52%` extracts as `252%` and
// `<0.001` as `,0.001`. The symbol font is the only Noto Sans JP text on the
// page, so `postprocess` can rewrite its CMap without touching anything else.

import { rewriteToUnicode } from '../../lib/pdfBytes.mjs';

const T = 'Times-Roman';
const TB = 'Times-Bold';
const TI = 'Times-Italic';
const SYM = 'NotoSansJP';
const SIGNS = /([−<>±×=])/u;
// What each sign's ToUnicode entry claims it is. The pattern follows the
// survey's evidence: − → 2, < → ',', > → '.', + → þ, = → ¼.
const LIES = { '−': '2', '<': ',', '>': '.', '±': 'þ', '×': '3', '=': '¼' };

const JOURNAL = 'Journal of Community Health Outcomes';
const RUNNING = 'Nurse-Led Remote Monitoring in Type 2 Diabetes';
const ISSUE = 'Vol. 14, No. 6 · June 2009';
const PAGE = '419';
const ARMS = [
  { name: 'Remote monitoring', n: 412 },
  { name: 'Usual care', n: 398 },
];

// value cells: [intervention, control, change, p]
const ROWS = [
  { label: 'HbA1c at 12 months, %', values: ['7.1 ± 0.9', '7.6 ± 1.1', '−0.5', '<0.001'] },
  { label: 'Systolic BP, mmHg', values: ['131 ± 14', '134 ± 15', '−3', '0.03'] },
  { label: 'Weight change, kg', values: ['−2.4 ± 3.1', '+0.3 ± 2.8', '−2.7', '0.004'] },
  { label: 'Hospital admissions, n (%)', values: ['38 (9%)', '79 (20%)', '−52%', '<0.001'] },
  { label: 'Emergency visits, n (%)', values: ['61 (15%)', '64 (16%)', '−2%', '0.91'] },
  { label: 'Adverse events, n (%)', values: ['22 (5%)', '19 (5%)', '+11%', '0.62'] },
  { label: 'Sites with >25 patients, n (%)', values: ['9 (64%)', '8 (57%)', '+7%', '0.71'] },
];
const COLUMNS = [`${ARMS[0].name} (n = ${ARMS[0].n})`, `${ARMS[1].name} (n = ${ARMS[1].n})`, 'Change', 'p'];
const TABLE_TITLE = 'Table 2. Primary and secondary outcomes at 12 months.';
const TABLE_NOTE =
  'Values are mean ± SD or n (%). Change is the difference in means, or the relative change in proportions. ' +
  'Insulin doses were titrated in steps of 2 × 2 IU. BP, blood pressure.';

const PARAGRAPHS_BEFORE = [
  'Of 1,024 patients screened, 810 were randomised (Fig 1): 412 to remote monitoring and 398 to usual care. ' +
    'Baseline characteristics were balanced between arms (Table 1); mean age was 61.3 ± 9.8 years and mean ' +
    'diabetes duration 8.2 ± 5.1 years.',
  'At 12 months, HbA1c was lower in the remote-monitoring arm (difference −0.5 percentage points, 95% CI −0.7 ' +
    'to −0.3; p < 0.001; Table 2). Hospital admissions fell by 52% relative to usual care (−52%, p < 0.001), ' +
    'whereas emergency visits were essentially unchanged (−2%, p = 0.91).',
];
const PARAGRAPHS_AFTER = [
  'The effect on HbA1c was consistent across sites with >25 patients and smaller sites (interaction p = 0.48). ' +
    'Adverse events did not differ between arms (+11%, p = 0.62); no event was judged related to the intervention.',
  'In a per-protocol analysis restricted to patients who transmitted readings on >80% of days (n = 351), the HbA1c ' +
    'difference was −0.6 percentage points (p < 0.001).',
];

export const meta = {
  title: 'Results page whose symbol font maps signs to the wrong characters',
  stresses:
    'minus, <, >, ±, × and = set in a symbol font whose ToUnicode CMap lies; signs inside prose and in an effect-size table with p-values',
  families: ['encoding', 'tables'],
  status: 'known-gap',
  compress: false,
};

const lie = (text) => [...text].map((ch) => LIES[ch] ?? ch).join('');

export const truth = `
Page ${PAGE} of *${JOURNAL}* (${ISSUE}), running head “${RUNNING}”. A **Results** section:
two paragraphs, ${TABLE_TITLE.split('.')[0]}, two more paragraphs.

Every sign on the page (−, <, >, ±, ×, =) is drawn from a separate symbol font whose
ToUnicode map says something else (${Object.entries(LIES)
  .map(([sign, claim]) => `\`${sign}\` → \`${claim}\``)
  .join(', ')}). The page shows the signs correctly; a correct reading reports
what the page shows, or at least flags that the signs cannot be trusted.

${PARAGRAPHS_BEFORE.join('\n\n')}

**${TABLE_TITLE}**

| Outcome | ${COLUMNS.join(' | ')} |
| --- | ---: | ---: | ---: | ---: |
${ROWS.map((row) => `| ${row.label} | ${row.values.join(' | ')} |`).join('\n')}

${TABLE_NOTE}

${PARAGRAPHS_AFTER.join('\n\n')}

## Questions an agent should be able to answer

1. How did hospital admissions change with remote monitoring, and was it significant? — They fell by 52% (−52%), p < 0.001
2. What was mean HbA1c at 12 months in each arm? — ${ROWS[0].values[0]}% with remote monitoring, ${ROWS[0].values[1]}% with usual care
3. How many patients were randomised to usual care? — ${ARMS[1].n}
4. Did weight go up or down in the remote-monitoring arm? — Down: ${ROWS[2].values[0]} kg (usual care ${ROWS[2].values[1]} kg)
5. Which outcomes reached p < 0.001? — HbA1c and hospital admissions

How the lies read when taken at face value: \`${lie('−52%')}\` for −52%, \`${lie('<0.001')}\` for <0.001,
\`${lie('7.1 ± 0.9')}\` for 7.1 ± 0.9, \`${lie('(n = 398)')}\` for (n = 398), \`${lie('−2.4')}\` for −2.4.

**Known gap (no issue yet):** \`read.md\` reports every sign as its CMap claims, and no warning
mentions the font. The prose reads \`Hospital admissions fell by 52% relative to usual care (252%, p , 0.001)\`
and \`emergency visits were essentially unchanged (22%, p 1⁄4 0.91)\`; the table row reads
\`| Hospital admissions, n (%) | 38 (9%) | 79 (20%) | 252% | ,0.001 |\`. So question 1 gets “252%”
(an increase), question 4 gets \`22.4 þ 3.1\`, and “<” and “>” become \`,\` and \`.\`
(\`Sites with .25 patients\`). Questions 3 and 5 survive only by reading \`,0.001\` as “<0.001”.
\`=\` comes out as \`1⁄4\` (¼ after normalisation), exactly the survey's \`z 1⁄4 0.09\`.

The table also carries \`layout_table_uncertain\` — its first three rows lose their label and
first value (\`|  |  | 7.6 þ 1.1 | 20.5 | ,0.001 |\`) — and says to render the table region,
which would happen to show the true signs there; nothing covers the prose, which is where
question 1 is usually answered.
`;

const LEFT = 72;
const RIGHT = 540;
const SIZE = 10;
const LEAD = 13.4;

/** Split text into Times / symbol-font segments for helpers.run(). */
const segments = (text, font) =>
  text
    .split(SIGNS)
    .filter(Boolean)
    .map((part) => (SIGNS.test(part) ? { text: part, font: SYM } : { text: part, font }));

function widthOf(doc, text, font, size) {
  return segments(text, font).reduce((sum, seg) => sum + doc.font(seg.font).fontSize(size).widthOfString(seg.text), 0);
}

/** Greedy left-aligned wrap over mixed-font words; returns the y below. */
function prose(doc, h, text, y, { indent = 18 } = {}) {
  const words = text.split(' ');
  let line = '';
  let first = true;
  const flush = () => {
    h.run(segments(line, T), LEFT + (first ? indent : 0), y, { font: T, size: SIZE });
    y += LEAD;
    first = false;
  };
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    const room = RIGHT - LEFT - (first ? indent : 0);
    if (line && widthOf(doc, next, T, SIZE) > room) {
      flush();
      line = word;
    } else line = next;
  }
  flush();
  return y + 4;
}

function cell(doc, h, text, right, y, font, size) {
  h.run(segments(text, font), right - widthOf(doc, text, font, size), y, { font, size });
}

function table(doc, h, y) {
  h.text(TABLE_TITLE, LEFT, y, { font: TB, size: 9.5 });
  y += 16;
  h.rule(LEFT, y, RIGHT, { width: 0.8 });
  y += 5;
  const rights = [356, 446, 494, RIGHT];
  // Arm headers wrap onto two lines: name, then (n = …).
  COLUMNS.forEach((name, i) => {
    const match = /^(.*) (\(n = \d+\))$/u.exec(name);
    if (match) {
      cell(doc, h, match[1], rights[i], y, TB, 8.5);
      cell(doc, h, match[2], rights[i], y + 10.5, T, 8.5);
    } else cell(doc, h, name, rights[i], y + 10.5, name === 'p' ? TI : TB, 8.5);
  });
  h.text('Outcome', LEFT, y + 10.5, { font: TB, size: 8.5 });
  y += 25;
  h.rule(LEFT, y, RIGHT, { width: 0.5 });
  y += 5;
  for (const row of ROWS) {
    h.run(segments(row.label, T), LEFT, y, { font: T, size: 9 });
    row.values.forEach((value, i) => {
      cell(doc, h, value, rights[i], y, T, 9);
    });
    y += 14;
  }
  h.rule(LEFT, y, RIGHT, { width: 0.8 });
  y += 6;
  const words = TABLE_NOTE.split(' ');
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && widthOf(doc, next, T, 8) > RIGHT - LEFT) {
      h.run(segments(line, T), LEFT, y, { font: T, size: 8 });
      y += 10;
      line = word;
    } else line = next;
  }
  h.run(segments(line, T), LEFT, y, { font: T, size: 8 });
  return y + 22;
}

export function draw(doc, h) {
  h.text(RUNNING, LEFT, 40, { font: TI, size: 8.5 });
  h.text(`${JOURNAL} · ${ISSUE}`, RIGHT, 40, { font: T, size: 8.5, align: 'right' });
  h.rule(LEFT, 53, RIGHT, { width: 0.4 });

  let y = 78;
  h.text('Results', LEFT, y, { font: TB, size: 12 });
  y += 20;
  h.text('Participants and primary outcome', LEFT, y, { font: TI, size: 10.5 });
  y += 17;
  for (const paragraph of PARAGRAPHS_BEFORE) y = prose(doc, h, paragraph, y);
  y = table(doc, h, y + 10);
  h.text('Secondary and sensitivity analyses', LEFT, y, { font: TI, size: 10.5 });
  y += 17;
  for (const paragraph of PARAGRAPHS_AFTER) y = prose(doc, h, paragraph, y);

  h.text(PAGE, 306, 748, { font: T, size: 9, align: 'center' });
}

export const postprocess = (bytes) => rewriteToUnicode(bytes, { font: 'NotoSansJP', replace: LIES });
