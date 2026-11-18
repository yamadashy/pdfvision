import {
  codePointLength,
  isRawTextItem,
  type RawTextItem,
  type UprightGeometry,
  uprightGeometry,
  withTextAndExtent,
} from './textItems.js';

/**
 * Mark superscripts and subscripts in the text: `10^{19}`, `P_{drop}`.
 *
 * Typesetters draw an exponent, an index or a footnote marker as a separate
 * smaller run on a raised or lowered baseline; nothing else in the content
 * stream says what it is. Joined as ordinary characters, `10^19` reads as
 * the number `1019` and `|∇f|²` as `|∇f|2` — valid-looking values that are
 * wrong. Unicode superscript characters are not an option: the page text is
 * NFKC-normalized, which folds `²` back to `2`.
 *
 * A run is a script only in the shape typesetting produces: noticeably
 * smaller than the run it touches, starting within a sliver of an em of
 * that run's end, its baseline shifted up (or down) by a fraction of an em
 * that keeps it on the same line, and short. Small caps (same baseline),
 * ruby (a full em above, centred over its base), a line of small print
 * beside a larger one (long), and a raised label set apart from a number
 * (a visible gap) all fail one of those tests. A footnote marker that
 * opens a line attaches to the text after it.
 */

const MIN_SIZE_RATIO = 0.45;
const MAX_SIZE_RATIO = 0.82;
const MIN_RAISE_EM = 0.18;
const MAX_RAISE_EM = 0.6;
const MIN_LOWER_EM = 0.1;
const MAX_LOWER_EM = 0.45;
const MAX_OVERLAP_EM = 0.15;
const MAX_GAP_EM = 0.12;
// A leading marker may be followed by a word space.
const MAX_LEADING_GAP_EM = 0.4;
const MAX_SCRIPT_CHARS = 10;
const SAME_SCRIPT_BASELINE_EM = 0.12;

type ScriptKind = 'sup' | 'sub';

interface Group {
  kind: ScriptKind;
  text: string;
  /** Geometry of the last run appended, for chaining `−` + `f`. */
  last: UprightGeometry;
}

interface Base {
  index: number;
  item: RawTextItem;
  geometry: UprightGeometry;
  groups: Group[];
  right: number;
  hasEOL: boolean;
  /** Where the space a script run ended with was drawn, kept as its own item. */
  space?: { item: RawTextItem; left: number; right: number };
}

export function attachScripts(
  items: readonly unknown[],
  canHoldScripts: (fontName: string) => boolean = () => true,
): unknown[] {
  const out: unknown[] = [];
  let base: Base | undefined;
  let changed = false;
  // Index in `out` of the previous text item, and whether anything but
  // zero-width items sits between it and the current one.
  let previousTextIndex = -1;
  let separated = false;

  const finishBase = () => {
    if (base && base.groups.length > 0) {
      const text = base.item.str + base.groups.map(renderGroup).join('');
      const { space } = base;
      out[base.index] = {
        ...withTextAndExtent(base.item, text, base.geometry.left, base.right),
        hasEOL: base.hasEOL && !space,
      };
      if (space) {
        const spaceItem = { ...withTextAndExtent(space.item, ' ', space.left, space.right), hasEOL: base.hasEOL };
        out.splice(base.index + 1, 0, spaceItem);
      }
    }
    base = undefined;
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!isRawTextItem(item)) {
      out.push(item);
      continue;
    }
    if (item.str.length === 0 && !item.hasEOL) {
      out.push(item);
      continue;
    }
    // pdf.js reports a line break between a subscript and the superscript
    // stacked over it (`u` `j` ⏎ `n`); the pair is one base's scripts.
    if (item.str.length === 0 && base && !separated && continuesWithScript(items, i, base)) continue;
    if (item.str.trim().length === 0) {
      out.push(item);
      separated = true;
      if (item.hasEOL) {
        finishBase();
        previousTextIndex = -1;
      }
      continue;
    }

    const geometry = uprightGeometry(item);
    const script = geometry && canHoldScripts(String(item.fontName)) ? scriptRun(item, geometry) : false;
    if (script && geometry && base && !separated && !base.space) {
      const kind = attachKind(base, geometry);
      if (kind) {
        appendScript(base, kind, item.str, geometry);
        // The latest script ends the line, or the line goes on after it.
        base.hasEOL = !!item.hasEOL;
        changed = true;
        continue;
      }
    }

    // A raised marker opening a line attaches to the text that follows it.
    if (script && geometry && (!base || separated || previousTextIndex < 0)) {
      const next = nextTextItem(items, i);
      if (next && leadsInto(geometry, next.geometry)) {
        finishBase();
        const spaced = next.spaced || /\s$/u.test(item.str);
        const text = `${renderGroup({ kind: 'sup', text: item.str.trim(), last: geometry })}${spaced && !/^\s/u.test(next.item.str) ? ' ' : ''}${next.item.str}`;
        out.push({ ...withTextAndExtent(next.item, text, geometry.left, next.geometry.right) });
        i = next.index;
        previousTextIndex = out.length - 1;
        separated = false;
        changed = true;
        const merged = out[previousTextIndex] as RawTextItem;
        base = startBase(merged, previousTextIndex);
        if (merged.hasEOL) {
          finishBase();
          previousTextIndex = -1;
        }
        continue;
      }
    }

    finishBase();
    out.push(item);
    previousTextIndex = out.length - 1;
    separated = false;
    base = startBase(item, previousTextIndex);
    if (item.hasEOL) {
      finishBase();
      previousTextIndex = -1;
    }
  }
  finishBase();
  return changed ? out : [...items];
}

function continuesWithScript(items: readonly unknown[], index: number, base: Base): boolean {
  for (let next = index + 1; next < items.length; next++) {
    const item = items[next];
    if (!isRawTextItem(item) || (item.str.length === 0 && !item.hasEOL)) continue;
    const geometry = uprightGeometry(item);
    return !!geometry && scriptRun(item, geometry) && attachKind(base, geometry) !== undefined;
  }
  return false;
}

function startBase(item: RawTextItem, index: number): Base | undefined {
  const geometry = uprightGeometry(item);
  // A base that ends in a space has nothing to attach a script to.
  if (!geometry || /\s$/u.test(item.str)) return undefined;
  return { index, item, geometry, groups: [], right: geometry.right, hasEOL: !!item.hasEOL };
}

// Kana or kanji set small beside a glyph is ruby (or a vertical line's
// annotation), which the ruby passes read; CJK typesetting raises digits
// and symbols, not words.
const CJK_TEXT_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

// Note, significance and trademark marks, and bracketed citations (`[12]`),
// read the same raised or not (`0.142***`, `famous.[4]`); table value cells
// already accept the marks as a trailing suffix.
const MARK_ONLY_RE = /^(?:[*∗⁎⋆★†‡§¶‖#®™©℠※＊]+\d{0,3}|\[[^\]]*\])$/u;
// A script says something only with a letter or digit in it, or as a lone
// sign (`Na^+`); a raised quote or question mark is OCR-layer jitter.
const SCRIPT_CONTENT_RE = /[\p{L}\p{N}]|^[+\-−±]$/u;
// Quotation marks belong to the sentence, not to a script.
const QUOTE_RE = /["“”‘’«»]/u;

function scriptRun(item: RawTextItem, geometry: UprightGeometry): boolean {
  const text = item.str.trim();
  if (
    text !== item.str.trimEnd() ||
    /\s/u.test(text) ||
    CJK_TEXT_RE.test(text) ||
    MARK_ONLY_RE.test(text) ||
    !SCRIPT_CONTENT_RE.test(text) ||
    QUOTE_RE.test(text)
  ) {
    return false;
  }
  return geometry.fontSize > 0 && codePointLength(text) <= MAX_SCRIPT_CHARS;
}

function attachKind(base: Base, script: UprightGeometry): ScriptKind | undefined {
  const last = base.groups.at(-1);
  // `−` then `f` on one raised baseline: the same script continues.
  if (last && continuesScript(last.last, script)) return last.kind;
  const { fontSize } = base.geometry;
  const ratio = script.fontSize / fontSize;
  if (ratio < MIN_SIZE_RATIO || ratio > MAX_SIZE_RATIO) return undefined;
  // A stacked script (410 with +160 over −180) starts where the first one did.
  const anchor = last ? Math.min(base.geometry.right, last.last.left) : base.right;
  const gap = script.left - anchor;
  if (gap < -MAX_OVERLAP_EM * fontSize || gap > MAX_GAP_EM * fontSize) return undefined;
  const shift = script.baseline - base.geometry.baseline;
  if (shift >= MIN_RAISE_EM * fontSize && shift <= MAX_RAISE_EM * fontSize) return 'sup';
  if (-shift >= MIN_LOWER_EM * fontSize && -shift <= MAX_LOWER_EM * fontSize) return 'sub';
  return undefined;
}

function continuesScript(prev: UprightGeometry, cur: UprightGeometry): boolean {
  const size = prev.fontSize;
  if (Math.abs(cur.fontSize - size) > size * 0.05) return false;
  if (Math.abs(cur.baseline - prev.baseline) > size * SAME_SCRIPT_BASELINE_EM) return false;
  const gap = cur.left - prev.right;
  return gap >= -MAX_OVERLAP_EM * size && gap <= MAX_GAP_EM * size * 2;
}

function appendScript(base: Base, kind: ScriptKind, str: string, geometry: UprightGeometry): void {
  const last = base.groups.at(-1);
  const text = str.trim();
  if (last && last.kind === kind && continuesScript(last.last, geometry)) {
    last.text += text;
    last.last = geometry;
  } else {
    base.groups.push({ kind, text, last: geometry });
  }
  if (text === str) {
    base.right = Math.max(base.right, geometry.right);
    return;
  }
  // `nd ` in `2nd floor`: the space stays a word space after the script.
  const textRight = geometry.left + (geometry.right - geometry.left) * (codePointLength(text) / codePointLength(str));
  base.right = Math.max(base.right, textRight);
  base.space = { item: base.item, left: textRight, right: geometry.right };
}

function leadsInto(script: UprightGeometry, next: UprightGeometry): boolean {
  const { fontSize } = next;
  const ratio = script.fontSize / fontSize;
  if (ratio < MIN_SIZE_RATIO || ratio > MAX_SIZE_RATIO) return false;
  const gap = next.left - script.right;
  if (gap < -MAX_OVERLAP_EM * fontSize || gap > MAX_LEADING_GAP_EM * fontSize) return false;
  const shift = script.baseline - next.baseline;
  return shift >= MIN_RAISE_EM * fontSize && shift <= MAX_RAISE_EM * fontSize;
}

/** The next text item, skipping one word space (reported as `spaced`). */
function nextTextItem(
  items: readonly unknown[],
  index: number,
): { index: number; item: RawTextItem; geometry: UprightGeometry; spaced: boolean } | undefined {
  let spaced = false;
  for (let next = index + 1; next < items.length; next++) {
    const item = items[next];
    if (!isRawTextItem(item)) continue;
    if (item.str.length === 0 && !item.hasEOL) continue;
    if (item.str.trim().length === 0 && item.str.length > 0 && !item.hasEOL && !spaced) {
      spaced = true;
      continue;
    }
    if (item.str.trim().length === 0) return undefined;
    const geometry = uprightGeometry(item);
    return geometry ? { index: next, item, geometry, spaced } : undefined;
  }
  return undefined;
}

// TeX's convention, extended to digit runs: `x^2`, `10^19`, `10^-3`, but
// `e^{-f}` and `P_{drop}`. Leaving digit exponents bare keeps `2.3 · 10^19`
// a number to the table detector, which accepts `^` but not braces.
const BARE_SCRIPT_RE = /^(?:.|[+\-−]?\p{Nd}+)$/u;

function renderGroup(group: Group): string {
  const body = BARE_SCRIPT_RE.test(group.text) ? group.text : `{${group.text}}`;
  return `${group.kind === 'sup' ? '^' : '_'}${body}`;
}

const UNICODE_SUPERSCRIPTS = new Map(
  Array.from('⁰0¹1²2³3⁴4⁵5⁶6⁷7⁸8⁹9⁺+⁻−⁼=⁽(⁾)ⁿnⁱi'.matchAll(/(.)(.)/gu), (m) => [m[1], m[2]]),
);
const UNICODE_SUBSCRIPTS = new Map(
  Array.from('₀0₁1₂2₃3₄4₅5₆6₇7₈8₉9₊+₋−₌=₍(₎)ₐaₑeₒoₓxₕhₖkₗlₘmₙnₚpₛsₜtᵢiᵣrᵤuᵥvⱼj'.matchAll(/(.)(.)/gu), (m) => [
    m[1],
    m[2],
  ]),
);
const UNICODE_SCRIPT_RUN_RE = /[⁰¹²³⁴-⁹⁺⁻⁼⁽⁾ⁿⁱ]+|[₀-₉₊₋₌₍₎ₐₑₒₓₕₖₗₘₙₚₛₜᵢᵣᵤᵥⱼ]+/gu;

/**
 * Write Unicode superscript and subscript characters in the same notation
 * as positioned scripts (`m²` → `m^2`, `H₂O` → `H_2O`). Run before NFKC
 * normalization, which would otherwise fold `²` to a plain `2` and turn
 * `10¹⁹` into the number `1019`.
 */
export function markUnicodeScripts(text: string): string {
  if (!/[⁰-ₜ¹²³ᵢ-ᵥⱼ]/u.test(text)) return text;
  return text.replace(UNICODE_SCRIPT_RUN_RE, (run) => {
    const sup = UNICODE_SUPERSCRIPTS.has(run[0] ?? '');
    const table = sup ? UNICODE_SUPERSCRIPTS : UNICODE_SUBSCRIPTS;
    const plain = Array.from(run, (char) => table.get(char) ?? char).join('');
    return renderGroup({ kind: sup ? 'sup' : 'sub', text: plain, last: NO_GEOMETRY });
  });
}

const NO_GEOMETRY: UprightGeometry = { left: 0, right: 0, baseline: 0, fontSize: 0 };
