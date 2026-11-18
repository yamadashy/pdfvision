// A survey-paper page that is almost all one table, as LaTeX booktabs sets
// it: about fifty rows and six columns, no vertical rules, only top, mid and
// bottom rules plus a rule under each row-group label ("Open source",
// "Closed source"), citation markers in the model cells, `–` for unknown
// values, a check-mark/cross column set in a dingbat font (pifont-style),
// and a two-line header.

const T = 'Times-Roman';
const TB = 'Times-Bold';
const TI = 'Times-Italic';
const DING = 'ZapfDingbats';
// ZapfDingbats codes: '3' is a check mark (a19), '7' a ballot cross (a23), as pifont's \ding{51}/\ding{55}.
const CHECK = { yes: '3', no: '7' };

const RUNNING_HEAD = 'A SURVEY OF OPEN AND CLOSED LANGUAGE MODELS, 2022–2026';
const PAGE = '9';
const CAPTION =
  'TABLE 3: Statistics of the language models covered by this survey. “Params” is the largest released size; “–” means not disclosed. RLHF marks models whose release notes report reinforcement learning from human feedback.';
const HEAD = [
  ['Model', ''],
  ['Release', 'date'],
  ['Params', '(B)'],
  ['Pre-train', 'tokens'],
  ['Context', 'length'],
  ['RLHF', ''],
];
const GROUPS = [
  {
    label: 'Open source',
    rows: [
      'Corvid-7B|12|Feb-2023|7|1.0T|2k|no',
      'Corvid-65B|12|Feb-2023|65|1.4T|2k|no',
      'Heron-13B|15|Apr-2023|13|1.2T|4k|no',
      'Heron-70B|15|Jul-2023|70|2.0T|4k|yes',
      'Lumen-7B|18|May-2023|7|1.5T|2k|no',
      'Lumen-40B|18|Jun-2023|40|1.0T|2k|no',
      'Pika-3B|21|Mar-2023|3|0.8T|2k|no',
      'Pika-12B|21|Apr-2023|12|0.3T|2k|no',
      'Marten-176B|23|Nov-2022|176|0.4T|2k|no',
      'Galeo-30B|25|Jun-2023|30|1.0T|8k|no',
      'Tarn-7B|27|Sep-2023|7|2.0T|8k|no',
      'Tarn-8x7B|27|Dec-2023|47|2.0T|32k|no',
      'Sable-34B|30|Nov-2023|34|3.0T|4k|yes',
      'Quokka-1.8B|31|Jan-2024|1.8|2.2T|4k|no',
      'Quokka-72B|31|Feb-2024|72|3.0T|32k|yes',
      'Wren-2B|33|Feb-2024|2|2.0T|8k|no',
      'Wren-27B|33|Jun-2024|27|13T|8k|yes',
      'Heron-3-8B|35|Apr-2024|8|15T|8k|yes',
      'Heron-3-405B|35|Jul-2024|405|15.6T|128k|yes',
      'Ibis-16B|37|Mar-2024|16|12T|32k|no',
      'Kestrel-236B|39|May-2024|236|8.1T|128k|yes',
      'Kestrel-671B|39|Dec-2024|671|14.8T|128k|yes',
      'Murre-12B|41|Jul-2024|12|–|128k|no',
      'Quokka-2.5-32B|43|Sep-2024|32|18T|128k|yes',
      'Plover-14B|45|Dec-2024|14|9.8T|16k|no',
      'Tern-1B|47|Jan-2025|1.2|4T|8k|no',
      'Wren-3-27B|33|Mar-2025|27|14T|128k|yes',
    ],
  },
  {
    label: 'Closed source',
    rows: [
      'Atlas-1|50|Jun-2022|175|0.3T|2k|no',
      'Atlas-1.5|50|Nov-2022|–|–|4k|yes',
      'Atlas-2|51|Mar-2023|–|–|8k|yes',
      'Atlas-2 Turbo|51|Nov-2023|–|–|128k|yes',
      'Atlas-2o|52|May-2024|–|–|128k|yes',
      'Beacon-1|54|Mar-2023|–|–|9k|yes',
      'Beacon-2|54|Jul-2023|–|–|100k|yes',
      'Beacon-3 Opal|55|Mar-2024|–|–|200k|yes',
      'Beacon-3.5|55|Jun-2024|–|–|200k|yes',
      'Gemma-Pro|57|Dec-2023|–|–|32k|yes',
      'Gemma-Ultra|57|Feb-2024|–|–|1M|yes',
      'Gemma-Flash|58|May-2024|–|–|1M|yes',
      'Ernst-4|60|Oct-2023|–|–|8k|yes',
      'Pangolin-Σ|62|Mar-2023|1085|0.3T|2k|no',
      'Jurist-2|64|Mar-2023|178|–|8k|no',
      'Comet-R|66|Mar-2024|104|–|128k|yes',
      'Nimbus-Large|68|Feb-2024|–|–|32k|yes',
      'Nimbus-Large-2|68|Jul-2024|123|–|128k|yes',
      'Grebe-1|70|Nov-2023|314|–|8k|no',
      'Grebe-2|70|Aug-2024|–|–|128k|yes',
      'Yarrow-Lightning|72|Oct-2024|–|–|16k|yes',
      'Atlas-3|52|Feb-2025|–|–|128k|yes',
    ],
  },
];

const parse = (row) => {
  const [model, cite, release, params, tokens, context, rlhf] = row.split('|');
  return { model, cite, release, params, tokens, context, rlhf };
};

export const meta = {
  title: 'Survey page with one tall table',
  stresses:
    'about 50 rows × 6 columns with no vertical rules; row-group labels as spanning rows; citation markers in cells; dingbat check/cross column; two-line header',
  status: 'ok',
  families: ['tables', 'encoding'],
};

const allRows = GROUPS.flatMap((g) => g.rows.map((r) => ({ ...parse(r), group: g.label })));
const find = (name) => allRows.find((r) => r.model === name);

export const truth = `
${CAPTION}

One table, ${allRows.length} model rows in two groups, header \`Model | Release date | Params (B) |
Pre-train tokens | Context length | RLHF\`. The RLHF column is a check mark (✓, ZapfDingbats \`a19\`)
or a cross (✗, \`a23\`). Each group label is a spanning row that applies to every row under it.

| Group | Model | Release date | Params (B) | Pre-train tokens | Context length | RLHF |
| --- | --- | --- | ---: | ---: | ---: | :---: |
${allRows
  .map(
    (r) =>
      `| ${r.group} | ${r.model} [${r.cite}] | ${r.release} | ${r.params} | ${r.tokens} | ${r.context} | ${r.rlhf === 'yes' ? '✓' : '✗'} |`,
  )
  .join('\n')}

Running head: \`${RUNNING_HEAD}\`; page ${PAGE}.

## Questions an agent should be able to answer

1. What context length and how many pre-training tokens does ${find('Heron-3-405B').model} have? — ${find('Heron-3-405B').context}; ${find('Heron-3-405B').tokens}
2. Is ${find('Pangolin-Σ').model} open or closed source, and how many parameters does it have? — ${find('Pangolin-Σ').group}; ${find('Pangolin-Σ').params}B
3. Which open-source models released in 2023 report RLHF? — ${allRows
  .filter((r) => r.group === 'Open source' && r.release.endsWith('2023') && r.rlhf === 'yes')
  .map((r) => r.model)
  .join(', ')}
4. Which reference is cited for ${find('Kestrel-671B').model}, and when was it released? — [${find('Kestrel-671B').cite}], ${find('Kestrel-671B').release}
5. How many models in the table are closed source? — ${GROUPS[1].rows.length}

The layout table keeps every model row intact (${allRows.length} rows, each value under the right
column) under its two-line header joined per column (\`| Model | Release date | Params (B) | Pre-train tokens | Context length | RLHF |\`,
#294), with both group labels as rows of their own where they sit: \`Open source\` between the header
and the first row (it no longer cuts the header off), \`Closed source\` (centred in a rule band of its
own) right before \`Atlas-1 [50]\`. So all five questions are answered from the table: membership
and the closed-source count come from the group rows. The RLHF marks decode to ✓ and ✗
(\`| Heron-3-405B [35] | Jul-2024 | 405 | 15.6T | 128k | ✓ |\`, #275).

The page body reads both halves row by row, one line per model (\`Heron-70B [15] Jul-2023 70 2.0T 4k ✓\`,
#297), where the real page this re-creates read the open-source half column by column;
\`tabular_numeric_layout\` says rows and columns may be flattened in the native text, and the table
carries each value's column.
`;

const LEFT = 72;
const RIGHT = 540;
// Column anchors: model left-aligned, the rest centred on these x.
const X = { model: LEFT + 2, release: 218, params: 285, tokens: 350, context: 420, rlhf: 498 };
const SIZE = 8;
const PITCH = 11.2;

// pdfkit gives every standard font WinAnsiEncoding, which would make '3' read as
// "three"; the dingbat font names its glyphs instead, as TeX's pifont output
// does, so the codes map to a19 (✓) and a23 (✗).
function useBuiltinEncoding(doc, name) {
  doc.font(name);
  const font = doc._font;
  font.embed = function embed() {
    this.dictionary.data = {
      Type: 'Font',
      BaseFont: this.name,
      Subtype: 'Type1',
      Encoding: { Type: 'Encoding', Differences: [51, 'a19', 55, 'a23'] },
    };
    return this.dictionary.end();
  };
}

/** A dingbat centred on `cx`, its baseline on the Times baseline of a row whose top is `y`. */
function dingbat(doc, code, cx, y) {
  const size = SIZE - 0.5;
  const baseline = y + (doc.font(T).fontSize(SIZE)._font.ascender / 1000) * SIZE;
  const width = (code === CHECK.yes ? 0.755 : 0.711) * size;
  doc.font(DING).fontSize(size);
  doc.text(code, cx - width / 2, baseline - (doc._font.ascender / 1000) * size, { lineBreak: false });
}

export function draw(doc, h) {
  useBuiltinEncoding(doc, DING);
  h.text(RUNNING_HEAD, LEFT, 40, { font: T, size: 7.5 });
  h.text(PAGE, RIGHT, 40, { font: T, size: 8, align: 'right' });

  // Caption above the table, as IEEE-style surveys set it.
  doc.font(T).fontSize(8.5);
  doc.text(CAPTION, LEFT, 62, { width: RIGHT - LEFT, lineGap: 1, align: 'justify' });
  let y = doc.y + 6;

  h.rule(LEFT, y, RIGHT, { width: 0.9 });
  y += 4;
  const centres = [X.release, X.params, X.tokens, X.context, X.rlhf];
  HEAD.forEach(([top, bottom], i) => {
    if (i === 0) {
      h.text(top, X.model, y + 5, { font: TB, size: SIZE });
      return;
    }
    if (bottom) {
      h.text(top, centres[i - 1], y, { font: TB, size: SIZE, align: 'center' });
      h.text(bottom, centres[i - 1], y + 9.5, { font: TB, size: SIZE, align: 'center' });
    } else {
      h.text(top, centres[i - 1], y + 5, { font: TB, size: SIZE, align: 'center' });
    }
  });
  y += 21;
  h.rule(LEFT, y, RIGHT, { width: 0.5 });
  y += 3;

  for (const group of GROUPS) {
    h.text(group.label, (LEFT + RIGHT) / 2, y + 1, { font: TI, size: SIZE, align: 'center' });
    y += PITCH;
    h.rule(LEFT, y, RIGHT, { width: 0.3 });
    y += 2.5;
    for (const raw of group.rows) {
      const r = parse(raw);
      // Σ is outside WinAnsi; it comes from a second font on the same baseline.
      const name = r.model.split('Σ');
      const segments = name.length === 2 ? [name[0], { text: 'Σ', font: 'NotoSansJP' }] : [r.model];
      h.run([...segments, ` [${r.cite}]`], X.model, y, { font: T, size: SIZE });
      h.text(r.release, X.release, y, { font: T, size: SIZE, align: 'center' });
      h.text(r.params, X.params, y, { font: T, size: SIZE, align: 'center' });
      h.text(r.tokens, X.tokens, y, { font: T, size: SIZE, align: 'center' });
      h.text(r.context, X.context, y, { font: T, size: SIZE, align: 'center' });
      dingbat(doc, CHECK[r.rlhf], X.rlhf, y);
      y += PITCH;
    }
    y += 1;
    h.rule(LEFT, y, RIGHT, { width: group === GROUPS[GROUPS.length - 1] ? 0.9 : 0.5 });
    y += 3;
  }
}
