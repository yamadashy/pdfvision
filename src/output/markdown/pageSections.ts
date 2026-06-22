import type { PageResult } from '../../types/index.js';
import { escapeTableCell, formatBox } from './helpers.js';

type SearchMatches = NonNullable<PageResult['matches']>;

export function appendSearchMatches(lines: string[], matches: SearchMatches): void {
  lines.push('');
  lines.push('### Search matches');
  if (matches.length === 0) {
    lines.push('');
    lines.push('_No search matches found._');
    return;
  }

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
