import type { PageResult } from '../../types/index.js';
import { escapeInline } from './helpers.js';

const MAX_LISTED = 8;
const MAX_TEXT_CHARS = 100;

interface ChromeGroup {
  first: string;
  last: string;
  pages: Set<number>;
  order: number;
}

/**
 * One header line naming the repeated page chrome that `stripRepeated`
 * removed from the page bodies, so text that only appears in a running
 * header or footer (`Confidential`, a print date, a source URL) is still
 * in the response once instead of nowhere. Strings that differ only in
 * their digits (`Page 2 of 9`) are one entry, shown as first … last.
 */
export function repeatedChromeSummary(pages: readonly PageResult[]): string | undefined {
  const groups = new Map<string, ChromeGroup>();
  for (const page of pages) {
    for (const block of page.layout?.blocks ?? []) {
      if (!block.repeated) continue;
      const text = block.text.replace(/\s+/gu, ' ').trim();
      if (text.length === 0) continue;
      const key = text.replace(/\p{N}+/gu, '#');
      const group = groups.get(key);
      if (group) {
        group.last = text;
        group.pages.add(page.page);
      } else {
        groups.set(key, { first: text, last: text, pages: new Set([page.page]), order: groups.size });
      }
    }
  }
  if (groups.size === 0) return undefined;

  const sorted = [...groups.values()].sort((a, b) => b.pages.size - a.pages.size || a.order - b.order);
  const listed = sorted.slice(0, MAX_LISTED).map((group) => {
    const shown = group.first === group.last ? quote(group.first) : `${quote(group.first)} … ${quote(group.last)}`;
    return `${shown} (${group.pages.size} ${group.pages.size === 1 ? 'page' : 'pages'})`;
  });
  const more = sorted.length > MAX_LISTED ? `; ${sorted.length - MAX_LISTED} more` : '';
  return `- **Repeated page chrome (removed from page bodies):** ${listed.join('; ')}${more}`;
}

function quote(text: string): string {
  const chars = Array.from(text);
  const clipped = chars.length <= MAX_TEXT_CHARS ? text : `${chars.slice(0, MAX_TEXT_CHARS - 1).join('')}…`;
  return `"${escapeInline(clipped)}"`;
}
