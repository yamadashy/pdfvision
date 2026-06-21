/**
 * Per-page OCR result. Surfaced only when `--ocr` was requested.
 * `pages[].text` (pdf.js native extraction) is preserved alongside this
 * so callers can compare the two — scanned PDFs typically have empty
 * `text` and a populated `ocr.text`.
 */
export interface PageOcr {
  /** OCR-derived text. Trimmed of trailing whitespace; line breaks preserved. */
  text: string;
  /**
   * Mean tesseract.js confidence over the page, normalised to 0..1
   * (rounded to 3dp). Tesseract reports it as 0..100 internally; we
   * scale down to match the existing `textCoverage` convention.
   */
  confidence: number;
  /** Language string passed in (e.g. `eng`, `eng+jpn`), echoed verbatim. */
  lang: string;
  /**
   * OCR word boxes in page coordinates, present when tesseract.js returns
   * block/line/word layout. Useful for precise search hits on scanned pages.
   */
  words?: OcrWord[];
}

export interface OcrWord {
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
