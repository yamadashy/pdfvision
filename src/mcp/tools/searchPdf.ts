import { formatPageRange } from '../../core/options/pageRange.js';
import { processDocument } from '../../core/processor.js';
import { hasUnreliableNativeText } from '../../core/quality/pageQuality.js';
import { cropRegionForBox } from '../../core/search/boxes.js';
import { formatBox } from '../../output/markdown/helpers.js';
import type { PageResult } from '../../types/index.js';
import { MATCH_CONTEXT_CHAR_CAP, MAX_MATCHES, MAX_SEARCH_WARNINGS } from '../limits.js';
import { matchRef, rememberRef } from '../refs.js';
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

export async function searchPdf(input: SearchPdfInput): Promise<ToolResult> {
  const resolved = await resolveSource(input.source);
  const warnings: string[] = [];
  const result = await processDocument(resolved.filePath, {
    sourceData: resolved.sourceData,
    password: input.password,
    pages: input.pages,
    search: input.query,
    searchRegex: input.regex ?? false,
    onWarning: (message) => warnings.push(message),
  });

  const hits = result.pages.flatMap((page) => (page.matches ?? []).map((match, index) => ({ page, match, index })));
  const matchedPages = new Set(hits.map((hit) => hit.page.page));

  const lines: string[] = [`# ${result.file} — search ${JSON.stringify(input.query)}`, ''];
  lines.push(
    `${hits.length} match${hits.length === 1 ? '' : 'es'} on ${matchedPages.size} of ${result.pages.length} searched page(s); document has ${result.totalPages}.`,
  );

  // Core search warnings are what keep a zero honest here: a regex that
  // blew the per-page time budget produces the same "0 matches" as a
  // term that is genuinely absent, and the model choosing the pattern
  // has no stderr to see.
  if (warnings.length > 0) {
    lines.push('');
    for (const message of warnings.slice(0, MAX_SEARCH_WARNINGS)) lines.push(`> [pdfvision] ${message}`);
    if (warnings.length > MAX_SEARCH_WARNINGS) {
      lines.push(`> [pdfvision] ${warnings.length - MAX_SEARCH_WARNINGS} further warning(s) omitted.`);
    }
  }

  if (hits.length > 0) {
    lines.push('', 'Each hit carries a `ref` — pass it straight to `render_pdf` instead of copying coordinates.', '');
    for (const { page, match, index } of hits.slice(0, MAX_MATCHES)) {
      const ref = matchRef(page.page, index);
      const region = cropRegionForBox(match.bbox, page);
      rememberRef(input.source, ref, { page: page.page, region, origin: `search hit for ${input.query}` });
      const context = match.context ? ` — "${condense(match.context, MATCH_CONTEXT_CHAR_CAP)}"` : '';
      lines.push(
        `- \`${ref}\` p.${page.page} ${match.source} · \`${condense(match.text, 80)}\`${context} · region ${formatBox(region)}`,
      );
    }
    if (hits.length > MAX_MATCHES) {
      // Naming every remaining page can be longer than the matches it
      // replaces, so report the span plus the few densest pages instead.
      const remaining = hits.slice(MAX_MATCHES);
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
        `[pdfvision] ${remaining.length} further match(es) omitted at the ${MAX_MATCHES}-match cap, spread over ${perPage.size} page(s) from ${pageNumbers[0]} to ${pageNumbers[pageNumbers.length - 1]}; densest ${densest}. Narrow with \`pages\`, or search a longer phrase.`,
      );
    }
  }

  appendUnsearchable(lines, result.pages);

  if (hits.length > 0) {
    const first = hits[0];
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
