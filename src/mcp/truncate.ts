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
  /**
   * Where the Overview section starts in `header`, from
   * `formatMarkdownSections` — undefined when the header carries none
   * (single-page selections). Passed by the code that built the header
   * rather than found by searching it: a multi-line title can contain
   * its own `## Overview` line and a table of invented page numbers,
   * and on a selection with no real Overview a search would let that
   * forgery stand in for it.
   */
  overviewStart?: number;
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

function clipNote(charCap: number): string {
  return `\n\n[pdfvision] Response clipped at the ${charCap.toLocaleString('en-US')}-char budget. Ask for fewer pages, or use search_pdf to locate what you need.\n`;
}

/**
 * How much content a clipped response may keep.
 *
 * The clip note is charged to the allowance rather than added on top of
 * it: it is emitted below the cut, so leaving it out spends part of the
 * reserve the structured notice still has to fit in — a few characters
 * of slack that the Overview clause has since used up. Below a cap that
 * cannot hold the note itself the charge is dropped, because nothing
 * fits there in any arrangement and content is what a caller can use.
 */
function clipRoom(limit: number, note: string): number {
  return limit >= note.length ? limit - note.length : Math.max(0, limit);
}

/**
 * Last-resort clip, for the one case page selection cannot cover: not
 * even the first page fits, so the response is cut mid-content and has
 * to say where.
 */
function clampBody(body: string, limit: number, charCap: number): string {
  if (body.length <= limit) return body;
  const note = clipNote(charCap);
  return body.slice(0, clipRoom(limit, note)) + note;
}

/** An Overview row: `| 419 | 3203 | … |`, one page per line. */
const OVERVIEW_ROW = /^\|\s*(\d+)\s*\|.*\|\s*$/;

/**
 * The last page whose Overview row survived the cut, or undefined when
 * no complete row did. `rowsStart` comes from the header's builder (see
 * {@link TruncateOptions.overviewStart}), so nothing before it — however
 * table-like — is ever read as a row; the heading, the column header,
 * and the separator inside the section do not match the row pattern.
 */
function lastOverviewRowPage(clipped: string, rowsStart: number): number | undefined {
  if (clipped.length <= rowsStart) return undefined;
  const lines = clipped.slice(rowsStart).split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const page = OVERVIEW_ROW.exec(lines[index] ?? '')?.[1];
    if (page !== undefined) return Number(page);
  }
  return undefined;
}

interface ClampedHeader {
  text: string;
  /** Whether the header carried a real Overview section to lose rows from. */
  hasOverview: boolean;
  /** Last page whose Overview row survived the cut, if the table was reached at all. */
  lastOverviewPage: number | undefined;
}

/**
 * Clip a header that alone overflows the budget, on a line boundary.
 *
 * The header's Overview table is one row per line, so cutting at the raw
 * character limit leaves a half row with no closing `|` and names a page
 * whose numbers the reader only partly received. Backing up to the
 * preceding line break can only remove characters, and page selection is
 * already settled by the time this runs, so no body can move in behind it.
 */
function clampHeader(header: string, limit: number, charCap: number, overviewStart: number | undefined): ClampedHeader {
  const note = clipNote(charCap);
  const cut = header.slice(0, clipRoom(limit, note));
  const aligned = cut.endsWith('\n') ? cut : cut.slice(0, cut.lastIndexOf('\n') + 1);
  return {
    text: aligned + note,
    hasOverview: overviewStart !== undefined,
    lastOverviewPage: overviewStart === undefined ? undefined : lastOverviewRowPage(aligned, overviewStart),
  };
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
  const headerClip = header.length > limit ? clampHeader(header, limit, charCap, options.overviewStart) : undefined;
  if (dropped.length === 0) return headerClip?.text ?? header;

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
      : (headerClip?.text ?? clampBody(header + (clipped[0]?.text ?? ''), limit, charCap));
  const shown =
    kept.length > 0
      ? `showing pages ${formatPageRange(kept.map((section) => section.page))}`
      : 'no page fits it whole, so nothing below is complete';
  // "Bodies", not "pages": the header normally carries an Overview row
  // for every selected page, so a caller reading "756 pages omitted"
  // next to 419 rows of per-page detail cannot tell what it was denied.
  // That only holds while the header survives whole. When the Overview
  // alone overflows the budget the rows below the cut are gone too, and
  // the count would then imply detail the response does not carry — so
  // the notice reports the clip and the last row that made it.
  const omitted = `${dropped.length} page ${dropped.length === 1 ? 'body' : 'bodies'} omitted (${formatPageRange(dropped)})`;
  // No clause at all when the header had no Overview to lose (a
  // single-page selection): claiming one was clipped would be as false
  // as the count it replaces.
  const overviewLoss =
    headerClip === undefined || !headerClip.hasOverview
      ? undefined
      : headerClip.lastOverviewPage === undefined
        ? 'Overview clipped before any page row'
        : `Overview clipped after page ${headerClip.lastOverviewPage}`;
  const lost = overviewLoss === undefined ? `${shown}, ${omitted}` : [shown, overviewLoss, omitted].join('; ');

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
    `[pdfvision] Truncated at the ${charCap.toLocaleString('en-US')}-char response budget: ${lost}.`,
    next,
    '',
  ].join('\n');
  return body + notice;
}
