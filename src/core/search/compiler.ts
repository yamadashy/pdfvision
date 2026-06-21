import { isCjkLeading } from '../text/cjkJoin.js';

/**
 * Inputs the processor builds once per request, then passes to
 * `searchPage` for every page.
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

function literalSearchPattern(s: string): string {
  const chars = Array.from(s);
  let pattern = '';
  for (let i = 0; i < chars.length; i++) {
    if (i > 0 && isCjkLeading(chars[i - 1]) && isCjkLeading(chars[i])) {
      pattern += '\\s*';
    }
    pattern += escapeRegExp(chars[i]);
  }
  return pattern;
}

/** Apply NFKC the same way `processor.normalizeText` does. */
export function nfkc(s: string): string {
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
      pattern = literalSearchPattern(query);
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
