import { isCjkLeading } from './cjkJoin.js';
import type { MeasuredRun } from './justifiedGlyphRuns.js';
import { codePointLength, isRawTextItem, uprightGeometry } from './textItems.js';

/**
 * A justified CJK line: spread across the measure by moving every glyph a
 * little further than its advance. It is read as one line only when it is
 * clearly a paragraph line — enough CJK glyphs, the gaps between them at
 * one pitch (punctuation may sit closer, as Japanese justification
 * compresses it), and a tightly set line of the same size a few lines away
 * spanning the same measure. A calendar's weekday header or a row of table
 * cells (also single glyphs at one pitch, but with spread-out neighbours)
 * stays apart. A gap clearly wider than the pitch, or a space glyph, is a
 * real space and stays; so does the space either side of a word pdf.js
 * kept whole (`の Diamond LNG を`), since the pitch says nothing about it.
 */

const MIN_JUSTIFIED_GLYPHS = 6;
// Digits and Latin letters in the line are spread with it.
const MIN_JUSTIFIED_CJK_SHARE = 0.5;
const MIN_JUSTIFIED_GAP_EM = 0.05;
const MAX_JUSTIFIED_GAP_EM = 1.2;
const GAP_TOLERANCE_EM = 0.08;
const GAP_TOLERANCE_SHARE = 0.15;
/** A space set in a justified line: the pitch plus at least this. */
const MIN_WORD_SPACE_EM = 0.2;
const MAX_WORD_SPACE_EM = 1.5;
const MAX_WORD_SPACE_SHARE = 0.25;
const SAME_BASELINE_EM = 0.05;
const SAME_SIZE_RATIO = 0.03;
const NEIGHBOUR_MIN_PITCH_EM = 0.9;
// A body line set to the same measure, within a few lines: the paragraph's own, or the one before it.
const NEIGHBOUR_MAX_PITCH_EM = 12;
const NEIGHBOUR_EDGE_EM = 1.5;
const NEIGHBOUR_MAX_ADVANCE_EM = 1.1;

export interface TextLine {
  baseline: number;
  fontSize: number;
  left: number;
  right: number;
  chars: number;
}

/** The line's text, or undefined when it is not a justified CJK line. */
export function readJustifiedCjkLine(run: MeasuredRun, neighbours: readonly TextLine[]): string | undefined {
  const { units, boundaries, fontSize: size } = run;
  const cjk = units.filter((unit) => unit.cjk).length;
  if (cjk < MIN_JUSTIFIED_GLYPHS || cjk < units.length * MIN_JUSTIFIED_CJK_SHARE) return undefined;
  const kinds = boundaries.map((boundary, i) => {
    const before = units[i];
    const after = units[i + 1];
    const punctuation = isCjkPunctuation(lastChar(before.text)) || isCjkPunctuation(Array.from(after.text)[0] ?? '');
    return {
      ...boundary,
      glyphs: before.glyph && after.glyph,
      even: before.cjk && after.cjk && !punctuation,
      punctuation,
    };
  });
  const even = kinds.filter((kind) => kind.even && !kind.spaceGlyph).map((kind) => kind.gap);
  if (even.length < MIN_JUSTIFIED_GLYPHS - 1) return undefined;
  const median = [...even].sort((a, b) => a - b)[Math.floor(even.length / 2)];
  if (median <= MIN_JUSTIFIED_GAP_EM * size || median > MAX_JUSTIFIED_GAP_EM * size) return undefined;
  const tolerance = Math.max(GAP_TOLERANCE_EM * size, GAP_TOLERANCE_SHARE * median);
  const isWordSpace = (gap: number) =>
    gap >= median + MIN_WORD_SPACE_EM * size && gap <= median + MAX_WORD_SPACE_EM * size;

  let text = units[0].text;
  let wordSpaces = 0;
  for (const [i, kind] of kinds.entries()) {
    let space: boolean;
    if (kind.spaceGlyph || !kind.glyphs) space = true;
    else if (
      kind.punctuation
        ? kind.gap >= -tolerance && kind.gap <= median + tolerance
        : Math.abs(kind.gap - median) <= tolerance
    )
      space = false;
    else if (isWordSpace(kind.gap)) {
      space = true;
      wordSpaces++;
    } else return undefined;
    text += (space ? ' ' : '') + units[i + 1].text;
  }
  if (wordSpaces > boundaries.length * MAX_WORD_SPACE_SHARE) return undefined;
  return hasTightNeighbourLine(run, neighbours) ? text : undefined;
}

function lastChar(text: string): string {
  return Array.from(text).at(-1) ?? '';
}

export function isCjkGlyph(char: string): boolean {
  return isCjkLeading(char) || isCjkPunctuation(char);
}

/** CJK symbols and punctuation (、。「」…), which sit between the script blocks isCjkLeading covers. */
export function isCjkPunctuation(char: string): boolean {
  const cp = char.codePointAt(0) ?? 0;
  return (
    (cp >= 0x3001 && cp <= 0x303f) || cp === 0x30fb || (cp >= 0xff01 && cp <= 0xff0f) || (cp >= 0xff1a && cp <= 0xff20)
  );
}

/** Upright text grouped by baseline and size: the lines a run is compared with. */
export function uprightTextLines(items: readonly unknown[]): TextLine[] {
  const lines: TextLine[] = [];
  for (const item of items) {
    if (!isRawTextItem(item) || item.str.trim().length === 0) continue;
    const geometry = uprightGeometry(item);
    if (!geometry) continue;
    const line = lines.find(
      (candidate) =>
        Math.abs(candidate.baseline - geometry.baseline) <= geometry.fontSize * SAME_BASELINE_EM &&
        Math.abs(candidate.fontSize - geometry.fontSize) <= geometry.fontSize * SAME_SIZE_RATIO,
    );
    // Spaces pdf.js put between spread glyphs would make a spread line look tightly set.
    const chars = codePointLength(item.str.replace(/\s/gu, ''));
    if (line) {
      line.left = Math.min(line.left, geometry.left);
      line.right = Math.max(line.right, geometry.right);
      line.chars += chars;
    } else {
      lines.push({ ...geometry, chars });
    }
  }
  return lines;
}

function hasTightNeighbourLine(run: MeasuredRun, lines: readonly TextLine[]): boolean {
  const { baseline, fontSize } = run;
  const left = run.units[0].left;
  const right = run.units[run.units.length - 1].right;
  return lines.some((line) => {
    if (Math.abs(line.fontSize - fontSize) > fontSize * SAME_SIZE_RATIO) return false;
    const pitch = Math.abs(line.baseline - baseline);
    if (pitch < NEIGHBOUR_MIN_PITCH_EM * fontSize || pitch > NEIGHBOUR_MAX_PITCH_EM * fontSize) return false;
    if (Math.abs(line.left - left) > NEIGHBOUR_EDGE_EM * fontSize) return false;
    if (Math.abs(line.right - right) > NEIGHBOUR_EDGE_EM * fontSize) return false;
    return (line.right - line.left) / Math.max(line.chars, 1) <= NEIGHBOUR_MAX_ADVANCE_EM * fontSize;
  });
}
