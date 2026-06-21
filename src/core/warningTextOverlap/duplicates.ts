import type { LayoutBlock } from '../../types/index.js';
import { intersectionArea } from './geometry.js';

const DUPLICATE_EXACT_TEXT_MIN_CHARS = 3;
const DUPLICATE_VERTICAL_CJK_CONTAINED_MIN_CHARS = 4;
const DUPLICATE_TEXT_MIN_CHARS = 8;
const DUPLICATE_TEXT_MIN_NGRAM_COVERAGE = 0.72;
const DUPLICATE_TEXT_MIN_OVERLAP_RATIO = 0.6;

export function isDuplicateExtractionPair(a: LayoutBlock, b: LayoutBlock): boolean {
  const overlap = intersectionArea(a, b);
  if (overlap <= 0) return false;
  const smallerArea = Math.max(0.001, Math.min(a.width * a.height, b.width * b.height));
  if (overlap / smallerArea < DUPLICATE_TEXT_MIN_OVERLAP_RATIO) return false;

  const aText = normalizeDuplicateText(a.text);
  const bText = normalizeDuplicateText(b.text);
  const shorter = aText.length <= bText.length ? aText : bText;
  const longer = aText.length <= bText.length ? bText : aText;
  if (shorter === longer && shorter.length >= DUPLICATE_EXACT_TEXT_MIN_CHARS) return true;
  if (
    shorter.length >= DUPLICATE_VERTICAL_CJK_CONTAINED_MIN_CHARS &&
    isVerticalLikePair(a, b) &&
    isCjkDominant(shorter) &&
    longer.includes(shorter)
  ) {
    return true;
  }
  if (shorter.length < DUPLICATE_TEXT_MIN_CHARS) return false;
  if (longer.includes(shorter)) return true;
  return ngramCoverage(shorter, longer) >= DUPLICATE_TEXT_MIN_NGRAM_COVERAGE;
}

function isVerticalLikePair(a: LayoutBlock, b: LayoutBlock): boolean {
  return a.writingMode === 'vertical' || b.writingMode === 'vertical';
}

function isCjkDominant(text: string): boolean {
  const chars = Array.from(text);
  if (chars.length === 0) return false;
  const cjkCount = chars.filter((char) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(char)).length;
  return cjkCount / chars.length >= 0.6;
}

function normalizeDuplicateText(text: string): string {
  return text.replace(/[^\p{Letter}\p{Number}]/gu, '');
}

function ngramCoverage(shorter: string, longer: string): number {
  const shorterNgrams = ngramSet(shorter);
  if (shorterNgrams.size === 0) return 0;
  const longerNgrams = ngramSet(longer);
  let shared = 0;
  for (const ngram of shorterNgrams) {
    if (longerNgrams.has(ngram)) shared++;
  }
  return shared / shorterNgrams.size;
}

function ngramSet(text: string): Set<string> {
  const chars = Array.from(text);
  const size = chars.length >= 3 ? 3 : chars.length;
  const out = new Set<string>();
  for (let i = 0; i <= chars.length - size; i++) {
    out.add(chars.slice(i, i + size).join(''));
  }
  return out;
}
