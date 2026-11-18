import type { LayoutLine } from '../../../types/index.js';
import { emOf, type Interval, type Row, type RowRun } from './shared.js';

const ALIKE_WIDTH_RATIO = 1.35;
const ALIKE_FONT_RATIO = 1.2;
const ALIKE_ROW_SHARE = 0.6;
const PARALLEL_ROW_SHARE = 0.25;
const MIN_PARALLEL_ROWS = 2;
/** A run this long whose two halves repeat one column structure is two lists. */
const TWIN_LIST_MIN_ROWS = 6;
const MIN_RUN_ON_CELLS = 2;
const MIN_RUN_ON_SHARE = 1 / 3;
const LETTER_RE = /\p{L}/gu;
const DIGIT_RE = /\p{N}/gu;

/**
 * Whether a run is rows of one table or list, not text columns that share
 * baselines. Its columns are x bands no cell crosses. Two lists set side by
 * side (an index, two bullet lists, two signature blocks, an author grid)
 * hold the same kind of cell in neighbouring columns, and a passage wrapped
 * beside another (a court caption) runs on from one row to the next; both
 * are read column by column, as before.
 */
export function hasRowStructure(run: RowRun): boolean {
  // A note mark set apart after a name (`*`, `†`) is no column of its own.
  const cells = run.rows.flatMap((row) => row.cells).filter((cell) => /[\p{L}\p{N}]/u.test(cell.text));
  const bands = columnBands(cells);
  if (bands.length < 2) return false;
  let alike = true;
  for (let i = 1; i < bands.length && alike; i++) alike = areAlikeColumns(run.rows, bands[i - 1], bands[i]);
  if (alike || isTwinList(run, bands) || isIndexColumns(cells, bands)) return false;
  const bandCells = bands.map((band) => cells.filter((cell) => inBand(cell, band)));
  if (bandCells.some(isFlowingText)) return false;
  // Sentences broken off at the line's end on both sides of a gap: two columns of prose.
  return bandCells.filter((members) => members.some((cell) => isProseFragment(cell.text))).length < 2;
}

const FUNCTION_WORD_END_RE =
  /(?:^|\s)(?:a|an|and|as|at|be|by|for|from|in|is|of|on|or|than|that|the|to|was|were|with)$/iu;

/**
 * Four words or more from the middle of a sentence: going on from the line
 * above (starting in lower case) or broken off before its end (`… alimony
 * or`, `… and check the`, a trailing comma).
 */
export function isProseFragment(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.split(/\s+/u).length < 4) return false;
  return /^\p{Ll}/u.test(trimmed) || trimmed.endsWith(',') || FUNCTION_WORD_END_RE.test(trimmed);
}

/**
 * The same columns twice over or more, down much of the page: an index, a
 * glossary or a numbered topic list set in columns (`311 Power of attorney`
 * beside `503 Deductible taxes`), whose parts each read top to bottom. Two
 * key/value pairs to a row on a form repeat the structure too, but for a
 * few rows only.
 */
function isTwinList(run: RowRun, bands: readonly Interval[]): boolean {
  if (run.rows.length < TWIN_LIST_MIN_ROWS || bands.length < 4) return false;
  const kinds = bands.map((band) => {
    const cells = run.rows.flatMap((row) => row.cells.filter((cell) => inBand(cell, band)));
    return cells.filter((cell) => isNumericText(cell.text)).length > cells.length / 2 ? 'number' : 'text';
  });
  for (let period = 2; period <= bands.length / 2; period++) {
    if (bands.length % period !== 0 || !kinds.slice(0, period).includes('text')) continue;
    if (kinds.every((kind, i) => i < period || kind === kinds[i - period])) return true;
  }
  return false;
}

function columnBands(cells: readonly LayoutLine[]): Interval[] {
  const bands: Interval[] = [];
  for (const cell of [...cells].sort((a, b) => a.x - b.x)) {
    const last = bands.at(-1);
    if (last && cell.x < last.right) last.right = Math.max(last.right, cell.x + cell.width);
    else bands.push({ left: cell.x, right: cell.x + cell.width });
  }
  return bands;
}

function inBand(cell: LayoutLine, band: Interval): boolean {
  return cell.x < band.right && cell.x + cell.width > band.left;
}

/**
 * Two neighbouring columns of one list set side by side: the cells of a row
 * begin alike (`• Audio preamplifiers` beside `• Low offset voltage`,
 * `Name:` beside `Name:` in two signature blocks), or are text of about the
 * same width in most rows (names beside names). A label and its value, a
 * code and its statement, an item and its price differ on both counts.
 */
function areAlikeColumns(rows: readonly Row[], a: Interval, b: Interval): boolean {
  const pairs: [LayoutLine, LayoutLine][] = [];
  for (const row of rows) {
    const left = row.cells.filter((cell) => inBand(cell, a)).at(-1);
    const right = row.cells.find((cell) => inBand(cell, b));
    if (left && right) pairs.push([left, right]);
  }
  if (pairs.length === 0) return false;
  // Entries that each carry their own number: an index's `Residency 13` beside
  // `worksheet 38`, a topic list's `311 Power of attorney` beside `503` (its
  // title set apart).
  const numbered = pairs.filter(
    ([left, right]) => isNumberedEntry(left.text) && (isNumberedEntry(right.text) || /^\d+$/u.test(right.text.trim())),
  );
  if (numbered.length >= pairs.length * ALIKE_ROW_SHARE) return true;
  const textual = pairs.filter(([left, right]) => !isNumericText(left.text) && !isNumericText(right.text));
  if (textual.length <= pairs.length / 2) return false;
  // A label and its value almost never start alike; lists side by side often do.
  const parallel = pairs.filter(([left, right]) => leadingToken(left.text) === leadingToken(right.text));
  if (parallel.length >= Math.max(MIN_PARALLEL_ROWS, pairs.length * PARALLEL_ROW_SHARE)) return true;
  const sameWidth = textual.filter(
    ([left, right]) =>
      Math.max(left.width, right.width) <= Math.min(left.width, right.width) * ALIKE_WIDTH_RATIO &&
      Math.max(emOf(left), emOf(right)) <= Math.min(emOf(left), emOf(right)) * ALIKE_FONT_RATIO,
  );
  return sameWidth.length >= pairs.length * ALIKE_ROW_SHARE;
}

/**
 * Index columns: in two columns or more, most cells are an entry that ends
 * in its page numbers (`Tax help 83`, `Tuition program earnings 93, 112`).
 */
function isIndexColumns(cells: readonly LayoutLine[], bands: readonly Interval[]): boolean {
  const members = bands.map((band) => cells.filter((cell) => inBand(cell, band)));
  const mostly = (list: readonly LayoutLine[], test: (text: string) => boolean) =>
    list.filter((cell) => test(cell.text.trim())).length >= list.length / 2;
  const isText = (text: string) => !isNumericText(text) && /\p{L}/u.test(text);
  let indexBands = 0;
  for (let i = 0; i < members.length; i++) {
    if (mostly(members[i], isNumberedEntry)) indexBands++;
    // Item numbers set apart from their titles (`551` | `Standard deduction`).
    else if (mostly(members[i], (text) => /^\d+$/u.test(text)) && members[i + 1] && mostly(members[i + 1], isText)) {
      indexBands++;
    }
  }
  return indexBands >= 2;
}

function isNumberedEntry(text: string): boolean {
  // `Tax help 83`, or a numbered item such as `311 Power of attorney information`.
  if (/^\d+\s+\p{L}/u.test(text.trim())) return true;
  return /\p{L}.*\s\d+(?:[–-]\d+)?(?:,\s*\d+(?:[–-]\d+)?)*$/u.test(text.trim());
}

function isNumericText(text: string): boolean {
  const digits = text.match(DIGIT_RE)?.length ?? 0;
  const letters = text.match(LETTER_RE)?.length ?? 0;
  return digits > 0 && digits >= letters;
}

/** The first word of a cell, or its bullet: what a list's entries start with. */
function leadingToken(text: string): string {
  const trimmed = text.trim();
  const symbol = /^[^\p{L}\p{N}\s]/u.exec(trimmed);
  if (symbol) return symbol[0];
  return (/^[^\s:：]+[:：]?/u.exec(trimmed)?.[0] ?? '').toLowerCase();
}

/**
 * A column whose cells run on from one row to the next (`MARLOWE BAKERY
 * COOPERATIVE, a` / `Calisota cooperative corporation,` / `Plaintiff,`, or
 * an index entry's page range broken at its dash) is a passage wrapped
 * beside another, not a column of separate entries.
 */
function isFlowingText(cells: readonly LayoutLine[]): boolean {
  const sorted = [...cells].sort((a, b) => a.y - b.y);
  let runOn = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].text.trim();
    const next = sorted[i].text.trim();
    // Words broken off at a comma or a dash, or ending and going on in lower
    // case; a lone dash placeholder or a unit such as `kg` over `mm` is neither.
    if (/\p{L}.*[,;\-–—]$/u.test(prev) || (/\s\S*\p{Ll}$/u.test(prev) && /^\p{Ll}/u.test(next))) runOn++;
  }
  return runOn >= MIN_RUN_ON_CELLS && runOn >= (sorted.length - 1) * MIN_RUN_ON_SHARE;
}
