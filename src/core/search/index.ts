import type { FormField, PageAnnotation, PageLink, PageOcr, SearchMatch, TextSpan } from '../../types/index.js';
import { contributingBoxes, round2, unionBoxes } from './boxes.js';
import { type CompiledSearch, nfkc } from './compiler.js';
import { buildPreciseDuplicateBudget, duplicateKey } from './duplicates.js';
import { buildOcrSearchLines, buildSearchLines } from './lines.js';
import { isRegexTimeout, runWithRegexTimeout } from './regexTimeout.js';
import { appendAnnotationMatches, appendFormFieldMatches, appendLinkMatches } from './sourceMatches.js';
import type { SearchLine } from './types.js';

export { type CompiledSearch, compileSearch } from './compiler.js';
export { suppressDuplicateOcrMatches } from './duplicates.js';

/**
 * Per-(query, page, source) cap on the number of emitted matches. Acts
 * as a defence-in-depth against a degenerate regex (e.g. `.` against a
 * 100KB OCR page produces 100k hits) and a soft brake on user typos.
 *
 * The cap counts *emitted* matches, so on its own it cannot stop a
 * catastrophic-backtracking pattern: that stalls inside a single
 * `regex.exec(...)` before any match would have been pushed. The vm
 * timeout below covers that case; the cap stays as defence-in-depth
 * for what happens after matches start flowing.
 *
 * The threshold leaves room for legitimate high-hit-count searches while
 * bounding how expensive a degenerate pattern can become after it starts
 * emitting matches.
 */
const MAX_MATCHES_PER_QUERY_PER_PAGE = 10000;

/**
 * Wall-clock budget for one page's regex-mode search.
 *
 * "The user is matching against their own input" stopped being the whole
 * threat model when `search_pdf` started letting a *model* pick the
 * pattern over MCP, so regex input is now semi-untrusted. The budget is
 * generous enough that no honest pattern on a realistic page approaches
 * it, and small enough that a catastrophic one costs a bounded slice of
 * a second per page instead of hanging the process.
 *
 * Literal-mode searches never enter the guard: escaped patterns cannot
 * backtrack catastrophically, and the common path stays free of the vm
 * setup cost.
 */
const REGEX_SEARCH_TIMEOUT_MS = 1000;

/**
 * Find occurrences of every compiled query in the given page's native
 * text (via spans) and OCR text (when present). Emission is capped at
 * 10,000 matches per page, query, and source. The first additional valid
 * match invokes onWarning when provided; it and later matches for that
 * combination are dropped. Returns native matches in top-down, left-right
 * line order, then
 * OCR-derived matches appended after.
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
 *
 * In regex mode the whole page pass is bounded at
 * {@link REGEX_SEARCH_TIMEOUT_MS}; exceeding it warns and returns no
 * matches for that page.
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
  return searchPageWithMatchCap(
    spans,
    ocr,
    pageNum,
    pageWidth,
    pageHeight,
    compiled,
    MAX_MATCHES_PER_QUERY_PER_PAGE,
    onWarning,
    formFields,
    annotations,
    links,
  );
}

export function searchOcrPage(
  ocr: PageOcr,
  pageNum: number,
  pageWidth: number,
  pageHeight: number,
  compiled: CompiledSearch,
  preciseMatches: readonly SearchMatch[] | undefined,
  onWarning?: (message: string) => void,
): SearchMatch[] {
  return searchPageWithMatchCap(
    undefined,
    ocr,
    pageNum,
    pageWidth,
    pageHeight,
    compiled,
    MAX_MATCHES_PER_QUERY_PER_PAGE,
    onWarning,
    undefined,
    undefined,
    undefined,
    preciseMatches,
  );
}

/**
 * @internal Exported for boundary-focused tests with a small cap, and
 * with a shortened regex timeout so timeout coverage stays fast.
 */
export function searchPageWithMatchCap(
  spans: readonly TextSpan[] | undefined,
  ocr: PageOcr | undefined,
  pageNum: number,
  pageWidth: number,
  pageHeight: number,
  compiled: CompiledSearch,
  matchCap: number,
  onWarning?: (message: string) => void,
  formFields?: readonly FormField[],
  annotations?: readonly PageAnnotation[],
  links?: readonly PageLink[],
  ocrDuplicateMatches?: readonly SearchMatch[],
  regexTimeoutMs: number = REGEX_SEARCH_TIMEOUT_MS,
): SearchMatch[] {
  const run = () =>
    collectPageMatches(
      spans,
      ocr,
      pageNum,
      pageWidth,
      pageHeight,
      compiled,
      matchCap,
      onWarning,
      formFields,
      annotations,
      links,
      ocrDuplicateMatches,
    );
  if (!compiled.regexMode) return run();
  try {
    return runWithRegexTimeout(run, regexTimeoutMs);
  } catch (error) {
    if (!isRegexTimeout(error)) throw error;
    // Granularity is the whole call, not the offending query: the guard
    // cannot tell which matcher was mid-exec when V8 terminated it, so
    // every query in this call loses this page. The processor's OCR
    // supplement pass runs under its own budget, so a page searched with
    // OCR is bounded at 2× the limit — bounded is what matters.
    onWarning?.(regexTimeoutWarning(pageNum, regexTimeoutMs, spans === undefined && ocr !== undefined));
    return [];
  }
}

const REGEX_TIMEOUT_WARNING_PREFIX = 'regex search on page';

/**
 * The OCR-supplement pass (no spans, OCR text only) gets its own wording:
 * claiming "results for this page were dropped" there would be false —
 * matches from the native pass are already on the page and are kept.
 */
function regexTimeoutWarning(pageNum: number, timeoutMs: number, ocrSupplement: boolean): string {
  const scope = ocrSupplement
    ? ' while searching OCR text; OCR-derived results for this page were dropped for every query (matches from the page’s other text sources are kept)'
    : '; results for this page were dropped for every query in this search';
  return `${REGEX_TIMEOUT_WARNING_PREFIX} ${pageNum} exceeded the ${timeoutMs}ms per-page regex time limit${scope}. Catastrophic backtracking in the pattern is the likely cause.`;
}

/**
 * True for warnings emitted when a regex-mode page search hit the time
 * budget. The processor uses this to keep an interrupted — and therefore
 * incomplete — result out of the cache.
 */
export function isRegexTimeoutWarning(message: string): boolean {
  return message.startsWith(REGEX_TIMEOUT_WARNING_PREFIX);
}

function collectPageMatches(
  spans: readonly TextSpan[] | undefined,
  ocr: PageOcr | undefined,
  pageNum: number,
  pageWidth: number,
  pageHeight: number,
  compiled: CompiledSearch,
  matchCap: number,
  onWarning?: (message: string) => void,
  formFields?: readonly FormField[],
  annotations?: readonly PageAnnotation[],
  links?: readonly PageLink[],
  ocrDuplicateMatches?: readonly SearchMatch[],
): SearchMatch[] {
  const matches: SearchMatch[] = [];

  // Per-query, per-page, per-source emission counter. Resets between
  // native and OCR passes (each gets its own cap). Track per matcher
  // index so multi-query searches don't share a budget.
  const nativeCount = new Map<number, number>();
  const nativeCapped = new Set<number>();
  const ocrMatches: SearchMatch[] = [];

  // Native pass — line-level literal/regex match. Span text is already
  // normalized and C0-cleaned when `--normalize` is on (matches what we
  // put in pages[].spans). Literal-mode queries are normalized at
  // compile time too, so they're in the same form as the haystack.
  // Regex-mode queries are intentionally NOT normalized — the user opts
  // into literal-codepoint semantics against the normalized document text.
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
        const hitEnd = hit.index + hit[0].length;
        if (line.syntheticRuby && !hitIntersectsRubyAnnotation(line, hit.index, hitEnd)) continue;
        if (!hitCrossesSyntheticJoin(line, hit.index, hitEnd)) continue;
        const hitBoxes = contributingBoxes(line, hit.index, hitEnd);
        if (hitBoxes.length === 0) continue;
        if ((line.syntheticHyphenated || line.syntheticDehyphenated) && hitBoxes.length < 2) continue;
        if (line.syntheticStacked && hitBoxes.length < 2) continue;
        if (line.syntheticVertical && hitBoxes.length < 2 && !line.syntheticRubyBase) continue;
        const box = unionBoxes(hitBoxes);
        const count = nativeCount.get(mi) ?? 0;
        if (count >= matchCap) {
          nativeCapped.add(mi);
          onWarning?.(
            `search query ${JSON.stringify(m.query)} exceeded the per-page native match cap of ${matchCap} on page ${pageNum}; later native matches for this query on this page were dropped.`,
          );
          // Stop scanning further lines for this matcher; other
          // matchers may still have budget.
          if (nativeCapped.size === compiled.matchers.length) break lineLoop;
          break;
        }
        matches.push({
          page: pageNum,
          query: m.query,
          ...(m.queryIndex !== undefined && { queryIndex: m.queryIndex }),
          bbox: box,
          boxes: hitBoxes,
          // `hit[0]` is in the same form as the span text (normalized
          // when normalize is on, raw under --no-normalize), matching
          // the documented `text` contract.
          text: hit[0],
          source: 'native',
          context: haystack,
        });
        nativeCount.set(mi, count + 1);
      }
    }
  }

  appendFormFieldMatches(matches, formFields, pageNum, compiled, matchCap, onWarning);
  appendAnnotationMatches(matches, annotations, pageNum, compiled, matchCap, onWarning);
  appendLinkMatches(matches, links, pageNum, compiled, matchCap, onWarning);
  const preciseOcrDuplicateBudget = buildPreciseDuplicateBudget(ocrDuplicateMatches ?? matches, compiled);

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
      const wordDuplicateBudget = new Map<string, number>();
      const matcherDuplicateKey = (matchText: string) =>
        duplicateKey(m.queryIndex, m.query, matchText, m.regex.ignoreCase);
      const searchLines = (
        lines: readonly SearchLine[],
        duplicateBudget?: Map<string, number>,
        recordDuplicateBudget?: Map<string, number>,
      ) => {
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
            const hitEnd = hit.index + hit[0].length;
            if (!hitCrossesSyntheticJoin(line, hit.index, hitEnd)) continue;
            const end = Math.min(ocrHaystack.length, hitEnd + 60);
            const context = ocrHaystack.slice(start, end).replace(/\s+/g, ' ').trim();
            const hitBoxes = contributingBoxes(line, hit.index, hitEnd);
            if ((line.syntheticHyphenated || line.syntheticDehyphenated) && hitBoxes.length < 2) continue;
            const hitKey = matcherDuplicateKey(hit[0]);
            if (recordDuplicateBudget) {
              recordDuplicateBudget.set(hitKey, (recordDuplicateBudget.get(hitKey) ?? 0) + 1);
            }
            const remainingDuplicates = duplicateBudget?.get(hitKey) ?? 0;
            if (remainingDuplicates > 0) {
              duplicateBudget?.set(hitKey, remainingDuplicates - 1);
              continue;
            }
            const remainingPreciseDuplicates = preciseOcrDuplicateBudget.get(hitKey) ?? 0;
            if (remainingPreciseDuplicates > 0) {
              preciseOcrDuplicateBudget.set(hitKey, remainingPreciseDuplicates - 1);
              continue;
            }
            if (count >= matchCap) {
              capped = true;
              break;
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
          }
          if (capped) break;
        }
      };
      searchLines(ocrWordLines, undefined, wordDuplicateBudget);
      if (!capped) {
        searchLines([ocrTextLine], wordDuplicateBudget);
      }
      if (capped) {
        onWarning?.(
          `search query ${JSON.stringify(m.query)} exceeded the per-page OCR match cap of ${matchCap} on page ${pageNum}; later OCR matches for this query on this page were dropped.`,
        );
      }
    }
  }

  for (const match of ocrMatches) matches.push(match);
  return matches;
}

function hitCrossesSyntheticJoin(line: SearchLine, start: number, end: number): boolean {
  if (line.syntheticJoinIndex === undefined) return true;
  return start < line.syntheticJoinIndex && end > line.syntheticJoinIndex;
}

function hitIntersectsRubyAnnotation(line: SearchLine, start: number, end: number): boolean {
  return line.rubyRanges?.some((range) => start < range.end && end > range.start) ?? false;
}
