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

interface Script {
  kind: ScriptKind;
  text: string;
  /** Geometry of the last run appended, for chaining `−` + `f`. */
  last: UprightGeometry;
}

interface Group extends Script {
  /** A script of this script, still open: the `k` of `P_{d_k}`. */
  nested?: Script;
}

interface Attachment {
  kind: ScriptKind;
  nested: boolean;
}

interface Base {
  index: number;
  item: RawTextItem;
  geometry: UprightGeometry;
  groups: Group[];
  right: number;
  hasEOL: boolean;
  /**
   * A big operator (`∑`, `∫`): math fonts draw it hanging from its
   * baseline, so its limits look lowered or raised against the wrong line.
   * The layout's math pass places them; nothing attaches here.
   */
  operator: boolean;
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
  // Whether the whitespace just skipped was an italic correction (`(P` ` ` `2` in `R^{(P^2·C)×D}`).
  let sliver = false;

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
    // stacked over it (`u` `j` ⏎ `n`); the pair is one base's scripts. TeX
    // also leaves an italic correction as a sliver of a space between a base
    // and its script (`F` ` ` `m`); the gap test below still applies, so a
    // word space keeps the next run apart.
    if (
      (item.str.length === 0 || (item.str.trim().length === 0 && !item.hasEOL && italicGap(base))) &&
      base &&
      !separated &&
      !base.space &&
      continuesWithScript(items, i, base, item.str.length > 0 ? 2 : 1)
    ) {
      sliver = item.str.length > 0;
      continue;
    }
    if (item.str.trim().length === 0) {
      out.push(item);
      separated = true;
      if (item.hasEOL) {
        finishBase();
        previousTextIndex = -1;
      }
      continue;
    }

    const slack = sliver ? 2 : 1;
    sliver = false;
    const geometry = uprightGeometry(item);
    const holds = !!geometry && canHoldScripts(String(item.fontName));
    const script = holds && geometry ? scriptRun(item, geometry) || opensScript(items, i, geometry) : false;
    // Inside a script, punctuation belongs to it: the point in `^{+0.008}`.
    const last = base?.groups.at(-1);
    const continuing =
      holds &&
      !!geometry &&
      !!last &&
      !separated &&
      (continuesScript(tail(last), geometry) || (!!last.nested && continuesScript(last.nested.last, geometry))) &&
      scriptRun(item, geometry, true);
    if ((script || continuing) && geometry && base && !separated && !base.space && !base.operator) {
      const attachment = attachKind(base, geometry, slack);
      if (attachment) {
        appendScript(base, attachment, item.str, geometry);
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

// An italic correction follows a letter or digit; after a bracket, a sign
// or an operator a sliver of space is spacing, and the raised run may be
// the numerator of a fraction (inline, or in an exponent: `−` ` ` `n` over
// `2`), which the layout's math pass reads.
function italicGap(base: Base | undefined): boolean {
  if (!base) return false;
  const last = base.groups.at(-1);
  const before = last ? (last.nested?.text ?? last.text) : base.item.str;
  return /[\p{L}\p{N}]$/u.test(before);
}

/** `(` set small and shifted, with the script it opens right after it: `PE_{(pos,2i)}`. */
function opensScript(items: readonly unknown[], index: number, geometry: UprightGeometry): boolean {
  if (!isRawTextItem(items[index]) || items[index].str.trim() !== '(') return false;
  const next = nextTextItem(items, index);
  return !!next && !next.spaced && continuesScript(geometry, next.geometry) && scriptRun(next.item, next.geometry);
}

function continuesWithScript(items: readonly unknown[], index: number, base: Base, slack: number): boolean {
  for (let next = index + 1; next < items.length; next++) {
    const item = items[next];
    if (!isRawTextItem(item) || (item.str.length === 0 && !item.hasEOL)) continue;
    const geometry = uprightGeometry(item);
    return !!geometry && scriptRun(item, geometry) && attachKind(base, geometry, slack) !== undefined;
  }
  return false;
}

function startBase(item: RawTextItem, index: number): Base | undefined {
  const geometry = uprightGeometry(item);
  // A base that ends in a space has nothing to attach a script to.
  if (!geometry || /\s$/u.test(item.str)) return undefined;
  const operator = BIG_OPERATOR_RE.test(item.str.trim());
  return { index, item, geometry, groups: [], right: geometry.right, hasEOL: !!item.hasEOL, operator };
}

const BIG_OPERATOR_RE = /^[∑∏∐⋃⋂⋁⋀⨁⨂⨀⨄⨆∫∬∭∮∯∰⨌]$/u;

// Kana or kanji set small beside a glyph is ruby (or a vertical line's
// annotation), which the ruby passes read; CJK typesetting raises digits
// and symbols, not words.
const CJK_TEXT_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

// Note, significance and trademark marks, and bracketed citations (`[12]`),
// read the same raised or not (`0.142***`, `famous.[4]`); table value cells
// already accept the marks as a trailing suffix.
const MARK_ONLY_RE = /^(?:[*∗⁎⋆★†‡§¶‖#®™©℠※＊]+\d{0,3}|\[[^\]]*\])$/u;
// A script says something only with a letter or digit in it, or as a lone
// sign (`Na^+`, `M_⊙`); a raised quote or question mark is OCR-layer jitter.
const SCRIPT_CONTENT_RE = /[\p{L}\p{N}]|^[+\-−±⊙⊕]$/u;
// Quotation marks belong to the sentence, not to a script.
const QUOTE_RE = /["“”‘’«»]/u;

function scriptRun(item: RawTextItem, geometry: UprightGeometry, continuation = false): boolean {
  const text = item.str.trim();
  if (
    text !== item.str.trimEnd() ||
    /\s/u.test(text) ||
    CJK_TEXT_RE.test(text) ||
    (!continuation && (MARK_ONLY_RE.test(text) || !SCRIPT_CONTENT_RE.test(text))) ||
    QUOTE_RE.test(text)
  ) {
    return false;
  }
  return geometry.fontSize > 0 && codePointLength(text) <= MAX_SCRIPT_CHARS;
}

/** `slack` widens the gap a script of a script may leave after an italic correction. */
function attachKind(base: Base, script: UprightGeometry, slack = 1): Attachment | undefined {
  const last = base.groups.at(-1);
  // `−` then `f` on one raised baseline: the same script continues.
  if (last?.nested && continuesScript(last.nested.last, script)) return { kind: last.nested.kind, nested: true };
  if (last && continuesScript(tail(last), script)) return { kind: last.kind, nested: false };
  const kind = shiftKind(base.geometry, script);
  if (kind) {
    // A stacked script (410 with +160 over −180) starts where the first one did.
    if (touches(base.geometry, script, last ? Math.min(base.geometry.right, last.last.left) : base.right)) {
      return { kind, nested: false };
    }
    // A charge set after an index on the other side of the baseline (SO₃²⁻)
    // starts where the index ends.
    if (last && last.kind !== kind && touches(base.geometry, script, last.last.right)) return { kind, nested: false };
  }
  // A script of a script (`P_{d_k}`, `dist_{t_0}`) is smaller again and
  // shifted from that script's own baseline.
  if (last && !last.nested) {
    const inner = shiftKind(last.last, script);
    if (inner && touches(last.last, script, last.last.right, slack)) return { kind: inner, nested: true };
  }
  return undefined;
}

/** Where a script's own baseline goes on from: past a script of it, if it has one. */
function tail(group: Group): UprightGeometry {
  const { last, nested } = group;
  return nested ? { ...last, right: Math.max(last.right, nested.last.right) } : last;
}

/** Whether `script` is set as a superscript or subscript of `base`, by size and baseline. */
function shiftKind(base: UprightGeometry, script: UprightGeometry): ScriptKind | undefined {
  const { fontSize } = base;
  const ratio = script.fontSize / fontSize;
  if (ratio < MIN_SIZE_RATIO || ratio > MAX_SIZE_RATIO) return undefined;
  const shift = script.baseline - base.baseline;
  if (shift >= MIN_RAISE_EM * fontSize && shift <= MAX_RAISE_EM * fontSize) return 'sup';
  if (-shift >= MIN_LOWER_EM * fontSize && -shift <= MAX_LOWER_EM * fontSize) return 'sub';
  return undefined;
}

function touches(base: UprightGeometry, script: UprightGeometry, anchor: number, slack = 1): boolean {
  const gap = script.left - anchor;
  return gap >= -MAX_OVERLAP_EM * base.fontSize && gap <= MAX_GAP_EM * base.fontSize * slack;
}

function continuesScript(prev: UprightGeometry, cur: UprightGeometry): boolean {
  const size = prev.fontSize;
  if (Math.abs(cur.fontSize - size) > size * 0.05) return false;
  if (Math.abs(cur.baseline - prev.baseline) > size * SAME_SCRIPT_BASELINE_EM) return false;
  const gap = cur.left - prev.right;
  return gap >= -MAX_OVERLAP_EM * size && gap <= MAX_GAP_EM * size * 2;
}

function appendScript(base: Base, { kind, nested }: Attachment, str: string, geometry: UprightGeometry): void {
  const last = base.groups.at(-1);
  const text = str.trim();
  if (nested && last) {
    if (last.nested) {
      last.nested.text += text;
      last.nested.last = geometry;
    } else {
      last.nested = { kind, text, last: geometry };
    }
  } else if (last && last.kind === kind && continuesScript(tail(last), geometry)) {
    // Back on the script's own baseline after a script of it (`x_{i_1 j}`).
    if (last.nested) last.text += renderScript(last.nested.kind, last.nested.text);
    last.nested = undefined;
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
  const nested = group.nested ? renderScript(group.nested.kind, group.nested.text) : '';
  return renderScript(group.kind, group.text + nested);
}

/** `^19`, `_{drop}`: a script in the page text's notation. */
export function renderScript(kind: ScriptKind, text: string): string {
  const body = BARE_SCRIPT_RE.test(text) ? text : `{${text}}`;
  return `${kind === 'sup' ? '^' : '_'}${body}`;
}

const SCRIPT_MARKUP_RE = /[\^_](?:\{([^{}]*)\})?/gu;

/**
 * The text with the script notation taken out (`V_{OS}` → `VOS`), for
 * heuristics that judge a run by how much it says. The markers lengthen a
 * label without adding to it; a literal `^` or `_` is dropped too, which a
 * length measure can afford.
 */
export function withoutScriptMarkup(text: string): string {
  return text.replace(SCRIPT_MARKUP_RE, (_marker, body: string | undefined) => body ?? '');
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
