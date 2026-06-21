import type { OcrWord, TextSpan } from '../../types/index.js';
import { CJK_TIGHT_GAP_RATIO, isCjkLeading } from '../text/cjkJoin.js';
import {
  isLikelyCjkDisplaySpacingRow,
  isLikelyWideWordSpacingRow,
  shouldInsertSemanticSpace,
} from '../text/spacing.js';
import { isRtlDominantPositionedText, textOrder } from '../text/textDirection.js';
import { unionBoxes } from './boxes.js';
import { nfkc } from './compiler.js';
import type { Box, SearchLine, SearchOwner } from './types.js';
import { buildVerticalSearchLines } from './verticalLines.js';

const DEFAULT_SPACE_GAP_RATIO = 0.25;
const FONT_SIZE_FALLBACK_PT = 12;
const SEARCH_SEGMENT_GAP_RATIO = 1.25;
const SEARCH_SEGMENT_MIN_GAP_PT = 14;
const HYPHENATED_SEARCH_LINE_SCAN_LIMIT = 6;
const HYPHENATED_SEARCH_LINE_MAX_GAP_RATIO = 2.5;
const HYPHENATED_SEARCH_LINE_MAX_GAP_PT = 24;
const HYPHENATED_SEARCH_LINE_X_TOLERANCE_PT = 12;

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
