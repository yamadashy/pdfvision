/**
 * One retained positioned text item from pdf.js. An item may contain a
 * character, word, or longer string; its bbox covers the whole item rather
 * than individual glyph outlines, and adjacent items are not merged or split
 * in public spans. The rounded aggregate axis-aligned bbox uses raw
 * page-view units in the displayed (post-/Rotate) page frame (the stored
 * frame on a page flagged `rotated_page_read_unrotated`), with `(0, 0)`
 * at the top-left and y increasing downward. Multiply by `pages[].userUnit`
 * (or 1 when omitted) for physical points. These are page coordinates, not
 * PNG pixels; rendered pixels equal raw lengths × UserUnit × render scale.
 */
export interface TextSpan {
  /** Text-item content. Already NFKC-normalized and C0-cleaned when `normalize` is on. */
  text: string;
  /** Top-left x in raw displayed (post-/Rotate) page-view units. */
  x: number;
  /** Top-left y in raw displayed (post-/Rotate) page-view units; y grows downward. */
  y: number;
  /** Rounded aggregate text-item width in raw page-view units. */
  width: number;
  /** Rounded aggregate height in raw page-view units; matrix-derived when pdf.js reports 0. */
  height: number;
  /**
   * Approximate font size in raw page-view units: the largest finite,
   * non-zero text-matrix scale, falling back to the reported/effective item
   * height when both matrix scales are unusable.
   */
  fontSize: number;
  /** Stable page-local font alias (e.g. `font1`). Useful for grouping items by font within a page. */
  fontName?: string;
}

/**
 * One visual line of text — a group of spans that share a baseline.
 * Text is reconstructed in the detected script direction for the line;
 * the bbox is the union of its spans' bboxes.
 */
export interface LayoutLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Most common fontSize across the spans in this line. */
  fontSize: number;
  /**
   * Visual writing direction for this reconstructed line. Omitted for the
   * default horizontal case to keep JSON compact; `vertical` marks CJK
   * glyph stacks that are meant to be read top-to-bottom.
   */
  writingMode?: 'vertical';
  /**
   * The margin line number printed on this line's baseline (pleading paper,
   * a bill, a manuscript in review mode). The number column itself is left
   * out of the text; see {@link PageLayout.lineNumbers}. Omitted for lines
   * that sit between two numbers or on a page without line numbers.
   */
  lineNumber?: number;
  /**
   * Indentation depth of a nested list or index line, relative to the
   * least indented line of its list: `1` for a subentry, `2` for a
   * sub-subentry. The text starts with two spaces per level. Omitted at
   * depth 0 and for ordinary paragraphs.
   */
  indent?: number;
}

/**
 * One semantic block — a group of consecutive lines that look like they
 * belong together (small vertical gap, similar font size). Block bbox is
 * the union of its lines' bboxes; `text` joins the line texts with `\n`.
 */
export interface LayoutBlock {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: LayoutLine[];
  /**
   * Visual writing direction for this reconstructed block. Omitted for
   * horizontal text; `vertical` means the block text was assembled from a
   * top-to-bottom CJK glyph stack rather than left-to-right baselines.
   */
  writingMode?: 'vertical';
  /**
   * Coarse semantic role. `'heading'` when the block's dominant fontSize
   * and surrounding shape look like a section anchor — see {@link level}
   * for the tiered confidence. Omitted otherwise; the absence of `role`
   * means body / regular text or insufficient evidence (not proof the
   * block is semantically non-heading). Caption / list / other roles are
   * not detected today; this field will gain values as heuristics are
   * added rather than be retroactively renamed.
   *
   * `'code'` marks a code block: monospaced rows set apart from the page's
   * proportional prose, whose tokens sit on one character grid. Its `text`
   * keeps the indentation the grid shows as leading spaces, one line per
   * row (blank rows included), and leaves out a line-number gutter, which
   * is reported in {@link codeLineNumbers}. Markdown fences it.
   */
  role?: 'heading' | 'code';
  /**
   * The first and last numbers of the line-number gutter dropped from a
   * `role: 'code'` block's text. Present only when such a gutter was found.
   */
  codeLineNumbers?: { first: number; last: number };
  /**
   * Approximate heading hierarchy, present only when `role === 'heading'`:
   *   - `1` — major title (fontSize ≥ 1.40× body median, or a
   *           top-of-page document title in the 1.25× band).
   *   - `2` — section heading (≥ 1.15× body, or ≥ 1.25× under the legacy
   *           rule). For the 1.15–1.25 band the block must also be short
   *           and either standalone or locally larger than its neighbours.
   *   - `3` — subsection candidate (≥ 1.08× body) — strict gates: short,
   *           single-line, standalone, locally larger than neighbours.
   * Consumers picking a high-precision slice should use `level <= 2`;
   * recall-oriented consumers can include `level === 3`. Title-only
   * extraction is `level === 1`.
   */
  level?: 1 | 2 | 3;
  /**
   * Heuristic confidence in the `role: 'heading'` classification on a
   * 0–1 scale (rounded to 2dp). Present only when `role === 'heading'`.
   *
   * The classifier is feature-based (font-size ratio, isShort, standalone,
   * locally-larger-than-neighbours), not statistical — `roleConfidence`
   * exposes how many of those features lined up rather than a calibrated
   * probability. Useful when an agent needs to threshold (e.g. only treat
   * `>= 0.7` as a section anchor) instead of relying on the discrete
   * `level` tier. The two fields are correlated by construction —
   * higher levels imply higher confidence — but the threshold value is
   * the agent's call.
   *
   * Rough bands (subject to tuning; do NOT hard-code exact values):
   *   - `>= 0.85` — clear title / top-of-section heading (level 1, or
   *     level 2 with every structural gate passing).
   *   - `0.60–0.85` — solid section heading with most gates passing.
   *   - `< 0.60` — recall-oriented level-3 subsection candidates.
   */
  roleConfidence?: number;
  /**
   * `true` when this block appears at the same vertical position with the
   * same text on enough other pages to look like a running header, footer,
   * page number, or watermark. Lets agents skip the chrome and focus on
   * the body. Detected post-clustering across the selected page set.
   * If only one line in a multi-line edge block is repeated chrome, pdfvision
   * can split that line into its own repeated block so adjacent body text
   * remains usable.
   * JSON and decoded TOON preserve this exact field. XML projects it as
   * `repeated="true"` on `<block>`; Markdown omits the block only when
   * `stripRepeated` is requested.
   *
   * When a block is flagged `repeated`, any heading classification is
   * dropped — a 2-character language marker that happens to sit at the
   * page-header fontSize was being classified as `level: 1` on every
   * page (eu-ai-act `EN` × 5 pages). The chrome marker wins; agents
   * after `headings` no longer see those duplicates.
   */
  repeated?: boolean;
}

/**
 * Page-level layout reconstructed from spans. `blocks` is ordered in
 * approximate reading order:
 *   - single-column pages come back top-to-bottom;
 *   - multi-column pages are detected when ≥ 2 narrow x-clusters of blocks
 *     each carry ≥ 2 entries, and reordered so each column reads top-down
 *     before the next column starts (left-to-right);
 *   - blocks wider than ~60% of the page are treated as spanning (e.g.
 *     headings, footers) and stay in their y position, acting as group
 *     separators between column runs.
 * See {@link buildLayout} / `reorderForColumns` in `core/layout/index.ts` for tuning.
 */
export interface PageLayout {
  blocks: LayoutBlock[];
  /**
   * Row-major table hints reconstructed from aligned layout lines. Present
   * only when pdfvision finds repeated rows with multiple numeric cells.
   * This is deliberately a hint, not a full PDF table model: merged cells
   * and multi-line headers can still require visual confirmation, but
   * detached currency symbols are folded into the following numeric cell
   * when their row position makes the relationship clear.
   */
  tables?: LayoutTable[];
  /**
   * Passages marked only by painted geometry: a side line (傍線) drawn
   * beside part of a vertical column, the way a 新旧対照表 marks what an
   * amendment changed. The text carries no marker of its own.
   */
  markedText?: LayoutMarkedText[];
  /**
   * The page's margin line numbers: a column of consecutive integers on the
   * line grid beside the text. The numbers are left out of the text and set
   * on the lines they number as {@link LayoutLine.lineNumber}.
   */
  lineNumbers?: { first: number; last: number };
}

export interface LayoutMarkedText {
  /** `side_line`: a thin vector rule just right of the glyphs of a vertical column. */
  mark: 'side_line';
  /** The marked glyphs in reading order; a passage running on into the next column is one entry. */
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutTable {
  x: number;
  y: number;
  width: number;
  height: number;
  rowCount: number;
  /**
   * Number of geometric columns the cells were assigned to (see
   * {@link LayoutTableCell.column}). A row can hold fewer cells than this
   * when some of its columns are empty.
   */
  columnCount: number;
  rows: LayoutTableRow[];
}

export interface LayoutTableRow {
  y: number;
  height: number;
  cells: LayoutTableCell[];
}

export interface LayoutTableCell {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * 0-based column the cell sits in, derived from the horizontal extent
   * the table's body cells share. Cells are listed left to right, so an
   * empty column shows up as a gap between consecutive `column` values,
   * never as a shifted value. Two cells can share a column when one line
   * was split (a header and its footnote marker).
   */
  column?: number;
  /**
   * Number of columns the cell covers, starting at `column`. Omitted when
   * it is 1. Grouped headers such as `Three Months Ended` above two year
   * columns, and merged value cells, cover more than one.
   */
  columnSpan?: number;
  /**
   * Number of rows one merged cell covers, set on each of those rows' copies
   * of it. Only tables read from a ruled grid carry it: a cell whose row
   * rules stop short of it (a parameter beside several condition rows) is
   * repeated in every row it spans so each row reads on its own; this says
   * the repeats are one cell. Omitted when 1.
   */
  rowSpan?: number;
}
