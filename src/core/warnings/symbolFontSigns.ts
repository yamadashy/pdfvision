import type { PageResult, PageWarning, TextSpan } from '../../types/index.js';
import { round2 } from '../processor/textUtils.js';
import { shortTextSample } from './textSamples.js';

/**
 * Journals typeset with 3B2/Arbortext-era toolchains take minus, <, >, ±
 * and = from a separate symbol font whose ToUnicode map (or missing map)
 * reports those glyphs as ordinary characters: `−52%` extracts as `252%`,
 * `<0.001` as `,0.001`, `±` as `þ`, `=` as `¼`. The text layer is
 * well-formed, so no glyph-garbage rule sees it, and the PDF carries nothing
 * that states the true sign. What it does carry is the shape of the
 * substitution: one font used only for single glyphs, each set inline at
 * body size directly beside a number in another font, each claiming to be a
 * digit, comma, period, or Latin-1 letter. A font switch for a lone `2`
 * between `(` and `52%` has no typographic reason to exist unless that glyph
 * is not a 2.
 */

const MAX_RUN_CODE_POINTS = 3;
const MIN_SIGN_SLOT_RUNS = 3;
const MIN_NON_FRACTION_SIGN_SLOT_RUNS = 2;
const MIN_SIGN_SLOT_SHARE = 0.5;
const MAX_BASELINE_SHIFT_EM = 0.35;
const MIN_SIZE_RATIO = 0.8;
const MAX_GAP_EM = 0.6;
const MAX_OVERLAP_EM = 0.3;
const MAX_FONT_CHAR_SHARE = 0.1;
const MIN_LONG_RUN_CHAR_SHARE = 0.5;
const SAMPLE_LIMIT = 3;

// What a mis-mapped sign claims to be. Real signs (− < > ± × ÷ = +) and
// letters are absent on purpose: a symbol font that maps to them is right,
// and a lone letter in another font is an italic variable or small cap.
const SUBSTITUTE_CHAR_RE = /^[0-9,.;:¼-¾⁄À-ÖØ-öø-ÿ]$/u;
// `½` set in its own font beside a number is also how fraction fonts work,
// so fractions alone never make the case.
const FRACTION_RE = /^(?:[¼-¾]|\d⁄\d)$/u;

interface SignSlot {
  span: TextSpan;
  left?: TextSpan;
  right?: TextSpan;
}

export function detectSymbolFontSubstitution(page: PageResult, spans: readonly TextSpan[], out: PageWarning[]): void {
  const byFont = new Map<string, TextSpan[]>();
  for (const span of spans) {
    if (span.fontName === undefined || span.text.trim() === '') continue;
    const list = byFont.get(span.fontName);
    if (list) list.push(span);
    else byFont.set(span.fontName, [span]);
  }

  // A page whose producer positions every glyph separately has short runs in
  // every font, so a short run says nothing about why the font switched.
  const runLength = (span: TextSpan) => [...span.text.trim()].length;
  const totalChars = [...byFont.values()].flat().reduce((sum, span) => sum + runLength(span), 0);
  const longRunChars = [...byFont.values()]
    .flat()
    .filter((span) => runLength(span) > MAX_RUN_CODE_POINTS)
    .reduce((sum, span) => sum + runLength(span), 0);
  if (totalChars === 0 || longRunChars < totalChars * MIN_LONG_RUN_CHAR_SHARE) return;

  const toRaw = 1 / (page.userUnit ?? 1);
  for (const [fontName, fontSpans] of byFont) {
    if (fontSpans.some((span) => runLength(span) > MAX_RUN_CODE_POINTS)) continue;
    if (fontSpans.reduce((sum, span) => sum + runLength(span), 0) > totalChars * MAX_FONT_CHAR_SHARE) continue;
    const slots = fontSpans.flatMap((span) => {
      const slot = signSlot(span, spans);
      return slot ? [slot] : [];
    });
    if (slots.length < MIN_SIGN_SLOT_RUNS) continue;
    if (slots.length < fontSpans.length * MIN_SIGN_SLOT_SHARE) continue;
    if (slots.filter((slot) => !FRACTION_RE.test(slot.span.text.trim())).length < MIN_NON_FRACTION_SIGN_SLOT_RUNS) {
      continue;
    }

    const chars = [...new Set(slots.map((slot) => slot.span.text.trim()))];
    // One sample per extracted character first, so each substitution shows.
    const samples = [...new Set([...chars.map((ch) => slots.find((slot) => slot.span.text.trim() === ch)), ...slots])]
      .flatMap((slot) => (slot ? [sampleOf(slot)] : []))
      .filter((sample, index, all) => all.indexOf(sample) === index)
      .slice(0, SAMPLE_LIMIT);
    const region = unionRegion(slots.map((slot) => slot.span))
      .map((n) => round2(n * toRaw))
      .join(',');
    out.push({
      code: 'symbol_font_substitution',
      severity: 'warning',
      message: `${slots.length} single-glyph runs in font ${fontName} sit inline beside numbers in another font and extract as ${chars.map((c) => JSON.stringify(c)).join(', ')} (samples: ${samples.map((s) => JSON.stringify(s)).join(', ')}) — the pattern of a symbol font whose character map reports minus, <, >, ± or = as ordinary characters, so signs and comparison operators in this text may be wrong (e.g. −52% read as 252%); render that region (--render-region ${region}) and read the signs from the image before trusting them`,
    });
  }
}

/** The span as a sign slot: inline at body size beside a number in another font. */
function signSlot(span: TextSpan, spans: readonly TextSpan[]): SignSlot | undefined {
  const text = span.text.trim();
  if (![...text].every((ch) => SUBSTITUTE_CHAR_RE.test(ch)) && !FRACTION_RE.test(text)) return undefined;
  let left: TextSpan | undefined;
  let right: TextSpan | undefined;
  const em = span.fontSize;
  for (const other of spans) {
    if (other === span || other.fontName === span.fontName || other.text.trim() === '') continue;
    if (!sameLine(span, other)) continue;
    const leftGap = span.x - (other.x + other.width);
    if (leftGap >= -MAX_OVERLAP_EM * em && leftGap <= MAX_GAP_EM * em && other.x < span.x) {
      if (!left || other.x + other.width > left.x + left.width) left = other;
    }
    const rightGap = other.x - (span.x + span.width);
    if (rightGap >= -MAX_OVERLAP_EM * em && rightGap <= MAX_GAP_EM * em && other.x > span.x) {
      if (!right || other.x < right.x) right = other;
    }
  }
  const besideNumber = /\p{Nd}$/u.test(left?.text.trimEnd() ?? '') || /^\p{Nd}/u.test(right?.text.trimStart() ?? '');
  return besideNumber ? { span, left, right } : undefined;
}

function sameLine(a: TextSpan, b: TextSpan): boolean {
  const ratio = Math.min(a.fontSize, b.fontSize) / Math.max(a.fontSize, b.fontSize);
  if (!(ratio >= MIN_SIZE_RATIO)) return false;
  const shift = Math.abs(a.y + a.height - (b.y + b.height));
  return shift <= MAX_BASELINE_SHIFT_EM * Math.max(a.fontSize, b.fontSize);
}

/** `(252%,`-style context: the neighbouring words around the run, as extracted. */
function sampleOf({ span, left, right }: SignSlot): string {
  const em = span.fontSize;
  const before = left?.text.trimEnd().split(/\s/u).pop() ?? '';
  const after = right?.text.trimStart().split(/\s/u)[0] ?? '';
  const leftSpace = left && (span.x - (left.x + left.width) > 0.15 * em || /\s$/u.test(left.text)) ? ' ' : '';
  const rightSpace = right && (right.x - (span.x + span.width) > 0.15 * em || /^\s/u.test(right.text)) ? ' ' : '';
  return shortTextSample(`${before}${leftSpace}${span.text.trim()}${rightSpace}${after}`);
}

function unionRegion(spans: readonly TextSpan[]): [number, number, number, number] {
  const x0 = Math.min(...spans.map((s) => s.x));
  const y0 = Math.min(...spans.map((s) => s.y));
  const x1 = Math.max(...spans.map((s) => s.x + s.width));
  const y1 = Math.max(...spans.map((s) => s.y + s.height));
  return [x0, y0, x1 - x0, y1 - y0];
}
