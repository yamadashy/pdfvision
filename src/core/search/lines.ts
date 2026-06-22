import type { OcrWord, TextSpan } from '../../types/index.js';
import { CJK_TIGHT_GAP_RATIO, isCjkLeading } from '../text/cjkJoin.js';
import {
  isLikelyCjkDisplaySpacingRow,
  isLikelyWideWordSpacingRow,
  shouldInsertSemanticSpace,
} from '../text/spacing.js';
import { isRtlDominantPositionedText, textOrder } from '../text/textDirection.js';
import { isLikelyCompactTableHeaderRow } from './compactTableHeaders.js';
import { nfkc } from './compiler.js';
import { withSyntheticSearchLines } from './syntheticLines.js';
import type { SearchLine, SearchOwner } from './types.js';
import { buildVerticalSearchLines } from './verticalLines.js';

const DEFAULT_SPACE_GAP_RATIO = 0.25;
const FONT_SIZE_FALLBACK_PT = 12;
const SEARCH_SEGMENT_GAP_RATIO = 1.25;
const SEARCH_SEGMENT_MIN_GAP_PT = 14;

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
    const preserveCompactTableHeader = isLikelyCompactTableHeaderRow(xSorted, pageWidth, FONT_SIZE_FALLBACK_PT);
    const segments: TextSpan[][] = [[xSorted[0]]];

    for (let i = 1; i < xSorted.length; i++) {
      const span = xSorted[i];
      const prev = xSorted[i - 1];
      const gap = span.x - (prev.x + prev.width);
      const fontSize = span.fontSize || prev.fontSize || FONT_SIZE_FALLBACK_PT;
      const segmentGap = Math.max(fontSize * SEARCH_SEGMENT_GAP_RATIO, SEARCH_SEGMENT_MIN_GAP_PT);
      if (!preserveWideWordSpacing && !preserveCjkDisplaySpacing && !preserveCompactTableHeader && gap > segmentGap) {
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
  return withSyntheticSearchLines(augmented);
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
