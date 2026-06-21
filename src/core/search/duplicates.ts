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

function preciseDuplicateBudget(
  preciseMatches: readonly SearchMatch[] | undefined,
  compiled: CompiledSearch,
): Map<string, number> {
  const budget = new Map<string, number>();
  for (const match of preciseMatches ?? []) {
    if (match.source === 'ocr') continue;
    const key = duplicateKeyForMatch(compiled, match);
    budget.set(key, (budget.get(key) ?? 0) + 1);
  }
  return budget;
}

export function hasPreciseDuplicateAtBox(
  preciseMatches: readonly SearchMatch[] | undefined,
  compiled: CompiledSearch,
  key: string,
  box: Box,
): boolean {
  for (const match of preciseMatches ?? []) {
    if (match.source === 'ocr') continue;
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
  const budget = preciseDuplicateBudget(nativeMatches, compiled);
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
