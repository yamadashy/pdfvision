import { formatPageRange } from '../core/options/pageRange.js';
import type { MarkdownPageSection } from '../output/markdown.js';
import { BODY_CHAR_CAP, PAGE_CHAR_CAP } from './limits.js';

/**
 * Fit a rendered body into the response budget.
 *
 * The pages arrive already separated by `formatMarkdownSections`, so this
 * never has to guess where a page starts by re-parsing Markdown — a
 * heading tweak in the formatter would silently break that.
 *
 * Truncation notices are imperative and carry the exact follow-up call. A
 * bare `[truncated]` reads to a model as "that was the document", which is
 * the failure this whole layer exists to prevent.
 */

function clipPage(section: MarkdownPageSection): MarkdownPageSection {
  if (section.text.length <= PAGE_CHAR_CAP) return section;
  const omitted = section.text.length - PAGE_CHAR_CAP;
  return {
    page: section.page,
    text: `${section.text.slice(0, PAGE_CHAR_CAP)}\n\n[pdfvision] Page ${section.page} clipped at ${PAGE_CHAR_CAP.toLocaleString('en-US')} chars (${omitted.toLocaleString('en-US')} omitted). Use search_pdf to locate content on this page instead of reading it whole.\n`,
  };
}

export interface TruncateOptions {
  /**
   * How the model asks for the omitted pages back, e.g.
   * `read_pdf(pages: "8-12")`. Receives the dropped page numbers rather
   * than a first/last pair: a selector like `1,100,200,300` drops
   * non-adjacent pages, and turning those into `200-300` would make the
   * follow-up call re-extract a hundred pages nobody asked for.
   *
   * Not always every dropped page: when none fit, it is called with the
   * first one alone, because the full set is the request that just failed.
   */
  continuationHint: (droppedPages: readonly number[]) => string;
  charCap?: number;
}

/**
 * Room held back from the budget so the recovery notice always fits.
 *
 * A fixed reserve rather than the notice's own length: measuring the
 * finished text made the page selection depend on the notice and the
 * notice depend on the selection, and the clamp that broke that cycle
 * could cut into a page the notice had already reported as included.
 *
 * The reserve bounds the *content*. A selector with many non-adjacent
 * pages can still push the notice past it, which is deliberate —
 * guidance the model cannot read is worse than a slightly larger reply.
 */
const NOTICE_RESERVE = 400;

/**
 * Last-resort clip, for the one case page selection cannot cover: not
 * even the first page fits, so the response is cut mid-content and has
 * to say where.
 */
function clampBody(body: string, limit: number, charCap: number): string {
  if (body.length <= limit) return body;
  return `${body.slice(0, Math.max(0, limit))}\n\n[pdfvision] Response clipped at the ${charCap.toLocaleString('en-US')}-char budget. Ask for fewer pages, or use search_pdf to locate what you need.\n`;
}

export function truncateBody(
  header: string,
  sections: readonly MarkdownPageSection[],
  options: TruncateOptions,
): string {
  const charCap = options.charCap ?? BODY_CHAR_CAP;
  const clipped = sections.map(clipPage);
  const full = header + clipped.map((section) => section.text).join('');
  if (full.length <= charCap) return full;

  const limit = Math.max(Math.floor(charCap / 2), charCap - NOTICE_RESERVE);
  const kept: MarkdownPageSection[] = [];
  let used = header.length;
  for (const section of clipped) {
    kept.push(section);
    used += section.text.length;
    if (used > limit) {
      kept.pop();
      break;
    }
  }

  const dropped = clipped.slice(kept.length).map((section) => section.page);
  if (dropped.length === 0) return clampBody(header, limit, charCap);

  // A page is only reported as delivered when it fits whole. When none
  // does — the header carries an Overview row per selected page, so
  // `pages: "1-500"` can fill the budget on its own — the first page is
  // still shown as far as there is room for, because a bare header
  // leaves the model nothing to work with. It counts as omitted all the
  // same: the caller has to ask again to get the rest of it, and naming
  // a page the reader did not fully receive is the failure this whole
  // layer exists to prevent.
  const body =
    kept.length > 0
      ? header + kept.map((section) => section.text).join('')
      : clampBody(header + (clipped[0]?.text ?? ''), limit, charCap);
  const shown =
    kept.length > 0
      ? `showing pages ${formatPageRange(kept.map((section) => section.page))}`
      : 'no page fits it whole, so nothing below is complete';
  // "Bodies", not "pages": the header still carries an Overview row for
  // every selected page, so a caller reading "756 pages omitted" next to
  // 419 rows of per-page detail cannot tell what it was denied.
  const omitted = `${dropped.length} page ${dropped.length === 1 ? 'body' : 'bodies'} omitted (${formatPageRange(dropped)})`;

  // Never hand back the call that just failed. When nothing fit, the
  // dropped pages *are* the requested pages, so `continuationHint(dropped)`
  // reproduces the request byte for byte and an agent following it loops
  // forever. The narrowest call that still makes progress is the first
  // page on its own — and when that already is the whole request, no page
  // selector is narrower, so the only way forward is to ask for something
  // specific on that page rather than for the page.
  const first = dropped[0];
  const next =
    kept.length > 0
      ? `Continue with ${options.continuationHint(dropped)}, or narrow with search_pdf first.`
      : dropped.length > 1
        ? `This range cannot be served whole. Start with ${options.continuationHint([first as number])} and work forward, or narrow with search_pdf first.`
        : `Page ${first} does not fit the budget on its own, so no narrower \`pages\` exists. Use search_pdf to locate what you need on it.`;

  const notice = [
    '',
    `[pdfvision] Truncated at the ${charCap.toLocaleString('en-US')}-char response budget: ${shown}, ${omitted}.`,
    next,
    '',
  ].join('\n');
  return body + notice;
}
