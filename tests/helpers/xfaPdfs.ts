/**
 * Hand-built PDFs for the two XFA shapes.
 *
 * pdf.js derives `IsXFAPresent` from a non-empty `/XFA` entry on the
 * AcroForm dictionary and `IsAcroFormPresent` from a non-empty `/Fields`
 * array that is not signatures-only, so declaring either takes nothing
 * more than the right catalog keys — pdfkit cannot author them, but a raw
 * PDF string can. Shared by the core warning tests and the MCP search
 * tests because both need the same two documents.
 */

function buildRawPdf(objects: string[]): Uint8Array {
  let body = '%PDF-1.7\n';
  const offsets: number[] = [0];
  for (const [index, object] of objects.entries()) {
    offsets[index + 1] = Buffer.byteLength(body, 'binary');
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(body, 'binary');
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(body, 'binary'));
}

function textStream(lines: readonly string[]): string {
  const content = ['BT /F1 11 Tf 12 TL 40 740 Td', ...lines.map((line) => `(${line}) Tj T*`), 'ET'].join('\n');
  return `<< /Length ${Buffer.byteLength(content, 'binary')} >>\nstream\n${content}\nendstream`;
}

/**
 * Adobe's generated placeholder, as LiveCycle emits it — the whole static
 * layer of a dynamic XFA form. Trimmed of the trademark paragraph, which
 * carries no marker the classifier looks at.
 */
const PLACEHOLDER_LINES = [
  'Please wait...',
  'If this message is not eventually replaced by the proper contents of the document,',
  'your PDF viewer may not be able to display this type of document.',
  'You can upgrade to the latest version of Adobe Reader for Windows, Mac, or Linux',
  'by visiting http://www.adobe.com/go/reader_download.',
  'For more assistance with Adobe Reader visit http://www.adobe.com/go/acrreader.',
];

const FORM_LINES = [
  'Application to Sponsor a Relative - Part A',
  'Name of applicant and mailing address as it appears on your permanent record.',
  'Enter the total annual income you reported for the last tax year on line 12.',
  'Check the box that describes your relationship to the sponsored person.',
  'Sign and date this page before mailing it with the supporting documents.',
];

/** Dynamic XFA: `/XFA` declared, no AcroForm field layer, boilerplate-only page. */
export function buildXfaPlaceholderPdf(): Uint8Array {
  return buildRawPdf([
    '<< /Type /Catalog /Pages 2 0 R /NeedsRendering true /AcroForm << /Fields [] /XFA [ (preamble) 6 0 R ] >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    textStream(PLACEHOLDER_LINES),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length 28 >>\nstream\n<xdp:xdp>real form</xdp:xdp>\nendstream',
  ]);
}

/** Hybrid AcroForm+XFA, the IRS-form shape: real static text plus a real widget field. */
export function buildHybridXfaPdf(): Uint8Array {
  return buildRawPdf([
    '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [6 0 R] /XFA [ (preamble) 7 0 R ] >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Annots [6 0 R] /Contents 4 0 R >>',
    textStream(FORM_LINES),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Annot /Subtype /Widget /FT /Tx /T (applicantName) /Rect [40 600 300 620] /F 4 >>',
    '<< /Length 28 >>\nstream\n<xdp:xdp>real form</xdp:xdp>\nendstream',
  ]);
}

/** Three placeholder pages, so a note that speaks only for the page it is pinned to is visible. */
export function buildMultiPageXfaPlaceholderPdf(): Uint8Array {
  return buildRawPdf([
    '<< /Type /Catalog /Pages 2 0 R /NeedsRendering true /AcroForm << /Fields [] /XFA [ (preamble) 8 0 R ] >> >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    textStream(PLACEHOLDER_LINES),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length 28 >>\nstream\n<xdp:xdp>real form</xdp:xdp>\nendstream',
  ]);
}

/**
 * The placeholder page of a document that also carries a filled AcroForm
 * field: the static field layer is real evidence, so this must not be
 * called a placeholder document.
 */
export function buildXfaPlaceholderWithFieldsPdf(): Uint8Array {
  return buildRawPdf([
    '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [6 0 R] /XFA [ (preamble) 7 0 R ] >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Annots [6 0 R] /Contents 4 0 R >>',
    textStream(PLACEHOLDER_LINES),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Annot /Subtype /Widget /FT /Tx /T (sponsorName) /V (Maria Sanchez) /Rect [40 600 300 620] /F 4 >>',
    '<< /Length 28 >>\nstream\n<xdp:xdp>real form</xdp:xdp>\nendstream',
  ]);
}

/**
 * XFA declared, no field layer, and a page whose content is a scanned
 * image with a page number for text — unreadable by extraction, but a
 * render or OCR reads it, so it is not the Acrobat-only shape.
 */
export function buildScannedXfaPdf(): Uint8Array {
  const content =
    'q 400 0 0 300 40 400 cm\nBI /W 2 /H 2 /CS /G /BPC 8 /F /AHx ID\n00ff00ff>\nEI Q\nBT /F1 11 Tf 40 60 Td (2) Tj ET';
  return buildRawPdf([
    '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [] /XFA [ (preamble) 6 0 R ] >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'binary')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length 28 >>\nstream\n<xdp:xdp>real form</xdp:xdp>\nendstream',
  ]);
}

/**
 * XFA declared, no field layer, one page of real text and one blank page —
 * so a whole-document call and a call scoped to the blank page can be
 * compared.
 */
export function buildXfaWithBlankSecondPagePdf(): Uint8Array {
  const blank = '<< /Length 0 >>\nstream\n\nendstream';
  return buildRawPdf([
    '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [] /XFA [ (preamble) 8 0 R ] >> >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    textStream(FORM_LINES),
    blank,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length 28 >>\nstream\n<xdp:xdp>real form</xdp:xdp>\nendstream',
  ]);
}

/** Same page content as the hybrid form, with no XFA declared at all. */
export function buildPlainFormPdf(): Uint8Array {
  return buildRawPdf([
    '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [6 0 R] >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Annots [6 0 R] /Contents 4 0 R >>',
    textStream(FORM_LINES),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Annot /Subtype /Widget /FT /Tx /T (applicantName) /Rect [40 600 300 620] /F 4 >>',
  ]);
}
