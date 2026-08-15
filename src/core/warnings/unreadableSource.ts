import type { PageResult, PageWarning } from '../../types/index.js';

/**
 * Warning codes whose meaning is "the text extracted from this page is not
 * the page's content at all" — not "the text is there but suspect".
 *
 * The distinction is what makes the set useful to a caller reasoning about
 * a zero result: on these pages neither a hit nor a miss is evidence about
 * the document, because the searched string was never the document's.
 * Narrow on purpose:
 *
 * - Pages with missing or corrupted native text (`glyph_garbage_text`,
 *   empty-but-visual pages) are already classified by
 *   `hasUnreliableNativeText` and reported separately; listing them here
 *   too would say the same thing twice.
 * - `invisible_text` and `text_under_opaque_fill` point the other way —
 *   extraction saw *more* than the page shows. A hit there is real text in
 *   the file, so it belongs in the per-page warning list, not in a note
 *   that discounts the whole page.
 * - `raster_backed_text_layer` and the OCR codes mean the text is an
 *   approximation of the page, which is weak evidence rather than none.
 *
 * The recovery string is per code because it is the one part that cannot
 * be generic: "render it" is useless advice for a page whose render is
 * also the placeholder.
 */
const UNREADABLE_SOURCE_RECOVERY: ReadonlyMap<PageWarning['code'], string> = new Map([
  [
    'xfa_form',
    'the real content lives in an XFA (LiveCycle) layer that standard extraction never sees and pdfvision cannot search — open the file in Adobe Acrobat/Reader',
  ],
]);

export function isUnreadableSourceCode(code: PageWarning['code']): boolean {
  return UNREADABLE_SOURCE_RECOVERY.has(code);
}

export interface UnreadableSourcePages {
  /** 1-based page numbers whose extracted text is not the page's content. */
  pages: number[];
  /** Codes that put them there, in first-seen order. */
  codes: PageWarning['code'][];
  /** One recovery sentence per distinct code, in the same order. */
  recovery: string[];
}

/** Empty `pages` means nothing in the selection carried an unreadable-source code. */
export function unreadableSourcePages(pages: readonly PageResult[]): UnreadableSourcePages {
  const numbers: number[] = [];
  const codes: PageWarning['code'][] = [];
  for (const page of pages) {
    const hits = (page.warnings ?? []).filter((warning) => isUnreadableSourceCode(warning.code));
    if (hits.length === 0) continue;
    numbers.push(page.page);
    for (const hit of hits) if (!codes.includes(hit.code)) codes.push(hit.code);
  }
  return {
    pages: numbers,
    codes,
    recovery: codes.map((code) => UNREADABLE_SOURCE_RECOVERY.get(code) as string),
  };
}
