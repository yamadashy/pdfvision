import type { PageLayout, VisualRegionAssociatedText } from '../../types/index.js';
import { MAX_ASSOCIATED_TEXT, mergeAssociatedText, normalizeAssociatedText } from './associatedText.js';
import {
  horizontalOverlapRatio,
  overlapArea,
  overlapOfSmaller,
  round2,
  unionBox,
  verticalOverlapRatio,
} from './geometry.js';
import type { BoxLike, Candidate } from './types.js';

type CaptionKind = 'figure' | 'table' | 'plate';

const CAPTION_MAX_GAP_PT = 54;
const CAPTION_MIN_HORIZONTAL_OVERLAP_RATIO = 0.2;
const MIN_CONTAINED_CAPTION_HEIGHT_PT = 6;
const CAPTION_SCORE_TOLERANCE_PT = 12;
const TABLE_CAPTION_CONTINUATION_MAX_LINES = 2;
const ABBREVIATED_FIGURE_CAPTION_CONTINUATION_MAX_LINES = 4;
const FULL_FIGURE_CAPTION_CONTINUATION_MAX_LINES = 8;
const CAPTION_CONTINUATION_MAX_CHARS = 240;
const CAPTION_CONTINUATION_TOTAL_MAX_CHARS = 600;
const SAME_BASELINE_HEADER_MIN_VERTICAL_OVERLAP_RATIO = 0.75;
const SAME_BASELINE_HEADER_MIN_LEFT_OFFSET_RATIO = 0.45;
const CAPTION_IDENTIFIER_ATOM = '[A-Za-z\\p{N}０-９一二三四五六七八九十]+';
const CAPTION_NUMBER_PATTERN = `${CAPTION_IDENTIFIER_ATOM}(?:(?:[.-]${CAPTION_IDENTIFIER_ATOM})|(?:-?\\(${CAPTION_IDENTIFIER_ATOM}\\)))*\\.?`;
const CAPTION_PATTERN = new RegExp(
  `^\\s*(?:fig(?:ure)?\\.?|table|plate|図表|図|表)\\s*(${CAPTION_NUMBER_PATTERN})(?=\\s|[:：．、]|$)`,
  'iu',
);
const CAPTION_DIGIT_OR_CJK_NUMBER_PATTERN = /[0-9０-９一二三四五六七八九十]/u;
const CAPTION_ROMAN_NUMERAL_PATTERN = /^[ivxlcdm]+$/iu;
const CAPTION_SINGLE_LETTER_PATTERN = /^[A-Z]$/u;
const GLOBAL_CAPTION_PATTERN = /^\s*plate\s+/iu;
const JAPANESE_TABLE_CAPTION_START_PATTERN = /^\s*(?:表|図表)\s*/u;
const GLUED_JAPANESE_TABLE_HEADER_SUFFIX_PATTERN = /^(.+[)）])([\p{L}\p{N}%％・／/]{1,8})$/u;
const TABLE_HEADER_FRAGMENT_PATTERN = /^[\p{L}\p{N}%％().（）・,，.．／/-]+$/u;

function joinCaptionTextParts(parts: readonly string[]): string {
  let text = '';
  for (const part of parts) {
    const normalizedPart = normalizeAssociatedText(part);
    if (normalizedPart.length === 0) continue;
    if (text.length === 0) {
      text = normalizedPart;
      continue;
    }
    if (text.endsWith('-') && /^[\p{L}\p{N}]/u.test(normalizedPart)) {
      text = `${text}${normalizedPart}`;
    } else {
      text = `${text} ${normalizedPart}`;
    }
  }
  return normalizeAssociatedText(text);
}

export function isCaptionText(text: string): boolean {
  const match = CAPTION_PATTERN.exec(text);
  return match !== null && isCaptionIdentifier(match[1] ?? '');
}

function isBareCaptionReferenceText(text: string): boolean {
  const match = CAPTION_PATTERN.exec(text);
  if (match === null || !isCaptionIdentifier(match[1] ?? '')) return false;
  const remainder = text
    .slice(match[0].length)
    .replace(/^[\s:：．。、.-]+/u, '')
    .trim();
  return !/[\p{L}\p{N}]/u.test(remainder);
}

function isCaptionIdentifier(text: string): boolean {
  const normalized = text.trim().replace(/[.．]+$/u, '');
  if (CAPTION_DIGIT_OR_CJK_NUMBER_PATTERN.test(normalized)) return true;
  if (CAPTION_ROMAN_NUMERAL_PATTERN.test(normalized)) return true;
  return CAPTION_SINGLE_LETTER_PATTERN.test(normalized);
}

function captionKind(text: string): CaptionKind | undefined {
  if (/^\s*table\b/iu.test(text) || /^\s*表/u.test(text)) return 'table';
  if (/^\s*plate\b/iu.test(text)) return 'plate';
  if (/^\s*fig(?:ure)?\.?(?=\s|[:：．、]|$)/iu.test(text) || /^\s*図/u.test(text)) return 'figure';
  return undefined;
}

function isGlobalCaptionText(text: string): boolean {
  return GLOBAL_CAPTION_PATTERN.test(text) && isCaptionText(text);
}

function captionContinuationLineLimit(text: string): number {
  if (/^\s*table\b/iu.test(text)) return TABLE_CAPTION_CONTINUATION_MAX_LINES;
  if (/^\s*fig\.?\s/iu.test(text)) return ABBREVIATED_FIGURE_CAPTION_CONTINUATION_MAX_LINES;
  if (/^\s*figure\b/iu.test(text)) return FULL_FIGURE_CAPTION_CONTINUATION_MAX_LINES;
  return 0;
}

function isCaptionContinuationText(captionText: string, text: string): boolean {
  const normalized = normalizeAssociatedText(text);
  if (normalized.length === 0 || normalized.length > CAPTION_CONTINUATION_MAX_CHARS) return false;
  if (!/[\p{L}\p{N}]/u.test(normalized)) return false;
  if (isCaptionText(normalized)) return false;
  if (/^(?:doi:|https?:\/\/|www\.)/iu.test(normalized)) return false;
  if (captionText.includes(normalized)) return false;
  return true;
}

function isSameBaselineTableHeaderText(text: string): boolean {
  const cells = normalizeAssociatedText(text).split(/\s+/u).filter(Boolean);
  if (cells.length < 2) return false;
  return cells.every((cell) => cell.length <= 12 && TABLE_HEADER_FRAGMENT_PATTERN.test(cell));
}

function isSameBaselineTableHeaderLine(captionLine: BoxLike, headerLine: BoxLike & { text: string }): boolean {
  if (verticalOverlapRatio(captionLine, headerLine) < SAME_BASELINE_HEADER_MIN_VERTICAL_OVERLAP_RATIO) return false;
  const minHeaderX = captionLine.x + captionLine.width * SAME_BASELINE_HEADER_MIN_LEFT_OFFSET_RATIO;
  if (headerLine.x < minHeaderX) return false;
  return isSameBaselineTableHeaderText(headerLine.text);
}

function trimGluedJapaneseTableHeaderFromCaption(
  text: string,
  captionLine: BoxLike,
  nextLine: (BoxLike & { text: string }) | undefined,
): string {
  if (!JAPANESE_TABLE_CAPTION_START_PATTERN.test(text)) return text;
  if (!nextLine || !isSameBaselineTableHeaderLine(captionLine, nextLine)) return text;
  const match = GLUED_JAPANESE_TABLE_HEADER_SUFFIX_PATTERN.exec(text);
  if (!match) return text;
  return match[1]?.trim() ?? text;
}

function captionScore(candidate: Candidate, textBox: BoxLike): number | undefined {
  const contained = overlapOfSmaller(candidate, textBox) >= 0.9;
  if (contained) {
    if (textBox.height < MIN_CONTAINED_CAPTION_HEIGHT_PT) return undefined;
    if ('text' in textBox && typeof textBox.text === 'string' && isBareCaptionReferenceText(textBox.text)) {
      return undefined;
    }
  }

  const captionBottom = textBox.y + textBox.height;
  const regionBottom = candidate.y + candidate.height;
  const belowGap = textBox.y - regionBottom;
  const aboveGap = candidate.y - captionBottom;
  const overlapsVertically = overlapArea(candidate, textBox) > 0;
  const gap = overlapsVertically ? 0 : belowGap >= 0 ? belowGap : aboveGap >= 0 ? aboveGap : Number.POSITIVE_INFINITY;
  if (gap > CAPTION_MAX_GAP_PT) return undefined;

  const overlap = horizontalOverlapRatio(candidate, textBox);
  if (overlap < CAPTION_MIN_HORIZONTAL_OVERLAP_RATIO) return undefined;
  const belowBonus = belowGap >= -4 ? 0 : 12;
  return gap + (1 - overlap) * 30 + belowBonus;
}

function captionTextsFromBlock(
  block: NonNullable<PageLayout['blocks']>[number],
  blockIndex: number,
): VisualRegionAssociatedText[] {
  const lines = block.lines.map((line) => ({ line, text: normalizeAssociatedText(line.text) }));
  const lineCaptions: VisualRegionAssociatedText[] = [];
  for (let i = 0; i < lines.length; i++) {
    const item = lines[i];
    if (!item || !isCaptionText(item.text)) continue;

    const textParts = [trimGluedJapaneseTableHeaderFromCaption(item.text, item.line, lines[i + 1]?.line)];
    let captionBox: BoxLike = item.line;
    const continuationLimit = captionContinuationLineLimit(item.text);
    for (let j = i + 1; continuationLimit > 0 && j < lines.length && j <= i + continuationLimit; j++) {
      const continuation = lines[j];
      if (!continuation) break;
      const captionText = joinCaptionTextParts(textParts);
      if (!isCaptionContinuationText(captionText, continuation.text)) break;
      const continuedCaption = joinCaptionTextParts([...textParts, continuation.text]);
      if (continuedCaption.length > CAPTION_CONTINUATION_TOTAL_MAX_CHARS) break;
      textParts.push(continuation.text);
      captionBox = unionBox(captionBox, continuation.line);
    }

    lineCaptions.push({
      text: joinCaptionTextParts(textParts),
      relation: 'caption' as const,
      x: round2(captionBox.x),
      y: round2(captionBox.y),
      width: round2(captionBox.width),
      height: round2(captionBox.height),
      blockIndex,
    });
  }
  if (lineCaptions.length > 0) return lineCaptions;

  const text = normalizeAssociatedText(block.text);
  if (!isCaptionText(text)) return [];
  return [
    {
      text,
      relation: 'caption' as const,
      x: block.x,
      y: block.y,
      width: block.width,
      height: block.height,
      blockIndex,
    },
  ];
}

export function attachCaptionText(candidates: Candidate[], layout: PageLayout | undefined): Candidate[] {
  const blocks = layout?.blocks ?? [];
  if (blocks.length === 0) return candidates;
  const captionItems = blocks.flatMap((block, index) =>
    block.repeated
      ? []
      : captionTextsFromBlock(block, index).map((associatedText) => ({
          text: associatedText,
          kind: captionKind(associatedText.text),
          global: isGlobalCaptionText(associatedText.text),
        })),
  );
  const globalCaptions = captionItems.filter((item) => item.global).slice(0, MAX_ASSOCIATED_TEXT);
  return candidates.map((candidate) => {
    const scoredCaptions = captionItems
      .map((item) => ({
        text: item.text,
        kind: item.kind,
        score: captionScore(candidate, item.text),
      }))
      .filter(
        (item): item is { text: VisualRegionAssociatedText; kind: CaptionKind | undefined; score: number } =>
          item.score !== undefined,
      )
      .sort((a, b) => a.score - b.score);
    const preferredCaptionKind = candidate.kind === 'table' ? 'table' : undefined;
    const preferredCaptions = preferredCaptionKind
      ? scoredCaptions.filter((caption) => caption.kind === preferredCaptionKind)
      : [];
    const captionPool = preferredCaptions.length > 0 ? preferredCaptions : scoredCaptions;
    const bestCaptionScore = captionPool[0]?.score;
    const captions =
      bestCaptionScore === undefined
        ? []
        : captionPool
            .filter((caption) => caption.score <= bestCaptionScore + CAPTION_SCORE_TOLERANCE_PT)
            .slice(0, MAX_ASSOCIATED_TEXT);
    if (captions.length === 0) {
      if (globalCaptions.length === 0) return candidate;
      const associatedText = mergeAssociatedText([
        ...(candidate.associatedText ?? []),
        ...globalCaptions.map((caption) => caption.text),
      ]);
      return { ...candidate, associatedText };
    }

    const associatedText = mergeAssociatedText([
      ...(candidate.associatedText ?? []),
      ...captions.map((caption) => caption.text),
    ]);
    const box = captions.reduce<BoxLike>((acc, caption) => unionBox(acc, caption.text), candidate);
    return { ...candidate, ...box, associatedText };
  });
}
