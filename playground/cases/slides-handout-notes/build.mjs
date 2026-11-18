// A presentation printed two ways that office suites offer: a "3 slides per
// page" handout (slide thumbnails down the left, ruled lines for notes on the
// right, a header and footer from the handout master) and a notes page (one
// slide thumbnail above the speaker notes). The thumbnails are the slides
// drawn at reduced scale, so their text is real but small, and the speaker
// notes hold facts the slides do not show.

const W = 612;
const H = 792;
const SW = 960;
const SH = 540;
const F = 'Helvetica';
const FB = 'Helvetica-Bold';

const DECK = 'Cycle counting at the Eastfield warehouse';
const SLIDES = [
  { title: DECK, subtitle: 'Operations review · 3 December 2026', kind: 'title' },
  {
    title: 'Why we are changing',
    bullets: [
      'Annual stocktake closes the warehouse for 3 days',
      'Inventory record accuracy is 95.8% (target 99%)',
      'Most errors are in 600 fast-moving SKUs',
    ],
  },
  {
    title: 'Pilot results (Aisles 11–14)',
    table: [
      ['', 'Before', 'Pilot'],
      ['Record accuracy', '95.8%', '98.9%'],
      ['Count hours / week', '0', '14'],
      ['Stock-outs / month', '23', '9'],
    ],
  },
];
const NOTES = [
  'Start with the cost: the stocktake in January took 3 days with 40 staff and still left 1,120 records wrong.',
  'The 95.8% accuracy figure is from the March audit of 2,400 sampled locations, not from the system report.',
  'Ask for a decision today: roll cycle counting out to all aisles from 1 February 2027, with two counters per shift.',
];

export const meta = {
  title: 'Slide handout (3 per page) and a speaker-notes page',
  stresses:
    'slides printed as scaled thumbnails with small real text; ruled note lines beside each thumbnail; handout header and footer; a notes page with a slide thumbnail above speaker notes that carry facts the slides do not',
  status: 'ok',
  families: ['page-geometry', 'structure'],
};

export const truth = `
Two Letter pages printed from one deck, **${DECK}**.

Page 1 is a handout: three slide thumbnails down the left, read top to bottom, each with blank ruled
lines for notes beside it; header \`${DECK}\`, footer \`Page 1\`.

1. Slide 1 (title): ${SLIDES[0].title} — ${SLIDES[0].subtitle}
2. Slide 2: **${SLIDES[1].title}** — ${SLIDES[1].bullets.join('; ')}
3. Slide 3: **${SLIDES[2].title}**

| ${SLIDES[2].table[0].map((c) => c || 'Measure').join(' | ')} |
| --- | ---: | ---: |
${SLIDES[2].table
  .slice(1)
  .map((r) => `| ${r.join(' | ')} |`)
  .join('\n')}

Page 2 is the notes page for slide 2: the slide thumbnail, then the speaker notes:

${NOTES.map((n) => `> ${n}`).join('\n>\n')}

## Questions an agent should be able to answer

1. What record accuracy did the pilot reach, and in which aisles? — 98.9%, Aisles 11–14
2. Where does the 95.8% accuracy figure come from? — The March audit of 2,400 sampled locations (speaker notes)
3. What decision does the presenter ask for? — Roll cycle counting out to all aisles from 1 February 2027, with two counters per shift
4. How did stock-outs per month change in the pilot? — From 23 to 9
5. How many slides does page 1 of the handout show, and which slide is on the notes page? — Three; slide 2 (Why we are changing)

**Reads correctly:** each thumbnail's text is read as one group, top to bottom, with its slide number
after it, and the ruled note lines add nothing; on page 2 the slide text comes before the speaker
notes. All five questions are answered from \`read.md\`. The handout header \`${DECK}\` is listed once
as repeated page chrome; the slide-1 title of the same wording stays in the body. The pilot table is
also reported as a layout table, but without its \`Before\` / \`Pilot\` header row (columns \`C1\`–\`C3\`);
the body keeps the header right above the rows.
`;

function slide(doc, h, s, number) {
  doc.rect(0, 0, SW, SH).fill('#ffffff');
  doc.rect(0, 0, SW, 14).fill('#00695c');
  doc.fillColor('black');
  if (s.kind === 'title') {
    h.text(s.title, SW / 2, 200, { font: FB, size: 44, align: 'center' });
    h.text(s.subtitle, SW / 2, 280, { font: F, size: 26, align: 'center' });
  } else {
    h.text(s.title, 60, 50, { font: FB, size: 40 });
    if (s.bullets) {
      s.bullets.forEach((b, i) => {
        doc.circle(78, 170 + i * 80, 6).fill('#00695c');
        doc.fillColor('black');
        h.text(b, 100, 154 + i * 80, { font: F, size: 30 });
      });
    }
    if (s.table) {
      const cols = [60, 500, 740];
      s.table.forEach((row, r) => {
        const y = 150 + r * 72;
        if (r === 0) doc.rect(50, y - 14, 860, 60).fill('#e0f2f1');
        doc.fillColor('black');
        row.forEach((cell, c) => {
          if (cell)
            h.text(cell, c === 0 ? cols[0] : cols[c] + 120, y, {
              font: r === 0 ? FB : F,
              size: 30,
              align: c === 0 ? 'left' : 'right',
            });
        });
      });
    }
  }
  h.text(String(number), SW - 40, SH - 40, { font: F, size: 18, align: 'right' });
  doc.lineWidth(2).rect(0, 0, SW, SH).stroke('#888');
}

function thumbnail(doc, h, s, number, x, y, width) {
  doc.save();
  doc.translate(x, y).scale(width / SW);
  slide(doc, h, s, number);
  doc.restore();
}

export function draw(doc, h) {
  h.text(DECK, 54, 30, { font: F, size: 9 });
  h.text('3 December 2026', W - 54, 30, { font: F, size: 9, align: 'right' });
  const thumbW = 250;
  SLIDES.forEach((s, i) => {
    const y = 70 + i * 230;
    thumbnail(doc, h, s, i + 1, 54, y, thumbW);
    doc.lineWidth(0.5).strokeColor('#999');
    for (let l = 0; l < 7; l++)
      doc
        .moveTo(330, y + 12 + l * 20)
        .lineTo(W - 54, y + 12 + l * 20)
        .stroke();
    doc.strokeColor('black');
  });
  h.text('Page 1', W / 2, H - 36, { font: F, size: 9, align: 'center' });

  h.newPage();
  h.text(DECK, 54, 30, { font: F, size: 9 });
  thumbnail(doc, h, SLIDES[1], 2, 126, 70, 360);
  let y = 70 + (360 * SH) / SW + 30;
  for (const note of NOTES) {
    y = h.paragraph(note, 72, y, W - 144, { font: 'Times-Roman', size: 12 }) + 10;
  }
  h.text('2', W / 2, H - 36, { font: F, size: 9, align: 'center' });
}
