import type { FormField, PageAnnotation, PageLink, PageOcr, SearchMatch, TextSpan } from '../../types/index.js';
import { contributingBoxes, round2, unionBoxes } from './boxes.js';
import { type CompiledSearch, nfkc } from './compiler.js';
import { duplicateKey, suppressDuplicateOcrMatches } from './duplicates.js';
import { buildOcrSearchLines, buildSearchLines } from './lines.js';
import { appendAnnotationMatches, appendFormFieldMatches, appendLinkMatches } from './sourceMatches.js';
import type { SearchLine } from './types.js';

export { type CompiledSearch, compileSearch } from './compiler.js';
export { suppressDuplicateOcrMatches } from './duplicates.js';

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
 * native text (via spans) and OCR text (when present). Returns native
 * matches in top-down, left-right line order, then OCR-derived matches
 * appended after.
 *
 * Native matches are found against line-level text reconstructed from
 * adjacent spans, so a query can cross pdf.js font-run boundaries
 * (e.g. `"Hello World"` split into `Hello` + `World`) while still
 * returning a bbox union of the contributing spans. Multi-line phrases
 * are intentionally not stitched together except for narrow hyphenated
 * line-break terms, where `boxes[]` keeps the contributing line slices
 * precise enough for follow-up inspection.
 *
 * OCR matches use `pages[].ocr.words[]` when present and supplement from
 * raw `pages[].ocr.text` with a page-level bbox when word-level
 * reconstruction misses one or more occurrences. Marked `source: 'ocr'`
 * so the consumer can tell them apart from native text-stream matches.
 *
 * Form field value matches are included when the processor supplies
 * form fields. They use the widget bbox, narrowed to the matching cells
 * for comb text widgets when pdf.js exposes enough appearance metadata,
 * and are marked `source: 'formField'` because widget appearance text is
 * not always part of the native text stream.
 *
 * FreeText annotation contents are included when the processor supplies
 * annotations. They use the annotation bbox and are marked
 * `source: 'annotation'`.
 *
 * Link targets are included when the processor supplies links. They use
 * the clickable link bbox and are marked `source: 'link'`.
 */
export function searchPage(
  spans: readonly TextSpan[] | undefined,
  ocr: PageOcr | undefined,
  pageNum: number,
  pageWidth: number,
  pageHeight: number,
  compiled: CompiledSearch,
  onWarning?: (message: string) => void,
  formFields?: readonly FormField[],
  annotations?: readonly PageAnnotation[],
  links?: readonly PageLink[],
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
      if (line.syntheticHyphenated && !m.query.includes('-')) continue;
      if (line.syntheticDehyphenated && m.query.includes('-')) continue;
      if (line.syntheticStacked && !/\s/u.test(m.query)) continue;
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
        if ((line.syntheticHyphenated || line.syntheticDehyphenated) && hitBoxes.length < 2) continue;
        if (line.syntheticStacked && hitBoxes.length < 2) continue;
        if (line.syntheticVertical && hitBoxes.length < 2) continue;
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

  appendFormFieldMatches(matches, formFields, pageNum, compiled, MAX_MATCHES_PER_QUERY_PER_PAGE, onWarning);
  appendAnnotationMatches(matches, annotations, pageNum, compiled, MAX_MATCHES_PER_QUERY_PER_PAGE, onWarning);
  appendLinkMatches(matches, links, pageNum, compiled, MAX_MATCHES_PER_QUERY_PER_PAGE, onWarning);

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
          if (line.syntheticHyphenated && !m.query.includes('-')) continue;
          if (line.syntheticDehyphenated && m.query.includes('-')) continue;
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
            if ((line.syntheticHyphenated || line.syntheticDehyphenated) && hitBoxes.length < 2) continue;
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
