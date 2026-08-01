import { BODY_CHAR_CAP, PAGE_CHAR_CAP } from './limits.js';

/**
 * Clip a rendered Markdown body at page boundaries.
 *
 * Truncation notices are imperative and carry the exact follow-up call.
 * A bare `[truncated]` reads to a model as "that was the document", which
 * is the failure this whole layer exists to prevent.
 */

const PAGE_HEADING = /^## Page (\d+)/gm;

interface PageChunk {
  page: number;
  text: string;
}

function splitPages(markdown: string): { header: string; chunks: PageChunk[] } {
  const starts: { page: number; index: number }[] = [];
  PAGE_HEADING.lastIndex = 0;
  for (let match = PAGE_HEADING.exec(markdown); match !== null; match = PAGE_HEADING.exec(markdown)) {
    starts.push({ page: Number(match[1]), index: match.index });
  }
  if (starts.length === 0) return { header: markdown, chunks: [] };

  const first = starts[0] as { page: number; index: number };
  const header = markdown.slice(0, first.index);
  const chunks = starts.map((start, i) => {
    const next = starts[i + 1];
    return { page: start.page, text: markdown.slice(start.index, next ? next.index : markdown.length) };
  });
  return { header, chunks };
}

function clipPage(chunk: PageChunk): PageChunk {
  if (chunk.text.length <= PAGE_CHAR_CAP) return chunk;
  const omitted = chunk.text.length - PAGE_CHAR_CAP;
  return {
    page: chunk.page,
    text: `${chunk.text.slice(0, PAGE_CHAR_CAP)}\n\n[pdfvision] Page ${chunk.page} clipped at ${PAGE_CHAR_CAP.toLocaleString('en-US')} chars (${omitted.toLocaleString('en-US')} omitted). Use search_pdf to locate content on this page instead of reading it whole.\n`,
  };
}

export interface TruncateOptions {
  /** How the model asks for the next slice, e.g. `read_pdf(source, pages: "8-12")`. */
  continuationHint: (fromPage: number, toPage: number) => string;
  charCap?: number;
}

/**
 * Returns the body clipped to `charCap`, with a notice naming the pages
 * that were dropped and the call that fetches them.
 */
export function truncateBody(markdown: string, options: TruncateOptions): string {
  const charCap = options.charCap ?? BODY_CHAR_CAP;
  const { header, chunks } = splitPages(markdown);
  if (chunks.length === 0) {
    if (markdown.length <= charCap) return markdown;
    return `${markdown.slice(0, charCap)}\n\n[pdfvision] Output clipped at ${charCap.toLocaleString('en-US')} chars.\n`;
  }

  const clipped = chunks.map(clipPage);
  const kept: PageChunk[] = [];
  let used = header.length;
  for (const chunk of clipped) {
    // Always keep the first page: a response that is only a header tells
    // the model nothing and gives it no way to make progress.
    if (kept.length > 0 && used + chunk.text.length > charCap) break;
    kept.push(chunk);
    used += chunk.text.length;
  }
  if (kept.length === chunks.length) {
    // Nothing dropped, but an individual page may still have been clipped.
    const anyPageClipped = clipped.some((chunk, index) => chunk.text !== (chunks[index] as PageChunk).text);
    return anyPageClipped ? header + clipped.map((chunk) => chunk.text).join('') : markdown;
  }

  const lastKept = kept[kept.length - 1] as PageChunk;
  const firstDropped = clipped[kept.length] as PageChunk;
  const lastDropped = clipped[clipped.length - 1] as PageChunk;
  const omitted = chunks.length - kept.length;
  const notice = [
    '',
    `[pdfvision] Truncated at the ${charCap.toLocaleString('en-US')}-char response budget: showing pages ${kept[0]?.page}-${lastKept.page}, ${omitted} page${omitted === 1 ? '' : 's'} omitted (${firstDropped.page}-${lastDropped.page}).`,
    `Continue with ${options.continuationHint(firstDropped.page, lastDropped.page)}, or narrow with search_pdf first.`,
    '',
  ].join('\n');
  return header + kept.map((chunk) => chunk.text).join('') + notice;
}
