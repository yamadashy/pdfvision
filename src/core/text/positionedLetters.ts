import type { MeasuredRun } from './justifiedGlyphRuns.js';

/**
 * A word letter-spaced by drawing each letter at its own position rather
 * than with character spacing (`B A C K G R O U N D`, one `Td` per letter).
 *
 * Tracking adds the same amount to every letter's advance, so the gaps
 * between letters are equal however wide each letter is. Letters set in
 * table cells, a comb field or a weekday header sit at one pitch instead,
 * so their gaps follow the letters' widths; typed spacing (`A G E N D A`,
 * `options A B C`) draws a space glyph. A run is read as tracked words only
 * when its gaps are equal and its pitch clearly is not — the letters'
 * widths differ enough to tell the two apart — and no space glyph lies
 * between letters of a word. A gap clearly wider than the tracking, or a
 * space glyph, separates two words.
 */

const LETTER_RE = /^[\p{L}\p{M}\p{N}]$/u;
const MIN_LETTER_GAPS = 3;
const MIN_WORD_LETTERS = 3;
const MIN_TRACKING_EM = 0.1;
const MAX_TRACKING_EM = 1.2;
const GAP_TOLERANCE_EM = 0.02;
/** Pitches between letters of a word differ by at least this, and by several times what the gaps do. */
const MIN_PITCH_SPREAD_EM = 0.04;
const MIN_PITCH_TO_GAP_SPREAD = 3;
const MIN_WORD_SPACE_EM = 0.2;

export function readTrackedLetters(run: MeasuredRun): string | undefined {
  const { units, boundaries, fontSize: size } = run;
  if (!units.every((unit) => unit.glyph && !unit.cjk && LETTER_RE.test(unit.text))) return undefined;
  const letterGaps = boundaries.filter((boundary) => !boundary.spaceGlyph).map((boundary) => boundary.gap);
  if (letterGaps.length < MIN_LETTER_GAPS) return undefined;
  const tracking = [...letterGaps].sort((a, b) => a - b)[Math.floor((letterGaps.length - 1) / 2)];
  if (tracking < MIN_TRACKING_EM * size || tracking > MAX_TRACKING_EM * size) return undefined;

  const words: string[] = [units[0].text];
  const gaps: number[] = [];
  const pitches: number[] = [];
  for (const [i, boundary] of boundaries.entries()) {
    const next = units[i + 1];
    if (boundary.spaceGlyph || boundary.gap >= tracking + MIN_WORD_SPACE_EM * size) {
      words.push(next.text);
      continue;
    }
    if (Math.abs(boundary.gap - tracking) > GAP_TOLERANCE_EM * size) return undefined;
    words[words.length - 1] += next.text;
    gaps.push(boundary.gap);
    pitches.push(next.left - units[i].left);
  }
  if (gaps.length < MIN_LETTER_GAPS || !words.some((word) => Array.from(word).length >= MIN_WORD_LETTERS)) {
    return undefined;
  }
  const pitchSpread = spread(pitches);
  if (pitchSpread < MIN_PITCH_SPREAD_EM * size || pitchSpread < MIN_PITCH_TO_GAP_SPREAD * spread(gaps))
    return undefined;
  return words.join(' ');
}

function spread(values: readonly number[]): number {
  return Math.max(...values) - Math.min(...values);
}
