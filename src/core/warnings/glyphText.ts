import type { LayoutLine, PageResult, PageWarning } from '../../types/index.js';
import {
  codePointLength,
  countNonPrintableCodePoints,
  countReplacementCharacters,
  detectCjkInterglyphSpacingNoise,
  detectCjkMojibakeGlyphNoise,
  detectInlineUppercaseDigraphGlyphNoise,
  detectLatin1MojibakeGlyphNoise,
  detectSequentialCjkExtensionGlyphNoise,
  privateUseGlyphStats,
} from './glyphPatterns.js';
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
const FONT_MAPPING_WARNING_PATTERNS = [/no cmap table available/iu, /toUnicode/i, /font.*cmap/iu];
const RAW_LATEXIT_SOURCE_RE = /<latexit(?:\s|[^>]*>)[A-Za-z0-9+/=\s]{80,}<\/latexit>/giu;
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

export function detectRawEmbeddedSourceText(page: PageResult, out: PageWarning[]): void {
  const matches = [...page.text.matchAll(RAW_LATEXIT_SOURCE_RE)];
  if (matches.length === 0) return;
  const samples = matches.slice(0, 2).map((match) => JSON.stringify(shortTextSample(match[0])));
  out.push({
    code: 'raw_embedded_source_text',
    severity: 'warning',
    message: `native text contains ${matches.length} raw embedded LaTeX source payload${matches.length === 1 ? '' : 's'} (sample: ${samples.join(', ')}) that may not be human-visible page text; compare against the render or OCR before trusting pages[].text, layout text, or search hits`,
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
