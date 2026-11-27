import { KERN_TRACKED_CHAR_RE, type PageFontTextHints } from './fontTextHints.js';
import {
  codePointLength,
  isRawTextItem,
  isWhitespaceItem,
  type RawTextItem,
  type UprightGeometry,
  uprightGeometry,
  withTextAndExtent,
} from './textItems.js';

/**
 * Undo letter spacing that pdf.js reads as word spaces: words drawn with
 * character spacing (`Tc`) or equal `TJ` adjustments, which the operator
 * list records as tracked words (see fontTextHints.ts).
 *
 * pdf.js puts a space inside an item wherever the gap between two glyphs
 * passes ~0.1 em, so a letter-spaced heading arrives as
 * `A C K G R O U N D`; past about 0.6 em it gives every glyph an item of its
 * own, with a space item between. Tokens of an item, or single-glyph items
 * on one baseline, that together spell part of a tracked word are
 * rejoined. A real space glyph splits the word, so `SUMMARY OF` keeps its
 * one space, and two tracked words that far apart stay on one line.
 *
 * Justified CJK lines, spread glyph by glyph with no such record, are
 * justifiedGlyphRuns.ts.
 */

const MIN_TRACKED_TOKENS = 2;
const MAX_TRACKED_TOKEN_CHARS = 2;
// Past heading tracking; letters set further apart are a grid or a matrix, or another column.
const MAX_TRACKED_LETTER_GAP_EM = 1.2;
const LETTERS_RE = /^[\p{L}\p{M}]+$/u;
const MIN_WIDE_TRACKED_WORD = 3;
// Two tracked words a word space apart: the tracking on both sides of a space glyph.
const MAX_TRACKED_ITEM_GAP_EM = 3;
/** A word space in tracked text: the tracking on both sides of a space glyph no wider than this. */
const MAX_SPACE_GLYPH_EM = 0.6;
const SAME_BASELINE_EM = 0.05;
const SAME_SIZE_RATIO = 0.03;

export function removeTrackingSpaces(items: readonly unknown[], hints: PageFontTextHints): unknown[] {
  if (![...hints.values()].some((hint) => hint.trackedWords)) return [...items];
  const inItem = items.map((item) => {
    if (!isRawTextItem(item) || typeof item.fontName !== 'string' || !item.str.includes(' ')) return item;
    const tracked = hints.get(item.fontName)?.trackedWords;
    if (!tracked) return item;
    const str = joinTrackedTokens(item.str, tracked);
    return str === item.str ? item : { ...item, str };
  });
  return joinTrackedItems(inItem, hints);
}

interface Token {
  index: number;
  item: RawTextItem;
  geometry: UprightGeometry;
  text: string;
}

/** Rejoin tracked words that pdf.js split into one item per glyph. */
function joinTrackedItems(items: readonly unknown[], hints: PageFontTextHints): unknown[] {
  const replace = new Map<number, RawTextItem>();
  const drop = new Set<number>();
  const chains = trackedTokenChains(items, hints);
  const others = chains.length > 0 ? textBoxes(items) : [];
  for (const chain of chains) {
    const tracked = hints.get(chain[0].item.fontName as string)?.trackedWords as string;
    const groups: Token[][] = [];
    for (const token of chain) {
      const group = groups.at(-1);
      const prev = group?.at(-1);
      const text = group?.map((entry) => entry.text).join('');
      const close =
        prev &&
        token.geometry.left - prev.geometry.right <= MAX_TRACKED_LETTER_GAP_EM * prev.geometry.fontSize &&
        !others.some((box) => box.index !== prev.index && box.index !== token.index && isBetween(box, prev, token));
      if (group && close && tracked.includes(text + token.text)) group.push(token);
      else groups.push([token]);
    }
    const candidates = groups.filter(
      (group) => group.length >= MIN_TRACKED_TOKENS && isTrackedGroup(group.map((token) => token.text)),
    );
    // Tracking this wide is also how a matrix or a row of figures is spaced
    // (`a b 0`, `1 0 0`): only a word of letters reads as a word, and a short
    // one only beside a longer one.
    // A grid of one letter (a halftone cell diagram) is not a word either.
    const lettered = candidates.filter((group) => {
      const word = group.map((token) => token.text).join('');
      return LETTERS_RE.test(word) && new Set(word).size > 1;
    });
    const anchored = lettered.some(
      (group) => codePointLength(group.map((token) => token.text).join('')) >= MIN_WIDE_TRACKED_WORD,
    );
    const words = anchored ? lettered : [];
    for (const line of wordsOnOneLine(words)) {
      const first = line[0][0];
      const last = line[line.length - 1].at(-1) as Token;
      const str = line.map((word) => word.map((token) => token.text).join('')).join(' ');
      const merged = withTextAndExtent(first.item, str, first.geometry.left, last.geometry.right);
      replace.set(first.index, { ...merged, hasEOL: !!last.item.hasEOL });
      for (let index = first.index + 1; index <= last.index; index++) drop.add(index);
    }
  }
  if (replace.size === 0) return [...items];
  return items.flatMap((item, index) => {
    const replacement = replace.get(index);
    if (replacement) return [replacement];
    return drop.has(index) ? [] : [item];
  });
}

interface TextBox extends UprightGeometry {
  index: number;
}

function textBoxes(items: readonly unknown[]): TextBox[] {
  return items.flatMap((item, index) => {
    if (!isRawTextItem(item) || item.str.trim().length === 0) return [];
    const geometry = uprightGeometry(item);
    return geometry ? [{ ...geometry, index }] : [];
  });
}

/**
 * Text of another item drawn in the gap between two letters (the `×` and
 * `+` of `a × x + d × y`, set in another font): the letters are not one word.
 */
function isBetween(box: TextBox, prev: Token, next: Token): boolean {
  const size = prev.geometry.fontSize;
  return (
    Math.abs(box.baseline - prev.geometry.baseline) <= size * 0.5 &&
    box.right > prev.geometry.right &&
    box.left < next.geometry.left
  );
}

/**
 * Consecutive tracked words a word space apart: as far apart as tracking on
 * both sides of a space glyph, measured against the tracking inside them.
 */
function wordsOnOneLine(words: readonly Token[][]): Token[][][] {
  const lines: Token[][][] = [];
  for (const word of words) {
    const line = lines.at(-1);
    const prev = line?.at(-1);
    if (line && prev && isWordSpace(prev, word)) line.push(word);
    else lines.push([word]);
  }
  return lines;
}

function isWordSpace(prev: readonly Token[], next: readonly Token[]): boolean {
  const last = prev[prev.length - 1];
  if (next[0].index <= last.index) return false;
  const size = last.geometry.fontSize;
  const tracking = Math.max(innerGap(prev), innerGap(next));
  return next[0].geometry.left - last.geometry.right <= 2 * tracking + MAX_SPACE_GLYPH_EM * size;
}

function innerGap(word: readonly Token[]): number {
  return Math.max(...word.slice(1).map((token, i) => token.geometry.left - word[i].geometry.right));
}

/**
 * Runs of single-token items in one tracked font on one baseline, with
 * nothing but pdf.js's space items between them.
 */
function trackedTokenChains(items: readonly unknown[], hints: PageFontTextHints): Token[][] {
  const chains: Token[][] = [];
  let chain: Token[] = [];
  const flush = () => {
    if (chain.length >= MIN_TRACKED_TOKENS) chains.push(chain);
    chain = [];
  };
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!isRawTextItem(item)) continue;
    if (item.str.length === 0 || isWhitespaceItem(item)) {
      if (item.hasEOL) flush();
      continue;
    }
    const text = item.str.trim();
    const geometry = uprightGeometry(item);
    const tracked = typeof item.fontName === 'string' && hints.get(item.fontName)?.trackedWords;
    // Leader dots, bullets and math signs set with the same spacing keep their spaces.
    const token = geometry && tracked && KERN_TRACKED_CHAR_RE.test(text) ? { index, item, geometry, text } : undefined;
    const prev = chain.at(-1);
    if (token && prev && !continuesTrackedChain(prev, token)) flush();
    if (token) chain.push(token);
    else flush();
    if (item.hasEOL) flush();
  }
  flush();
  return chains;
}

function continuesTrackedChain(prev: Token, cur: Token): boolean {
  const size = prev.geometry.fontSize;
  const gap = cur.geometry.left - prev.geometry.right;
  return (
    cur.item.fontName === prev.item.fontName &&
    Math.abs(cur.geometry.fontSize - size) <= size * SAME_SIZE_RATIO &&
    Math.abs(cur.geometry.baseline - prev.geometry.baseline) <= size * SAME_BASELINE_EM &&
    gap > -size * SAME_BASELINE_EM &&
    gap <= size * MAX_TRACKED_ITEM_GAP_EM
  );
}

/**
 * Rejoin space-separated tokens of `text` that spell part of a tracked
 * word. Exported for tests.
 */
export function joinTrackedTokens(text: string, trackedWords: string): string {
  // Split on single spaces only; a doubled space is kept as it is.
  return text
    .split(/( {2,})/u)
    .map((segment, index) => (index % 2 === 1 ? segment : joinSegment(segment, trackedWords)))
    .join('');
}

function joinSegment(segment: string, trackedWords: string): string {
  const tokens = segment.split(' ');
  if (tokens.length < MIN_TRACKED_TOKENS) return segment;
  const groups: string[][] = [];
  for (const token of tokens) {
    const group = groups.at(-1);
    if (group && token.length > 0 && group[0].length > 0 && trackedWords.includes(group.join('') + token)) {
      group.push(token);
    } else {
      groups.push([token]);
    }
  }
  // Tracking spaces sit between most letters; a group made mostly of whole
  // words is ordinary text that happens to spell part of a tracked word.
  return groups.flatMap((group) => (isTrackedGroup(group) ? [group.join('')] : group)).join(' ');
}

function isTrackedGroup(group: readonly string[]): boolean {
  if (group.length < MIN_TRACKED_TOKENS) return true;
  const short = group.filter((token) => codePointLength(token) <= MAX_TRACKED_TOKEN_CHARS).length;
  return short * 2 >= group.length;
}
