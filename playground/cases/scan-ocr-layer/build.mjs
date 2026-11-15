// A two-page scanned letter as a copier's "scan to searchable PDF" mode
// writes it: each page is a full-page JPEG; page 1 also carries an
// invisible OCR text layer (render mode 3) laid over the lines, with the
// errors OCR makes on a skewed, noisy scan — `rn` read as `m`, `1` as `l`,
// a misread amount and a dropped line. Page 2 got no text layer at all.

import { AMOUNT_RIGHT, INSPECTION, LETTER } from './data.mjs';

const OCR_FONT = 'Helvetica';

export const meta = {
  title: 'Scanned letter with an imperfect OCR text layer',
  stresses:
    'full-page raster scans; invisible OCR text (render mode 3) with OCR errors; a second scanned page with no text layer',
  status: 'ok',
};

const visibleLine = (entry) => (entry.amount ? `${entry.text} ${entry.amount}` : entry.text);
const ocrLine = (entry) => {
  if (entry.ocr === null) return null;
  const text = entry.ocr ?? entry.text;
  const amount = entry.ocrAmount ?? entry.amount;
  return amount ? `${text} ${amount}` : text;
};
const deductions = LETTER.filter((entry) => entry.amount && !entry.bold);
const errors = LETTER.filter((entry) => entry.ocr !== undefined || entry.ocrAmount);

export const truth = `
**Page 1 — what the scan shows** (a skewed, speckled image of a typed letter):

${LETTER.map((entry) => `> ${visibleLine(entry)}`).join('\n')}

(plus a handwritten signature between “Sincerely,” and the name).

**Page 1 — what the invisible OCR layer contains.** Same lines, except:

${errors
  .map((entry) =>
    entry.ocr === null
      ? `- dropped: \`${visibleLine(entry)}\` is not in the layer at all`
      : `- \`${visibleLine(entry)}\` → \`${ocrLine(entry)}\``,
  )
  .join('\n')}

A correct reading does not present the OCR layer as the page's text without saying it comes
from a scan, so the reader knows the image is the authority. The misread amount and the
dropped line are invisible in the text itself: the layer still says \`Total deductions $244.75\`,
which no longer adds up (\`$145.00 + $81.25 = $226.25\`).

**Page 2** — image only, no text layer. It shows:

${INSPECTION.title}; ${INSPECTION.unit}; ${INSPECTION.date}

| ${INSPECTION.columns.join(' | ')} |
| --- | --- | --- |
${INSPECTION.rows.map((row) => `| ${row.join(' | ')} |`).join('\n')}

${INSPECTION.keys}. ${INSPECTION.inspector}. Tenant signature line (blank).

A correct reading says page 2 has no text and needs OCR or the render.

## Questions an agent should be able to answer

1. How much of the deposit is being returned? — ${LETTER.find((e) => e.text === 'Amount returned').amount}
2. Which deductions were taken, and for how much? — ${deductions.map((e) => `${e.text} ${e.amount}`).join('; ')}
3. Within how many days must a dispute be raised? — 14
4. Who signed the letter? — Marianne Holloway, Property Manager
5. Which room was rated Poor at the inspection? — Bedroom 2 (page 2, image only)

**Current reading (ok — the warnings carry it):** \`read.md\` returns the OCR layer verbatim as page 1's
text, errors included (\`Amount retumed\`, \`l4 days\`, \`$81.25\`, the blind line missing), so
from text alone question 2 is answered wrongly (two deductions, utility \`$81.25\`) and question 3
reads \`l4\`. Page 1 carries \`raster_backed_text_layer\` (“native text appears to be an OCR/text
layer over a full-page raster image … rerun with --ocr or compare against the render before
trusting wording”), and page 2 carries \`raster_image_no_native_text\` (“compare the render or OCR
when exact text matters”). Both name the next step, so an agent that follows them gets 2, 3
and 5 right; questions 1 and 4 are answered correctly from the layer.
`;

export function draw(doc, h) {
  doc.image(h.asset('page-1-scan.jpg'), 0, 0, { width: 612, height: 792 });
  h.invisible(() => {
    for (const entry of LETTER) {
      const text = entry.ocr === null ? null : (entry.ocr ?? entry.text);
      if (text === null) continue;
      h.text(text, entry.x, entry.y, { font: OCR_FONT, size: entry.size });
      const amount = entry.ocrAmount ?? entry.amount;
      if (amount) h.text(amount, AMOUNT_RIGHT, entry.y, { font: OCR_FONT, size: entry.size, align: 'right' });
    }
  });
  h.newPage();
  doc.image(h.asset('page-2-scan.jpg'), 0, 0, { width: 612, height: 792 });
}
