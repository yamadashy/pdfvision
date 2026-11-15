/**
 * Per-font facts about how text was drawn that pdf.js text content drops,
 * read once from the page's operator list:
 *
 * - `trackedWords`: words drawn with explicit character spacing (`Tc`).
 *   pdf.js inserts a space wherever the gap between two glyphs exceeds about
 *   a tenth of an em, so letter-spaced text comes back as `B A C K`. The
 *   glyph sequence still says no space glyph was drawn there.
 */
export interface FontTextHints {
  /** Tracked words joined by U+0000, for substring tests. */
  trackedWords?: string;
}

export type PageFontTextHints = ReadonlyMap<string, FontTextHints>;

export interface FontTextHintOps {
  save: number;
  restore: number;
  setFont?: number;
  setCharSpacing?: number;
  textShowOps: ReadonlySet<number>;
}

// Below this, Tc is kerning-sized and pdf.js inserts no spaces anyway.
const MIN_TRACKING_EM = 0.05;
const MIN_TRACKED_WORD_CHARS = 2;
const MAX_TRACKED_WORDS_PER_FONT = 2000;

interface GlyphLike {
  unicode?: unknown;
  isSpace?: unknown;
}

interface FontAccumulator {
  trackedWords?: Set<string>;
}

export function collectFontTextHints(
  fnArray: readonly number[],
  argsArray: readonly unknown[],
  ops: FontTextHintOps,
): PageFontTextHints {
  const fonts = new Map<string, FontAccumulator>();
  const accumulatorFor = (loadedName: string): FontAccumulator => {
    let acc = fonts.get(loadedName);
    if (!acc) {
      acc = {};
      fonts.set(loadedName, acc);
    }
    return acc;
  };

  let font: string | undefined;
  let fontSize = 0;
  let charSpacing = 0;
  const stack: { font: string | undefined; fontSize: number; charSpacing: number }[] = [];
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] as readonly unknown[] | null | undefined;
    if (fn === ops.save) {
      stack.push({ font, fontSize, charSpacing });
    } else if (fn === ops.restore) {
      const state = stack.pop();
      if (state) ({ font, fontSize, charSpacing } = state);
    } else if (fn === ops.setFont) {
      font = typeof args?.[0] === 'string' ? args[0] : undefined;
      fontSize = typeof args?.[1] === 'number' && Number.isFinite(args[1]) ? Math.abs(args[1]) : 0;
    } else if (fn === ops.setCharSpacing) {
      charSpacing = typeof args?.[0] === 'number' && Number.isFinite(args[0]) ? args[0] : 0;
    } else if (ops.textShowOps.has(fn) && font !== undefined) {
      const glyphs = args?.[0];
      if (!Array.isArray(glyphs)) continue;
      const acc = accumulatorFor(font);
      if (fontSize > 0 && charSpacing >= fontSize * MIN_TRACKING_EM) recordTrackedWords(acc, glyphs);
    }
  }

  const hints = new Map<string, FontTextHints>();
  for (const [name, acc] of fonts) {
    if (acc.trackedWords && acc.trackedWords.size > 0) {
      hints.set(name, { trackedWords: [...acc.trackedWords].join('\u0000') });
    }
  }
  return hints;
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
