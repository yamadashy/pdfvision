import type { PageOcr, SearchMatch, TextSpan } from '../types/index.js';
import { CJK_TIGHT_GAP_RATIO, isCjkLeading } from './cjkJoin.js';

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
const SEARCH_SEGMENT_GAP_RATIO = 3;
const SEARCH_SEGMENT_MIN_GAP_PT = 24;

interface SearchLine {
  text: string;
  owners: (TextSpan | undefined)[];
}

function buildSearchLines(spans: readonly TextSpan[] | undefined): SearchLine[] {
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
    let text = '';
    const owners: (TextSpan | undefined)[] = [];
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
        if (gap > segmentGap) {
          pushLine();
        } else if (gap > spaceGapThreshold(prev, span, fontSize) && !/\s$/.test(text) && !/^\s/.test(span.text)) {
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

function spaceGapThreshold(prev: TextSpan, cur: TextSpan, fontSize: number): number {
  const bothCjk = isCjkLeading(prev.text) && isCjkLeading(cur.text);
  return fontSize * (bothCjk ? CJK_TIGHT_GAP_RATIO : DEFAULT_SPACE_GAP_RATIO);
}

function unionBoxes(spans: readonly TextSpan[]): { x: number; y: number; width: number; height: number } {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const span of spans) {
    minX = Math.min(minX, span.x);
    minY = Math.min(minY, span.y);
    maxX = Math.max(maxX, span.x + span.width);
    maxY = Math.max(maxY, span.y + span.height);
  }
  return {
    x: round2(minX),
    y: round2(minY),
    width: round2(maxX - minX),
    height: round2(maxY - minY),
  };
}

function contributingSpans(line: SearchLine, start: number, end: number): TextSpan[] {
  const out: TextSpan[] = [];
  const seen = new Set<TextSpan>();
  for (let i = start; i < end; i++) {
    const span = line.owners[i];
    if (!span || seen.has(span)) continue;
    seen.add(span);
    out.push(span);
  }
  return out;
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
 * OCR matches don't carry per-word bbox today (tesseract.js exposes
 * `data.words[]` but we don't currently plumb that through), so OCR
 * matches come back with a page-level bbox. Marked `source: 'ocr'`
 * so the consumer can tell them apart from precise native matches.
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

  // Native pass — line-level literal/regex match. Span text is already
  // NFKC-normalised when `--normalize` is on (matches what we put in
  // pages[].spans). Literal-mode queries were NFKC'd at compile time
  // too, so they're in the same form as the haystack. Regex-mode
  // queries are intentionally NOT normalised — the user opts into
  // literal-codepoint semantics against the normalised document text.
  lineLoop: for (const line of buildSearchLines(spans)) {
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
        const hitSpans = contributingSpans(line, hit.index, hit.index + hit[0].length);
        if (hitSpans.length === 0) continue;
        const box = unionBoxes(hitSpans);
        matches.push({
          page: pageNum,
          query: m.query,
          ...(m.queryIndex !== undefined && { queryIndex: m.queryIndex }),
          bbox: box,
          boxes: hitSpans.map((span) => ({
            x: round2(span.x),
            y: round2(span.y),
            width: round2(span.width),
            height: round2(span.height),
          })),
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

  // OCR pass — runs against the post-trim OCR text. Page-level bbox
  // because we don't have per-word OCR bbox plumbed yet.
  if (ocr?.text) {
    const ocrHaystack = compiled.normalize ? nfkc(ocr.text) : ocr.text;
    const pageBox = { x: 0, y: 0, width: round2(pageWidth), height: round2(pageHeight) };
    for (const m of compiled.matchers) {
      m.regex.lastIndex = 0;
      let count = 0;
      let capped = false;
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
        matches.push({
          page: pageNum,
          query: m.query,
          ...(m.queryIndex !== undefined && { queryIndex: m.queryIndex }),
          bbox: pageBox,
          boxes: [],
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
      if (capped) {
        onWarning?.(
          `search query ${JSON.stringify(m.query)} hit the per-page OCR match cap of ${MAX_MATCHES_PER_QUERY_PER_PAGE} on page ${pageNum}; subsequent OCR matches for this query on this page were dropped.`,
        );
      }
    }
  }

  return matches;
}
