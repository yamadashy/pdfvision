import type { FormField, OcrWord, PageAnnotation, PageOcr, SearchMatch, TextSpan } from '../types/index.js';
import { CJK_TIGHT_GAP_RATIO, isCjkLeading } from './cjkJoin.js';
import { type CompiledSearch, nfkc } from './search/compiler.js';
import { duplicateKey, hasPreciseDuplicateAtBox, suppressDuplicateOcrMatches } from './search/duplicates.js';

export { type CompiledSearch, compileSearch } from './search/compiler.js';
export { suppressDuplicateOcrMatches } from './search/duplicates.js';

import { isLikelyCjkDisplaySpacingRow, isLikelyWideWordSpacingRow, shouldInsertSemanticSpace } from './spacing.js';
import { isRtlDominantPositionedText, textOrder } from './textDirection.js';

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
const SEARCH_SEGMENT_GAP_RATIO = 1.25;
const SEARCH_SEGMENT_MIN_GAP_PT = 14;
const HYPHENATED_SEARCH_LINE_SCAN_LIMIT = 6;
const HYPHENATED_SEARCH_LINE_MAX_GAP_RATIO = 2.5;
const HYPHENATED_SEARCH_LINE_MAX_GAP_PT = 24;
const HYPHENATED_SEARCH_LINE_X_TOLERANCE_PT = 12;
const VERTICAL_SEARCH_COLUMN_X_TOLERANCE_PT = 4;
const VERTICAL_SEARCH_MAX_COLUMN_GAP_PT = 36;
const VERTICAL_SEARCH_MAX_COLUMN_GAP_RATIO = 3;
const VERTICAL_SEARCH_MIN_SPAN_HEIGHT_RATIO = 2;
const LATIN_OR_NUMBER_END_RE = /[\p{Script=Latin}\p{M}\p{N}]$/u;
const LATIN_OR_NUMBER_START_RE = /^[\p{Script=Latin}\p{M}\p{N}]/u;
const LOWERCASE_START_RE = /^\p{Ll}/u;

interface SearchLine {
  text: string;
  owners: (SearchOwner | undefined)[];
  syntheticHyphenated?: boolean;
  syntheticVertical?: boolean;
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
    const preserveCjkDisplaySpacing = isLikelyCjkDisplaySpacingRow(xSorted);
    const segments: TextSpan[][] = [[xSorted[0]]];

    for (let i = 1; i < xSorted.length; i++) {
      const span = xSorted[i];
      const prev = xSorted[i - 1];
      const gap = span.x - (prev.x + prev.width);
      const fontSize = span.fontSize || prev.fontSize || FONT_SIZE_FALLBACK_PT;
      const segmentGap = Math.max(fontSize * SEARCH_SEGMENT_GAP_RATIO, SEARCH_SEGMENT_MIN_GAP_PT);
      if (!preserveWideWordSpacing && !preserveCjkDisplaySpacing && gap > segmentGap) {
        segments.push([span]);
        continue;
      }
      segments[segments.length - 1].push(span);
    }

    for (const segment of segments) {
      const rtl = isRtlDominantPositionedText(segment);
      const ordered = textOrder(segment);
      let text = '';
      const owners: (SearchOwner | undefined)[] = [];
      for (let i = 0; i < ordered.length; i++) {
        const span = ordered[i];
        if (i > 0) {
          const prev = ordered[i - 1];
          const gap = rtl ? prev.x - (span.x + span.width) : span.x - (prev.x + prev.width);
          const fontSize = span.fontSize || prev.fontSize || FONT_SIZE_FALLBACK_PT;
          if (
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
      if (text.length > 0) lines.push({ text, owners });
    }
  }
  const augmented = [...lines, ...buildVerticalSearchLines(spans)];
  return withHyphenatedSearchLines(augmented);
}

function buildVerticalSearchLines(spans: readonly TextSpan[]): SearchLine[] {
  const verticalSpans = spans.filter(isVerticalSearchSpan);
  if (verticalSpans.length < 2) return [];

  const columns = groupVerticalSearchColumns(verticalSpans).sort((a, b) => b.centerX - a.centerX);
  const lines: SearchLine[] = [];
  let run: VerticalSearchColumn[] = [];
  const flush = () => {
    const line = verticalSearchLineFromColumns(run);
    if (line) lines.push(line);
    run = [];
  };

  for (const column of columns) {
    const previous = run.at(-1);
    if (previous && !canContinueVerticalSearchColumn(previous, column)) flush();
    run.push(column);
  }
  flush();
  return lines;
}

interface VerticalSearchColumn {
  centerX: number;
  fontSize: number;
  spans: TextSpan[];
}

function isVerticalSearchSpan(span: TextSpan): boolean {
  if (span.text.trim().length === 0) return false;
  if (!isVerticalSearchOwner(span)) return false;
  const fontSize = span.fontSize || FONT_SIZE_FALLBACK_PT;
  return span.height >= fontSize * VERTICAL_SEARCH_MIN_SPAN_HEIGHT_RATIO;
}

function groupVerticalSearchColumns(spans: readonly TextSpan[]): VerticalSearchColumn[] {
  const columns: VerticalSearchColumn[] = [];
  const sorted = [...spans].sort((a, b) => centerX(b) - centerX(a) || a.y - b.y);
  for (const span of sorted) {
    const x = centerX(span);
    const column = columns.find((item) => Math.abs(item.centerX - x) <= VERTICAL_SEARCH_COLUMN_X_TOLERANCE_PT);
    if (column) {
      column.spans.push(span);
      column.centerX = column.spans.reduce((sum, item) => sum + centerX(item), 0) / Math.max(column.spans.length, 1);
      column.fontSize = median(column.spans.map((item) => item.fontSize || FONT_SIZE_FALLBACK_PT));
    } else {
      columns.push({
        centerX: x,
        fontSize: span.fontSize || FONT_SIZE_FALLBACK_PT,
        spans: [span],
      });
    }
  }
  for (const column of columns) {
    column.spans.sort((a, b) => a.y - b.y || b.x - a.x);
  }
  return columns;
}

function canContinueVerticalSearchColumn(prev: VerticalSearchColumn, cur: VerticalSearchColumn): boolean {
  const gap = prev.centerX - cur.centerX;
  if (gap < 0) return false;
  const fontSize = Math.max(prev.fontSize, cur.fontSize, FONT_SIZE_FALLBACK_PT);
  if (gap > Math.max(fontSize * VERTICAL_SEARCH_MAX_COLUMN_GAP_RATIO, VERTICAL_SEARCH_MAX_COLUMN_GAP_PT)) {
    return false;
  }
  const overlap = Math.min(columnBottom(prev), columnBottom(cur)) - Math.max(columnTop(prev), columnTop(cur));
  return overlap > 0;
}

function verticalSearchLineFromColumns(columns: readonly VerticalSearchColumn[]): SearchLine | undefined {
  if (columns.length < 2) return undefined;
  let text = '';
  const owners: (SearchOwner | undefined)[] = [];
  let previousSpan: TextSpan | undefined;

  for (const column of columns) {
    for (const span of column.spans) {
      const spanText = span.text;
      if (spanText.length === 0) continue;
      const delimiter = previousSpan ? verticalSearchDelimiter(previousSpan, span) : '';
      if (delimiter.length > 0 && !/\s$/.test(text) && !/^\s/.test(spanText)) {
        text += delimiter;
        owners.push(undefined);
      }
      text += spanText;
      for (let index = 0; index < spanText.length; index++) owners.push(span);
      previousSpan = span;
    }
  }

  return text.length > 0 ? { text, owners, syntheticVertical: true } : undefined;
}

function verticalSearchDelimiter(prev: TextSpan, cur: TextSpan): string {
  const prevText = prev.text.trimEnd();
  const curText = cur.text.trimStart();
  if (!LATIN_OR_NUMBER_END_RE.test(prevText) || !LATIN_OR_NUMBER_START_RE.test(curText)) return '';
  if (LOWERCASE_START_RE.test(curText)) return '';
  return ' ';
}

function centerX(span: TextSpan): number {
  return span.x + span.width / 2;
}

function columnTop(column: VerticalSearchColumn): number {
  return Math.min(...column.spans.map((span) => span.y));
}

function columnBottom(column: VerticalSearchColumn): number {
  return Math.max(...column.spans.map((span) => span.y + span.height));
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function withHyphenatedSearchLines(lines: readonly SearchLine[]): SearchLine[] {
  const synthetic: SearchLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineText = line.text.trimEnd();
    if (!lineText.endsWith('-')) continue;
    const lineBox = searchLineBox(line);
    if (!lineBox) continue;

    for (let j = i + 1; j < lines.length && j <= i + HYPHENATED_SEARCH_LINE_SCAN_LIMIT; j++) {
      const next = lines[j];
      const nextText = next.text.trimStart();
      if (!/^[\p{L}\p{N}]/u.test(nextText)) continue;
      const nextBox = searchLineBox(next);
      if (!nextBox) continue;
      const verticalGap = nextBox.y - (lineBox.y + lineBox.height);
      if (verticalGap < -1) continue;
      if (
        verticalGap > Math.max(lineBox.height * HYPHENATED_SEARCH_LINE_MAX_GAP_RATIO, HYPHENATED_SEARCH_LINE_MAX_GAP_PT)
      ) {
        break;
      }
      if (Math.abs(nextBox.x - lineBox.x) > HYPHENATED_SEARCH_LINE_X_TOLERANCE_PT) continue;

      const trailingSpaces = line.text.length - lineText.length;
      const leadingSpaces = next.text.length - nextText.length;
      synthetic.push({
        text: `${lineText}${nextText}`,
        owners: [...line.owners.slice(0, line.owners.length - trailingSpaces), ...next.owners.slice(leadingSpaces)],
        syntheticHyphenated: true,
      });
      break;
    }
  }
  return synthetic.length === 0 ? [...lines] : [...lines, ...synthetic];
}

function searchLineBox(line: SearchLine): Box | undefined {
  const seen = new Set<SearchOwner>();
  const boxes: Box[] = [];
  for (const owner of line.owners) {
    if (!owner || seen.has(owner)) continue;
    seen.add(owner);
    boxes.push(owner);
  }
  return boxes.length === 0 ? undefined : unionBoxes(boxes);
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
    const ordered = textOrder(xSorted);
    let text = '';
    const owners: (SearchOwner | undefined)[] = [];
    let previousWordText = '';
    for (const word of ordered) {
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
  if (isVerticalSearchOwner(span)) {
    const charHeight = span.height / textLength;
    return {
      x: round2(span.x),
      y: round2(span.y + charHeight * clampedStart),
      width: round2(span.width),
      height: round2(charHeight * (clampedEnd - clampedStart)),
    };
  }
  const charWidth = span.width / textLength;
  return {
    x: round2(span.x + charWidth * clampedStart),
    y: round2(span.y),
    width: round2(charWidth * (clampedEnd - clampedStart)),
    height: round2(span.height),
  };
}

function isVerticalSearchOwner(span: SearchOwner): boolean {
  return span.height > Math.max(span.width, 1) * 3;
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
