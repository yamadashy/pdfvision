// A three-slide 16:9 deck exported from presentation software: a title
// slide, a content slide with nested bullets and a native bar chart, and a
// slide that is nothing but a pasted screenshot — its table exists only as
// pixels, and the only native text left is the footer and slide number.

import { PIPELINE } from './data.mjs';

const W = 960;
const H = 540;
const SANS = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const ACCENT = '#2b5c8a';

const BRAND = 'Larkspur Analytics  |  Confidential — internal use only';
const TITLE_SLIDE = {
  title: 'Q3 FY2026 Business Review',
  subtitle: 'Customer Success & Revenue Operations',
  speaker: 'Dana Whitfield, VP Revenue Operations',
  date: 'October 14, 2026',
};
// Used by the bullet on the slide and by the answer key, so the two cannot drift.
const RENEWALS = 37;

const CONTENT_SLIDE = {
  heading: 'Net revenue retention rose for a third straight quarter',
  // depth 0 = bullet, 1 = nested bullet.
  bullets: [
    { depth: 0, text: 'NRR reached 118%, up from 112% in Q2' },
    { depth: 1, text: 'Expansion led by the Analytics Pro tier' },
    { depth: 0, text: 'Gross churn held at 4.1% of ARR' },
    { depth: 0, text: `${RENEWALS} enterprise renewals closed, 6 ahead of plan` },
  ],
  chartTitle: 'Net revenue retention by quarter',
  chart: [
    { label: 'Q4 FY25', value: 108 },
    { label: 'Q1 FY26', value: 110 },
    { label: 'Q2 FY26', value: 112 },
    { label: 'Q3 FY26', value: 118 },
  ],
};

export const meta = {
  title: 'Three-slide 16:9 deck with a screenshot slide',
  stresses:
    'non-Letter landscape page size; repeated footer; nested bullets; vector chart with value labels; a slide whose content is only a raster image',
  status: 'known-gap',
  families: ['page-geometry', 'raster-text', 'vector-meaning'],
  page: { size: [W, H] },
};

export const truth = `
Three 960 × 540 pt slides. Every slide carries the footer \`${BRAND}\`; slides 2 and 3 carry
their number at the bottom right. A good reading may report the footer as repeated chrome.

**Slide 1 (title):** ${TITLE_SLIDE.title} — ${TITLE_SLIDE.subtitle}. ${TITLE_SLIDE.speaker}. ${TITLE_SLIDE.date}.

**Slide 2:** ${CONTENT_SLIDE.heading}

${CONTENT_SLIDE.bullets.map((b) => `${'  '.repeat(b.depth)}- ${b.text}`).join('\n')}

Native bar chart “${CONTENT_SLIDE.chartTitle}” (value labels are text):
${CONTENT_SLIDE.chart.map((bar) => `${bar.label} ${bar.value}%`).join(', ')}.

**Slide 3:** one raster image (a dashboard screenshot); its text exists only as pixels. Native
text on the slide: the footer and \`3\`. A correct reading says the slide is an image whose
content needs the render or OCR, rather than presenting the slide as empty or footer-only.
Text inside the image:

${PIPELINE.title} — ${PIPELINE.subtitle}

| ${PIPELINE.columns.join(' | ')} |
| --- | ---: | ---: | ---: |
${PIPELINE.rows.map((row) => `| ${row.join(' | ')} |`).join('\n')}

## Questions an agent should be able to answer

1. Who presented the review, and on what date? — ${TITLE_SLIDE.speaker}, ${TITLE_SLIDE.date}
2. What was NRR in ${CONTENT_SLIDE.chart[1].label}, according to the chart? — ${CONTENT_SLIDE.chart[1].value}%
3. How many enterprise renewals closed in Q3? — ${RENEWALS}
4. What is the open pipeline in EMEA? — ${PIPELINE.rows[1][2]} (in the screenshot only; needs the render or OCR)
5. Which point under “NRR reached 118%” explains the increase? — ${CONTENT_SLIDE.bullets[1].text} (nested under the first bullet)

**Known gap (no issue yet):** questions 1, 2, 3 and 5 are answered from \`read.md\`; nesting
survives as the \`–\` sub-bullet glyph, and each chart value label is followed by its quarter.
Question 4 cannot be answered from \`read.md\`: the value is only in the screenshot. Page 3 carries
\`large_raster_low_text_overlap\` (“large raster image covers 63.3% of the page … labels, chart
text, or map text inside the image will not appear in native text”) and its native status is
\`sparse_text_with_visual_content\`. Both say what is missing; neither names rendering the page
or OCR as the next step.

The footer is dropped from every page as repeated chrome, and nothing in the response says
so; an agent asked whether the deck is marked confidential cannot tell from \`read.md\`.
`;

function chrome(doc, h, number) {
  doc.rect(0, H - 34, W, 34).fill('#f1f4f8');
  doc.fillColor('#5d6876');
  h.text(BRAND, 40, H - 22, { font: SANS, size: 10 });
  if (number) h.text(String(number), W - 40, H - 22, { font: BOLD, size: 10, align: 'right' });
  doc.fillColor('black');
}

function titleSlide(doc, h) {
  doc.rect(0, 0, W, H - 34).fill('#1d3b5a');
  doc.rect(64, 250, 120, 4).fill('#7fb2e0');
  doc.fillColor('white');
  h.text(TITLE_SLIDE.title, 64, 168, { font: BOLD, size: 44 });
  h.text(TITLE_SLIDE.subtitle, 64, 222, { font: SANS, size: 20 });
  h.text(TITLE_SLIDE.speaker, 64, 300, { font: BOLD, size: 16 });
  h.text(TITLE_SLIDE.date, 64, 324, { font: SANS, size: 16 });
  doc.fillColor('black');
  chrome(doc, h);
}

function contentSlide(doc, h) {
  doc.fillColor(ACCENT);
  h.text(CONTENT_SLIDE.heading, 56, 44, { font: BOLD, size: 28 });
  doc.rect(56, 88, 60, 3).fill(ACCENT);
  doc.fillColor('#1f2a37');
  let y = 132;
  for (const bullet of CONTENT_SLIDE.bullets) {
    const x = 64 + bullet.depth * 30;
    const size = bullet.depth ? 16 : 20;
    // Bullets are font glyphs, as presentation software exports them.
    doc.fillColor(bullet.depth ? '#7a8594' : ACCENT);
    h.text(bullet.depth ? '–' : '•', x, y, { font: SANS, size });
    doc.fillColor('#1f2a37');
    h.text(bullet.text, x + 20, y, { font: SANS, size });
    y += bullet.depth ? 36 : 44;
  }

  // Chart on the right half.
  const plot = { left: 560, right: 900, top: 150, bottom: 420 };
  const min = 100;
  const max = 120;
  doc.fillColor('#4a5462');
  h.text(CONTENT_SLIDE.chartTitle, (plot.left + plot.right) / 2, 112, { font: BOLD, size: 14, align: 'center' });
  doc.moveTo(plot.left, plot.bottom).lineTo(plot.right, plot.bottom).lineWidth(1).stroke('#9aa3ae');
  const slot = (plot.right - plot.left) / CONTENT_SLIDE.chart.length;
  CONTENT_SLIDE.chart.forEach((bar, i) => {
    const x = plot.left + i * slot + slot * 0.2;
    const top = plot.bottom - ((plot.bottom - plot.top) * (bar.value - min)) / (max - min);
    const last = i === CONTENT_SLIDE.chart.length - 1;
    doc.rect(x, top, slot * 0.6, plot.bottom - top).fill(last ? ACCENT : '#a9bdd2');
    doc.fillColor('#1f2a37');
    h.text(`${bar.value}%`, x + slot * 0.3, top - 20, { font: BOLD, size: 14, align: 'center' });
    doc.fillColor('#4a5462');
    h.text(bar.label, x + slot * 0.3, plot.bottom + 8, { font: SANS, size: 12, align: 'center' });
  });
  doc.fillColor('black');
  chrome(doc, h, 2);
}

function screenshotSlide(doc, h) {
  doc.rect(0, 0, W, H - 34).fill('#e9edf2');
  doc.image(h.asset('pipeline.png'), 70, 52, { width: 820, height: 400 });
  doc.rect(70, 52, 820, 400).lineWidth(0.75).stroke('#b9c1cc');
  chrome(doc, h, 3);
}

export function draw(doc, h) {
  titleSlide(doc, h);
  h.newPage();
  contentSlide(doc, h);
  h.newPage();
  screenshotSlide(doc, h);
}
