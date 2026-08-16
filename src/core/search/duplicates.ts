import type { SearchMatch } from '../../types/index.js';
import type { CompiledSearch } from './compiler.js';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PRECISE_DUPLICATE_MIN_OVERLAP_RATIO = 0.5;

export function duplicateKey(queryIndex: number | undefined, query: string, text: string, ignoreCase: boolean): string {
  const queryKey = queryIndex === undefined ? query : String(queryIndex);
  const textKey = ignoreCase ? text.toLowerCase() : text;
  return `${queryKey}\u0000${textKey}`;
}

function matcherForMatch(compiled: CompiledSearch, match: SearchMatch): { regex: RegExp } | undefined {
  if (match.queryIndex !== undefined) {
    return compiled.matchers.find((m) => m.queryIndex === match.queryIndex && m.query === match.query);
  }
  return compiled.matchers.find((m) => m.query === match.query);
}

function duplicateKeyForMatch(compiled: CompiledSearch, match: SearchMatch): string {
  const matcher = matcherForMatch(compiled, match);
  return duplicateKey(match.queryIndex, match.query, match.text, matcher?.regex.ignoreCase ?? false);
}

const NOT_DRAWN_ON_PAGE = Symbol('pdfvision.searchMatchNotDrawnOnPage');

type SearchMatchWithVisibility = SearchMatch & { [NOT_DRAWN_ON_PAGE]?: true };

/**
 * Mark a match whose string is not part of the page's artwork.
 *
 * Non-enumerable on purpose: this is a fact about where a match came
 * from, not a field of the documented `SearchMatch` shape, and it must
 * not reach JSON/TOON/XML output or the cache payload.
 */
export function markMatchNotDrawnOnPage(match: SearchMatch): void {
  Object.defineProperty(match, NOT_DRAWN_ON_PAGE, { value: true, enumerable: false });
}

/**
 * Whether a match counts as one visible occurrence for the OCR budget.
 *
 * The budget exists because OCR re-reads the page image: an OCR hit on a
 * string a precise source already reported is the same occurrence read
 * twice, so the precise bbox should win. That reasoning holds only for
 * matches whose text is actually drawn on the page. A link target is not
 * — it lives in the annotation, and when the anchor does restate it the
 * native hit is what OCR would re-read. A checkbox or radio export value
 * is form metadata that commonly appears nowhere in the artwork. Letting
 * either fund the budget spends it on text OCR never saw, and the cost
 * lands on a genuine OCR-only occurrence of the same string somewhere
 * else on the page, which disappears without a warning.
 *
 * Text and choice values and button captions stay: those are drawn
 * inside their widgets, so OCR does read them back.
 */
function fundsOcrDuplicateBudget(match: SearchMatch): boolean {
  if (match.source === 'ocr' || match.source === 'link') return false;
  return (match as SearchMatchWithVisibility)[NOT_DRAWN_ON_PAGE] !== true;
}

export function buildPreciseDuplicateBudget(
  preciseMatches: readonly SearchMatch[] | undefined,
  compiled: CompiledSearch,
): Map<string, number> {
  const budget = new Map<string, number>();
  for (const match of preciseMatches ?? []) {
    if (!fundsOcrDuplicateBudget(match)) continue;
    const key = duplicateKeyForMatch(compiled, match);
    budget.set(key, (budget.get(key) ?? 0) + 1);
  }
  return budget;
}

/**
 * `sources` narrows which earlier matches can suppress this one. Callers
 * that can tell apart "the same evidence reported twice" from "two
 * different facts about one rectangle" pass it; the default counts every
 * non-OCR source, which is the historical behaviour.
 */
export function hasPreciseDuplicateAtBox(
  preciseMatches: readonly SearchMatch[] | undefined,
  compiled: CompiledSearch,
  key: string,
  box: Box,
  sources?: (source: SearchMatch['source']) => boolean,
): boolean {
  for (const match of preciseMatches ?? []) {
    if (match.source === 'ocr') continue;
    if (sources && !sources(match.source)) continue;
    if (duplicateKeyForMatch(compiled, match) !== key) continue;
    if (boxOverlapRatio(match.bbox, box) >= PRECISE_DUPLICATE_MIN_OVERLAP_RATIO) return true;
  }
  return false;
}

function boxOverlapRatio(a: Box, b: Box): number {
  const areaA = Math.max(0, a.width) * Math.max(0, a.height);
  const areaB = Math.max(0, b.width) * Math.max(0, b.height);
  const smallerArea = Math.min(areaA, areaB);
  if (smallerArea <= 0) return 0;
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const overlap = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return overlap / smallerArea;
}

export function suppressDuplicateOcrMatches(
  nativeMatches: readonly SearchMatch[] | undefined,
  ocrMatches: readonly SearchMatch[],
  compiled: CompiledSearch,
): SearchMatch[] {
  const budget = buildPreciseDuplicateBudget(nativeMatches, compiled);
  const out: SearchMatch[] = [];
  for (const match of ocrMatches) {
    if (match.source !== 'ocr') {
      out.push(match);
      continue;
    }
    const key = duplicateKeyForMatch(compiled, match);
    const remaining = budget.get(key) ?? 0;
    if (remaining > 0) {
      budget.set(key, remaining - 1);
      continue;
    }
    out.push(match);
  }
  return out;
}
