import { isNonPrintableCodePoint } from '../nonPrintable.js';

const REPLACEMENT_CHARACTER = '\uFFFD';
const CJK_MOJIBAKE_MIN_CJK_COUNT = 50;
const CJK_MOJIBAKE_COUNT_THRESHOLD = 5;
const CJK_MOJIBAKE_RATIO_THRESHOLD = 0.05;
const LATIN1_MOJIBAKE_MIN_COUNT = 4;
const LATIN1_MOJIBAKE_RATIO_THRESHOLD = 0.6;
const INLINE_UPPERCASE_DIGRAPH_GLYPH_PATTERN = /\b[\p{Ll}\p{Nd}]+LJ[\p{Ll}\p{Nd}]+\b/gu;
const INLINE_UPPERCASE_DIGRAPH_SAMPLE_LIMIT = 3;
const CJK_INTERGLYPH_SPACE_MIN_CJK_COUNT = 8;
const CJK_INTERGLYPH_SPACE_MIN_PAIR_COUNT = 5;
const CJK_INTERGLYPH_SPACE_PAIR_RATIO_THRESHOLD = 0.45;
const CJK_INTERGLYPH_SPACE_SAMPLE_LIMIT = 3;
const SEQUENTIAL_CJK_EXTENSION_GLYPH_MIN_COUNT = 8;
const SEQUENTIAL_CJK_EXTENSION_GLYPH_DOMINANCE_THRESHOLD = 0.75;
const SEQUENTIAL_CJK_EXTENSION_GLYPH_MAX_STEP = 4;
const SEQUENTIAL_CJK_EXTENSION_GLYPH_SAMPLE_LIMIT = 4;

export function privateUseGlyphStats(text: string): { count: number; ratio: number } {
  let total = 0;
  let count = 0;
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i) as number;
    const char = String.fromCodePoint(cp);
    if (!/\s/u.test(char)) {
      total++;
      if (isPrivateUseCodePoint(cp)) count++;
    }
    i += cp > 0xffff ? 2 : 1;
  }
  return { count, ratio: total > 0 ? count / total : 0 };
}

export function detectInlineUppercaseDigraphGlyphNoise(text: string): string[] {
  const samples: string[] = [];
  for (const match of text.matchAll(INLINE_UPPERCASE_DIGRAPH_GLYPH_PATTERN)) {
    const sample = match[0];
    if (!samples.includes(sample)) samples.push(sample);
    if (samples.length >= INLINE_UPPERCASE_DIGRAPH_SAMPLE_LIMIT) break;
  }
  return samples;
}

export function detectCjkInterglyphSpacingNoise(text: string): { pairCount: number; samples: string[] } | undefined {
  const chars = Array.from(text);
  const cjkCount = chars.filter(isCjkTextChar).length;
  if (cjkCount < CJK_INTERGLYPH_SPACE_MIN_CJK_COUNT) return undefined;

  let pairCount = 0;
  const samples: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const left = chars[i];
    if (!isCjkTextChar(left)) continue;
    let j = i + 1;
    let sawSpace = false;
    while (isInlineSpacingChar(chars[j])) {
      sawSpace = true;
      j++;
    }
    const right = chars[j];
    if (!sawSpace || !isCjkTextChar(right)) continue;
    pairCount++;
    const sample = `${left} ${right}`;
    if (!samples.includes(sample) && samples.length < CJK_INTERGLYPH_SPACE_SAMPLE_LIMIT) samples.push(sample);
  }
  if (pairCount < CJK_INTERGLYPH_SPACE_MIN_PAIR_COUNT) return undefined;
  const ratio = pairCount / Math.max(1, cjkCount - 1);
  if (ratio < CJK_INTERGLYPH_SPACE_PAIR_RATIO_THRESHOLD) return undefined;
  return { pairCount, samples };
}

export function detectSequentialCjkExtensionGlyphNoise(text: string): { samples: string[] } | undefined {
  const chars = Array.from(text).filter((ch) => !/\s/u.test(ch));
  if (chars.length < SEQUENTIAL_CJK_EXTENSION_GLYPH_MIN_COUNT) return undefined;

  const extensionChars = chars.filter(isCjkExtensionChar);
  if (extensionChars.length < SEQUENTIAL_CJK_EXTENSION_GLYPH_MIN_COUNT) return undefined;
  if (extensionChars.length / chars.length < SEQUENTIAL_CJK_EXTENSION_GLYPH_DOMINANCE_THRESHOLD) return undefined;

  let currentRun: string[] = [];
  let currentStep: number | undefined;
  for (const char of chars) {
    if (!isCjkExtensionChar(char)) {
      currentRun = [];
      currentStep = undefined;
      continue;
    }
    if (currentRun.length === 0) {
      currentRun = [char];
      continue;
    }

    const previous = currentRun.at(-1) as string;
    const step = (char.codePointAt(0) as number) - (previous.codePointAt(0) as number);
    if (step <= 0 || step > SEQUENTIAL_CJK_EXTENSION_GLYPH_MAX_STEP) {
      currentRun = [char];
      currentStep = undefined;
      continue;
    }
    if (currentStep !== undefined && step !== currentStep) {
      currentRun = [previous, char];
      currentStep = step;
      continue;
    }

    currentStep = step;
    currentRun.push(char);
    if (currentRun.length >= SEQUENTIAL_CJK_EXTENSION_GLYPH_MIN_COUNT) {
      return { samples: currentRun.slice(0, SEQUENTIAL_CJK_EXTENSION_GLYPH_SAMPLE_LIMIT) };
    }
  }

  return undefined;
}

export function detectCjkMojibakeGlyphNoise(text: string): { count: number; samples: string[] } | undefined {
  const chars = Array.from(text);
  const cjkCount = chars.filter(isCjkTextChar).length;
  if (cjkCount < CJK_MOJIBAKE_MIN_CJK_COUNT) return undefined;

  const suspicious: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (!isLatinExtendedChar(ch)) continue;
    if (isLatinTextChar(chars[i - 1]) || isLatinTextChar(chars[i + 1])) continue;
    suspicious.push(ch);
  }
  const ratio = chars.length > 0 ? suspicious.length / chars.length : 0;
  if (suspicious.length < CJK_MOJIBAKE_COUNT_THRESHOLD) return undefined;
  if (ratio >= CJK_MOJIBAKE_RATIO_THRESHOLD) return undefined;
  return { count: suspicious.length, samples: [...new Set(suspicious)].slice(0, 3) };
}

export function detectLatin1MojibakeGlyphNoise(
  text: string,
): { count: number; ratio: number; samples: string[] } | undefined {
  const allChars = Array.from(text);
  if (!hasAdjacentLatin1SupplementRun(allChars)) return undefined;
  const chars = allChars.filter((ch) => !/\s/u.test(ch));
  if (chars.length < LATIN1_MOJIBAKE_MIN_COUNT) return undefined;

  const suspicious = chars.filter(isLatin1SupplementChar);
  if (suspicious.length < LATIN1_MOJIBAKE_MIN_COUNT) return undefined;
  const ratio = suspicious.length / chars.length;
  if (ratio < LATIN1_MOJIBAKE_RATIO_THRESHOLD) return undefined;
  if (!suspicious.some(isLatin1MojibakeAnchorChar)) return undefined;
  return { count: suspicious.length, ratio, samples: [...new Set(suspicious)].slice(0, 4) };
}

export function countNonPrintableCodePoints(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i) as number;
    if (isNonPrintableCodePoint(cp)) count++;
    i += cp > 0xffff ? 2 : 1;
  }
  return count;
}

export function codePointLength(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i) as number;
    count++;
    i += cp > 0xffff ? 2 : 1;
  }
  return count;
}

export function countReplacementCharacters(text: string): number {
  let count = 0;
  for (const ch of text) {
    if (ch === REPLACEMENT_CHARACTER) count++;
  }
  return count;
}

function isPrivateUseCodePoint(cp: number): boolean {
  return (cp >= 0xe000 && cp <= 0xf8ff) || (cp >= 0xf0000 && cp <= 0xffffd) || (cp >= 0x100000 && cp <= 0x10fffd);
}

function isInlineSpacingChar(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t' || ch === '\u3000';
}

function isCjkExtensionChar(ch: string | undefined): boolean {
  if (ch === undefined) return false;
  const cp = ch.codePointAt(0);
  return cp !== undefined && ((cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x20000 && cp <= 0x2ebef));
}

function isCjkTextChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(ch);
}

function isLatinTextChar(ch: string | undefined): boolean {
  return ch !== undefined && /\p{Script=Latin}/u.test(ch);
}

function isLatinExtendedChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\u0100-\u024f\u1e00-\u1eff]/u.test(ch);
}

function isLatin1SupplementChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\u00a0-\u00ff]/u.test(ch);
}

function isLatin1MojibakeAnchorChar(ch: string | undefined): boolean {
  return ch !== undefined && /[ÃÂâãÐðÞþ]/u.test(ch);
}

function hasAdjacentLatin1SupplementRun(chars: readonly string[]): boolean {
  for (let i = 1; i < chars.length; i++) {
    if (isLatin1SupplementChar(chars[i - 1]) && isLatin1SupplementChar(chars[i])) return true;
  }
  return false;
}
