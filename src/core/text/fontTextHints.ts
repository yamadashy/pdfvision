import { type SymbolFontKind, standardSymbolFontKind, symbolFontChar } from './symbolFontEncodings.js';

/**
 * Per-font facts about how text was drawn that pdf.js text content drops,
 * read once from the page's operator list:
 *
 * - `charMap`: for a standard symbol font (ZapfDingbats, Symbol) whose
 *   glyphs pdf.js passed through as raw character codes, the character each
 *   code really draws (`3` → ✓).
 * - `trackedWords`: words drawn with explicit character spacing (`Tc`).
 *   pdf.js inserts a space wherever the gap between two glyphs exceeds about
 *   a tenth of an em, so letter-spaced text comes back as `B A C K`. The
 *   glyph sequence still says no space glyph was drawn there.
 */
export interface FontTextHints {
  charMap?: ReadonlyMap<string, string>;
  /** Tracked words joined by U+0000, for substring tests. */
  trackedWords?: string;
  /** Every run in this font was drawn invisible (render mode 3/7): an OCR layer's font. */
  invisible?: boolean;
}

export type PageFontTextHints = ReadonlyMap<string, FontTextHints>;

export interface FontTextHintOps {
  save: number;
  restore: number;
  setFont?: number;
  setCharSpacing?: number;
  setTextRenderingMode?: number;
  textShowOps: ReadonlySet<number>;
}

export interface FontNameInfo {
  name?: string;
  differences?: unknown;
}

export type FontNameResolver = (loadedName: string) => FontNameInfo | undefined;

// Below this, Tc is kerning-sized and pdf.js inserts no spaces anyway.
const MIN_TRACKING_EM = 0.05;
const MIN_TRACKED_WORD_CHARS = 2;
const MAX_TRACKED_WORDS_PER_FONT = 2000;

interface GlyphLike {
  unicode?: unknown;
  originalCharCode?: unknown;
  isSpace?: unknown;
}

interface FontAccumulator {
  kind?: SymbolFontKind;
  differences?: ReadonlyMap<number, string>;
  charMap?: Map<string, string>;
  /** Characters some glyph produced through a real mapping; never rewritten. */
  mappedChars?: Set<string>;
  trackedWords?: Set<string>;
  visibleRuns: number;
  invisibleRuns: number;
}

export function collectFontTextHints(
  fnArray: readonly number[],
  argsArray: readonly unknown[],
  ops: FontTextHintOps,
  resolveFont: FontNameResolver,
): PageFontTextHints {
  const fonts = new Map<string, FontAccumulator>();
  const accumulatorFor = (loadedName: string): FontAccumulator => {
    let acc = fonts.get(loadedName);
    if (!acc) {
      const info = resolveFont(loadedName);
      const kind = standardSymbolFontKind(info?.name);
      acc = {
        ...(kind && { kind, differences: differenceMap(info?.differences) }),
        visibleRuns: 0,
        invisibleRuns: 0,
      };
      fonts.set(loadedName, acc);
    }
    return acc;
  };

  let font: string | undefined;
  let fontSize = 0;
  let charSpacing = 0;
  let renderingMode = 0;
  const stack: { font: string | undefined; fontSize: number; charSpacing: number; renderingMode: number }[] = [];
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] as readonly unknown[] | null | undefined;
    if (fn === ops.save) {
      stack.push({ font, fontSize, charSpacing, renderingMode });
    } else if (fn === ops.restore) {
      const state = stack.pop();
      if (state) ({ font, fontSize, charSpacing, renderingMode } = state);
    } else if (fn === ops.setFont) {
      font = typeof args?.[0] === 'string' ? args[0] : undefined;
      fontSize = typeof args?.[1] === 'number' && Number.isFinite(args[1]) ? Math.abs(args[1]) : 0;
    } else if (fn === ops.setCharSpacing) {
      charSpacing = typeof args?.[0] === 'number' && Number.isFinite(args[0]) ? args[0] : 0;
    } else if (fn === ops.setTextRenderingMode) {
      renderingMode = typeof args?.[0] === 'number' ? args[0] : 0;
    } else if (ops.textShowOps.has(fn) && font !== undefined) {
      const glyphs = args?.[0];
      if (!Array.isArray(glyphs)) continue;
      const acc = accumulatorFor(font);
      if (renderingMode === 3 || renderingMode === 7) acc.invisibleRuns++;
      else acc.visibleRuns++;
      if (acc.kind) recordSymbolGlyphs(acc, glyphs);
      if (fontSize > 0 && charSpacing >= fontSize * MIN_TRACKING_EM) recordTrackedWords(acc, glyphs);
    }
  }

  const hints = new Map<string, FontTextHints>();
  for (const [name, acc] of fonts) {
    const charMap = acc.charMap && acc.mappedChars ? withoutConflicts(acc.charMap, acc.mappedChars) : acc.charMap;
    const entry: FontTextHints = {
      ...(charMap && charMap.size > 0 && { charMap }),
      ...(acc.trackedWords && acc.trackedWords.size > 0 && { trackedWords: [...acc.trackedWords].join('\u0000') }),
      ...(acc.invisibleRuns > 0 && acc.visibleRuns === 0 && { invisible: true }),
    };
    if (entry.charMap || entry.trackedWords || entry.invisible) hints.set(name, entry);
  }
  return hints;
}

function recordSymbolGlyphs(acc: FontAccumulator, glyphs: readonly unknown[]): void {
  for (const glyph of glyphs) {
    if (!glyph || typeof glyph !== 'object') continue;
    const { unicode, originalCharCode } = glyph as GlyphLike;
    if (typeof unicode !== 'string' || unicode.length === 0 || typeof originalCharCode !== 'number') continue;
    // A glyph pdf.js mapped to something other than its own code went
    // through a real ToUnicode or glyph-name lookup; leave that char alone.
    if (unicode !== String.fromCharCode(originalCharCode)) {
      acc.mappedChars ??= new Set();
      acc.mappedChars.add(unicode);
      continue;
    }
    const target = symbolFontChar(acc.kind as SymbolFontKind, originalCharCode, acc.differences?.get(originalCharCode));
    if (target === undefined || target === unicode) continue;
    acc.charMap ??= new Map();
    acc.charMap.set(unicode, target);
  }
}

function recordTrackedWords(acc: FontAccumulator, glyphs: readonly unknown[]): void {
  acc.trackedWords ??= new Set();
  if (acc.trackedWords.size >= MAX_TRACKED_WORDS_PER_FONT) return;
  let word = '';
  const flush = () => {
    if (Array.from(word).length >= MIN_TRACKED_WORD_CHARS) acc.trackedWords?.add(word);
    word = '';
  };
  for (const glyph of glyphs) {
    if (!glyph || typeof glyph !== 'object') continue;
    const { unicode, isSpace } = glyph as GlyphLike;
    if (typeof unicode !== 'string') continue;
    if (isSpace === true || unicode.trim().length === 0) flush();
    else word += unicode;
  }
  flush();
}

function withoutConflicts(charMap: Map<string, string>, mappedChars: ReadonlySet<string>): Map<string, string> {
  for (const char of mappedChars) charMap.delete(char);
  return charMap;
}

function differenceMap(value: unknown): ReadonlyMap<number, string> | undefined {
  const map = new Map<number, string>();
  const add = (code: unknown, name: unknown) => {
    const numeric = typeof code === 'number' ? code : typeof code === 'string' ? Number(code) : Number.NaN;
    if (Number.isInteger(numeric) && typeof name === 'string' && name.length > 0) map.set(numeric, name);
  };
  if (value instanceof Map) {
    for (const [code, name] of value) add(code, name);
  } else if (Array.isArray(value)) {
    for (const [code, name] of value.entries()) add(code, name);
  } else if (value && typeof value === 'object') {
    for (const [code, name] of Object.entries(value)) add(code, name);
  }
  return map.size > 0 ? map : undefined;
}

/** Rewrite the characters of one text item through its font's symbol map. */
export function mapSymbolFontText(text: string, charMap: ReadonlyMap<string, string>): string {
  let out = '';
  let changed = false;
  for (const char of text) {
    const mapped = charMap.get(char);
    if (mapped !== undefined) {
      out += mapped;
      changed = true;
    } else {
      out += char;
    }
  }
  return changed ? out : text;
}
