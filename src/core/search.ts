import type { PageOcr, SearchMatch, TextSpan } from '../types/index.js';

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

/**
 * Find every occurrence of every compiled query in the given page's
 * native text (via spans) and OCR text (when present). Returns the
 * matches in page-natural order: per-span pass for spans (top-down
 * left-right by how they were emitted), then OCR-derived matches
 * appended after.
 *
 * V1 limitation: only single-span matches are emitted on the native
 * side. A query that straddles two pdf.js spans (e.g. `"Hello World"`
 * where `Hello` and `World` are different spans) won't be found. Most
 * single-word and short-phrase queries hit single spans because pdf.js
 * groups by font run, so the typical agent use case ("find this term")
 * is covered. Multi-span matching is a follow-up.
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

  // Native pass — per-span literal/regex match.
  spanLoop: for (const span of spans ?? []) {
    // Span text is already NFKC-normalised when `--normalize` is on
    // (matches what we put in pages[].spans). Literal-mode queries
    // were NFKC'd at compile time too, so they're in the same form
    // as the haystack. Regex-mode queries are intentionally NOT
    // normalised — the user opts into literal-codepoint semantics
    // against the normalised document text (see CompiledSearch).
    const haystack = span.text;
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
        // V1: single-span match, so bbox === span bbox. Per-character
        // sub-span bbox would need width-per-glyph from pdf.js, which
        // we don't have today (spans are already at the glyph-run
        // granularity pdfjs emits).
        const box = {
          x: round2(span.x),
          y: round2(span.y),
          width: round2(span.width),
          height: round2(span.height),
        };
        matches.push({
          page: pageNum,
          query: m.query,
          ...(m.queryIndex !== undefined && { queryIndex: m.queryIndex }),
          bbox: box,
          boxes: [box],
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
          // Stop scanning further spans for this matcher; other
          // matchers may still have budget.
          if (nativeCapped.size === compiled.matchers.length) break spanLoop;
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
