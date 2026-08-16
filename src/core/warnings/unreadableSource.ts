import type { PageResult, PageWarning } from '../../types/index.js';
import { formatPageRange } from '../options/pageRange.js';

/**
 * Warnings whose meaning is "the text extracted from these pages may not
 * be the pages' content" — not "the text is there but suspect".
 *
 * The distinction is what makes the set useful to a caller reasoning about
 * a zero result: on these pages neither a hit nor a miss is evidence about
 * the document, because what was searched was never the document's text.
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
 * `scope: 'document'` marks the codes that describe the file rather than
 * the page they are attached to. `xfa_form` is raised once, on the first
 * extracted page, but what it says is true of every page in the selection
 * — a consumer that listed only the page carrying it would leave the other
 * placeholder pages looking searched.
 *
 * Each rule writes its own note rather than filling a shared template,
 * because the claim and the recovery both change with what was actually
 * established: a confirmed placeholder is not the document and rendering
 * it is pointless, while a suspected one is one render away from being
 * settled, and a note that blurred the two would be wrong half the time.
 */
interface UnreadableSourceRule {
  scope: 'document' | 'page';
  /** The complete note, given a phrase naming the pages it covers ("p.1", "p.1-3"). */
  note: (pages: string) => string;
}

function unreadableSourceRule(warning: PageWarning): UnreadableSourceRule | undefined {
  if (warning.code !== 'xfa_form') return undefined;
  if (warning.severity === 'error') {
    return {
      scope: 'document',
      note: (pages) =>
        `The text searched on ${pages} is the XFA (LiveCycle) viewer placeholder, not this document's content (xfa_form), so neither a hit nor a miss there is evidence about the form — open the file in Adobe Acrobat/Reader; standard extraction cannot see the XFA layer, and rendering shows the placeholder too.`,
    };
  }
  return {
    scope: 'document',
    note: (pages) =>
      `Too little was extracted from ${pages} to confirm the text searched there is this document's content rather than an XFA (LiveCycle) viewer placeholder (xfa_form), so a miss there is not evidence of absence — render or OCR those pages to check; if they show only a "Please wait..." notice, the content is XFA-only and needs Adobe Acrobat/Reader.`,
  };
}

export function isUnreadableSourceCode(code: PageWarning['code']): boolean {
  return code === 'xfa_form';
}

export interface UnreadableSourceReport {
  /** 1-based page numbers the notes speak for; empty when nothing applies. */
  pages: number[];
  /** One complete sentence per distinct rule. */
  notes: string[];
}

export function unreadableSourceReport(pages: readonly PageResult[]): UnreadableSourceReport {
  const perPage: number[] = [];
  const rules: UnreadableSourceRule[] = [];
  let coversSelection = false;

  for (const page of pages) {
    let pageMatched = false;
    for (const warning of page.warnings ?? []) {
      const rule = unreadableSourceRule(warning);
      if (!rule) continue;
      pageMatched = true;
      if (rule.scope === 'document') coversSelection = true;
      rules.push(rule);
    }
    if (pageMatched) perPage.push(page.page);
  }

  if (perPage.length === 0) return { pages: [], notes: [] };
  const covered = coversSelection ? pages.map((page) => page.page) : perPage;
  const phrase = `p.${formatPageRange(covered)}`;
  const notes: string[] = [];
  for (const rule of rules) {
    const note = rule.note(phrase);
    if (!notes.includes(note)) notes.push(note);
  }
  return { pages: covered, notes };
}
