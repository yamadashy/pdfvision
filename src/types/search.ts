/**
 * One occurrence of a {@link ProcessDocumentOptions.search} query on a
 * page. Emitted per match, not per page — so the same query found
 * three times on page 5 yields three SearchMatch entries with `page: 5`.
 *
 * The bbox is in PDF points (top-left origin, y grows downward —
 * matching {@link TextSpan} / {@link LayoutBlock} / {@link ImageBox}),
 * so an agent can pipe it directly into a follow-up `renderRegion`
 * call to get a PNG zoomed onto the match.
 */
export interface SearchMatch {
  /** 1-based page number the match was found on. Mirrored on the
   *  parent `PageResult.page` for convenience — so a match plucked out
   *  of a flat `pages.flatMap(p => p.matches ?? [])` still knows where
   *  it came from. */
  page: number;
  /** The query string that produced this match (verbatim, before NFKC
   *  normalization). Useful when the search ran with multiple queries
   *  and the consumer wants to filter / group by source query. */
  query: string;
  /** 0-based index into the `search` array when more than one query
   *  was passed. Omitted when search was a single string — keeps the
   *  common case un-noisy. */
  queryIndex?: number;
  /** Union bbox covering every contributing span. Suitable for
   *  `renderRegion` zoom. */
  bbox: { x: number; y: number; width: number; height: number };
  /** Per-span bboxes that contribute to the match. Single-span matches
   *  have one box; phrase matches crossing pdf.js span boundaries carry
   *  multiple boxes and a union `bbox`. Lets callers draw precise
   *  highlight overlays or split multi-span matches. */
  boxes: { x: number; y: number; width: number; height: number }[];
  /** The matched substring in the same form as `pages[].text` — NFKC-
   *  normalized when `normalize` is on (the default), raw codepoints
   *  when `--no-normalize` was passed. For OCR-source matches this is
   *  the OCR-derived text. Agents wanting both forms can extract from
   *  the surrounding `pages[].text` / `pages[].rawText` pair using the
   *  bbox offsets — V1 doesn't dual-emit per match. */
  text: string;
  /** Where the match came from. `'native'` = pdf.js text stream
   *  (precise bbox via spans). `'formField'` = a text/choice widget
   *  value (widget bbox). `'annotation'` = visible FreeText annotation
   *  contents (annotation bbox). `'link'` = clickable link target
   *  metadata such as a URL, destination, or attachment filename.
   *  `'ocr'` = `pages[].ocr.text`
   *  (word-level bbox when `pages[].ocr.words` exists and matches,
   *  otherwise page-level fallback). */
  source: 'native' | 'formField' | 'annotation' | 'link' | 'ocr';
  /** Optional surrounding-line text (typically ±N characters from the
   *  match) for human / LLM readability. Trimmed and de-newlined. */
  context?: string;
}
