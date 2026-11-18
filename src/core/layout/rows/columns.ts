import type { LayoutLine } from '../../../types/index.js';
import { median } from '../geometry.js';
import { emOf, type Interval, type Row, type RowRun } from './shared.js';

const KIND_LENGTH_RATIO = 1.6;
const KIND_SHARE_TOLERANCE = 0.3;
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
  // Glyphs count here: a glyph chart's halves repeat glyph, name, glyph, name.
  const allBands = columnBands(run.rows.flatMap((row) => row.cells));
  if (alike || isTwinList(run, allBands) || isIndexColumns(cells, bands)) return false;
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
  if (bands.length < 4) return false;
  const columns = bands.map((band) => run.rows.flatMap((row) => row.cells.filter((cell) => inBand(cell, band))));
  const kinds = columns.map((cells) =>
    cells.filter((cell) => isNumericText(cell.text)).length > cells.length / 2 ? 'number' : 'text',
  );
  const profiles = columns.map(profile);
  for (let period = 2; period <= bands.length / 2; period++) {
    if (bands.length % period !== 0 || !kinds.slice(0, period).includes('text')) continue;
    const repeats = (i: number) => kinds[i] === kinds[i - period];
    // A page-long run repeating the same kinds of column is two lists; a
    // short one needs the repeated columns to hold the same kind of entry too.
    const same = (i: number) =>
      repeats(i) && (run.rows.length >= TWIN_LIST_MIN_ROWS || isSameKind(profiles[i], profiles[i - period]));
    if (kinds.every((_, i) => i < period || same(i))) return true;
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

function entryIn(row: Row, band: Interval): LayoutLine | undefined {
  const cells = row.cells.filter((cell) => inBand(cell, band));
  const [first] = cells;
  if (!first) return undefined;
  if (cells.length === 1) return first;
  const last = cells[cells.length - 1];
  return {
    ...first,
    text: cells.map((cell) => cell.text.trim()).join(' '),
    width: last.x + last.width - first.x,
  };
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
  // Each side is the row's whole entry in that column: a glyph and its name
  // set as two runs are one entry.
  for (const row of rows) {
    const left = entryIn(row, a);
    const right = entryIn(row, b);
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
  // A label and its value almost never start alike; text lists side by side often do.
  const textual = pairs.filter(([left, right]) => !isNumericText(left.text) && !isNumericText(right.text));
  const parallel = textual.filter(([left, right]) => leadingToken(left.text) === leadingToken(right.text));
  if (parallel.length >= Math.max(MIN_PARALLEL_ROWS, pairs.length * PARALLEL_ROW_SHARE)) return true;
  // Columns of bare values (`46%` beside `18%`, years beside figures) are a
  // table's value columns, whatever their likeness.
  const values = pairs.filter(([left, right]) => !/\p{L}/u.test(left.text) && !/\p{L}/u.test(right.text));
  if (values.length > pairs.length / 2) return false;
  return isSameKind(profile(pairs.map(([left]) => left)), profile(pairs.map(([, right]) => right)));
}

/** What a column's cells are like, taken over the column as a whole. */
interface ColumnProfile {
  numberShare: number;
  labelShare: number;
  words: number;
  ems: number;
  fontSize: number;
  lead: string;
}

function profile(cells: readonly LayoutLine[]): ColumnProfile {
  const share = (test: (text: string) => boolean) =>
    cells.filter((cell) => test(cell.text.trim())).length / Math.max(cells.length, 1);
  const leads = new Map<string, number>();
  for (const cell of cells) {
    const lead = leadingClass(cell.text);
    leads.set(lead, (leads.get(lead) ?? 0) + 1);
  }
  return {
    numberShare: share(isNumericText),
    labelShare: share((text) => /[:：]$/u.test(text)),
    words: median(cells.map((cell) => Math.max(1, withoutLeadingGlyph(cell.text).split(/\s+/u).length))),
    // Width scaled to the text after a leading glyph, which one side may carry as a run of its own.
    ems: median(
      cells.map((cell) => {
        const text = cell.text.trim();
        return ((cell.width / emOf(cell)) * withoutLeadingGlyph(text).length) / Math.max(text.length, 1);
      }),
    ),
    fontSize: median(cells.map(emOf)),
    lead: [...leads].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '',
  };
}

/**
 * Two columns hold the same kind of entry when nothing tells them apart:
 * neither is the numbers or the labels of the other, they run to about the
 * same length in the same type, and their entries start alike (a capital,
 * a digit, a bullet). A label and its value, a code and its statement, an
 * item and its price differ on at least one count; two lists of names, two
 * columns of a glyph chart or a topic list do not.
 */
function isSameKind(a: ColumnProfile, b: ColumnProfile): boolean {
  const ratio = (x: number, y: number) => Math.max(x, y) / Math.max(Math.min(x, y), 0.001);
  return (
    Math.abs(a.numberShare - b.numberShare) <= KIND_SHARE_TOLERANCE &&
    Math.abs(a.labelShare - b.labelShare) <= KIND_SHARE_TOLERANCE &&
    ratio(a.words, b.words) <= KIND_LENGTH_RATIO &&
    ratio(a.ems, b.ems) <= KIND_LENGTH_RATIO &&
    ratio(a.fontSize, b.fontSize) <= ALIKE_FONT_RATIO &&
    a.lead === b.lead
  );
}

/** A glyph, bullet or item number set before an entry's words marks the entry; the words are what it is. */
function withoutLeadingGlyph(text: string): string {
  return text.trim().replace(/^[^\p{L}\s]+\s+(?=\S)/u, '');
}

function leadingClass(text: string): string {
  const first = [...withoutLeadingGlyph(text)][0] ?? '';
  if (/\p{N}/u.test(first)) return 'digit';
  if (/\p{Lu}/u.test(first)) return 'upper';
  if (/\p{Ll}/u.test(first)) return 'lower';
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(first)) return 'cjk';
  return /\p{L}/u.test(first) ? 'letter' : 'symbol';
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
  if (/^\d+\s+\S*\p{L}/u.test(text.trim())) return true;
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
