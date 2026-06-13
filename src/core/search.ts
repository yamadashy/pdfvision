import type { OcrWord, PageOcr, SearchMatch, TextSpan } from '../types/index.js';
import { CJK_TIGHT_GAP_RATIO, isCjkLeading } from './cjkJoin.js';
import { isLikelyWideWordSpacingRow, shouldInsertSemanticSpace } from './spacing.js';

/**
 * Inputs the processor builds once per request, then passes to
 * {@link searchPage} for every page.
 */
export interface CompiledSearch {
  /** Each query's matcher, in the same order as the original input.
   *  Captured as RegExp so literal and regex paths share the iteration
   *  code below — literal queries get the substring escaped and the
   *  `g` flag added, regex queries get the user pattern verbatim. */
  matchers: { query: string; regex: RegExp; queryIndex?: number }[];
  /** Whether NFKC normalization applies on the *document* side
   *  (spans / OCR haystack). Literal-mode queries are also NFKC-
   *  normalised in this case so `"fi"` finds compatibility ligature
   *  `"ﬁ"` (U+FB01) PDFs. Regex queries are NEVER normalised, even when this flag
   *  is true — NFKC can turn compatibility punctuation into regex
   *  metacharacters; users opting into regex get literal codepoints
   *  against the normalised document text and own the asymmetry.
   *  When `--no-normalize` is on, this is false and the document
   *  side stays raw too. */
  normalize: boolean;
}

/**
 * Escape every character that has special meaning in a JavaScript
 * RegExp so a literal-mode query like `"3.14"` doesn't accidentally
 * match `"3X14"`. Used only on the literal path; regex-mode queries
 * skip this and are compiled verbatim.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Apply NFKC the same way `processor.normalizeText` does. Inlined
 *  here so search.ts doesn't reach back into processor.ts. */
function nfkc(s: string): string {
  return s.normalize('NFKC');
}

/**
 * Compile the user-supplied search inputs into a {@link CompiledSearch}
 * the processor can reuse across pages. Throws on:
 *   - empty array / empty string queries (nothing to search for)
 *   - invalid regex when `regex` is true
 *
 * Single-query callers omit `queryIndex` on the resulting matchers so
 * downstream `SearchMatch.queryIndex` stays undefined for the common
 * case; multi-query callers get 0-based indices.
 */
export function compileSearch(
  search: string | string[] | undefined,
  options: { regex?: boolean; caseSensitive?: boolean; normalize?: boolean },
): CompiledSearch | undefined {
  if (search === undefined) return undefined;
  const queries = Array.isArray(search) ? search : [search];
  if (queries.length === 0) {
    throw new Error('search: expected at least one query');
  }
  for (const q of queries) {
    if (typeof q !== 'string' || q.length === 0) {
      throw new Error('search: query must be a non-empty string');
    }
  }
  const normalize = options.normalize !== false;
  const isMulti = queries.length > 1;
  const flags = options.caseSensitive ? 'g' : 'gi';
  const matchers = queries.map((rawQuery, i) => {
    let pattern: string;
    if (options.regex) {
      // Verbatim — let JS RegExp surface invalid-pattern errors with
      // their own messages. Crucially we do NOT NFKC-normalize regex
      // queries: NFKC can turn compatibility punctuation into regex
      // metacharacters (`Ａ．Ｂ` → `A.B`, silent overmatch) or break
      // syntax outright (`［…］` → `[…]`, may not be a valid char
      // class). Users opting into regex semantics get the literal
      // codepoints they typed.
      pattern = rawQuery;
    } else {
      // Literal mode: NFKC the query so `"fi"` finds compatibility
      // ligature `"ﬁ"` (U+FB01) PDFs, matching what we do to the
      // document text. Escape *after* normalization so a fullwidth
      // dot that normalises to `.` is still treated literally.
      const query = normalize ? nfkc(rawQuery) : rawQuery;
      pattern = escapeRegExp(query);
    }
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags);
    } catch (err) {
      throw new Error(
        `Invalid search query ${JSON.stringify(rawQuery)}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return { query: rawQuery, regex, ...(isMulti && { queryIndex: i }) };
  });
  return { matchers, normalize };
}

/** Round to 2dp — matches the convention used by spans / layout / region. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Per-(query, page, source) cap on the number of emitted matches. Acts
 * as a defence-in-depth against a degenerate regex (e.g. `.` against a
 * 100KB OCR page produces 100k hits) and a soft brake on user typos.
 *
 * NOT a full ReDoS mitigation — the cap counts emitted matches, so a
 * catastrophic-backtracking pattern on a single string can still stall
 * inside one `regex.exec(...)` call before any match would have been
 * pushed. pdfvision's threat model is "the user is matching against
 * their own input", so the cost of safe-regex / worker / RE2 is
 * deliberately not paid. Library consumers exposing pdfvision to
 * untrusted regex input should wrap the call in their own timeout.
 *
 * 10000 is generous enough that a real "find every paragraph match"
 * query passes; lower and we'd false-positive on legitimate use, higher
 * and a degenerate pattern stays expensive enough to be a problem.
 */
const MAX_MATCHES_PER_QUERY_PER_PAGE = 10000;
const DEFAULT_SPACE_GAP_RATIO = 0.25;
const FONT_SIZE_FALLBACK_PT = 12;
/** Search segment splitting uses max(SEARCH_SEGMENT_GAP_RATIO * fontSize,
 *  SEARCH_SEGMENT_MIN_GAP_PT) so phrase matching stays within a visual
 *  line or column. These values are intentionally tighter than the
 *  layout column detector: search context and phrase matching should
 *  avoid stitching neighbouring columns even when a magazine-style
 *  gutter is only a couple of body-font widths. */
const SEARCH_SEGMENT_GAP_RATIO = 1.5;
const SEARCH_SEGMENT_MIN_GAP_PT = 14;

interface SearchLine {
  text: string;
  owners: (SearchOwner | undefined)[];
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SearchOwner extends Box {
  text: string;
}

function duplicateKey(queryIndex: number | undefined, query: string, text: string, ignoreCase: boolean): string {
  const queryKey = queryIndex === undefined ? query : String(queryIndex);
  const textKey = ignoreCase ? text.toLowerCase() : text;
  return `${queryKey}\u0000${textKey}`;
}

function matcherForMatch(compiled: CompiledSearch, match: SearchMatch): { regex: RegExp } | undefined {
  if (match.queryIndex !== undefined) {
    return compiled.matchers.find((m) => m.queryIndex === match.queryIndex && m.query === match.query);
  }
  return compiled.matchers.find((m) => m.query === match.query);
}

function duplicateKeyForMatch(compiled: CompiledSearch, match: SearchMatch): string {
  const matcher = matcherForMatch(compiled, match);
  return duplicateKey(match.queryIndex, match.query, match.text, matcher?.regex.ignoreCase ?? false);
}

function nativeDuplicateBudget(
  nativeMatches: readonly SearchMatch[] | undefined,
  compiled: CompiledSearch,
): Map<string, number> {
  const budget = new Map<string, number>();
  for (const match of nativeMatches ?? []) {
    if (match.source !== 'native') continue;
    const key = duplicateKeyForMatch(compiled, match);
    budget.set(key, (budget.get(key) ?? 0) + 1);
  }
  return budget;
}

export function suppressDuplicateOcrMatches(
  nativeMatches: readonly SearchMatch[] | undefined,
  ocrMatches: readonly SearchMatch[],
  compiled: CompiledSearch,
): SearchMatch[] {
  const budget = nativeDuplicateBudget(nativeMatches, compiled);
  const out: SearchMatch[] = [];
  for (const match of ocrMatches) {
    if (match.source !== 'ocr') {
      out.push(match);
      continue;
    }
    const key = duplicateKeyForMatch(compiled, match);
    const remaining = budget.get(key) ?? 0;
    if (remaining > 0) {
      budget.set(key, remaining - 1);
      continue;
    }
    out.push(match);
  }
  return out;
}

function buildSearchLines(spans: readonly TextSpan[] | undefined, pageWidth: number): SearchLine[] {
  if (!spans || spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: TextSpan[][] = [];
  for (const span of sorted) {
    const last = groups[groups.length - 1];
    const tolerance = Math.max(span.height, 1) * 0.5;
    if (last && Math.abs(span.y - last[0].y) < tolerance) {
      last.push(span);
    } else {
      groups.push([span]);
    }
  }

  const lines: SearchLine[] = [];
  for (const group of groups) {
    const xSorted = [...group].sort((a, b) => a.x - b.x);
    const preserveWideWordSpacing = isLikelyWideWordSpacingRow(xSorted, pageWidth);
    let text = '';
    const owners: (SearchOwner | undefined)[] = [];
    const pushLine = (): void => {
      if (text.length === 0) return;
      lines.push({ text, owners: [...owners] });
      text = '';
      owners.length = 0;
    };

    for (let i = 0; i < xSorted.length; i++) {
      const span = xSorted[i];
      if (i > 0) {
        const prev = xSorted[i - 1];
        const gap = span.x - (prev.x + prev.width);
        const fontSize = span.fontSize || prev.fontSize || FONT_SIZE_FALLBACK_PT;
        const segmentGap = Math.max(fontSize * SEARCH_SEGMENT_GAP_RATIO, SEARCH_SEGMENT_MIN_GAP_PT);
        if (!preserveWideWordSpacing && gap > segmentGap) {
          pushLine();
        } else if (
          (gap > spaceGapThreshold(prev, span, fontSize) ||
            shouldInsertSemanticSpace(prev.text, span.text, gap, fontSize)) &&
          !/\s$/.test(text) &&
          !/^\s/.test(span.text)
        ) {
          text += ' ';
          owners.push(undefined);
        }
      }
      text += span.text;
      for (let j = 0; j < span.text.length; j++) owners.push(span);
    }
    pushLine();
  }
  return lines;
}

function buildOcrSearchLines(words: readonly OcrWord[] | undefined, normalize: boolean): SearchLine[] {
  if (!words || words.length === 0) return [];
  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: OcrWord[][] = [];
  for (const word of sorted) {
    const last = groups[groups.length - 1];
    const tolerance = Math.max(word.height, 1) * 0.75;
    if (last && Math.abs(word.y - last[0].y) < tolerance) {
      last.push(word);
    } else {
      groups.push([word]);
    }
  }

  const lines: SearchLine[] = [];
  for (const group of groups) {
    const xSorted = [...group].sort((a, b) => a.x - b.x);
    let text = '';
    const owners: (SearchOwner | undefined)[] = [];
    let previousWordText = '';
    for (const word of xSorted) {
      const wordText = normalize ? nfkc(word.text) : word.text;
      if (wordText.length === 0) continue;
      const owner = wordText === word.text ? word : { ...word, text: wordText };
      if (
        text.length > 0 &&
        !/\s$/.test(text) &&
        !/^\s/.test(wordText) &&
        !(isCjkLeading(previousWordText) && isCjkLeading(wordText))
      ) {
        text += ' ';
        owners.push(undefined);
      }
      text += wordText;
      for (let i = 0; i < wordText.length; i++) owners.push(owner);
      previousWordText = wordText;
    }
    if (text.length > 0) lines.push({ text, owners });
  }
  return lines;
}

function spaceGapThreshold(prev: TextSpan, cur: TextSpan, fontSize: number): number {
  const bothCjk = isCjkLeading(prev.text) && isCjkLeading(cur.text);
  return fontSize * (bothCjk ? CJK_TIGHT_GAP_RATIO : DEFAULT_SPACE_GAP_RATIO);
}

function unionBoxes(boxes: readonly Box[]): Box {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return {
    x: round2(minX),
    y: round2(minY),
    width: round2(maxX - minX),
    height: round2(maxY - minY),
  };
}

function contributingBoxes(line: SearchLine, start: number, end: number): Box[] {
  const out: Box[] = [];
  let i = start;
  while (i < end) {
    const span = line.owners[i];
    if (!span) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < end && line.owners[j] === span) j++;
    const spanStart = firstOwnerIndex(line, span);
    if (spanStart >= 0) {
      out.push(sliceSpanBox(span, i - spanStart, j - spanStart));
    }
    i = j;
  }
  return out;
}

function firstOwnerIndex(line: SearchLine, span: SearchOwner): number {
  for (let i = 0; i < line.owners.length; i++) {
    if (line.owners[i] === span) return i;
  }
  return -1;
}

function sliceSpanBox(span: SearchOwner, start: number, end: number): Box {
  const textLength = span.text.length;
  const clampedStart = Math.max(0, Math.min(textLength, start));
  const clampedEnd = Math.max(clampedStart, Math.min(textLength, end));
  if (textLength === 0 || (clampedStart === 0 && clampedEnd === textLength) || span.width <= 0) {
    return { x: round2(span.x), y: round2(span.y), width: round2(span.width), height: round2(span.height) };
  }
  const charWidth = span.width / textLength;
  return {
    x: round2(span.x + charWidth * clampedStart),
    y: round2(span.y),
    width: round2(charWidth * (clampedEnd - clampedStart)),
    height: round2(span.height),
  };
}

/**
 * Find every occurrence of every compiled query in the given page's
 * native text (via spans) and OCR text (when present). Returns native
 * matches in top-down, left-right line order, then OCR-derived matches
 * appended after.
 *
 * Native matches are found against line-level text reconstructed from
 * adjacent spans, so a query can cross pdf.js font-run boundaries
 * (e.g. `"Hello World"` split into `Hello` + `World`) while still
 * returning a bbox union of the contributing spans. Multi-line phrases
 * are intentionally not stitched together yet; returning one giant
 * cross-line region is usually too imprecise for renderRegion zoom.
 *
 * OCR matches use `pages[].ocr.words[]` when present and supplement from
 * raw `pages[].ocr.text` with a page-level bbox when word-level
 * reconstruction misses one or more occurrences. Marked `source: 'ocr'`
 * so the consumer can tell them apart from native text-stream matches.
 */
export function searchPage(
  spans: readonly TextSpan[] | undefined,
  ocr: PageOcr | undefined,
  pageNum: number,
  pageWidth: number,
  pageHeight: number,
  compiled: CompiledSearch,
  onWarning?: (message: string) => void,
): SearchMatch[] {
  const matches: SearchMatch[] = [];

  // Per-query, per-page, per-source emission counter. Resets between
  // native and OCR passes (each gets its own cap). Track per matcher
  // index so multi-query searches don't share a budget.
  const nativeCount = new Map<number, number>();
  const nativeCapped = new Set<number>();
  const ocrMatches: SearchMatch[] = [];

  // Native pass — line-level literal/regex match. Span text is already
  // NFKC-normalised when `--normalize` is on (matches what we put in
  // pages[].spans). Literal-mode queries were NFKC'd at compile time
  // too, so they're in the same form as the haystack. Regex-mode
  // queries are intentionally NOT normalised — the user opts into
  // literal-codepoint semantics against the normalised document text.
  lineLoop: for (const line of buildSearchLines(spans, pageWidth)) {
    const haystack = line.text;
    for (let mi = 0; mi < compiled.matchers.length; mi++) {
      const m = compiled.matchers[mi];
      if (nativeCapped.has(mi)) continue;
      // Reset lastIndex so the same RegExp object can be reused
      // across spans (`g` flag is stateful).
      m.regex.lastIndex = 0;
      while (true) {
        const hit = m.regex.exec(haystack);
        if (hit === null) break;
        if (hit[0].length === 0) {
          // Zero-width regex match (e.g. `/(?=...)/g`) would loop
          // forever. Advance lastIndex by one and continue.
          m.regex.lastIndex++;
          continue;
        }
        const hitBoxes = contributingBoxes(line, hit.index, hit.index + hit[0].length);
        if (hitBoxes.length === 0) continue;
        const box = unionBoxes(hitBoxes);
        matches.push({
          page: pageNum,
          query: m.query,
          ...(m.queryIndex !== undefined && { queryIndex: m.queryIndex }),
          bbox: box,
          boxes: hitBoxes,
          // `hit[0]` is in the same form as the span text (NFKC when
          // normalize is on, raw under --no-normalize), matching the
          // documented `text` contract.
          text: hit[0],
          source: 'native',
          context: haystack,
        });
        const next = (nativeCount.get(mi) ?? 0) + 1;
        nativeCount.set(mi, next);
        if (next >= MAX_MATCHES_PER_QUERY_PER_PAGE) {
          nativeCapped.add(mi);
          onWarning?.(
            `search query ${JSON.stringify(m.query)} hit the per-page native match cap of ${MAX_MATCHES_PER_QUERY_PER_PAGE} on page ${pageNum}; subsequent native matches for this query on this page were dropped.`,
          );
          // Stop scanning further lines for this matcher; other
          // matchers may still have budget.
          if (nativeCapped.size === compiled.matchers.length) break lineLoop;
          break;
        }
      }
    }
  }

  // OCR pass — prefer word-level OCR geometry when available, then
  // supplement from the post-trim OCR text with a page-level bbox for
  // occurrences that word reconstruction missed.
  if (ocr?.text) {
    const ocrWordLines = buildOcrSearchLines(ocr.words, compiled.normalize);
    const ocrTextLine: SearchLine = { text: compiled.normalize ? nfkc(ocr.text) : ocr.text, owners: [] };
    const pageBox = { x: 0, y: 0, width: round2(pageWidth), height: round2(pageHeight) };
    for (const m of compiled.matchers) {
      let count = 0;
      let capped = false;
      const matcherDuplicateKey = (matchText: string) =>
        duplicateKey(m.queryIndex, m.query, matchText, m.regex.ignoreCase);
      const searchLines = (lines: readonly SearchLine[], duplicateBudget?: Map<string, number>) => {
        for (const line of lines) {
          const ocrHaystack = line.text;
          m.regex.lastIndex = 0;
          while (true) {
            const hit = m.regex.exec(ocrHaystack);
            if (hit === null) break;
            if (hit[0].length === 0) {
              m.regex.lastIndex++;
              continue;
            }
            // Surface a short context around the hit so the consumer can
            // pick out which OCR'd paragraph it sits in even without bbox
            // precision. ±60 chars matches a single line of typical text;
            // larger windows clutter JSON output.
            const start = Math.max(0, hit.index - 60);
            const end = Math.min(ocrHaystack.length, hit.index + hit[0].length + 60);
            const context = ocrHaystack.slice(start, end).replace(/\s+/g, ' ').trim();
            const hitBoxes = contributingBoxes(line, hit.index, hit.index + hit[0].length);
            const hitKey = matcherDuplicateKey(hit[0]);
            const remainingDuplicates = duplicateBudget?.get(hitKey) ?? 0;
            if (remainingDuplicates > 0) {
              duplicateBudget?.set(hitKey, remainingDuplicates - 1);
              continue;
            }
            ocrMatches.push({
              page: pageNum,
              query: m.query,
              ...(m.queryIndex !== undefined && { queryIndex: m.queryIndex }),
              bbox: hitBoxes.length > 0 ? unionBoxes(hitBoxes) : pageBox,
              boxes: hitBoxes,
              text: hit[0],
              source: 'ocr',
              context,
            });
            count++;
            if (count >= MAX_MATCHES_PER_QUERY_PER_PAGE) {
              capped = true;
              break;
            }
          }
          if (capped) break;
        }
      };
      const wordMatchStart = ocrMatches.length;
      searchLines(ocrWordLines);
      if (!capped) {
        const rawDuplicateBudget = new Map<string, number>();
        for (const match of ocrMatches.slice(wordMatchStart)) {
          const key = matcherDuplicateKey(match.text);
          rawDuplicateBudget.set(key, (rawDuplicateBudget.get(key) ?? 0) + 1);
        }
        searchLines([ocrTextLine], rawDuplicateBudget);
      }
      if (capped) {
        onWarning?.(
          `search query ${JSON.stringify(m.query)} hit the per-page OCR match cap of ${MAX_MATCHES_PER_QUERY_PER_PAGE} on page ${pageNum}; subsequent OCR matches for this query on this page were dropped.`,
        );
      }
    }
  }

  matches.push(...suppressDuplicateOcrMatches(matches, ocrMatches, compiled));
  return matches;
}
