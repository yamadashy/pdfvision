import type { LayoutBlock, LayoutLine, TextSpan } from '../../types/index.js';
import { round2, unionBox } from './geometry.js';

/**
 * Code blocks: monospaced lines whose horizontal offsets are the text.
 *
 * Syntax highlighters and print engines place every token at its column's
 * x position, so leading indentation exists only as geometry. The ordinary
 * line pass joins tokens with single spaces and starts every line flush
 * left, which erases the structure of Python and YAML, and a line-number
 * gutter reads as a column of its own (#269).
 *
 * A block counts as code only on evidence that the page itself sets code
 * apart from its prose:
 * - every span on its rows is in a font pdf.js reports as fixed-pitch, and
 *   no proportional text shares those rows (inline `code` in a sentence
 *   never qualifies);
 * - the page also carries proportional text, so a document set entirely in
 *   a monospaced face (an RFC, a plain-text report) is left alone;
 * - the tokens sit on one character grid: each multi-character span is as
 *   wide as its characters at one advance, and each span starts a whole
 *   number of advances from the block's left edge;
 * - at least three rows hold code.
 *
 * Indentation is rebuilt from the grid as leading spaces. A gutter of
 * increasing line numbers, right-aligned left of the code, is dropped from
 * the code text and reported as `codeLineNumbers` on the block, so the code
 * can be copied as it is and the numbers stay available.
 */

const MIN_CODE_ROWS = 3;
const MIN_PROPORTIONAL_TEXT_SHARE = 0.1;
const ROW_Y_TOLERANCE_RATIO = 0.3;
const ROW_FONT_RATIO = 1.08;
/** Wider gaps inside one row start a separate segment (two listings side by side). */
const MAX_IN_ROW_GAP_ADVANCES = 30;
/** Up to two blank lines inside a block. */
const MAX_ROW_STEP_PITCHES = 3.4;
const MIN_ROW_STEP_RATIO = 0.9;
const MAX_FIRST_ROW_STEP_RATIO = 2.2;
const PROPORTIONAL_NEIGHBOUR_ADVANCES = 2;
const GRID_TOLERANCE = 0.2;
const MIN_ON_GRID_SHARE = 0.85;
const ADVANCE_TOLERANCE = 0.06;
const MIN_UNIFORM_ADVANCE_SHARE = 0.9;
const GUTTER_RIGHT_TOLERANCE_PT = 1.5;
const MIN_GUTTER_ROW_SHARE = 0.6;
const SHARED_ROW_CENTER_TOLERANCE = 0.25;
const MAX_SHARED_ROW_SHARE = 0.5;
const MIN_ASCII_SHARE = 0.7;
const MIN_CODE_SYMBOL_SHARE = 0.04;
const CODE_SYMBOL_RE = /[[\]{}()<>=;_#/\\$|`@*+&%~^]/u;
const DIGITS_RE = /^\d{1,5}$/u;

export interface CodeBlockExtraction {
  blocks: LayoutBlock[];
  remainingSpans: TextSpan[];
}

interface Row {
  y: number;
  fontSize: number;
  spans: TextSpan[];
}

interface Candidate {
  rows: Row[];
  fontSize: number;
  pitch: number;
  left: number;
  right: number;
}

export function extractCodeBlocks(
  spans: readonly TextSpan[],
  monospaceFonts: ReadonlySet<string> | undefined,
): CodeBlockExtraction {
  const none = { blocks: [], remainingSpans: [...spans] };
  if (!monospaceFonts || monospaceFonts.size === 0) return none;
  const isMono = (span: TextSpan) => span.fontName !== undefined && monospaceFonts.has(span.fontName);

  let monoChars = 0;
  let proportionalChars = 0;
  for (const span of spans) {
    const chars = span.text.replace(/\s/gu, '').length;
    if (isMono(span)) monoChars += chars;
    else proportionalChars += chars;
  }
  if (monoChars === 0 || proportionalChars < (monoChars + proportionalChars) * MIN_PROPORTIONAL_TEXT_SHARE) return none;

  const proportional = byTop(spans.filter((span) => !isMono(span)));
  const segments = rowSegments(spans.filter(isMono)).filter((row) => !hasProportionalNeighbour(row, proportional));
  const used = new Set<TextSpan>();
  const blocks: LayoutBlock[] = [];
  for (const candidate of stackRows(segments)) {
    if (sharesRowsWithProportionalText(candidate, proportional)) continue;
    const block = toCodeBlock(candidate);
    if (!block) continue;
    blocks.push(block);
    for (const row of candidate.rows) for (const span of row.spans) used.add(span);
  }
  if (blocks.length === 0) return none;
  return { blocks, remainingSpans: spans.filter((span) => !used.has(span)) };
}

function fontSizeOf(span: TextSpan): number {
  return span.fontSize || span.height || 1;
}

function rowSegments(mono: readonly TextSpan[]): Row[] {
  const sorted = [...mono].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Row[] = [];
  for (const span of sorted) {
    const fontSize = fontSizeOf(span);
    // Spans arrive top to bottom, so only the last few rows can still take one.
    let row: Row | undefined;
    for (let index = rows.length - 1; index >= 0; index--) {
      const candidate = rows[index];
      if (span.y - candidate.y > candidate.fontSize * ROW_Y_TOLERANCE_RATIO * 4) break;
      if (
        Math.abs(candidate.y - span.y) <= candidate.fontSize * ROW_Y_TOLERANCE_RATIO &&
        Math.max(candidate.fontSize, fontSize) / Math.min(candidate.fontSize, fontSize) <= ROW_FONT_RATIO
      ) {
        row = candidate;
        break;
      }
    }
    if (row) row.spans.push(span);
    else rows.push({ y: span.y, fontSize, spans: [span] });
  }
  const segments: Row[] = [];
  for (const row of rows) {
    const byX = row.spans.sort((a, b) => a.x - b.x);
    const advance = row.fontSize * 0.6;
    let current: TextSpan[] = [];
    for (const span of byX) {
      const previous = current.at(-1);
      if (previous && span.x - (previous.x + previous.width) > advance * MAX_IN_ROW_GAP_ADVANCES) {
        segments.push({ y: row.y, fontSize: row.fontSize, spans: current });
        current = [];
      }
      current.push(span);
    }
    if (current.length > 0) segments.push({ y: row.y, fontSize: row.fontSize, spans: current });
  }
  return segments.sort((a, b) => a.y - b.y || rowLeft(a) - rowLeft(b));
}

function rowLeft(row: Row): number {
  return Math.min(...row.spans.map((span) => span.x));
}

function rowRight(row: Row): number {
  return Math.max(...row.spans.map((span) => span.x + span.width));
}

/** Monospaced text sharing its line with proportional text is inline code in a sentence. */
interface SpansByTop {
  spans: TextSpan[];
  maxHeight: number;
}

function byTop(spans: readonly TextSpan[]): SpansByTop {
  return {
    spans: [...spans].sort((a, b) => a.y - b.y),
    maxHeight: spans.reduce((max, span) => Math.max(max, span.height), 0),
  };
}

/** Spans that can reach into [top, bottom]. */
function spansNear(index: SpansByTop, top: number, bottom: number): TextSpan[] {
  const from = top - index.maxHeight;
  let low = 0;
  let high = index.spans.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (index.spans[mid].y < from) low = mid + 1;
    else high = mid;
  }
  const out: TextSpan[] = [];
  for (let i = low; i < index.spans.length && index.spans[i].y <= bottom; i++) out.push(index.spans[i]);
  return out;
}

function hasProportionalNeighbour(row: Row, proportional: SpansByTop): boolean {
  const reach = row.fontSize * 0.6 * PROPORTIONAL_NEIGHBOUR_ADVANCES;
  const left = rowLeft(row) - reach;
  const right = rowRight(row) + reach;
  const top = Math.min(...row.spans.map((span) => span.y));
  const bottom = Math.max(...row.spans.map((span) => span.y + span.height));
  return spansNear(proportional, top, bottom).some((span) => {
    if (span.x > right || span.x + span.width < left) return false;
    const overlap = Math.min(bottom, span.y + span.height) - Math.max(top, span.y);
    return overlap > Math.min(bottom - top, span.height) * 0.5;
  });
}

/**
 * A table whose first columns are set in a monospaced face (an options table
 * listing `name`, `string`) has proportional cells on the same baselines,
 * row after row. Prose in a neighbouring column keeps its own leading, so
 * its lines line up with a listing's rows only now and then.
 */
function sharesRowsWithProportionalText(candidate: Candidate, proportional: SpansByTop): boolean {
  let shared = 0;
  for (const row of candidate.rows) {
    const center = row.y + row.fontSize / 2;
    const tolerance = row.fontSize * SHARED_ROW_CENTER_TOLERANCE;
    const near = spansNear(proportional, center - tolerance, center + tolerance);
    if (near.some((span) => Math.abs(span.y + span.height / 2 - center) <= tolerance)) shared++;
  }
  return shared >= candidate.rows.length * MAX_SHARED_ROW_SHARE;
}

function stackRows(rows: readonly Row[]): Candidate[] {
  const candidates: Candidate[] = [];
  let open: Candidate[] = [];
  for (const row of rows) {
    // A candidate whose last row is out of reach can take no further row.
    open = open.filter(
      (candidate) =>
        row.y - (candidate.rows.at(-1)?.y ?? row.y) <=
        candidate.pitch * MAX_ROW_STEP_PITCHES + candidate.fontSize * MAX_FIRST_ROW_STEP_RATIO,
    );
    const left = rowLeft(row);
    const right = rowRight(row);
    const target = open.find((candidate) => {
      if (Math.max(candidate.fontSize, row.fontSize) / Math.min(candidate.fontSize, row.fontSize) > ROW_FONT_RATIO) {
        return false;
      }
      const last = candidate.rows.at(-1);
      if (!last) return false;
      const step = row.y - last.y;
      const maxStep =
        candidate.rows.length === 1
          ? candidate.fontSize * MAX_FIRST_ROW_STEP_RATIO
          : candidate.pitch * MAX_ROW_STEP_PITCHES;
      if (step < candidate.fontSize * MIN_ROW_STEP_RATIO || step > maxStep) return false;
      return left < candidate.right && right > candidate.left - candidate.fontSize * 0.6 * 4;
    });
    if (target) {
      const step = row.y - (target.rows.at(-1)?.y ?? row.y);
      target.pitch = target.rows.length === 1 ? step : Math.min(target.pitch, step);
      target.rows.push(row);
      target.left = Math.min(target.left, left);
      target.right = Math.max(target.right, right);
      continue;
    }
    const candidate: Candidate = { rows: [row], fontSize: row.fontSize, pitch: row.fontSize * 1.2, left, right };
    open.push(candidate);
    candidates.push(candidate);
  }
  return candidates;
}

interface Gutter {
  spans: Set<TextSpan>;
  first: number;
  last: number;
}

function findGutter(rows: readonly Row[]): Gutter | undefined {
  const firsts = rows.map((row) => row.spans[0]).filter((span) => DIGITS_RE.test(span.text.trim()));
  if (firsts.length < Math.max(MIN_CODE_ROWS, rows.length * MIN_GUTTER_ROW_SHARE)) return undefined;
  const rights = firsts.map((span) => span.x + span.width).sort((a, b) => a - b);
  const right = rights[Math.floor(rights.length / 2)];
  if (firsts.some((span) => Math.abs(span.x + span.width - right) > GUTTER_RIGHT_TOLERANCE_PT)) return undefined;
  const numbers = firsts.map((span) => Number(span.text.trim()));
  for (let index = 1; index < numbers.length; index++) {
    if (numbers[index] <= numbers[index - 1]) return undefined;
  }
  // The code itself starts clear of the numbers.
  const codeLeft = Math.min(
    ...rows.flatMap((row) => row.spans.filter((span) => !firsts.includes(span)).map((span) => span.x)),
  );
  if (!(codeLeft > right)) return undefined;
  return { spans: new Set(firsts), first: numbers[0], last: numbers[numbers.length - 1] };
}

function toCodeBlock(candidate: Candidate): LayoutBlock | undefined {
  const gutter = findGutter(candidate.rows);
  const codeSpans = candidate.rows.flatMap((row) => row.spans.filter((span) => !gutter?.spans.has(span)));
  const codeRows = candidate.rows.filter((row) => row.spans.some((span) => !gutter?.spans.has(span)));
  if (codeRows.length < MIN_CODE_ROWS) return undefined;

  if (!looksLikeCode(codeSpans, gutter !== undefined)) return undefined;

  const advance = characterAdvance(codeSpans);
  if (!advance) return undefined;
  const origin = Math.min(...codeSpans.map((span) => span.x));
  const onGrid = codeSpans.filter((span) => {
    const columns = (span.x - origin) / advance;
    return Math.abs(columns - Math.round(columns)) <= GRID_TOLERANCE;
  }).length;
  if (onGrid < codeSpans.length * MIN_ON_GRID_SHARE) return undefined;

  const lines: LayoutLine[] = [];
  let previousY: number | undefined;
  for (const row of candidate.rows) {
    if (previousY !== undefined) {
      const missing = Math.round((row.y - previousY) / candidate.pitch) - 1;
      for (let index = 1; index <= missing; index++) {
        lines.push(blankLine(origin, previousY + candidate.pitch * index, candidate.fontSize));
      }
    }
    previousY = row.y;
    const tokens = row.spans.filter((span) => !gutter?.spans.has(span));
    if (tokens.length === 0) {
      lines.push(blankLine(origin, row.y, row.fontSize));
      continue;
    }
    lines.push({
      text: rowText(tokens, origin, advance),
      ...unionBox(tokens),
      fontSize: round2(row.fontSize),
    });
  }
  const box = unionBox(candidate.rows.flatMap((row) => row.spans));
  return {
    text: lines.map((line) => line.text).join('\n'),
    ...box,
    lines,
    role: 'code',
    ...(gutter && { codeLineNumbers: { first: gutter.first, last: gutter.last } }),
  };
}

/**
 * Monospaced text that is not code: a Japanese passage in a full-width
 * fixed-pitch face (MS Mincho reports fixed pitch), or a quotation set in a
 * typewriter face. Code is mostly ASCII and either has a line-number gutter,
 * indentation, or the punctuation code is made of.
 */
function looksLikeCode(spans: readonly TextSpan[], hasGutter: boolean): boolean {
  let chars = 0;
  let ascii = 0;
  let symbols = 0;
  for (const span of spans) {
    for (const char of span.text) {
      if (/\s/u.test(char)) continue;
      chars++;
      if (char <= '~') ascii++;
      if (CODE_SYMBOL_RE.test(char)) symbols++;
    }
  }
  if (chars === 0 || ascii < chars * MIN_ASCII_SHARE) return false;
  if (hasGutter || symbols >= chars * MIN_CODE_SYMBOL_SHARE) return true;
  const lefts = spans.map((span) => Math.round(span.x));
  const origin = Math.min(...lefts);
  return new Set(spans.filter((span) => isRowStart(span, spans)).map((span) => Math.round(span.x - origin))).size > 1;
}

function isRowStart(span: TextSpan, spans: readonly TextSpan[]): boolean {
  return !spans.some((other) => other !== span && Math.abs(other.y - span.y) < span.height * 0.5 && other.x < span.x);
}

function blankLine(x: number, y: number, fontSize: number): LayoutLine {
  return { text: '', x: round2(x), y: round2(y), width: 0, height: round2(fontSize), fontSize: round2(fontSize) };
}

/** The advance every multi-character span agrees on, or undefined when the spans are not on one pitch. */
function characterAdvance(spans: readonly TextSpan[]): number | undefined {
  const samples = spans
    .filter((span) => span.text.length >= 2)
    .map((span) => span.width / span.text.length)
    .sort((a, b) => a - b);
  if (samples.length === 0) return undefined;
  const advance = samples[Math.floor(samples.length / 2)];
  if (!(advance > 0)) return undefined;
  const uniform = samples.filter((sample) => Math.abs(sample - advance) <= advance * ADVANCE_TOLERANCE).length;
  return uniform >= samples.length * MIN_UNIFORM_ADVANCE_SHARE ? advance : undefined;
}

function rowText(tokens: readonly TextSpan[], origin: number, advance: number): string {
  let text = '';
  for (const span of [...tokens].sort((a, b) => a.x - b.x)) {
    const column = Math.max(0, Math.round((span.x - origin) / advance));
    if (column > text.length) text += ' '.repeat(column - text.length);
    text += span.text;
  }
  return text.trimEnd();
}
