import type { PageResult } from '../../types/index.js';
import { escapeTableCell, formatBox } from './helpers.js';

type SearchMatches = NonNullable<PageResult['matches']>;

/** Render the per-page search-match table. Callers only invoke this for
 *  pages that actually matched (`matches.length > 0`); a zero-match page
 *  is silent — its density line already reports `matches: 0`. */
export function appendSearchMatches(lines: string[], matches: SearchMatches): void {
  if (matches.length === 0) return;

  lines.push('');
  lines.push('### Search matches');
  lines.push('');
  const showQueryIndex = matches.some((match) => match.queryIndex !== undefined);
  lines.push(`| Query |${showQueryIndex ? ' Query# |' : ''} Source | Text | Context | BBox |`);
  lines.push(`| --- |${showQueryIndex ? ' ---: |' : ''} --- | --- | --- | --- |`);
  for (const match of matches) {
    const queryIndexCell = showQueryIndex ? ` ${match.queryIndex ?? ''} |` : '';
    lines.push(
      `| ${escapeTableCell(match.query)} |${queryIndexCell} ${match.source} | ${escapeTableCell(match.text)} | ${escapeTableCell(match.context ?? '')} | ${formatBox(match.bbox)} |`,
    );
  }
}
