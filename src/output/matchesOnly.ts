import type { DocumentResult, OutputFormat, SearchMatch } from '../types/index.js';
import { escapeTableCell, formatBox } from './markdown/helpers.js';
import { encodeJsonModelAsToon } from './toon.js';
import { escapeAttr, escapeText } from './xml/helpers.js';

/**
 * Focused search report. Retain the file, total page/match counts, and query
 * list, then emit flat matches with page, source, text, optional context, and
 * bbox. The full pages/body payload is omitted so an agent asking "where does
 * BLEU appear" can feed a reported bbox into `--render-region`. Output size
 * still grows with the emitted matches and context.
 *
 * A run that matched nothing anywhere still succeeds (exit 0) and emits a
 * zero-match report — a zero count is a valid observation for an agent,
 * distinct from grep's exit-1 "not found" convention.
 *
 * The JSON/TOON model has this flat shape; Markdown and XML expose the same
 * report metadata and match fields in their native representations:
 *   { file, totalPages, queries, totalMatches, matches: [{ page,
 *     queryIndex, source, text, context?, bbox: {x,y,width,height} }] }
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
}

interface MatchesOnlyModel {
  file: string;
  totalPages: number;
  queries: string[];
  totalMatches: number;
  matches: FlatMatch[];
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
      });
    }
  }
  return { file: result.file, totalPages: result.totalPages, queries, totalMatches: matches.length, matches };
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
  };
}

function serializableModel(model: MatchesOnlyModel) {
  return {
    file: model.file,
    totalPages: model.totalPages,
    queries: model.queries,
    totalMatches: model.totalMatches,
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

function formatMarkdown(model: MatchesOnlyModel): string {
  const lines: string[] = [];
  lines.push(`# ${model.file}`);
  lines.push('');
  lines.push(`- **Pages:** ${model.totalPages}`);
  lines.push(`- **Matches:** ${summaryLine(model)}`);
  if (model.totalMatches === 0) return lines.join('\n');

  lines.push('');
  lines.push('| Page | Query | Source | Text | Context | BBox |');
  lines.push('| ---: | --- | --- | --- | --- | --- |');
  for (const m of model.matches) {
    lines.push(
      `| ${m.page} | ${escapeTableCell(m.query)} | ${m.source} | ${escapeTableCell(m.text)} | ${escapeTableCell(m.context ?? '')} | ${formatBox(m.bbox)} |`,
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

function formatXml(model: MatchesOnlyModel): string {
  const out: string[] = [];
  out.push(
    `<matches file="${escapeAttr(model.file)}" totalPages="${model.totalPages}" totalMatches="${model.totalMatches}">`,
  );
  out.push('<queries>');
  for (const q of model.queries) out.push(`<query>${escapeText(q)}</query>`);
  out.push('</queries>');
  for (const m of model.matches) {
    const attrs = [
      `page="${m.page}"`,
      `queryIndex="${m.queryIndex}"`,
      `source="${m.source}"`,
      `x="${m.bbox.x}"`,
      `y="${m.bbox.y}"`,
      `width="${m.bbox.width}"`,
      `height="${m.bbox.height}"`,
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
