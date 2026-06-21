import type { LayoutLine, PageResult, PageWarning } from '../../types/index.js';
import { isNonPrintableCodePoint } from '../nonPrintable.js';
import { shortTextSample } from './textSamples.js';

interface GlyphFontWarningContext {
  pdfJsWarnings?: readonly string[];
}

const LOCALIZED_GLYPH_NOISE_RATIO_THRESHOLD = 0.05;
const LOCALIZED_GLYPH_NOISE_COUNT_THRESHOLD = 2;
const SINGLE_DISPLAY_NONPRINTABLE_FONT_SIZE_THRESHOLD = 18;
const SINGLE_DISPLAY_NONPRINTABLE_MAX_LINE_CHARS = 32;
const PRIVATE_USE_GLYPH_GARBAGE_MIN_COUNT = 2;
const PRIVATE_USE_GLYPH_GARBAGE_RATIO_THRESHOLD = 0.6;
const GEOMETRY_SUPPRESSION_GLYPH_NOISE_RATIO = 0.1;
const LOCALIZED_PRIVATE_USE_GLYPH_COUNT_THRESHOLD = 8;
const LOCALIZED_PRIVATE_USE_GLYPH_LOW_RATIO_THRESHOLD = 0.02;
const LOCALIZED_PRIVATE_USE_GLYPH_RATIO_THRESHOLD = 0.25;
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
const FONT_MAPPING_WARNING_PATTERNS = [/no cmap table available/iu, /toUnicode/i, /font.*cmap/iu];
const TINY_NATIVE_TEXT_MAX_FONT_SIZE = 2;
const TINY_NATIVE_TEXT_MIN_CHARS = 12;
const TINY_NATIVE_TEXT_SAMPLE_LIMIT = 3;

export function detectGlyphGarbageText(page: PageResult, out: PageWarning[]): void {
  const status = page.quality.nativeTextStatus;
  if (status === 'mixed_glyph_indices' || status === 'unusable_glyph_indices') {
    const percent = (page.nonPrintableRatio * 100).toFixed(1);
    const scope = status === 'unusable_glyph_indices' ? 'mostly' : 'partly';
    out.push({
      code: 'glyph_garbage_text',
      severity: 'warning',
      message: `native text is ${scope} raw glyph-index garbage (${percent}% non-printable, ${page.nonPrintableCount} code point${page.nonPrintableCount === 1 ? '' : 's'}); inspect the render or run OCR before trusting extracted text`,
    });
    return;
  }

  const privateUse = privateUseGlyphStats(page.text);
  if (privateUse.count < PRIVATE_USE_GLYPH_GARBAGE_MIN_COUNT) return;
  if (privateUse.ratio < PRIVATE_USE_GLYPH_GARBAGE_RATIO_THRESHOLD) return;
  out.push({
    code: 'glyph_garbage_text',
    severity: 'warning',
    message: `native text is mostly private-use glyph codes (${(privateUse.ratio * 100).toFixed(1)}% PUA, ${privateUse.count} code point${privateUse.count === 1 ? '' : 's'}); inspect the render or run OCR before trusting extracted text`,
  });
}

export function detectLocalizedGlyphNoise(page: PageResult, out: PageWarning[]): void {
  const replacementCount = countReplacementCharacters(page.text);
  if (
    replacementCount > 0 &&
    page.quality.nativeTextStatus !== 'mixed_glyph_indices' &&
    page.quality.nativeTextStatus !== 'unusable_glyph_indices'
  ) {
    out.push({
      code: 'localized_glyph_noise',
      severity: 'warning',
      message: `native text contains ${replacementCount} Unicode replacement character${replacementCount === 1 ? '' : 's'} (U+FFFD) — at least one visible glyph could not be decoded; inspect the render if exact symbols or punctuation matter`,
    });
  }

  if (
    page.nonPrintableCount >= LOCALIZED_GLYPH_NOISE_COUNT_THRESHOLD &&
    page.nonPrintableRatio < LOCALIZED_GLYPH_NOISE_RATIO_THRESHOLD
  ) {
    out.push({
      code: 'localized_glyph_noise',
      severity: 'warning',
      message: `native text contains ${page.nonPrintableCount} non-printable code points below the glyph-garbage ratio threshold — likely localized glyph noise such as formulas, bullets, or symbols; inspect the render if exact text matters`,
    });
  }

  const displayNonPrintable = findSingleDisplayNonPrintableGlyph(page);
  if (displayNonPrintable) {
    out.push({
      code: 'localized_glyph_noise',
      severity: 'warning',
      blockIndex: displayNonPrintable.blockIndex,
      message:
        'native text contains a single non-printable code point in a large display line — likely a localized symbol-font mapping failure; inspect the render if exact symbols matter',
    });
  }

  const privateUse = privateUseGlyphStats(page.text);
  const isPageWidePrivateUseGarbage =
    privateUse.count >= PRIVATE_USE_GLYPH_GARBAGE_MIN_COUNT &&
    privateUse.ratio >= PRIVATE_USE_GLYPH_GARBAGE_RATIO_THRESHOLD;
  const hasLocalizedPrivateUseNoise =
    privateUse.count > 0 &&
    (privateUse.ratio >= LOCALIZED_PRIVATE_USE_GLYPH_RATIO_THRESHOLD ||
      (privateUse.count >= LOCALIZED_PRIVATE_USE_GLYPH_COUNT_THRESHOLD &&
        privateUse.ratio >= LOCALIZED_PRIVATE_USE_GLYPH_LOW_RATIO_THRESHOLD));
  if (!isPageWidePrivateUseGarbage && hasLocalizedPrivateUseNoise) {
    out.push({
      code: 'localized_glyph_noise',
      severity: 'warning',
      message: `native text contains ${privateUse.count} private-use glyph code${privateUse.count === 1 ? '' : 's'} in otherwise readable text (${(privateUse.ratio * 100).toFixed(1)}% PUA) — likely localized glyph noise such as a symbol, unit mark, or icon-font glyph; inspect the render if exact text matters`,
    });
  }

  const cjkMojibake = detectCjkMojibakeGlyphNoise(page.text);
  if (cjkMojibake) {
    out.push({
      code: 'localized_glyph_noise',
      severity: 'warning',
      message: `native text contains ${cjkMojibake.count} isolated Latin-extended glyphs inside CJK text (e.g. ${cjkMojibake.samples.map((s) => JSON.stringify(s)).join(', ')}) — likely localized character-map noise such as leader dots or symbols; inspect the render if exact text matters`,
    });
  }

  const latin1Mojibake = detectLatin1MojibakeGlyphNoise(page.text);
  if (latin1Mojibake) {
    out.push({
      code: 'localized_glyph_noise',
      severity: 'warning',
      message: `native text is ${(latin1Mojibake.ratio * 100).toFixed(1)}% Latin-1 supplement glyphs (samples: ${latin1Mojibake.samples.map((s) => JSON.stringify(s)).join(', ')}) — likely printable mojibake from a missing or custom font map; inspect the render if exact text matters`,
    });
  }

  const inlineUppercaseDigraphs = detectInlineUppercaseDigraphGlyphNoise(page.text);
  if (inlineUppercaseDigraphs.length > 0) {
    out.push({
      code: 'localized_glyph_noise',
      severity: 'warning',
      message: `native text contains uppercase "LJ" inside otherwise lowercase word${inlineUppercaseDigraphs.length === 1 ? '' : 's'} (samples: ${inlineUppercaseDigraphs.map((s) => JSON.stringify(s)).join(', ')}) — likely printable ligature or font-map noise; inspect the render if exact text matters`,
    });
  }

  const cjkInterglyphSpaces = detectCjkInterglyphSpacingNoise(page.text);
  if (cjkInterglyphSpaces) {
    out.push({
      code: 'localized_glyph_noise',
      severity: 'warning',
      message: `native text contains spaces between ${cjkInterglyphSpaces.pairCount} adjacent CJK glyph pairs (samples: ${cjkInterglyphSpaces.samples.map((s) => JSON.stringify(s)).join(', ')}) — likely PDF text-positioning artifacts; inspect the render or normalize CJK spacing before using exact text`,
    });
  }

  const sequentialCjkExtension = detectSequentialCjkExtensionGlyphNoise(page.text);
  if (sequentialCjkExtension) {
    out.push({
      code: 'localized_glyph_noise',
      severity: 'warning',
      message: `native text is dominated by a sequential run of rare CJK extension code points (samples: ${sequentialCjkExtension.samples.map((s) => JSON.stringify(s)).join(', ')}) — likely printable CID/glyph-id substitution from a missing character map; inspect the render before trusting exact text`,
    });
  }
}

export function detectFontMappingWarning(page: PageResult, context: GlyphFontWarningContext, out: PageWarning[]): void {
  const warning = context.pdfJsWarnings?.find((message) =>
    FONT_MAPPING_WARNING_PATTERNS.some((pattern) => pattern.test(message)),
  );
  if (!warning) return;
  if (page.charCount === 0) return;
  if (page.quality.nativeTextStatus !== 'ok') return;
  if (out.some((item) => item.code === 'glyph_garbage_text' || item.code === 'localized_glyph_noise')) return;

  out.push({
    code: 'font_mapping_warning',
    severity: 'warning',
    message: `pdf.js reported a font character-map warning (${warning.replace(/^Warning:\s*/u, '')}) while extracting this document — native text may contain printable glyph substitutions even though quality.nativeTextStatus is ok; inspect the render if exact text matters`,
  });
}

export function detectTinyNativeTextNoise(page: PageResult, out: PageWarning[]): void {
  const candidates = textGeometryItems(page).filter((item) => {
    const text = item.text.trim();
    if (text.length < TINY_NATIVE_TEXT_MIN_CHARS) return false;
    const fontSize = item.fontSize ?? item.height;
    return fontSize > 0 && fontSize <= TINY_NATIVE_TEXT_MAX_FONT_SIZE && item.height <= TINY_NATIVE_TEXT_MAX_FONT_SIZE;
  });
  if (candidates.length === 0) return;
  const samples = candidates
    .slice(0, TINY_NATIVE_TEXT_SAMPLE_LIMIT)
    .map((item) => JSON.stringify(shortTextSample(item.text.trim())));
  out.push({
    code: 'tiny_native_text_noise',
    severity: 'warning',
    message: `native text contains ${candidates.length} extremely small text run${candidates.length === 1 ? '' : 's'} (sample: ${samples.join(', ')}) that may be invisible at normal reading scale; inspect the render before treating pages[].text, links, or search matches as human-visible`,
  });
}

export function hasUnreliableGlyphGeometry(page: PageResult): boolean {
  return (
    page.quality.nativeTextStatus === 'unusable_glyph_indices' ||
    (page.quality.nativeTextStatus === 'mixed_glyph_indices' &&
      page.nonPrintableRatio >= GEOMETRY_SUPPRESSION_GLYPH_NOISE_RATIO)
  );
}

function textGeometryItems(page: PageResult): { text: string; height: number; fontSize?: number }[] {
  if (page.layout) {
    const items: { text: string; height: number; fontSize?: number }[] = [];
    for (const block of page.layout.blocks) {
      if (block.lines.length > 0) items.push(...block.lines);
      else items.push(block);
    }
    return items;
  }
  return page.spans ?? [];
}

function privateUseGlyphStats(text: string): { count: number; ratio: number } {
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

function isPrivateUseCodePoint(cp: number): boolean {
  return (cp >= 0xe000 && cp <= 0xf8ff) || (cp >= 0xf0000 && cp <= 0xffffd) || (cp >= 0x100000 && cp <= 0x10fffd);
}

function detectInlineUppercaseDigraphGlyphNoise(text: string): string[] {
  const samples: string[] = [];
  for (const match of text.matchAll(INLINE_UPPERCASE_DIGRAPH_GLYPH_PATTERN)) {
    const sample = match[0];
    if (!samples.includes(sample)) samples.push(sample);
    if (samples.length >= INLINE_UPPERCASE_DIGRAPH_SAMPLE_LIMIT) break;
  }
  return samples;
}

function detectCjkInterglyphSpacingNoise(text: string): { pairCount: number; samples: string[] } | undefined {
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

function isInlineSpacingChar(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t' || ch === '\u3000';
}

function detectSequentialCjkExtensionGlyphNoise(text: string): { samples: string[] } | undefined {
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

function isCjkExtensionChar(ch: string | undefined): boolean {
  if (ch === undefined) return false;
  const cp = ch.codePointAt(0);
  return cp !== undefined && ((cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x20000 && cp <= 0x2ebef));
}

function findSingleDisplayNonPrintableGlyph(page: PageResult): { blockIndex: number } | undefined {
  if (page.nonPrintableCount !== 1) return undefined;
  if (page.nonPrintableRatio >= LOCALIZED_GLYPH_NOISE_RATIO_THRESHOLD) return undefined;
  if (
    page.quality.nativeTextStatus === 'mixed_glyph_indices' ||
    page.quality.nativeTextStatus === 'unusable_glyph_indices'
  ) {
    return undefined;
  }

  const blocks = page.layout?.blocks ?? [];
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const block = blocks[blockIndex];
    for (const line of block.lines) {
      if (countNonPrintableCodePoints(line.text) !== 1) continue;
      if (!isDisplayLine(line)) continue;
      return { blockIndex };
    }
  }
  return undefined;
}

function isDisplayLine(line: LayoutLine): boolean {
  const trimmed = line.text.trim();
  if (codePointLength(trimmed) > SINGLE_DISPLAY_NONPRINTABLE_MAX_LINE_CHARS) return false;
  return Math.max(line.fontSize, line.height) >= SINGLE_DISPLAY_NONPRINTABLE_FONT_SIZE_THRESHOLD;
}

function countNonPrintableCodePoints(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i) as number;
    if (isNonPrintableCodePoint(cp)) count++;
    i += cp > 0xffff ? 2 : 1;
  }
  return count;
}

function codePointLength(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i) as number;
    count++;
    i += cp > 0xffff ? 2 : 1;
  }
  return count;
}

function countReplacementCharacters(text: string): number {
  let count = 0;
  for (const ch of text) {
    if (ch === REPLACEMENT_CHARACTER) count++;
  }
  return count;
}

function detectCjkMojibakeGlyphNoise(text: string): { count: number; samples: string[] } | undefined {
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

function isCjkTextChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(ch);
}

function isLatinTextChar(ch: string | undefined): boolean {
  return ch !== undefined && /\p{Script=Latin}/u.test(ch);
}

function isLatinExtendedChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\u0100-\u024f\u1e00-\u1eff]/u.test(ch);
}

function detectLatin1MojibakeGlyphNoise(text: string): { count: number; ratio: number; samples: string[] } | undefined {
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
