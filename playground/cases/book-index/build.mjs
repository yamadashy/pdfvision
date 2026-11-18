// A page from the back-of-book index of a policy textbook: two columns,
// letter headings, main entries with page locators, subentries indented one
// step and sub-subentries two, turnover lines indented deeper still, italic
// "see" / "see also" cross-references, bold locators for definitions, "f"
// and "t" for figures and tables, and a main entry whose subentries run on
// from the foot of the first column to the head of the second under a
// "(continued)" line. Indentation is the only thing that says which entry a
// subentry belongs to.

const W = 396;
const H = 612;
const F = 'Times-Roman';
const FI = 'Times-Italic';
const FB = 'Times-Bold';

// level: 0 main, 1 sub, 2 sub-sub. `loc` segments: string, or { b } bold, or { i } italic.
const ENTRIES = [
  { head: 'C' },
  { level: 0, text: 'cap-and-trade', loc: [', ', { i: 'see' }, ' emissions trading'] },
  { level: 0, text: 'carbon border adjustment', loc: [', 214–219, ', { b: '215' }, ', 233t'] },
  { level: 1, text: 'and export rebates', loc: [', 217'] },
  { level: 1, text: 'WTO compatibility of', loc: [', 218–219'] },
  { level: 0, text: 'carbon leakage', loc: [', 61, 202–206, 241f'] },
  { level: 1, text: 'evidence from steel and cement', loc: [', 204'] },
  { level: 1, text: 'in trade-exposed industries', loc: [', 203, 205'] },
  { level: 0, text: 'carbon pricing', loc: [', ', { b: '12' }, ', 40–58'] },
  { level: 1, text: 'distributional effects of', loc: [', 51–54'] },
  { level: 2, text: 'on low-income households', loc: [', 52, 53t'] },
  { level: 2, text: 'regional', loc: [', 54'] },
  { level: 1, text: 'hybrid schemes', loc: [', 47'] },
  { level: 1, text: 'price floors and ceilings in', loc: [', 48–50, 49f'] },
  { level: 1, text: 'revenue recycling', loc: [', 55–58'] },
  { level: 2, text: 'as dividends to households, compared with cuts to payroll taxes', loc: [', 56–57'] },
  { level: 1, text: 'see also', loc: [' emissions trading; fuel taxes'], seeAlso: true },
  { level: 0, text: 'clean development mechanism (CDM)', loc: [', 131, 140–142'] },
  { level: 0, text: 'coal phase-out', loc: [', 88–93'] },
  { level: 1, text: 'compensation for workers', loc: [', 91'] },
  { level: 1, text: 'and grid reliability', loc: [', 92–93'] },
  { level: 0, text: 'cost–benefit analysis', loc: [', 22–27'] },
  { level: 1, text: 'discount rate in', loc: [', ', { b: '24' }, ', 25–26'] },
  { head: 'D' },
  { level: 0, text: 'damage functions', loc: [', 28–31, 29f'] },
  { level: 0, text: 'decarbonisation pathways', loc: [', 160–171'] },
  { level: 1, text: 'for buildings', loc: [', 166'] },
  { level: 1, text: 'for heavy industry', loc: [', 168–170'] },
  { level: 1, text: 'for transport', loc: [', 162–165'] },
  { level: 0, text: 'demand response', loc: [', 97, 104'] },
  { level: 0, text: 'discount rate', loc: [', ', { i: 'see' }, ' cost–benefit analysis'] },
  { level: 0, text: 'double dividend hypothesis', loc: [', 57'] },
  { head: 'E' },
  { level: 0, text: 'electricity markets', loc: [', 94–112'] },
  { level: 1, text: 'capacity payments', loc: [', 101'] },
  { level: 1, text: 'marginal pricing', loc: [', ', { b: '96' }, ', 98'] },
  { level: 0, text: 'emissions trading', loc: [', 40, 59–75'] },
  { level: 1, text: 'allowance banking', loc: [', 66'] },
  { level: 1, text: 'free allocation', loc: [', 63–65, 202'] },
  { level: 1, text: 'market stability reserve', loc: [', 68–70, 69f'] },
  { level: 1, text: 'offsets in', loc: [', 72–73'] },
  { level: 1, text: 'see also', loc: [' carbon pricing'], seeAlso: true },
  { level: 0, text: 'energy efficiency', loc: [', 113–128'] },
  { level: 1, text: 'appliance standards', loc: [', 117–119'] },
  { level: 1, text: 'rebound effect', loc: [', ', { b: '121' }, ', 122–124, 123f'] },
  { level: 0, text: 'externalities', loc: [', ', { b: '9' }, ', 10–14'] },
  { head: 'F' },
  { level: 0, text: 'feed-in tariffs', loc: [', 77–80, 79t'] },
  { level: 0, text: 'fossil fuel subsidies', loc: [', 82–86'] },
  { level: 1, text: 'reform of, and public acceptance', loc: [', 85–86'] },
  { level: 0, text: 'fuel taxes', loc: [', 43, 76'] },
];

export const meta = {
  title: 'Back-of-book index page in two columns',
  stresses:
    'letter headings; main entries, subentries and sub-subentries told apart only by indentation; turnover lines indented deeper; italic see / see also; bold and f/t locators; an entry whose subentries continue into the next column under a "(continued)" line; running head with the page number',
  status: 'ok',
  families: ['structure', 'reading-order'],
  page: { size: [W, H] },
};

const plainLoc = (loc) => loc.map((s) => (typeof s === 'string' ? s : (s.b ?? s.i))).join('');

export const truth = `
One ${W} × ${H} pt book page: the running head \`Index\` and page number \`412\`, then an index in two
columns, read left column then right. Each subentry belongs to the nearest main entry above it with
less indentation; the right column opens with \`carbon pricing (continued)\`, so its first subentries
still belong to *carbon pricing*.

${ENTRIES.map((e) => (e.head ? `**${e.head}**` : `${'    '.repeat(e.level)}- ${e.seeAlso ? '*see also*' : e.text}${plainLoc(e.loc)}`)).join('\n')}

Bold locators mark the defining page; \`f\` and \`t\` mark a figure or a table on that page.

## Questions an agent should be able to answer

1. On which pages does the book discuss revenue recycling, and under which main entry is it listed? — 55–58, under *carbon pricing*
2. Where are the distributional effects of carbon pricing on low-income households covered? — pages 52 and 53 (a table on 53)
3. Which page defines carbon pricing? — 12 (the bold locator)
4. Where should a reader look for "cap-and-trade"? — the entry *emissions trading* (40, 59–75)
5. On which pages is free allocation in emissions trading discussed? — 63–65 and 202
6. What does the locator "regional, 54" index — regional what? — the regional distributional effects of carbon pricing (a sub-subentry under *distributional effects of*, beside *on low-income households*)

All six questions are answerable from \`read.md\`: the columns are read in order, the \`emissions
trading (continued)\` line keeps *free allocation* with its entry, and every line keeps its indent as
two leading spaces per step of the column's smallest indent — main entries flush, subentries at one
level, sub-subentries at two. For question 6, \`regional, 54\` sits at the second level under
\`distributional effects of\`, beside \`on low-income households\`, and \`hybrid schemes, 47\` is back at
the first. Turnover lines are set deeper than any subentry, so they read at the third level
(\`      233t\`, \`      compared with cuts to payroll\` / \`      taxes, 56–57\`), below the entry they
continue; nothing joins them to it, so an agent must read a line one level deeper than the deepest
subentry as a turnover.
`;

const COL_W = 154;
const COLS = [36, 36 + COL_W + 16];
const TOP = 70;
const BOTTOM = 574;
const SIZE = 9;
const LEAD = 11.2;
const INDENT = [0, 10, 20];
const TURNOVER = 30;

function segments(entry) {
  const label = entry.seeAlso ? [{ i: 'see also' }] : [entry.text];
  return [...label, ...entry.loc];
}

// Break an entry's segments into lines at word boundaries within `width`; returns arrays of { text, font }.
function layout(doc, entry, width) {
  const words = [];
  for (const segment of segments(entry)) {
    const font = typeof segment === 'string' ? F : segment.b ? FB : FI;
    const text = typeof segment === 'string' ? segment : (segment.b ?? segment.i);
    for (const part of text.split(/(?<= )/u)) if (part) words.push({ text: part, font });
  }
  const lines = [[]];
  let used = INDENT[entry.level];
  for (const word of words) {
    doc.font(word.font).fontSize(SIZE);
    const w = doc.widthOfString(word.text);
    if (used + w > width && lines[lines.length - 1].length > 0) {
      lines.push([]);
      used = TURNOVER;
    }
    lines[lines.length - 1].push(word);
    used += w;
  }
  return lines;
}

export function draw(doc, h) {
  h.text('Index', 36, 36, { font: FI, size: 9 });
  h.text('412', W - 36, 36, { font: F, size: 9, align: 'right' });

  let col = 0;
  let y = TOP;
  let currentMain;
  for (const entry of ENTRIES) {
    if (entry.head) {
      y += 6;
      h.text(entry.head, COLS[col], y, { font: FB, size: 10 });
      y += LEAD + 4;
      continue;
    }
    if (entry.level === 0) currentMain = entry.text;
    const lines = layout(doc, entry, COL_W);
    if (y + lines.length * LEAD > BOTTOM) {
      col += 1;
      y = TOP;
      if (entry.level > 0) {
        h.text(`${currentMain} (continued)`, COLS[col], y, { font: F, size: SIZE });
        y += LEAD;
      }
    }
    lines.forEach((words, i) => {
      let x = COLS[col] + (i === 0 ? INDENT[entry.level] : TURNOVER);
      for (const word of words) {
        doc.font(word.font).fontSize(SIZE);
        doc.text(word.text, x, y, { lineBreak: false });
        x += doc.widthOfString(word.text);
      }
      y += LEAD;
    });
  }
}
