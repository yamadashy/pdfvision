import { formatJson } from '../../output/json.js';
import { formatMarkdown } from '../../output/markdown.js';
import { formatMatchesOnly } from '../../output/matchesOnly.js';
import { formatToon } from '../../output/toon.js';
import { formatXml } from '../../output/xml.js';
import type { DocumentResult, ProcessOptions } from '../../types/index.js';

/** Normalize the `search` option (string | string[] | undefined) into a
 *  flat query array for the matches-only formatter. */
function searchQueries(search: ProcessOptions['search']): string[] {
  if (search === undefined) return [];
  return Array.isArray(search) ? search : [search];
}

/** Render a structured DocumentResult into the caller-requested string format. */
export function renderResult(result: DocumentResult, options: ProcessOptions): string {
  const { format } = options;
  if (options.matchesOnly) {
    // Compact search-only output shares the same flat shape across all
    // four formats; dispatch before the per-format document formatters.
    return formatMatchesOnly(result, format, searchQueries(options.search));
  }
  switch (format) {
    case 'json':
      return formatJson(result);
    case 'xml':
      return formatXml(result);
    case 'toon':
      return formatToon(result);
    default:
      return formatMarkdown(result, { stripRepeated: options.stripRepeated });
  }
}
