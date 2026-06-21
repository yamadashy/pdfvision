/**
 * One text-positioned glyph run as emitted by pdf.js. Coordinates are in
 * PDF points and use a top-down origin (0, 0) at the top-left of the page,
 * y increases downward — matching the rendered PNG convention so callers
 * can overlay spans on `image` directly without flipping.
 */
export interface TextSpan {
  /** Glyph run text. Already NFKC-normalized when `normalize` is on. */
  text: string;
  /** Top-left x in PDF points (origin: page top-left). */
  x: number;
  /** Top-left y in PDF points (origin: page top-left, y grows downward). */
  y: number;
  /** Glyph run width in PDF points. */
  width: number;
  /** Glyph run height in PDF points. Approximated from the text matrix when pdf.js reports 0. */
  height: number;
  /** Approximate font size in PDF points (max of horizontal and vertical text-matrix scales). */
  fontSize: number;
  /** pdf.js internal font name (e.g. `g_d0_f1`). Useful for grouping items by font. */
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
   */
  role?: 'heading';
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
}

export interface LayoutTable {
  x: number;
  y: number;
  width: number;
  height: number;
  rowCount: number;
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
}
