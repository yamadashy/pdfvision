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
    // A second link annotation stacked on the same rectangle with the
    // same target is the same link reported twice whatever its anchor
    // says, so those always suppress. Visible text at that rectangle is
    // only a duplicate when the anchor restates the target.
    const duplicateSources = anchorTextRestatesTarget(link, haystack, compiled.normalize) ? undefined : isLinkSource;
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
        if (hasPreciseDuplicateAtBox(matches, compiled, hitKey, box, duplicateSources)) continue;
        const count = linkCount.get(mi) ?? 0;
        if (count >= matchCap) {
          linkCapped.add(mi);
          onWarning?.(
            `search query ${JSON.stringify(m.query)} exceeded the per-page link match cap of ${matchCap} on page ${pageNum}; later link matches for this query on this page were dropped.`,
          );
          break;
        }
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
        linkCount.set(mi, count + 1);
      }
    }
    if (linkCapped.size === compiled.matchers.length) break;
  }
}

/**
 * Whether a native hit inside the link rectangle would be reporting the
 * same evidence as the link hit, rather than a second, different fact.
 *
 * The visible text is the whole difference. When the anchor *is* the
 * target — `https://example.com/a.pdf` printed as itself, a truncated
 * `example.com`, a table-of-contents row whose words are the destination
 * name — the page and the target say one thing twice, and the native hit
 * already carries the precise glyph box, so the link hit is noise. When
 * the anchor is prose (`Download the full dataset here` →
 * `…/datasets/q3-2026-full.csv`), the sentence and the hidden target are
 * different evidence that happen to share a word, and dropping the link
 * hit loses the only report that the document links there at all.
 *
 * The test is word coverage rather than equality, because a rendered URL
 * is rarely byte-identical to its target: it is shortened, loses its
 * scheme, gets an ellipsis, or mashes words together with hyphens and
 * slashes. So: the anchor restates the target when every one of its
 * words is also a word of the target. Prose fails that as soon as it
 * contributes a word of its own, which is nearly the definition of
 * prose. Both sides are tokenised the same way and compared whole —
 * substring containment would read `press` as covered by `wordpress`
 * and suppress an anchor that shares no word with its target at all.
 *
 * One-word anchors get a second condition: the word must look like part
 * of a URL, carrying a dot, slash, or colon. `example.com` does and is a
 * shortened rendering of the target; `Download` over `…/download/…` does
 * not, and it is the operational label a URL is most often hung on — the
 * case where the visible word and the link are least likely to be one
 * fact stated twice. A single common word is too little evidence to drop
 * a match on.
 *
 * An anchor pdfvision could not reconstruct is not treated as a
 * restatement. Silence is not evidence of double-reporting, and this
 * suppression is the one place in search where a match is dropped
 * outright rather than counted.
 */
function anchorTextRestatesTarget(link: PageLink, target: string, normalize: boolean): boolean {
  const anchor = link.text;
  if (anchor === undefined || anchor.length === 0) return false;
  const anchorText = (normalize ? nfkc(anchor) : anchor).toLowerCase();
  const anchorWords = anchorText.match(ANCHOR_WORD_PATTERN);
  if (!anchorWords || anchorWords.length === 0) return false;
  if (anchorWords.length === 1 && !URL_PUNCTUATION_PATTERN.test(anchorText)) return false;
  const targetWords = new Set(target.toLowerCase().match(ANCHOR_WORD_PATTERN) ?? []);
  return anchorWords.every((word) => targetWords.has(word));
}

const ANCHOR_WORD_PATTERN = /[\p{Letter}\p{Number}]+/gu;

/** Punctuation that makes a lone anchor word read as a URL fragment. */
const URL_PUNCTUATION_PATTERN = /[./:]/u;

function isLinkSource(source: SearchMatch['source']): boolean {
  return source === 'link';
}

function linkSearchValue(link: PageLink): string | undefined {
  if (typeof link.target === 'string' && link.target.length > 0) return link.target;
  if (Array.isArray(link.target) && link.target.length > 0) return JSON.stringify(link.target);
  return undefined;
}

function linkMatchContext(link: PageLink, value: string): string {
  return cleanContext(`${link.type} link target: ${value}`, 240);
}
