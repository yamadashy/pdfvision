import type { OcrWord, TextSpan } from '../../types/index.js';
import { CJK_TIGHT_GAP_RATIO, isCjkLeading } from '../cjkJoin.js';
import { isLikelyCjkDisplaySpacingRow, isLikelyWideWordSpacingRow, shouldInsertSemanticSpace } from '../spacing.js';
import { isRtlDominantPositionedText, textOrder } from '../textDirection.js';
import { nfkc } from './compiler.js';
import type { Box, SearchLine, SearchOwner } from './types.js';

const DEFAULT_SPACE_GAP_RATIO = 0.25;
const FONT_SIZE_FALLBACK_PT = 12;
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

export function buildSearchLines(spans: readonly TextSpan[] | undefined, pageWidth: number): SearchLine[] {
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

export function buildOcrSearchLines(words: readonly OcrWord[] | undefined, normalize: boolean): SearchLine[] {
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

export function unionBoxes(boxes: readonly Box[]): Box {
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

export function contributingBoxes(line: SearchLine, start: number, end: number): Box[] {
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

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
