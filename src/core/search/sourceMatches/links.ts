import type { PageLink, SearchMatch } from '../../../types/index.js';
import { type CompiledSearch, nfkc } from '../compiler.js';
import { duplicateKey, hasPreciseDuplicateAtBox } from '../duplicates.js';
import { cleanContext, roundedBox } from './shared.js';

export function appendLinkMatches(
  matches: SearchMatch[],
  links: readonly PageLink[] | undefined,
  pageNum: number,
  compiled: CompiledSearch,
  matchCap: number,
  onWarning?: (message: string) => void,
): void {
  if (!links || links.length === 0) return;
  const linkCount = new Map<number, number>();
  const linkCapped = new Set<number>();
  for (const link of links) {
    const rawSearchValue = linkSearchValue(link);
    if (rawSearchValue === undefined) continue;
    const haystack = compiled.normalize ? nfkc(rawSearchValue) : rawSearchValue;
    if (haystack.length === 0) continue;
    for (let mi = 0; mi < compiled.matchers.length; mi++) {
      if (linkCapped.has(mi)) continue;
      const m = compiled.matchers[mi];
      m.regex.lastIndex = 0;
      while (true) {
        const hit = m.regex.exec(haystack);
        if (hit === null) break;
        if (hit[0].length === 0) {
          m.regex.lastIndex++;
          continue;
        }
        const hitKey = duplicateKey(m.queryIndex, m.query, hit[0], m.regex.ignoreCase);
        const box = roundedBox(link);
        if (hasPreciseDuplicateAtBox(matches, compiled, hitKey, box)) continue;
        matches.push({
          page: pageNum,
          query: m.query,
          ...(m.queryIndex !== undefined && { queryIndex: m.queryIndex }),
          bbox: box,
          boxes: [box],
          text: hit[0],
          source: 'link',
          context: linkMatchContext(link, haystack),
        });
        const next = (linkCount.get(mi) ?? 0) + 1;
        linkCount.set(mi, next);
        if (next >= matchCap) {
          linkCapped.add(mi);
          onWarning?.(
            `search query ${JSON.stringify(m.query)} hit the per-page link match cap of ${matchCap} on page ${pageNum}; subsequent link matches for this query on this page were dropped.`,
          );
          break;
        }
      }
    }
    if (linkCapped.size === compiled.matchers.length) break;
  }
}

function linkSearchValue(link: PageLink): string | undefined {
  if (typeof link.target === 'string' && link.target.length > 0) return link.target;
  if (Array.isArray(link.target) && link.target.length > 0) return JSON.stringify(link.target);
  return undefined;
}

function linkMatchContext(link: PageLink, value: string): string {
  return cleanContext(`${link.type} link target: ${value}`, 240);
}
