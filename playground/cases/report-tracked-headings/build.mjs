// A section page of a company annual report on Letter whose headings are
// letter-spaced three different ways, as different layout tools write it:
// a running label with wide character spacing (`Tc` past half an em), a
// heading with each letter placed on its own (`Td` per letter, word space
// only a wider move), and a heading tracked inside `TJ` together with pair
// kerning. Beside them, text that is really spaced out: a section label
// typed with a space between letters, and a calendar whose weekday initials
// sit centred in their cells.

const T = 'Helvetica';
const TB = 'Helvetica-Bold';
const H = 792;
const LEFT = 72;

const LABEL = 'ANNUAL REPORT 2026';
const HEADINGS = { placed: 'FINANCIAL HIGHLIGHTS', kerned: 'RISK FACTORS' };
const TYPED = 'S U S T A I N A B I L I T Y';
const HIGHLIGHTS = [
  'Revenue rose 9.4% to $4.82 billion, led by demand for the industrial sensor line,',
  'and operating margin widened to 14.1% from 12.7% a year earlier. Free cash flow',
  'reached $611 million, of which $240 million was returned to shareholders.',
];
const RISKS = [
  'Two suppliers provide most of the specialised wafers the sensor line depends on;',
  'a disruption at either would delay deliveries for up to two quarters. Currency',
  'movements, chiefly the euro, affect about a third of reported revenue.',
];
const SUSTAINABILITY = ['Scope 1 and 2 emissions fell 18% against the 2022 baseline.'];
const CALENDAR = { title: 'Annual general meeting: May 2027', days: 'SMTWTFS', first: 6, length: 31 };

export const meta = {
  title: 'Annual report page with headings letter-spaced three ways',
  stresses:
    'running label tracked wider than half an em with Tc; heading with each letter placed by its own Td and no space glyph; heading tracked inside TJ with pair kerning; a label typed with spaces between letters; a calendar with centred weekday initials',
  families: ['encoding', 'structure'],
  status: 'ok',
  showcase: true,
  hard: 'Letter-spaced headings reach text extraction as single letters with gaps between them, the same shape as a label typed with spaces or initials set in table cells; only how the letters were drawn tells them apart.',
  issue: 268,
};

export const truth = `
Running label: **${LABEL}** (character spacing past half an em)

## ${HEADINGS.placed}

(each letter placed on its own; the word space is a wider move, no space glyph)

${HIGHLIGHTS.join(' ')}

## ${HEADINGS.kerned}

(tracked inside TJ adjustments that also carry pair kerning, so the pushes are unequal)

${RISKS.join(' ')}

## ${TYPED}

(typed with a space glyph between every letter: the text really is \`${TYPED}\`)

${SUSTAINABILITY.join(' ')}

**${CALENDAR.title}** — a month calendar headed by the weekday initials \`${Array.from(CALENDAR.days).join(' ')}\`, each
centred in its cell.

## Questions an agent should be able to answer

1. What are the page's section headings? — ${HEADINGS.placed}, ${HEADINGS.kerned}, Sustainability (typed as \`${TYPED}\`)
2. How much did revenue grow, and to what? — 9.4%, to $4.82 billion
3. What supply risk does the report name? — two suppliers provide most of the specialised wafers; a disruption would delay deliveries for up to two quarters
4. Which report is this page from? — ${LABEL}

The drawn headings read as words (\`${HEADINGS.placed}\`, \`${HEADINGS.kerned}\`, #268), so they can be searched,
and so do the running label's words (\`ANNUAL REPORT\`). Its year stays \`2 0 2 6\`, on a line of its own:
character spacing this wide is also how a matrix or a row of figures is spaced, so only words of letters
are rejoined across glyphs pdf.js split apart; question 4 is still answered. The typed label stays
\`${TYPED}\` and the weekday initials stay \`${Array.from(CALENDAR.days).join(' ')}\`: their spacing is real.
`;

/** A paragraph of lines in the body font, PDF coordinates. */
function body(h, lines, top) {
  h.textOperators(T, 10.5, ({ id, hex }) =>
    lines.map((line, i) => `BT /${id} 10.5 Tf ${LEFT} ${(top - i * 14).toFixed(2)} Td ${hex(line)} Tj ET`),
  );
}

export function draw(doc, h) {
  // Running label: one Tj, character spacing 0.75 em.
  h.textOperators(TB, 9, ({ id, hex }) => [`BT /${id} 9 Tf 6.75 Tc ${LEFT} 740 Td ${hex(LABEL)} Tj ET`]);
  h.rule(LEFT, 62, 540, { width: 0.6 });

  // Each letter placed by its own Td, 4.8pt (0.3 em) apart; the word space is a move of space + 2 x tracking.
  h.textOperators(TB, 16, ({ id, hex, width }) => {
    const tracking = 4.8;
    const ops = [`BT /${id} 16 Tf ${LEFT} 690 Td`];
    let advance = 0;
    for (const char of HEADINGS.placed) {
      if (char === ' ') {
        advance += width(' ') + tracking;
        continue;
      }
      if (advance > 0) ops.push(`${advance.toFixed(3)} 0 Td`);
      ops.push(`${hex(char)} Tj`);
      advance = width(char) + tracking;
    }
    ops.push('ET');
    return ops;
  });
  body(h, HIGHLIGHTS, 664);

  // Tracking written into TJ with pair kerning: AV-style pairs get more push.
  h.textOperators(TB, 14, ({ id, hex }) => {
    const kern = { RI: -150, IS: -190, SK: -140, FA: -205, AC: -150, CT: -160, TO: -190, OR: -150, RS: -145 };
    const parts = [];
    const chars = Array.from(HEADINGS.kerned);
    // The space glyph is tracked like any other.
    chars.forEach((char, i) => {
      if (i > 0) parts.push(String(kern[chars[i - 1] + char] ?? -150));
      parts.push(hex(char));
    });
    return [`BT /${id} 14 Tf ${LEFT} 590 Td [${parts.join(' ')}] TJ ET`];
  });
  body(h, RISKS, 566);

  // Typed with spaces, as a designer keyed it.
  h.textOperators(TB, 14, ({ id, hex }) => [`BT /${id} 14 Tf ${LEFT} 492 Td ${hex(TYPED)} Tj ET`]);
  body(h, SUSTAINABILITY, 468);

  // A month calendar in a box beside the last section: weekday initials centred in 20pt cells.
  const CELL = 20;
  const boxX = 384;
  const boxTop = H - 430;
  doc
    .rect(boxX - 8, H - boxTop - 8, CELL * 7 + 16, 120)
    .lineWidth(0.5)
    .stroke();
  h.text(CALENDAR.title, boxX, H - boxTop - 2, { font: TB, size: 8 });
  h.textOperators(T, 8, ({ id, hex, width }) => {
    const ops = [];
    const cell = (text, column, row) => {
      const x = boxX + column * CELL + (CELL - width(text)) / 2;
      ops.push(`BT /${id} 8 Tf 1 0 0 1 ${x.toFixed(2)} ${(boxTop - 16 - row * 14).toFixed(2)} Tm ${hex(text)} Tj ET`);
    };
    Array.from(CALENDAR.days).forEach((day, column) => {
      cell(day, column, 0);
    });
    for (let date = 1; date <= CALENDAR.length; date++) {
      const slot = CALENDAR.first + date - 1;
      cell(String(date), slot % 7, 1 + Math.floor(slot / 7));
    }
    return ops;
  });
}
