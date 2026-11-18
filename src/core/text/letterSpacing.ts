import { isCjkLeading } from './cjkJoin.js';
import type { PageFontTextHints } from './fontTextHints.js';
import {
  codePointLength,
  isRawTextItem,
  isWhitespaceItem,
  type RawTextItem,
  type UprightGeometry,
  uprightGeometry,
  withTextAndExtent,
} from './textItems.js';

/**
 * Undo letter spacing that pdf.js reads as word spaces.
 *
 * Two shapes reach text content:
 *
 * - Character spacing (`Tc`) on a showText. pdf.js puts a space inside the
 *   item wherever the gap between two glyphs passes ~0.1 em, so a
 *   letter-spaced heading arrives as `A C K G R O U N D`. The operator list
 *   still has the glyphs, and a tracked word is a run of them with no space
 *   glyph between; tokens of the item that together spell part of such a
 *   word are rejoined. A real space glyph splits the word, so
 *   `SUMMARY OF` keeps its one space.
 * - One glyph per text item at a uniform, wider-than-normal pitch: a
 *   justified CJK line, spread across the measure character by character.
 *   Every gap is a space to the joiners. A run of such glyphs is rejoined
 *   only when it is clearly a paragraph line — enough glyphs, one pitch, and
 *   a tightly set line of the same size next to it spanning the same
 *   measure — so a calendar's weekday header or a row of table cells (also
 *   single glyphs at one pitch, but with spread-out neighbours) stays apart.
 */

const MIN_TRACKED_TOKENS = 2;
const MAX_TRACKED_TOKEN_CHARS = 2;

const MIN_JUSTIFIED_GLYPHS = 6;
const MIN_JUSTIFIED_CJK_SHARE = 0.8;
// Below 0.3 em the joiners already treat CJK glyphs as touching.
const MIN_JUSTIFIED_GAP_EM = 0.3;
const MAX_JUSTIFIED_GAP_EM = 1.2;
const GAP_TOLERANCE_EM = 0.08;
const GAP_TOLERANCE_SHARE = 0.15;
const SAME_BASELINE_EM = 0.05;
const SAME_SIZE_RATIO = 0.03;
const NEIGHBOUR_MIN_PITCH_EM = 0.9;
const NEIGHBOUR_MAX_PITCH_EM = 3;
const NEIGHBOUR_EDGE_EM = 1.5;
const NEIGHBOUR_MAX_ADVANCE_EM = 1.1;

export function removeTrackingSpaces(items: readonly unknown[], hints: PageFontTextHints): unknown[] {
  if (![...hints.values()].some((hint) => hint.trackedWords)) return [...items];
  return items.map((item) => {
    if (!isRawTextItem(item) || typeof item.fontName !== 'string' || !item.str.includes(' ')) return item;
    const tracked = hints.get(item.fontName)?.trackedWords;
    if (!tracked) return item;
    const str = joinTrackedTokens(item.str, tracked);
    return str === item.str ? item : { ...item, str };
  });
}

/**
 * Rejoin space-separated tokens of `text` that spell part of a tracked
 * word. Exported for tests.
 */
export function joinTrackedTokens(text: string, trackedWords: string): string {
  // Split on single spaces only; a doubled space is kept as it is.
  return text
    .split(/( {2,})/u)
    .map((segment, index) => (index % 2 === 1 ? segment : joinSegment(segment, trackedWords)))
    .join('');
}

function joinSegment(segment: string, trackedWords: string): string {
  const tokens = segment.split(' ');
  if (tokens.length < MIN_TRACKED_TOKENS) return segment;
  const groups: string[][] = [];
  for (const token of tokens) {
    const group = groups.at(-1);
    if (group && token.length > 0 && group[0].length > 0 && trackedWords.includes(group.join('') + token)) {
      group.push(token);
    } else {
      groups.push([token]);
    }
  }
  // Tracking spaces sit between most letters; a group made mostly of whole
  // words is ordinary text that happens to spell part of a tracked word.
  return groups.flatMap((group) => (isTrackedGroup(group) ? [group.join('')] : group)).join(' ');
}

function isTrackedGroup(group: readonly string[]): boolean {
  if (group.length < MIN_TRACKED_TOKENS) return true;
  const short = group.filter((token) => codePointLength(token) <= MAX_TRACKED_TOKEN_CHARS).length;
  return short * 2 >= group.length;
}

interface Glyph {
  index: number;
  item: RawTextItem;
  geometry: UprightGeometry;
}

/** Rejoin justified CJK lines set one glyph per item. */
export function joinJustifiedGlyphRuns(items: readonly unknown[]): unknown[] {
  const runs = findJustifiedRuns(items);
  if (runs.length === 0) return [...items];
  const neighbours = uprightTextLines(items);
  const replace = new Map<number, RawTextItem>();
  const drop = new Set<number>();
  for (const run of runs) {
    if (!hasTightNeighbourLine(run, neighbours)) continue;
    const first = run[0];
    const last = run[run.length - 1];
    const merged = withTextAndExtent(
      first.item,
      run.map((glyph) => glyph.item.str.trim()).join(''),
      first.geometry.left,
      last.geometry.right,
    );
    replace.set(first.index, { ...merged, hasEOL: !!last.item.hasEOL });
    for (let index = first.index + 1; index <= last.index; index++) drop.add(index);
  }
  if (replace.size === 0) return [...items];
  return items.flatMap((item, index) => {
    const replacement = replace.get(index);
    if (replacement) return [replacement];
    return drop.has(index) ? [] : [item];
  });
}

function findJustifiedRuns(items: readonly unknown[]): Glyph[][] {
  const runs: Glyph[][] = [];
  let run: Glyph[] = [];
  const flush = () => {
    if (isJustifiedRun(run)) runs.push(run);
    run = [];
  };
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!isRawTextItem(item)) continue;
    // Separators pdf.js put between the glyphs; a line break ends the run.
    if (item.str.length === 0 || isWhitespaceItem(item)) {
      if (item.hasEOL) flush();
      continue;
    }
    const geometry = uprightGeometry(item);
    const glyph = geometry && codePointLength(item.str.trim()) === 1 ? { index, item, geometry } : undefined;
    const prev = run.at(-1);
    if (glyph && prev && !continuesRun(prev, glyph)) flush();
    if (glyph) run.push(glyph);
    else flush();
    if (item.hasEOL) flush();
  }
  flush();
  return runs;
}

function continuesRun(prev: Glyph, cur: Glyph): boolean {
  const size = prev.geometry.fontSize;
  return (
    cur.item.fontName === prev.item.fontName &&
    Math.abs(cur.geometry.fontSize - size) <= size * SAME_SIZE_RATIO &&
    Math.abs(cur.geometry.baseline - prev.geometry.baseline) <= size * SAME_BASELINE_EM &&
    cur.geometry.left > prev.geometry.left
  );
}

function isJustifiedRun(run: readonly Glyph[]): boolean {
  if (run.length < MIN_JUSTIFIED_GLYPHS) return false;
  const cjk = run.filter((glyph) => isCjkGlyph(glyph.item.str.trim())).length;
  if (cjk < run.length * MIN_JUSTIFIED_CJK_SHARE) return false;
  const size = run[0].geometry.fontSize;
  const gaps = run.slice(1).map((glyph, i) => glyph.geometry.left - run[i].geometry.right);
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median <= MIN_JUSTIFIED_GAP_EM * size || median > MAX_JUSTIFIED_GAP_EM * size) return false;
  const tolerance = Math.max(GAP_TOLERANCE_EM * size, GAP_TOLERANCE_SHARE * median);
  return gaps.every((gap) => Math.abs(gap - median) <= tolerance);
}

function isCjkGlyph(char: string): boolean {
  const cp = char.codePointAt(0) ?? 0;
  // CJK symbols and punctuation (、。「」…) sit between the script blocks isCjkLeading covers.
  return isCjkLeading(char) || (cp >= 0x3000 && cp <= 0x303f);
}

interface TextLine {
  baseline: number;
  fontSize: number;
  left: number;
  right: number;
  chars: number;
}

/** Upright text grouped by baseline and size: the lines a run is compared with. */
function uprightTextLines(items: readonly unknown[]): TextLine[] {
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
    const chars = codePointLength(item.str.trim());
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

function hasTightNeighbourLine(run: readonly Glyph[], lines: readonly TextLine[]): boolean {
  const { baseline, fontSize, left } = run[0].geometry;
  const right = run[run.length - 1].geometry.right;
  return lines.some((line) => {
    if (Math.abs(line.fontSize - fontSize) > fontSize * SAME_SIZE_RATIO) return false;
    const pitch = Math.abs(line.baseline - baseline);
    if (pitch < NEIGHBOUR_MIN_PITCH_EM * fontSize || pitch > NEIGHBOUR_MAX_PITCH_EM * fontSize) return false;
    if (Math.abs(line.left - left) > NEIGHBOUR_EDGE_EM * fontSize) return false;
    if (Math.abs(line.right - right) > NEIGHBOUR_EDGE_EM * fontSize) return false;
    return (line.right - line.left) / Math.max(line.chars, 1) <= NEIGHBOUR_MAX_ADVANCE_EM * fontSize;
  });
}
