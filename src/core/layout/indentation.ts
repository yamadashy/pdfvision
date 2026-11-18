import type { LayoutBlock, LayoutLine } from '../../types/index.js';
import { median } from './geometry.js';
import { rowCells } from './rows/index.js';

/**
 * Keep the depth of nested lists and index entries in the text. Which entry
 * a subentry belongs to, or which bullet a sub-bullet sits under, is carried
 * only by how far the line is indented; flush text loses it.
 *
 * Two shapes are read:
 * - **list items**: lines (within a block) or blocks (one per item, as
 *   slides set them) that start with a bullet or an enumerator at two or
 *   more indents. An item's wrapped lines take its depth.
 * - **indented entries** without markers (a back-of-book index, a table of
 *   contents): a block of short lines at three or more indents, each indent
 *   used by several lines.
 *
 * Ordinary prose is left alone: a first-line indent, a block quote, or a
 * hanging indent is one level, which neither shape accepts, and lines of
 * running text (many words each) or of centred text (each line at its own
 * indent) are not entries.
 *
 * Depth is counted in steps of the smallest indent, so a turnover line set
 * deeper than any subentry stays deeper; each level is two leading spaces
 * in the text and `indent` on the line.
 */
export function indentNestedLines(blocks: readonly LayoutBlock[], sources: readonly LayoutBlock[] = []): void {
  const depths = new Map<LayoutLine, number>();
  // Rows read across label and value columns (see rows/index.ts) take the
  // depth their label had in its own column.
  for (const block of sources) {
    if (isRightAligned(block.lines)) continue;
    const lineDepths = blockLineDepths(block);
    if (!lineDepths) continue;
    block.lines.forEach((line, index) => {
      if (lineDepths[index] > 0) depths.set(line, lineDepths[index]);
    });
  }
  for (const block of blocks) {
    for (const line of block.lines) {
      const depth = rowCells(line).length > 1 ? depths.get(rowCells(line)[0]) : undefined;
      if (depth !== undefined) depths.set(line, depth);
    }
  }
  for (const block of blocks) {
    const lineDepths = blockLineDepths(block);
    if (!lineDepths) continue;
    block.lines.forEach((line, index) => {
      if (lineDepths[index] > 0 && !depths.has(line)) depths.set(line, lineDepths[index]);
    });
  }
  for (const [block, depth] of itemBlockDepths(blocks)) {
    for (const line of block.lines) depths.set(line, (depths.get(line) ?? 0) + depth);
  }
  if (depths.size === 0) return;
  for (const block of blocks) {
    if (!block.lines.some((line) => depths.has(line))) continue;
    // Only blocks whose text is still their lines joined: anything else was
    // rewritten by an earlier pass and its lines no longer map onto it.
    if (block.text !== block.lines.map((line) => line.text).join('\n')) continue;
    for (const line of block.lines) {
      const depth = depths.get(line);
      if (!depth) continue;
      line.text = `${'  '.repeat(depth)}${line.text}`;
      line.indent = depth;
    }
    block.text = block.lines.map((line) => line.text).join('\n');
  }
}

const MAX_DEPTH = 6;
const RIGHT_ALIGNED_SHARE = 0.8;
const MAX_INDENT_EM = 8;
const INDENT_TOLERANCE_EM = 0.25;
const INDENT_TOLERANCE_MIN_PT = 1.5;
/** Index and contents lines are a few words; running text has many. */
const MAX_ENTRY_MEDIAN_WORDS = 8;
const MIN_ENTRY_LEVELS = 3;
const MIN_LINES_PER_LEVEL = 2;
/** Lines at an indent no other line shares (centred or ragged text): at most this share. */
const MAX_LONE_INDENT_SHARE = 0.2;
const ITEM_RUN_MAX_GAP_LINES = 3;
const FULL_LINE_SLACK_EM = 2;
const MAX_FULL_LINE_SHARE = 0.3;
const MAX_SHORT_ENTRY_MEDIAN_WORDS = 6;
const MIN_CONSECUTIVE_INDENTED = 2;
const MAX_FIGURE_LINE_SHARE = 0.2;
const INDENT_STEP_TOLERANCE = 0.25;
const MAX_MARK_LINE_CHARS = 3;
const SENTENCE_END_RE = /[.!?。]["”’)]?$/u;

/** A bullet glyph before text; a run of them (`・・・・`) is a leader, not a bullet. */
const BULLET_RE = /^[•‣◦▪▫■□●○◆◇►▸▹▶➢➤✓✔☐☑・◎※]\s*[^\s•‣◦▪▫■□●○◆◇►▸▹▶➢➤✓✔☐☑・◎※.…·]/u;
const ENUMERATOR_RE = /^(?:\d{1,3}[.)]|[a-zA-Z][.)]|\((?:\d{1,3}|[a-zA-Z]|[ivxlc]{1,5})\)|[①-⑳]|[-–—])\s+\S/u;

export function startsWithListMarker(text: string): boolean {
  const trimmed = text.trimStart();
  // An item says something; `5. 1` is a decimal set with a space.
  if (!/\p{L}/u.test(trimmed.slice(1))) return false;
  return BULLET_RE.test(trimmed) || ENUMERATOR_RE.test(trimmed);
}

function isIndentable(block: LayoutBlock): boolean {
  return block.role === undefined && block.writingMode !== 'vertical' && block.lines.length > 0;
}

interface Level {
  offset: number;
  count: number;
}

/** Cluster left offsets; returns each level (ascending) and each offset's level index. */
function clusterOffsets(offsets: readonly number[], tolerance: number): { levels: Level[]; levelOf: number[] } {
  const order = offsets.map((offset, index) => ({ offset, index })).sort((a, b) => a.offset - b.offset);
  const levels: Level[] = [];
  const levelOf: number[] = Array.from({ length: offsets.length }, () => 0);
  let anchor = Number.NEGATIVE_INFINITY;
  for (const { offset, index } of order) {
    if (offset - anchor > tolerance) {
      levels.push({ offset, count: 0 });
      anchor = offset;
    }
    const level = levels[levels.length - 1];
    level.count++;
    levelOf[index] = levels.length - 1;
  }
  return { levels, levelOf };
}

function depthOf(offset: number, unit: number): number {
  return Math.min(MAX_DEPTH, Math.max(0, Math.round(offset / unit)));
}

function toleranceFor(lines: readonly LayoutLine[]): { tolerance: number; em: number } {
  const em = median(lines.map((line) => line.fontSize)) || 10;
  return { tolerance: Math.max(INDENT_TOLERANCE_MIN_PT, em * INDENT_TOLERANCE_EM), em };
}

/** Depth of each line inside one block, or undefined when the block is not a nested list or index. */
function blockLineDepths(block: LayoutBlock): number[] | undefined {
  if (!isIndentable(block) || block.lines.length < 2) return undefined;
  // A row joined from cells is judged by its first cell: the entry, not the
  // values or page number set to its right. A row of values alone (under a
  // label that wraps) has no entry and takes no depth.
  const heads = block.lines.map((line) => rowCells(line)[0]);
  const rowHeads = heads.filter((_, index) => rowCells(block.lines[index]).length > 1);
  // A line set under another column of the rows (a statement's detail line)
  // is no entry of the first column either.
  const columnRight = Math.min(...rowHeads.map((head) => head.x + head.width));
  const keep = heads.map((head) => rowHeads.length === 0 || (/\p{L}/u.test(head.text) && head.x < columnRight));
  const kept = heads.filter((_, index) => keep[index]);
  if (rowHeads.length > 0 && isRightAligned(kept)) return undefined;
  const depths = lineDepths(kept);
  if (!depths) return undefined;
  let next = 0;
  return keep.map((kept) => (kept ? depths[next++] : 0));
}

/**
 * Labels set flush right against what follows them (a pinout's pin names)
 * start wherever their width puts them; that is no indent.
 */
function isRightAligned(lines: readonly LayoutLine[]): boolean {
  if (lines.length < 2) return false;
  const rights = lines.map((line) => line.x + line.width);
  const at = median(rights);
  const { tolerance } = toleranceFor(lines);
  return rights.filter((right) => Math.abs(right - at) <= tolerance).length >= lines.length * RIGHT_ALIGNED_SHARE;
}

function lineDepths(lines: readonly LayoutLine[]): number[] | undefined {
  if (lines.length < 2) return undefined;
  const { tolerance, em } = toleranceFor(lines);
  const base = Math.min(...lines.map((line) => line.x));
  const offsets = lines.map((line) => line.x - base);
  if (Math.max(...offsets) > em * MAX_INDENT_EM) return undefined;
  const { levels, levelOf } = clusterOffsets(offsets, tolerance);
  if (levels.length < 2) return undefined;

  const markers = lines.map((line) => startsWithListMarker(line.text));
  const markerLevels = new Set(levelOf.filter((_, index) => markers[index]));
  if (markerLevels.size >= 2) return listItemDepths(lines, markers, levels, levelOf, tolerance);
  return entryDepths(lines, levels, levelOf, em);
}

function listItemDepths(
  lines: readonly LayoutLine[],
  markers: readonly boolean[],
  levels: readonly Level[],
  levelOf: readonly number[],
  tolerance: number,
): number[] | undefined {
  const markerOffsets = [...new Set(levelOf.filter((_, index) => markers[index]))]
    .sort((a, b) => a - b)
    .map((level) => levels[level].offset);
  const unit = Math.min(...markerOffsets.slice(1).map((offset, index) => offset - markerOffsets[index]));
  const markerBase = markerOffsets[0];
  const depths: number[] = [];
  let item: { depth: number; x: number } | undefined;
  for (const [index, line] of lines.entries()) {
    const offset = levels[levelOf[index]].offset;
    if (markers[index]) {
      item = { depth: depthOf(offset - markerBase, unit), x: line.x };
      depths.push(item.depth);
    } else if (!item) {
      // A lead-in line above the list.
      depths.push(0);
    } else if (line.x > item.x + tolerance) {
      // A wrapped line of the item above, hanging under its text.
      depths.push(item.depth);
    } else {
      // Text back at the marker's edge after an item: numbered paragraphs
      // run in with prose (`1. Maximum length. Many commenters …`), not a
      // list whose items hang.
      return undefined;
    }
  }
  return depths;
}

function entryDepths(
  lines: readonly LayoutLine[],
  levels: readonly Level[],
  levelOf: readonly number[],
  em: number,
): number[] | undefined {
  // A list whose markers all sit at one indent is flat; what is indented
  // around it is the paragraph it belongs to or its wrapped lines.
  if (lines.some((line) => startsWithListMarker(line.text))) return undefined;
  // Right-aligned figures start wherever their width puts them.
  const figures = lines.filter(isFigureLine).length;
  if (figures > lines.length * MAX_FIGURE_LINE_SHARE) return undefined;
  const lone = levels.filter((level) => level.count === 1).length;
  if (lone > lines.length * MAX_LONE_INDENT_SHARE) return undefined;
  const words = median(lines.map((line) => line.text.trim().split(/\s+/u).length));
  if (words > MAX_ENTRY_MEDIAN_WORDS) return undefined;
  // Justified prose fills its measure; entries end where their words end
  // (a contents line reaching its page number does not count).
  const right = Math.max(...lines.map((line) => line.x + line.width));
  const full = lines.filter(
    (line) => line.x + line.width >= right - em * FULL_LINE_SLACK_EM && !/\p{N}\p{L}?$/u.test(line.text.trim()),
  ).length;
  if (full > lines.length * MAX_FULL_LINE_SHARE) return undefined;
  const unit = levels[1].offset;
  if (unit < em * INDENT_TOLERANCE_EM * 2) return undefined;
  if (!onIndentSteps(levels, unit)) return undefined;
  if (opensParagraphs(lines, levelOf)) return undefined;
  const shared = levels.filter((level) => level.count >= MIN_LINES_PER_LEVEL).length;
  if (shared < MIN_ENTRY_LEVELS && !isShortEntryList(lines, levelOf)) return undefined;
  return levelOf.map((level) => depthOf(levels[level].offset, unit));
}

/** A value (`8k`, `(810)`, `12.4%`) or a mark (`O/S`, `√`) rather than words. */
function isFigureLine(line: LayoutLine): boolean {
  const text = line.text.replace(/\s/gu, '');
  if (text.length <= MAX_MARK_LINE_CHARS) return true;
  return /\p{N}/u.test(text) && (text.match(/\p{L}/gu)?.length ?? 0) <= 2;
}

/**
 * The line before an indented one ends a sentence: the indent opens a
 * paragraph (a footnote, a numbered note), as entries and their subentries
 * never end in a full stop.
 */
function opensParagraphs(lines: readonly LayoutLine[], levelOf: readonly number[]): boolean {
  let indented = 0;
  let afterSentence = 0;
  for (let index = 1; index < lines.length; index++) {
    if (levelOf[index] <= levelOf[index - 1]) continue;
    indented++;
    if (SENTENCE_END_RE.test(lines[index - 1].text.trim())) afterSentence++;
  }
  return indented > 0 && afterSentence * 2 >= indented;
}

/**
 * Every indent is a whole number of steps of the smallest one, as a style's
 * indents are; text that starts where a missing glyph or a centred line
 * happens to leave it is not.
 */
function onIndentSteps(levels: readonly Level[], unit: number): boolean {
  return levels.every((level) => {
    const steps = level.offset / unit;
    return Math.abs(steps - Math.round(steps)) <= INDENT_STEP_TOLERANCE;
  });
}

/**
 * Entries at one level of indent under flush ones (an index column holding
 * no sub-subentries) look like paragraphs with first-line indents, or a
 * hanging-indent bibliography, unless the lines are short and indented
 * lines follow each other, as a paragraph's first line never does.
 */
function isShortEntryList(lines: readonly LayoutLine[], levelOf: readonly number[]): boolean {
  const words = median(lines.map((line) => line.text.trim().split(/\s+/u).length));
  if (words > MAX_SHORT_ENTRY_MEDIAN_WORDS) return false;
  let consecutive = 0;
  for (let index = 1; index < lines.length; index++) {
    if (levelOf[index] > 0 && levelOf[index - 1] > 0) consecutive++;
  }
  return consecutive >= MIN_CONSECUTIVE_INDENTED;
}

/**
 * Items set one per block (slides space their bullets apart): a run of
 * consecutive blocks that each start with a marker, in one column, at two
 * or more indents.
 */
function itemBlockDepths(blocks: readonly LayoutBlock[]): Map<LayoutBlock, number> {
  const out = new Map<LayoutBlock, number>();
  let run: LayoutBlock[] = [];
  const flush = () => {
    if (run.length >= 2) assignRunDepths(run, out);
    run = [];
  };
  for (const block of blocks) {
    const first = block.lines[0];
    if (!isIndentable(block) || !first || !startsWithListMarker(first.text)) {
      flush();
      continue;
    }
    const previous = run[run.length - 1];
    if (previous && !continuesRun(previous, block, run)) flush();
    run.push(block);
  }
  flush();
  return out;
}

function continuesRun(previous: LayoutBlock, block: LayoutBlock, run: readonly LayoutBlock[]): boolean {
  const lineHeight = Math.max(previous.lines[0]?.height ?? previous.height, 1);
  const gap = block.y - (previous.y + previous.height);
  if (gap < -lineHeight * 0.3 || gap > lineHeight * ITEM_RUN_MAX_GAP_LINES) return false;
  const left = Math.min(...run.map((item) => item.x));
  const right = Math.max(...run.map((item) => item.x + item.width));
  return block.x < right && block.x + block.width > left;
}

function assignRunDepths(run: readonly LayoutBlock[], out: Map<LayoutBlock, number>): void {
  const { tolerance, em } = toleranceFor(run.map((block) => block.lines[0]));
  const base = Math.min(...run.map((block) => block.x));
  const offsets = run.map((block) => block.lines[0].x - base);
  if (Math.max(...offsets) > em * MAX_INDENT_EM) return;
  const { levels, levelOf } = clusterOffsets(offsets, tolerance);
  if (levels.length < 2) return;
  const unit = Math.min(...levels.slice(1).map((level, index) => level.offset - levels[index].offset));
  if (unit < em * INDENT_TOLERANCE_EM * 2 || !onIndentSteps(levels, unit)) return;
  const depths = run.map((_, index) => depthOf(levels[levelOf[index]].offset, unit));
  // A nested item follows its parent: the run opens at the outer level and
  // goes in one level at a time. Items indented under a paragraph and then
  // followed by outer ones (a parties list before numbered clauses) are not
  // one list.
  if (depths[0] !== 0) return;
  if (depths.some((depth, index) => index > 0 && depth > depths[index - 1] + 1)) return;
  run.forEach((block, index) => {
    if (depths[index] > 0) out.set(block, depths[index]);
  });
}
