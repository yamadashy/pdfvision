import type { OcrWord, TextSpan } from '../../types/index.js';
import {
  extractHorizontalRubyAnalysis,
  type HorizontalRubyAssociation,
  horizontalRubyReadingText,
} from '../layout/horizontalRuby.js';
import { mergeSameOffsetRubyTextAttachments } from '../layout/rubyMerge.js';
import { extractBodyVerticalCjkRunAnalysis } from '../layout/verticalText.js';
import { CJK_TIGHT_GAP_RATIO, isCjkLeading } from '../text/cjkJoin.js';
import {
  isLikelyCjkDisplaySpacingRow,
  isLikelyWideWordSpacingRow,
  shouldInsertSemanticSpace,
} from '../text/spacing.js';
import { isRtlDominantPositionedText, textOrder } from '../text/textDirection.js';
import { isLikelyCompactTableHeaderRow } from './compactTableHeaders.js';
import { nfkc } from './compiler.js';
import { withHyphenatedSearchLines, withSyntheticSearchLines } from './syntheticLines.js';
import type { SearchLine, SearchOwner } from './types.js';
import { buildVerticalSearchLines } from './verticalLines.js';

const DEFAULT_SPACE_GAP_RATIO = 0.25;
const FONT_SIZE_FALLBACK_PT = 12;
const SEARCH_SEGMENT_GAP_RATIO = 1.25;
const SEARCH_SEGMENT_MIN_GAP_PT = 14;

interface HorizontalSearchRubyAttachment {
  offset: number;
  text: string;
  rubySpans: readonly TextSpan[];
}

export function buildSearchLines(spans: readonly TextSpan[] | undefined, pageWidth: number): SearchLine[] {
  if (!spans || spans.length === 0) return [];
  const verticalAnalysis = extractBodyVerticalCjkRunAnalysis(spans);
  const rubySpans = new Set(verticalAnalysis.rubySpans);
  const excludedVerticalSpans = new Set([...verticalAnalysis.rubySpans, ...verticalAnalysis.gutterAnnotationSpans]);
  const rubyBodySpans = new Set<TextSpan>();
  if (rubySpans.size > 0) {
    for (const block of verticalAnalysis.blocks) {
      for (const column of block.columns) {
        for (const span of column.spans) rubyBodySpans.add(span);
      }
    }
  }
  const horizontalSpans =
    excludedVerticalSpans.size > 0
      ? spans.filter((span) => !excludedVerticalSpans.has(span) && !rubyBodySpans.has(span))
      : spans;
  const horizontalRuby = extractHorizontalRubyAnalysis(horizontalSpans);
  const horizontalRubySpans = new Set(horizontalRuby.rubySpans);
  const horizontalRubyAttachments = horizontalSearchRubyAttachments(horizontalRuby.rubyAssociations);
  const sorted = horizontalSpans
    .filter((span) => !horizontalRubySpans.has(span))
    .sort((a, b) => a.y - b.y || a.x - b.x);
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
      const line = searchLineFromHorizontalSegment(segment);
      if (!line) continue;
      const rubyLine = searchLineFromHorizontalSegment(segment, horizontalRubyAttachments);
      if (rubyLine?.rubyRanges && rubyLine.rubyRanges.length > 0) {
        lines.push({ ...line, syntheticRubyBase: true });
        lines.push(rubyLine);
      } else {
        lines.push(line);
      }
    }
  }
  const augmented = [...lines, ...buildVerticalSearchLines(spans)];
  return withSyntheticSearchLines(augmented);
}

function searchLineFromHorizontalSegment(
  segment: readonly TextSpan[],
  rubyAttachments: ReadonlyMap<TextSpan, readonly HorizontalSearchRubyAttachment[]> = new Map(),
): SearchLine | undefined {
  const rtl = isRtlDominantPositionedText(segment);
  const ordered = textOrder(segment);
  const state: { text: string; owners: (SearchOwner | undefined)[]; rubyRanges: { start: number; end: number }[] } = {
    text: '',
    owners: [],
    rubyRanges: [],
  };
  for (let i = 0; i < ordered.length; i++) {
    const span = ordered[i];
    if (i > 0) {
      const prev = ordered[i - 1];
      const gap = rtl ? prev.x - (span.x + span.width) : span.x - (prev.x + prev.width);
      const fontSize = span.fontSize || prev.fontSize || FONT_SIZE_FALLBACK_PT;
      if (
        (gap > spaceGapThreshold(prev, span, fontSize) ||
          shouldInsertSemanticSpace(prev.text, span.text, gap, fontSize)) &&
        !/\s$/.test(state.text) &&
        !/^\s/.test(span.text)
      ) {
        state.text += ' ';
        state.owners.push(undefined);
      }
    }
    appendSpanTextWithRuby(state, span, rubyAttachments.get(span));
  }
  return state.text.length > 0
    ? {
        text: state.text,
        owners: state.owners,
        ...(state.rubyRanges.length > 0 && { syntheticRuby: true, rubyRanges: state.rubyRanges }),
      }
    : undefined;
}

function appendSpanTextWithRuby(
  state: { text: string; owners: (SearchOwner | undefined)[]; rubyRanges: { start: number; end: number }[] },
  span: TextSpan,
  attachments: readonly HorizontalSearchRubyAttachment[] | undefined,
): void {
  if (!attachments || attachments.length === 0) {
    appendTextOwners(state, span.text, span);
    return;
  }

  let cursor = 0;
  for (const attachment of mergeSameOffsetRubyTextAttachments(attachments, (left, right) => ({
    offset: left.offset,
    text: left.text + right.text,
    rubySpans: [...left.rubySpans, ...right.rubySpans],
  }))) {
    const offset = Math.max(cursor, Math.min(span.text.length, attachment.offset));
    appendTextOwners(state, span.text.slice(cursor, offset), span);
    const rangeStart = state.text.length;
    appendTextOwners(state, '《', undefined);
    const rubyOwner = attachment.rubySpans[0];
    appendTextOwners(state, attachment.text, rubyOwner);
    appendTextOwners(state, '》', undefined);
    if (attachment.text.length > 0) state.rubyRanges.push({ start: rangeStart, end: state.text.length });
    cursor = offset;
  }
  appendTextOwners(state, span.text.slice(cursor), span);
}

function appendTextOwners(
  state: { text: string; owners: (SearchOwner | undefined)[] },
  text: string,
  owner: SearchOwner | undefined,
): void {
  state.text += text;
  for (let index = 0; index < text.length; index++) state.owners.push(owner);
}

function horizontalSearchRubyAttachments(
  associations: readonly HorizontalRubyAssociation[],
): ReadonlyMap<TextSpan, readonly HorizontalSearchRubyAttachment[]> {
  const attachments = new Map<TextSpan, HorizontalSearchRubyAttachment[]>();
  for (const association of associations) {
    const baseEnd = association.baseRanges.at(-1);
    if (!baseEnd) continue;
    const existing = attachments.get(baseEnd.span);
    const attachment = {
      offset: baseEnd.end,
      text: horizontalRubyReadingText(association),
      rubySpans: association.rubySpans,
    };
    if (existing) {
      existing.push(attachment);
    } else {
      attachments.set(baseEnd.span, [attachment]);
    }
  }
  return attachments;
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
  return withHyphenatedSearchLines(lines, { allowRaggedBreaks: true, includeDehyphenated: true });
}

function spaceGapThreshold(prev: TextSpan, cur: TextSpan, fontSize: number): number {
  const bothCjk = isCjkLeading(prev.text) && isCjkLeading(cur.text);
  return fontSize * (bothCjk ? CJK_TIGHT_GAP_RATIO : DEFAULT_SPACE_GAP_RATIO);
}
