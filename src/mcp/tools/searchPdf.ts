import { formatPageRange } from '../../core/options/pageRange.js';
import { processDocument } from '../../core/processor.js';
import { hasUnreliableNativeText } from '../../core/quality/pageQuality.js';
import { cropRegionForBox } from '../../core/search/boxes.js';
import { isRegexTimeoutWarning } from '../../core/search/index.js';
import { formatBox } from '../../output/markdown/helpers.js';
import type { PageResult, RenderRegion, SearchMatch } from '../../types/index.js';
import { MATCH_CONTEXT_CHAR_CAP, MAX_MATCH_TEXTS, MAX_MATCHES, MAX_SEARCH_WARNINGS } from '../limits.js';
import { forgetRefs, matchRef, rememberRef } from '../refs.js';
import { type ToolResult, toolResult } from '../result.js';
import { resolveSource } from '../source.js';

export interface SearchPdfInput {
  source: string;
  query: string;
  pages?: string;
  regex?: boolean;
  password?: string;
}

function condense(text: string, cap: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= cap ? flat : `${flat.slice(0, cap)}…`;
}

export interface SearchHit {
  page: PageResult;
  match: SearchMatch;
}

export interface CollapsedHit {
  page: PageResult;
  region: RenderRegion;
  /** 0-based position among the collapsed hits of this page, so refs stay dense. */
  index: number;
  /** Occurrences this row stands for. */
  count: number;
  /** Distinct matched strings in first-appearance order, capped. */
  texts: string[];
  /** More distinct strings were found than `texts` carries. */
  moreTexts: boolean;
  source: SearchMatch['source'];
  context?: string;
}

function regionKey(page: number, region: RenderRegion): string {
  return `${page}:${region.x},${region.y},${region.width},${region.height}`;
}

/**
 * One row per place, not per occurrence.
 *
 * A hit's crop grows to the line or table row it sits in, so two hits on
 * one line resolve to the same region and used to emit two rows that
 * differed only in their ref — three copies of one handle, since both
 * render the same image. Grouping on `(page, region)` is exact rather
 * than approximate: the regions come from the same computation over the
 * same structure, so equal places produce equal numbers.
 *
 * The matched strings are kept per row because they are the one thing
 * that can differ within a group — `the` / `The`, or, under a regex,
 * unrelated substrings — and dropping them would make the row claim
 * something the document does not say.
 */
export function collapseHits(hits: readonly SearchHit[]): CollapsedHit[] {
  const groups = new Map<string, { collapsed: CollapsedHit; seen: Set<string> }>();
  const perPageCount = new Map<number, number>();
  const out: CollapsedHit[] = [];

  for (const { page, match } of hits) {
    const region = cropRegionForBox(match.bbox, page);
    const key = regionKey(page.page, region);
    const group = groups.get(key);
    if (group) {
      group.collapsed.count++;
      if (!group.seen.has(match.text)) {
        group.seen.add(match.text);
        if (group.collapsed.texts.length < MAX_MATCH_TEXTS) group.collapsed.texts.push(match.text);
        else group.collapsed.moreTexts = true;
      }
      continue;
    }
    const index = perPageCount.get(page.page) ?? 0;
    perPageCount.set(page.page, index + 1);
    const collapsed: CollapsedHit = {
      page,
      region,
      index,
      count: 1,
      texts: [match.text],
      moreTexts: false,
      source: match.source,
      context: match.context,
    };
    groups.set(key, { collapsed, seen: new Set([match.text]) });
    out.push(collapsed);
  }

  return out;
}

/**
 * Native text can be absent or corrupted while search still returns zero
 * hits without complaint. A silent "not found" on a scanned page is the
 * exact failure pdfvision exists to expose, so the report says which
 * pages could not have matched in the first place. Same classification
 * the document map uses to suggest OCR.
 */
function appendUnsearchable(lines: string[], pages: readonly PageResult[]): void {
  const suspect = pages.filter(hasUnreliableNativeText);
  if (suspect.length === 0) return;
  lines.push(
    '',
    `> ${suspect.length} of the searched pages have no usable native text (${formatPageRange(suspect.map((page) => page.page))}), so a miss there is not evidence of absence. Re-run \`read_pdf\` with \`ocr\` on those pages, or \`render_pdf\` to look at them.`,
  );
}

/**
 * Page-level warnings for the pages a hit landed on.
 *
 * A match is a claim that the text says something, and these codes are
 * the cases where the text is not what the page shows: glyphs that map
 * to nothing, native text drawn invisibly, text sitting under an opaque
 * fill, an OCR layer over a scan. `read_pdf` surfaces them inline with
 * the body; a search response that omits them hands back the one line
 * that matched with none of the reasons to distrust it — and the whole
 * point of the ref is that the caller renders instead of re-reading.
 *
 * Codes only, not messages: the message is written for someone holding
 * the page, and the recovery here is the same for all of them (render
 * the ref). Errors first, then warnings, capped like the search
 * warnings above.
 */
export function appendPageWarnings(lines: string[], pages: readonly PageResult[], matched: ReadonlySet<number>): void {
  const noted = pages
    .filter((page) => matched.has(page.page) && (page.warnings ?? []).length > 0)
    .map((page) => ({
      page: page.page,
      codes: [
        ...new Set(
          [...(page.warnings ?? [])]
            .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
            .map((warning) => warning.code),
        ),
      ],
    }));
  if (noted.length === 0) return;

  const shown = noted.slice(0, MAX_SEARCH_WARNINGS);
  const subject = noted.length === 1 ? 'A page carrying a hit also carries' : 'Pages carrying hits also carry';
  lines.push('', `> ${subject} extraction warnings — render the ref before quoting the text:`);
  for (const entry of shown) lines.push(`> - p.${entry.page}: ${entry.codes.join(', ')}`);
  const omitted = noted.length - shown.length;
  if (omitted > 0) lines.push(`> - ${omitted} further page(s) with warnings omitted.`);
}

/**
 * Core search warnings are what keep a zero honest here: a regex that
 * blew the per-page time budget produces the same "0 matches" as a term
 * that is genuinely absent, and the model choosing the pattern has no
 * stderr to see. Relayed warnings are capped at MAX_SEARCH_WARNINGS,
 * and regex-timeout warnings outrank the rest — they are the one class
 * whose loss turns a zero into false evidence of absence, and a
 * document that warns on many early pages would otherwise push them
 * past the cap. Retention is bounded per class too, so a degenerate
 * thousand-page search cannot accumulate a thousand strings just to
 * report five.
 */
export function searchWarningCollector(): { onWarning: (message: string) => void; lines: () => string[] } {
  const timeouts: string[] = [];
  const others: string[] = [];
  let total = 0;
  return {
    onWarning(message: string): void {
      total++;
      const bucket = isRegexTimeoutWarning(message) ? timeouts : others;
      if (bucket.length < MAX_SEARCH_WARNINGS) bucket.push(message);
    },
    lines(): string[] {
      if (total === 0) return [];
      const shown = [...timeouts, ...others].slice(0, MAX_SEARCH_WARNINGS);
      const out = ['', ...shown.map((message) => `> [pdfvision] ${message}`)];
      const omitted = total - shown.length;
      if (omitted > 0) out.push(`> [pdfvision] ${omitted} further warning(s) omitted.`);
      return out;
    },
  };
}

export async function searchPdf(input: SearchPdfInput): Promise<ToolResult> {
  const resolved = await resolveSource(input.source);
  const warningLog = searchWarningCollector();
  const result = await processDocument(resolved.filePath, {
    sourceData: resolved.sourceData,
    password: input.password,
    pages: input.pages,
    search: input.query,
    searchRegex: input.regex ?? false,
    // Not for the body — this tool never emits page text. Layout is what
    // lets a hit's crop grow to the line or table row it sits in, which is
    // the difference between `render_pdf(ref:)` showing a row's values and
    // showing only its label. Measured at ~3% of a whole-document search.
    layout: true,
    onWarning: warningLog.onWarning,
  });

  const hits = result.pages.flatMap((page) => (page.matches ?? []).map((match) => ({ page, match })));
  const matchedPages = new Set(hits.map((hit) => hit.page.page));
  const collapsed = collapseHits(hits);

  const lines: string[] = [`# ${result.file} — search ${JSON.stringify(input.query)}`, ''];
  lines.push(
    `${hits.length} match${hits.length === 1 ? '' : 'es'} on ${matchedPages.size} of ${result.pages.length} searched page(s); document has ${result.totalPages}.`,
  );

  lines.push(...warningLog.lines());

  // This response replaces whatever the previous one filed for this
  // source, which is what the ref contract promises: a handle from an
  // older search must not still resolve. A search that found nothing
  // replaces it too — that is exactly the case where a leftover ref
  // would render evidence for a question no longer being asked.
  forgetRefs(input.source);

  if (collapsed.length > 0) {
    lines.push(
      '',
      "One row per distinct place; `×N` counts the occurrences it covers. Pass a row's `ref` straight to `render_pdf` instead of copying coordinates.",
      '',
    );
    for (const hit of collapsed.slice(0, MAX_MATCHES)) {
      const ref = matchRef(hit.page.page, hit.index);
      rememberRef(input.source, ref, {
        page: hit.page.page,
        region: hit.region,
        origin: `search hit for ${input.query}`,
      });
      const texts = hit.texts.map((value) => `\`${condense(value, 80)}\``).join(' / ') + (hit.moreTexts ? ' / …' : '');
      const multiplicity = hit.count > 1 ? ` ×${hit.count}` : '';
      const context = hit.context ? ` — "${condense(hit.context, MATCH_CONTEXT_CHAR_CAP)}"` : '';
      lines.push(
        `- \`${ref}\` p.${hit.page.page} ${hit.source} · ${texts}${multiplicity}${context} · region ${formatBox(hit.region)}`,
      );
    }
    if (collapsed.length > MAX_MATCHES) {
      // Naming every remaining page can be longer than the rows it
      // replaces, so report the span plus the few densest pages instead.
      const remaining = collapsed.slice(MAX_MATCHES);
      const perPage = new Map<number, number>();
      for (const hit of remaining) perPage.set(hit.page.page, (perPage.get(hit.page.page) ?? 0) + 1);
      const densest = [...perPage.entries()]
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])
        .slice(0, 5)
        .map(([page, count]) => `p.${page} (${count})`)
        .join(', ');
      const pageNumbers = [...perPage.keys()].sort((a, b) => a - b);
      lines.push(
        '',
        `[pdfvision] ${remaining.length} further place(s) omitted at the ${MAX_MATCHES}-place cap, spread over ${perPage.size} page(s) from ${pageNumbers[0]} to ${pageNumbers[pageNumbers.length - 1]}; densest by place ${densest}. Narrow with \`pages\`, or search a longer phrase.`,
      );
    }
  }

  appendUnsearchable(lines, result.pages);
  appendPageWarnings(lines, result.pages, matchedPages);

  if (collapsed.length > 0) {
    const first = collapsed[0];
    lines.push(
      '',
      '## Next step',
      '',
      `- \`render_pdf(ref: "${matchRef(first?.page.page ?? 1, first?.index ?? 0)}")\` — see the hit in place`,
      `- \`read_pdf(pages: "${first?.page.page}")\` — read the surrounding page`,
    );
  }

  return toolResult(lines.join('\n'));
}
