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
   */
  continuationHint: (droppedPages: readonly number[]) => string;
  charCap?: number;
}

/**
 * Last-resort clip on the assembled response.
 *
 * Dropping whole pages cannot bound a response on its own: the document
 * header carries an Overview row per selected page, so `pages: "1-500"`
 * blows the budget before the first page body is added. Page-boundary
 * truncation stays the primary mechanism because it leaves a usable,
 * well-formed document behind; this only catches what it cannot.
 *
 * The cap bounds the *content*. Notices are added on top, so a response
 * can run a few hundred characters over — deliberately, because guidance
 * the model cannot read is worse than a slightly larger reply.
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

  const kept: MarkdownPageSection[] = [];
  let used = header.length;
  for (const section of clipped) {
    // Always keep the first page: a response that is only a header tells
    // the model nothing and gives it no way to make progress.
    if (kept.length > 0 && used + section.text.length > charCap) break;
    kept.push(section);
    used += section.text.length;
  }

  const body = header + kept.map((section) => section.text).join('');
  if (kept.length === sections.length) return clampBody(body, charCap, charCap);

  const dropped = clipped.slice(kept.length).map((section) => section.page);
  const notice = [
    '',
    `[pdfvision] Truncated at the ${charCap.toLocaleString('en-US')}-char response budget: showing pages ${formatPageRange(kept.map((section) => section.page))}, ${dropped.length} page${dropped.length === 1 ? '' : 's'} omitted (${formatPageRange(dropped)}).`,
    `Continue with ${options.continuationHint(dropped)}, or narrow with search_pdf first.`,
    '',
  ].join('\n');
  // Reserve room for the notice before clamping: clipping the response to
  // the cap and *then* appending would cut off the recovery instructions,
  // which are the one part that must survive. Never give the notice more
  // than half the budget, so a tiny cap still returns some content rather
  // than nothing but its own apology.
  const bodyLimit = Math.max(Math.floor(charCap / 2), charCap - notice.length);
  return clampBody(body, bodyLimit, charCap) + notice;
}
