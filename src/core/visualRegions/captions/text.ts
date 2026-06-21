import { normalizeAssociatedText } from '../associatedText.js';
import { verticalOverlapRatio } from '../geometry.js';
import type { BoxLike } from '../types.js';

export type CaptionKind = 'figure' | 'table' | 'plate';

const TABLE_CAPTION_CONTINUATION_MAX_LINES = 2;
const ABBREVIATED_FIGURE_CAPTION_CONTINUATION_MAX_LINES = 4;
const FULL_FIGURE_CAPTION_CONTINUATION_MAX_LINES = 8;
const CAPTION_CONTINUATION_MAX_CHARS = 240;
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

export function joinCaptionTextParts(parts: readonly string[]): string {
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

export function isBareCaptionReferenceText(text: string): boolean {
  const match = CAPTION_PATTERN.exec(text);
  if (match === null || !isCaptionIdentifier(match[1] ?? '')) return false;
  const remainder = text
    .slice(match[0].length)
    .replace(/^[\s:：．。、.-]+/u, '')
    .trim();
  return !/[\p{L}\p{N}]/u.test(remainder);
}

export function captionKind(text: string): CaptionKind | undefined {
  if (/^\s*table\b/iu.test(text) || /^\s*表/u.test(text)) return 'table';
  if (/^\s*plate\b/iu.test(text)) return 'plate';
  if (/^\s*fig(?:ure)?\.?(?=\s|[:：．、]|$)/iu.test(text) || /^\s*図/u.test(text)) return 'figure';
  return undefined;
}

export function isGlobalCaptionText(text: string): boolean {
  return GLOBAL_CAPTION_PATTERN.test(text) && isCaptionText(text);
}

export function captionContinuationLineLimit(text: string): number {
  if (/^\s*table\b/iu.test(text)) return TABLE_CAPTION_CONTINUATION_MAX_LINES;
  if (/^\s*fig\.?\s/iu.test(text)) return ABBREVIATED_FIGURE_CAPTION_CONTINUATION_MAX_LINES;
  if (/^\s*figure\b/iu.test(text)) return FULL_FIGURE_CAPTION_CONTINUATION_MAX_LINES;
  return 0;
}

export function isCaptionContinuationText(captionText: string, text: string): boolean {
  const normalized = normalizeAssociatedText(text);
  if (normalized.length === 0 || normalized.length > CAPTION_CONTINUATION_MAX_CHARS) return false;
  if (!/[\p{L}\p{N}]/u.test(normalized)) return false;
  if (isCaptionText(normalized)) return false;
  if (/^(?:doi:|https?:\/\/|www\.)/iu.test(normalized)) return false;
  if (captionText.includes(normalized)) return false;
  return true;
}

export function trimGluedJapaneseTableHeaderFromCaption(
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

function isCaptionIdentifier(text: string): boolean {
  const normalized = text.trim().replace(/[.．]+$/u, '');
  if (CAPTION_DIGIT_OR_CJK_NUMBER_PATTERN.test(normalized)) return true;
  if (CAPTION_ROMAN_NUMERAL_PATTERN.test(normalized)) return true;
  return CAPTION_SINGLE_LETTER_PATTERN.test(normalized);
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
