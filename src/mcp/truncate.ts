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
  /** How the model asks for the next slice, e.g. `read_pdf(pages: "8-12")`. */
  continuationHint: (fromPage: number, toPage: number) => string;
  charCap?: number;
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
  if (kept.length === sections.length) return body;

  const firstDropped = clipped[kept.length] as MarkdownPageSection;
  const lastDropped = clipped[clipped.length - 1] as MarkdownPageSection;
  const omitted = sections.length - kept.length;
  return [
    body,
    '',
    `[pdfvision] Truncated at the ${charCap.toLocaleString('en-US')}-char response budget: showing pages ${kept[0]?.page}-${kept[kept.length - 1]?.page}, ${omitted} page${omitted === 1 ? '' : 's'} omitted (${firstDropped.page}-${lastDropped.page}).`,
    `Continue with ${options.continuationHint(firstDropped.page, lastDropped.page)}, or narrow with search_pdf first.`,
    '',
  ].join('\n');
}
