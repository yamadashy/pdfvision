import type { FormField, PageAnnotation, PageOcr, SearchMatch, TextSpan } from '../types/index.js';
import { type CompiledSearch, nfkc } from './search/compiler.js';
import { duplicateKey, hasPreciseDuplicateAtBox, suppressDuplicateOcrMatches } from './search/duplicates.js';
import { buildOcrSearchLines, buildSearchLines, contributingBoxes, round2, unionBoxes } from './search/lines.js';
import type { SearchLine } from './search/types.js';

export { type CompiledSearch, compileSearch } from './search/compiler.js';
export { suppressDuplicateOcrMatches } from './search/duplicates.js';

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
 * form fields. They use the widget bbox and are marked
 * `source: 'formField'` because widget appearance text is not always
 * part of the native text stream.
 *
 * FreeText annotation contents are included when the processor supplies
 * annotations. They use the annotation bbox and are marked
 * `source: 'annotation'`.
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

  appendFormFieldMatches(matches, formFields, pageNum, compiled, onWarning);
  appendAnnotationMatches(matches, annotations, pageNum, compiled, onWarning);

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

function appendAnnotationMatches(
  matches: SearchMatch[],
  annotations: readonly PageAnnotation[] | undefined,
  pageNum: number,
  compiled: CompiledSearch,
  onWarning?: (message: string) => void,
): void {
  if (!annotations || annotations.length === 0) return;
  const annotationCount = new Map<number, number>();
  const annotationCapped = new Set<number>();
  for (const annotation of annotations) {
    if (!isSearchableAnnotationText(annotation)) continue;
    const haystack = compiled.normalize ? nfkc(annotation.contents) : annotation.contents;
    if (haystack.length === 0) continue;
    for (let mi = 0; mi < compiled.matchers.length; mi++) {
      if (annotationCapped.has(mi)) continue;
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
        const box = {
          x: round2(annotation.x),
          y: round2(annotation.y),
          width: round2(annotation.width),
          height: round2(annotation.height),
        };
        if (hasPreciseDuplicateAtBox(matches, compiled, hitKey, box)) continue;
        matches.push({
          page: pageNum,
          query: m.query,
          ...(m.queryIndex !== undefined && { queryIndex: m.queryIndex }),
          bbox: box,
          boxes: [box],
          text: hit[0],
          source: 'annotation',
          context: annotationMatchContext(annotation, haystack),
        });
        const next = (annotationCount.get(mi) ?? 0) + 1;
        annotationCount.set(mi, next);
        if (next >= MAX_MATCHES_PER_QUERY_PER_PAGE) {
          annotationCapped.add(mi);
          onWarning?.(
            `search query ${JSON.stringify(m.query)} hit the per-page annotation match cap of ${MAX_MATCHES_PER_QUERY_PER_PAGE} on page ${pageNum}; subsequent annotation matches for this query on this page were dropped.`,
          );
          break;
        }
      }
    }
    if (annotationCapped.size === compiled.matchers.length) break;
  }
}

function appendFormFieldMatches(
  matches: SearchMatch[],
  formFields: readonly FormField[] | undefined,
  pageNum: number,
  compiled: CompiledSearch,
  onWarning?: (message: string) => void,
): void {
  if (!formFields || formFields.length === 0) return;
  const formFieldCount = new Map<number, number>();
  const formFieldCapped = new Set<number>();
  for (const field of formFields) {
    const rawSearchValue = formFieldSearchValue(field);
    if (rawSearchValue === undefined) continue;
    const haystack = compiled.normalize ? nfkc(rawSearchValue) : rawSearchValue;
    if (haystack.length === 0) continue;
    for (let mi = 0; mi < compiled.matchers.length; mi++) {
      if (formFieldCapped.has(mi)) continue;
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
        const box = {
          x: round2(field.x),
          y: round2(field.y),
          width: round2(field.width),
          height: round2(field.height),
        };
        if (hasPreciseDuplicateAtBox(matches, compiled, hitKey, box)) continue;
        const context = formFieldMatchContext(field, haystack);
        matches.push({
          page: pageNum,
          query: m.query,
          ...(m.queryIndex !== undefined && { queryIndex: m.queryIndex }),
          bbox: box,
          boxes: [box],
          text: hit[0],
          source: 'formField',
          context,
        });
        const next = (formFieldCount.get(mi) ?? 0) + 1;
        formFieldCount.set(mi, next);
        if (next >= MAX_MATCHES_PER_QUERY_PER_PAGE) {
          formFieldCapped.add(mi);
          onWarning?.(
            `search query ${JSON.stringify(m.query)} hit the per-page form-field match cap of ${MAX_MATCHES_PER_QUERY_PER_PAGE} on page ${pageNum}; subsequent form-field matches for this query on this page were dropped.`,
          );
          break;
        }
      }
    }
    if (formFieldCapped.size === compiled.matchers.length) break;
  }
}

function formFieldMatchContext(field: FormField, value: string): string {
  const text = field.label?.text ? `${field.label.text}: ${value}` : value;
  return text.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function formFieldSearchValue(field: FormField): string | undefined {
  if (!isVisibleFormField(field)) return undefined;
  if (field.type === 'button') return field.caption && field.caption.length > 0 ? field.caption : undefined;
  if (field.type !== 'text' && field.type !== 'choice') return undefined;
  if (!field.value) return undefined;
  if (field.type === 'choice' && field.displayValue) return field.displayValue;
  if (field.type !== 'choice') return field.value;
  const selectedValues = field.value.split(/\s*,\s*/u).filter((value) => value.length > 0);
  const displayValues = selectedValues.map((value) => choiceDisplayValue(field, value));
  if (displayValues.length === 0) return field.value;
  return displayValues.join(', ');
}

function choiceDisplayValue(field: FormField, value: string): string {
  const option = field.options?.find((item) => item.exportValue === value || item.displayValue === value);
  return option?.displayValue ?? value;
}

function isVisibleFormField(field: FormField): boolean {
  const flags = field.flags ?? [];
  return !flags.some((flag) => flag === 'hidden' || flag === 'invisible' || flag === 'noView');
}

function isSearchableAnnotationText(annotation: PageAnnotation): annotation is PageAnnotation & { contents: string } {
  if (annotation.subtype !== 'FreeText') return false;
  if (!annotation.contents) return false;
  const flags = annotation.flags ?? [];
  return !flags.some((flag) => flag === 'hidden' || flag === 'invisible' || flag === 'noView');
}

function annotationMatchContext(annotation: PageAnnotation, contents: string): string {
  return `${annotation.subtype} annotation: ${contents}`.replace(/\s+/g, ' ').trim().slice(0, 160);
}
