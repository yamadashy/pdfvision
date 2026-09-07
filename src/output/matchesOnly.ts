import { cropRegionForBox } from '../core/search/boxes.js';
import { type UnreadableSourceReport, unreadableSourceReport } from '../core/warnings/unreadableSource.js';
import type { DocumentResult, OutputFormat, PageQuality, PageWarning, SearchMatch } from '../types/index.js';
import { escapeInline, escapeTableCell, formatBox } from './markdown/helpers.js';
import { encodeJsonModelAsToon } from './toon.js';
import { escapeAttr, escapeText } from './xml/helpers.js';

/**
 * Focused search report. Retain the file, total page/match counts, and query
 * list, then emit flat matches with page, source, text, optional context, and
 * both the tight bbox and crop-ready region. Diagnostics are retained only
 * for selected pages with warnings or non-OK quality, without restoring their
 * page bodies. The full pages/body payload is omitted so an agent asking
 * "where does BLEU appear" can feed the reported region unchanged into
 * `--render-region`. Output size still grows with the emitted matches, context,
 * and diagnostics.
 *
 * A run that matched nothing anywhere still succeeds (exit 0) and emits a
 * zero-match report — a zero count is a valid observation for an agent,
 * distinct from grep's exit-1 "not found" convention.
 *
 * The JSON/TOON model has this flat shape; Markdown and XML expose the same
 * report metadata and match fields in their native representations:
 *   { file, totalPages, queries, totalMatches, pageUserUnits?:
 *     [{ page, userUnit }], pageDiagnostics?: [{ page, quality, warnings? }],
 *     unreadableSource?: { pages, notes }, matches: [{ page, queryIndex,
 *     source, text, context?, bbox: {x,y,width,height},
 *     region: {x,y,width,height} }] }
 * `bbox` hugs the matched glyphs; `region` is the crop-ready box grown to
 * the containing table row or visual line, and is what --render-region
 * wants. XML carries the same pair as x/y/width/height plus
 * regionX/regionY/regionWidth/regionHeight on <match>.
 * `pageUserUnits` is omitted when every selected page uses the default value
 * 1. It keeps raw match boxes physically interpretable without restoring the
 * full pages[] payload; the emitted region still passes unchanged to
 * `--render-region`.
 */

/** One flattened match, carrying the parent query string (markdown shows
 *  it; json/xml/toon key off `queryIndex` instead). */
interface FlatMatch {
  page: number;
  query: string;
  queryIndex: number;
  source: SearchMatch['source'];
  text: string;
  context?: string;
  bbox: SearchMatch['bbox'];
  /**
   * Crop-ready box for `--render-region`, grown from `bbox` to the table
   * row or visual line the hit sits in. `bbox` hugs the glyphs, so
   * rendering it verbatim shows the row label and none of its values;
   * this is the box the evidence chain is meant to use.
   */
  region: SearchMatch['bbox'];
}

interface MatchesOnlyModel {
  file: string;
  totalPages: number;
  queries: string[];
  totalMatches: number;
  pageUserUnits?: { page: number; userUnit: number }[];
  pageDiagnostics?: PageDiagnostic[];
  unreadableSource?: UnreadableSourceReport;
  matches: FlatMatch[];
}

interface PageDiagnostic {
  page: number;
  quality: PageQuality;
  warnings?: PageWarning[];
}

function needsDiagnostics(quality: PageQuality, warnings: PageWarning[] | undefined): boolean {
  return (
    (warnings?.length ?? 0) > 0 ||
    quality.nativeTextStatus !== 'ok' ||
    (quality.visualStatus !== undefined && quality.visualStatus !== 'ok')
  );
}

function buildModel(result: DocumentResult, queries: string[]): MatchesOnlyModel {
  const matches: FlatMatch[] = [];
  for (const page of result.pages) {
    for (const m of page.matches ?? []) {
      matches.push({
        page: m.page,
        query: m.query,
        // Single-query runs omit queryIndex on the match; the flat shape
        // always carries it (defaulting to 0) so consumers can map back
        // into `queries` uniformly regardless of query count.
        queryIndex: m.queryIndex ?? 0,
        source: m.source,
        text: m.text,
        ...(m.context !== undefined && { context: m.context }),
        bbox: m.bbox,
        region: cropRegionForBox(m.bbox, page),
      });
    }
  }
  const pageUserUnits = result.pages.flatMap((page) =>
    page.userUnit === undefined ? [] : [{ page: page.page, userUnit: page.userUnit }],
  );
  const pageDiagnostics = result.pages.flatMap((page): PageDiagnostic[] => {
    if (!needsDiagnostics(page.quality, page.warnings)) return [];
    return [
      {
        page: page.page,
        quality: page.quality,
        ...(page.warnings !== undefined && page.warnings.length > 0 && { warnings: page.warnings }),
      },
    ];
  });
  const unreadableSource = unreadableSourceReport(result.pages);
  return {
    file: result.file,
    totalPages: result.totalPages,
    queries,
    totalMatches: matches.length,
    ...(pageUserUnits.length > 0 && { pageUserUnits }),
    ...(pageDiagnostics.length > 0 && { pageDiagnostics }),
    ...(unreadableSource.pages.length > 0 && { unreadableSource }),
    matches,
  };
}

/** Serialisable entry with the query string dropped — json/xml/toon key
 *  off `queryIndex` against the top-level `queries` array instead. */
function serializableEntry(m: FlatMatch) {
  return {
    page: m.page,
    queryIndex: m.queryIndex,
    source: m.source,
    text: m.text,
    ...(m.context !== undefined && { context: m.context }),
    bbox: m.bbox,
    region: m.region,
  };
}

function serializableModel(model: MatchesOnlyModel) {
  return {
    file: model.file,
    totalPages: model.totalPages,
    queries: model.queries,
    totalMatches: model.totalMatches,
    ...(model.pageUserUnits !== undefined && { pageUserUnits: model.pageUserUnits }),
    ...(model.pageDiagnostics !== undefined && { pageDiagnostics: model.pageDiagnostics }),
    ...(model.unreadableSource !== undefined && { unreadableSource: model.unreadableSource }),
    matches: model.matches.map(serializableEntry),
  };
}

/** Human-readable summary of the match count, quoted queries, and the
 *  pages they landed on: `3 ("BLEU") on page 1`. Zero matches → `0`. */
function summaryLine(model: MatchesOnlyModel): string {
  if (model.totalMatches === 0) return '0';
  const quoted = model.queries.map((q) => `"${q}"`).join(', ');
  const pages = [...new Set(model.matches.map((m) => m.page))].sort((a, b) => a - b);
  const pagesFragment = pages.length === 1 ? ` on page ${pages[0]}` : ` on pages ${pages.join(', ')}`;
  return `${model.totalMatches} (${quoted})${pagesFragment}`;
}

function warningIndexReferences(warning: PageWarning): string[] {
  const references: string[] = [];
  if (warning.blockIndex !== undefined) references.push(`blockIndex=${warning.blockIndex}`);
  if (warning.otherBlockIndex !== undefined) references.push(`otherBlockIndex=${warning.otherBlockIndex}`);
  if (warning.imageBoxIndex !== undefined) references.push(`imageBoxIndex=${warning.imageBoxIndex}`);
  return references;
}

function appendMarkdownDiagnostics(lines: string[], diagnostics: PageDiagnostic[] | undefined): void {
  if (!diagnostics) return;

  lines.push('');
  lines.push('## Diagnostics');
  lines.push('');
  let hasIndexReferences = false;
  for (const diagnostic of diagnostics) {
    const visual =
      diagnostic.quality.visualStatus === undefined ? '' : `; visual: \`${diagnostic.quality.visualStatus}\``;
    lines.push(`- **Page ${diagnostic.page}** — native: \`${diagnostic.quality.nativeTextStatus}\`${visual}`);
    for (const warning of diagnostic.warnings ?? []) {
      const references = warningIndexReferences(warning);
      hasIndexReferences ||= references.length > 0;
      const referenceText = references.length > 0 ? ` [${references.join(', ')}]` : '';
      lines.push(`  - **${warning.severity}** (\`${warning.code}\`): ${escapeInline(warning.message)}${referenceText}`);
    }
  }
  if (hasIndexReferences) {
    lines.push('');
    lines.push(
      '_Warning indices refer to `layout.blocks` or `imageBoxes` in the full report; those arrays are omitted here._',
    );
  }
}

function appendMarkdownUnreadableSource(lines: string[], report: UnreadableSourceReport | undefined): void {
  if (!report) return;

  lines.push('');
  lines.push('## Unreadable source');
  lines.push('');
  lines.push(`- **Pages:** ${report.pages.join(', ')}`);
  for (const note of report.notes) lines.push(`- ${escapeInline(note)}`);
}

function formatMarkdown(model: MatchesOnlyModel): string {
  const lines: string[] = [];
  lines.push(`# ${model.file}`);
  lines.push('');
  lines.push(`- **Pages:** ${model.totalPages}`);
  lines.push(`- **Matches:** ${summaryLine(model)}`);
  if (model.pageUserUnits) {
    lines.push(
      `- **Page UserUnits:** ${model.pageUserUnits.map((item) => `${item.page}=${item.userUnit}`).join(', ')}`,
    );
  }
  appendMarkdownDiagnostics(lines, model.pageDiagnostics);
  appendMarkdownUnreadableSource(lines, model.unreadableSource);
  if (model.totalMatches === 0) return lines.join('\n');

  lines.push('');
  lines.push('| Page | Query | Source | Text | Context | BBox | Region |');
  lines.push('| ---: | --- | --- | --- | --- | --- | --- |');
  for (const m of model.matches) {
    lines.push(
      `| ${m.page} | ${escapeTableCell(m.query)} | ${m.source} | ${escapeTableCell(m.text)} | ${escapeTableCell(m.context ?? '')} | ${formatBox(m.bbox)} | ${formatBox(m.region)} |`,
    );
  }
  return lines.join('\n');
}

function formatJson(model: MatchesOnlyModel): string {
  return JSON.stringify(serializableModel(model), null, 2);
}

function formatToon(model: MatchesOnlyModel): string {
  return encodeJsonModelAsToon(serializableModel(model));
}

function appendXmlWarnings(out: string[], warnings: PageWarning[]): void {
  out.push('<warnings>');
  for (const warning of warnings) {
    const attrs = [`code="${warning.code}"`, `severity="${warning.severity}"`];
    if (warning.blockIndex !== undefined) attrs.push(`blockIndex="${warning.blockIndex}"`);
    if (warning.otherBlockIndex !== undefined) attrs.push(`otherBlockIndex="${warning.otherBlockIndex}"`);
    if (warning.imageBoxIndex !== undefined) attrs.push(`imageBoxIndex="${warning.imageBoxIndex}"`);
    out.push(`<warning ${attrs.join(' ')}>${escapeText(warning.message)}</warning>`);
  }
  out.push('</warnings>');
}

function appendXmlDiagnostics(out: string[], diagnostics: PageDiagnostic[] | undefined): void {
  if (!diagnostics) return;

  out.push('<pageDiagnostics>');
  for (const diagnostic of diagnostics) {
    const attrs = [`no="${diagnostic.page}"`, `nativeTextStatus="${diagnostic.quality.nativeTextStatus}"`];
    if (diagnostic.quality.visualStatus !== undefined) {
      attrs.push(`visualStatus="${diagnostic.quality.visualStatus}"`);
    }
    if (!diagnostic.warnings) {
      out.push(`<page ${attrs.join(' ')}/>`);
      continue;
    }
    out.push(`<page ${attrs.join(' ')}>`);
    appendXmlWarnings(out, diagnostic.warnings);
    out.push('</page>');
  }
  out.push('</pageDiagnostics>');
}

function appendXmlUnreadableSource(out: string[], report: UnreadableSourceReport | undefined): void {
  if (!report) return;

  out.push('<unreadableSource>');
  out.push('<pages>');
  for (const page of report.pages) out.push(`<page no="${page}"/>`);
  out.push('</pages>');
  out.push('<notes>');
  for (const note of report.notes) out.push(`<note>${escapeText(note)}</note>`);
  out.push('</notes>');
  out.push('</unreadableSource>');
}

function formatXml(model: MatchesOnlyModel): string {
  const out: string[] = [];
  out.push(
    `<matches file="${escapeAttr(model.file)}" totalPages="${model.totalPages}" totalMatches="${model.totalMatches}">`,
  );
  out.push('<queries>');
  for (const q of model.queries) out.push(`<query>${escapeText(q)}</query>`);
  out.push('</queries>');
  if (model.pageUserUnits) {
    out.push('<pageUserUnits>');
    for (const item of model.pageUserUnits) out.push(`<page no="${item.page}" userUnit="${item.userUnit}"/>`);
    out.push('</pageUserUnits>');
  }
  appendXmlDiagnostics(out, model.pageDiagnostics);
  appendXmlUnreadableSource(out, model.unreadableSource);
  for (const m of model.matches) {
    const attrs = [
      `page="${m.page}"`,
      `queryIndex="${m.queryIndex}"`,
      `source="${m.source}"`,
      `x="${m.bbox.x}"`,
      `y="${m.bbox.y}"`,
      `width="${m.bbox.width}"`,
      `height="${m.bbox.height}"`,
      `regionX="${m.region.x}"`,
      `regionY="${m.region.y}"`,
      `regionWidth="${m.region.width}"`,
      `regionHeight="${m.region.height}"`,
    ];
    out.push(`<match ${attrs.join(' ')}>`);
    out.push(`<text>${escapeText(m.text)}</text>`);
    if (m.context !== undefined) out.push(`<context>${escapeText(m.context)}</context>`);
    out.push('</match>');
  }
  out.push('</matches>');
  return out.join('\n');
}

/**
 * Render a {@link DocumentResult} as a focused matches-only report in the
 * requested format. `queries` is the verbatim search query list (used for
 * the markdown query column and the top-level `queries` array).
 */
export function formatMatchesOnly(result: DocumentResult, format: OutputFormat, queries: string[]): string {
  const model = buildModel(result, queries);
  switch (format) {
    case 'json':
      return formatJson(model);
    case 'xml':
      return formatXml(model);
    case 'toon':
      return formatToon(model);
    default:
      return formatMarkdown(model);
  }
}
