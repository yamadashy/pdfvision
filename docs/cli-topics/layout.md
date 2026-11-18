---
name: layout
description: The --layout block / line / table shapes, multi-column reading order, repeated chrome, heading levels, and the --geometry span contract. Use when reconstructing structure or reading order rather than reading flat text.
---

# Layout and span geometry

Reference for `-f json`, `-f xml`, and `-f toon` consumers.

## Layout (`--layout`)

```ts
interface PageLayout {
  blocks: LayoutBlock[];     // in approximate reading order (multi-column aware)
  tables?: LayoutTable[];    // row-major hints for aligned numeric tables
}

interface LayoutBlock {
  text: string;              // line texts joined with \n
  x: number; y: number; width: number; height: number;
  lines: LayoutLine[];
  writingMode?: 'vertical';  // present for detected CJK top-to-bottom glyph stacks, including body text
  role?: 'heading';          // heuristic heading classification — see `level`
  level?: 1 | 2 | 3;         // present iff role === 'heading': 1=title, 2=section, 3=subsection candidate
  repeated?: boolean;        // chrome (running header / footer / page number / watermark), usually detected across pages
}

interface LayoutLine {
  text: string;
  x: number; y: number; width: number; height: number;
  fontSize: number;          // most common fontSize across the spans in this line
  writingMode?: 'vertical';  // present for top-to-bottom CJK glyph stacks, including body text
}

interface LayoutTable {
  x: number; y: number; width: number; height: number;
  rowCount: number;
  columnCount: number;       // geometric columns the cells were assigned to
  rows: LayoutTableRow[];
}

interface LayoutTableRow {
  y: number; height: number;
  cells: LayoutTableCell[];  // sorted left-to-right; empty columns have no cell
}

interface LayoutTableCell {
  text: string;
  x: number; y: number; width: number; height: number;
  column?: number;           // 0-based column; gaps between consecutive values are empty columns
  columnSpan?: number;       // columns covered from `column`; omitted when 1
}
```

`--layout` adds an alternate reading-order view with geometry and role hints; it never replaces native text. In JSON/XML/TOON, `pages[].layout` appears only with `--layout` while `pages[].text` stays the unchanged pdf.js stream, so blocks and raw text can be diffed against each other. Markdown is the exception: it always runs the layout pass internally, so its per-page body is the layout-rebuilt reading order whenever any block exists and falls back to `pages[].text` only when there is none; `--layout` there gates only the structural extras — the per-page layout table sections and the Overview `Blocks` / `Tables` columns. Note there is no `pages[].layout.lines` — lines live under `blocks[].lines`.

Multi-column reading order: `blocks[]` reads top-to-bottom of the left column before the right column. A line never runs across a column gutter that the page as a whole shows: a vertical strip that stays clear line after line while the next column's lines keep starting at the same x. That holds however narrow the gutter (dense three-column registers use about 12pt, no wider than their widest word spaces) and when the columns sit on their own baselines, so a line no longer absorbs the first word or the short last line of the neighbouring column: the text on each side of such a gutter is grouped into lines separately. A lone bullet or icon set larger than the text does not set a line's height, so it neither pulls the next line into its own nor ends up on a line by itself. Cell splitting for tables inside a column reads the page-wide row as before, and an aligned-text table whose every column boundary is one of these prose gutters (the text columns read across) is not reported. Text rotated a quarter turn in the page margin, such as print-production lines and arXiv stamps, is read after the page body instead of inside a paragraph, and no longer splits a column's indented first lines into a column of their own. The layout pass also treats recurring narrow gutters and recurring right-side panel starts as column/table breaks, including landscape pages where a numeric side panel means the main body columns cover only part of the physical page width. It preserves tight Latin and Arabic word spaces when pdf.js emits words as separate spans, keeps short display-spaced CJK title rows on one line (for example `科 学`), keeps indented singleton lines attached to the nearest surviving column instead of turning them into page-wide separators, avoids letting tall drop caps absorb following paragraph lines, keeps narrow standalone numeric page labels separate from surrounding prose, and moves small bottom permission/footer notes after the main two-column body. It also detects body-sized one-glyph CJK vertical runs, compact display CJK glyph stacks, and tall CJK spans that are visually vertical, keeps tatechuyoko digit groups inline in the same vertical column when geometry and source order agree, joins each column top-to-bottom, groups adjacent body columns right-to-left with `\n` between columns, and marks those blocks/lines with `writingMode: "vertical"` so consumers do not mistake them for horizontal rows. Furigana/ruby attaches to layout text as `base《ruby》` when the adjacent vertical ruby column or above-line horizontal kana run maps to an unambiguous CJK base range; otherwise it remains excluded rather than becoming standalone layout noise. Short medium-size note-reference marks in the right gutter of a vertical body column are also excluded rather than becoming standalone layout blocks. `pages[].text` applies the same body-sized vertical-run detector only as a stream-order join: it joins a detected column when the source item order already matches top-to-bottom geometry, and falls back per run rather than reordering. Standalone level-1 / level-2 headings act as column separators; level-3 candidates stay inside their column so subsection breaks don't scramble reading order. Block clustering is still heuristic — table cells may merge into a single block.

Painted structure groups text in `blocks[]`. A framed or tinted box, the band between matching horizontal rules (a pull quote, a booktabs table), or a vector figure with the short labels hugging it (axis ticks, legend, bar values, category names) is read as one unit wherever it falls: a boxed warning's body follows its heading instead of the page footer, a sidebar or pull quote is one item of the column it sits in, and a footnote under a ruled table stays at the page foot. Inside a unit, prose keeps the page's own rules and short labels read row by row (a ruled or gridded table row by row, not column by column) or, over vertical bars, bar by bar; a panel holding several charts reads chart by chart. Chart labels kept together are still not paired with their bars by the text — `vector_chart_labels` names the region to render. A column interrupted by a photo, pull quote or sidebar is read to its end before the next column: text run around an inset (a narrower band inside the column) is read in its place, a stray word or jump line inside a column's band joins that column, and a justified line's last word cut off by wide word spaces is put back on its line. A full-width block cuts only the columns it crosses, so a sidebar beside a full-width abstract is read after the abstract as a whole, and lines of two side-by-side prose runs that arrive alternately in the stream are rebuilt into one block per run.

Repeated chrome detection runs after block clustering. When only one line inside a multi-line edge block is repeated page chrome, such as a slide footer glued to nearby body text, pdfvision splits that line into its own `repeated: true` block and leaves the adjacent body lines non-repeated. The exact field exists in JSON/TOON; XML uses `<block repeated="true">`, and Markdown omits the block only with `--strip-repeated`. Narrow vertical blocks at the left or right page edge also need corroboration before they become chrome: sentence-like text containing `。` or `、`, and vertical edge text longer than the short chrome ceiling, is never marked as `repeated`; in multi-page extraction the same normalized short edge text must recur on at least two selected pages; in single-page extraction only conservative short markers such as `第`, `章`, digits, or `第1章`-style labels can be marked. Short form control labels such as `Yes.`, `No.`, and `STOP` are not treated as page chrome even when they recur at the page edge in decision-tree instructions.

`tables[]` is a conservative row-major hint for aligned numeric tables. It appears when multiple rows have several cells and at least two numeric cells, a common shape in financial statements and government statistical tables; compact two-column year/value tables are included when enough regular rows make the table shape clear. Treat it as a visual-structure aid, not a complete table parser: merged headers, continuation labels, and footnotes can still require `--render` / `--render-region`, but `rows[].cells[]` preserves the row/cell order that `blocks[]` often loses when a table is split into label and numeric columns. Dense recurring numeric gutters are split before table construction so adjacent values do not collapse into one cell when the visual grid is regular, including compact side tables with comma-formatted values or ratio cells such as `13.0x`. Dense rows with three or more numeric spans can also split narrow same-row numeric gutters, including financial statement rows where a trailing currency symbol visually marks the next value column. Wide tables with three or more recurring numeric columns can also keep short leading header rows and sparse first rows directly above the first fully populated row, including scientific notation cells such as `1.0 · 10^20` and score/percentile cells such as `298 / 400 (~90th)`, so the table bbox starts at the human-visible table top. Decorative dotted rule text from publisher table borders is ignored while grouping rows, so a tall dotted border does not absorb all cells into one row. Nearby label-only continuation rows are folded into the label of the row they sit clearly closer to — the row above when the label wraps under its first line (an invoice item whose name runs onto a second line), otherwise the following row, as statements set a label that wraps above its values; when the spacing cannot tell and the row above ends in a full-width label line, `layout_table_uncertain` says so. A caption such as `Table 1 (continued)` is never taken as a table row or folded into a label. A header row set as widely spaced words (`Depot   Region   Planned`) reads as one line in the page text but is split back into one cell per word for the table, so it becomes a header row with one cell per column instead of being glued onto the first label. Header rows that only the aligned-text or single-row pass recognises — a units line such as `百万円 | % | 百万円 | %` — are kept above a table found from its numbers. Irregular row spacing is still accepted when labelled rows have recurring numeric columns, or when nearly every row starts with a label in one label column and the rows' value lines keep a regular pitch (a group heading or a wrapped label moves a row's top, not its values), so financial tables with multi-line labels, subtotal gaps, and long prose-like labels before recurring year columns remain visible instead of being trimmed as adjacent prose. Detached currency symbols are folded into the following numeric cell when their row position makes the relationship clear. Each cell carries a 0-based `column`. Columns come from the body rows: cells whose horizontal extents overlap across rows share a column, which holds for right-aligned numbers, left-aligned labels, and centered values alike, so a row with an empty cell keeps its later values in their own columns instead of shifting them left — read a value's column from `column`, never from its position in `cells[]`. Header rows above the body, merged values, and single-cell rows are placed on the columns their text physically overlaps, with `columnSpan` when that is more than one. A group header therefore spans its visual group only where its text reaches over every column of it; a centered header narrower than its group gets just the columns under its text (Apple's `Three Months Ended` over three columns can land on the middle one with no span), so render the region when the group's width matters. A header digit that overlaps no value (centered over right-aligned values too narrow to reach it) joins the clearly nearest column. Two cells can share a column when one visual cell was extracted as two lines, such as a header and its `(a)` footnote marker. Dash-like placeholders (`—`, `–`, `-`, `n/a`) count as values, so a row such as `Proceeds from issuance of term debt | — | 5,228` stays in the table, and a row that is placeholders in every column (`Restructuring charges | — | —`) stays in it when it sits between two rows of the table with each placeholder under their values, or in the run of such rows directly above the first numbered row (on its own such a row is no evidence of a table). Values carrying significance stars or daggers (`0.412***`), Japanese negatives written with a triangle (`△1,166`, `▲42`), and values behind a note marker (`※7 26,269`) count as values too. Rows that continue the grid stay in the table: a sparser row between two table rows whose cells sit in its columns (a group heading such as `4 Test & launch`, a task whose dates are still empty), a line wrapped inside one of their cells (joined to the cell it sits clearly closer to), and rows right after the table at its row pitch whose word values sit one per value column (`County fixed effects | Yes | Yes | No`); values with a lettered footnote marker (`(10,246) (b)`) and a currency symbol that belongs to the next column (`$ 29,610 $`) are split at the column boundary. Label-only rows inside the table's vertical span that sit in the label column — group headers such as `Net sales:` or `Earnings per share:` — are kept as single-cell rows, so repeated sub-labels (`Products`, `Basic`) stay distinguishable. When the geometry still does not resolve into one consistent grid, the page carries a `layout_table_uncertain` warning naming the table and its bbox (`pdfvision docs warnings layout_table_uncertain`); render that region before trusting the table.

### Heading levels (`role === 'heading'`)

`role` is set when a block is classified as a heading; `level` ranks the visual hierarchy:

- `level: 1` — paper / page title (fontSize ≥ 1.40× body median, or top-of-page document title in the ≥ 1.25× band).
- `level: 2` — section heading (≥ 1.25× under the legacy rule, or ≥ 1.15× with structural support: short and either standalone or locally larger than neighbours). Catches the typical LaTeX 12pt-over-10pt section style.
- `level: 3` — subsection candidate (≥ 1.08×, single short line, locally larger than same-column neighbours). Lower confidence; the kind of heading ResNet's `3.1.` and `3.4.` use.

Pick a slice that matches the use case:
- Title-only: `role === 'heading' && level === 1`.
- High precision (sections only): `role === 'heading' && level <= 2`.
- Recall-oriented (include subsections): all `role === 'heading'`.

Repeated chrome wins over heading classification. When a heading-shaped running header/footer is marked `repeated: true`, pdfvision drops `role`, `level`, and `roleConfidence` so repeated page chrome does not appear in heading lists. When chunking body content, still filter `repeated: true` first.
## Spans (`--geometry`)

```ts
interface TextSpan {
  text: string;              // NFKC-normalized and C0-cleaned by default (disable with --no-normalize)
  x: number; y: number;      // displayed (post-/Rotate) page frame, top-left origin; stored frame under rotated_page_read_unrotated
  width: number; height: number;
  fontSize: number;          // largest finite non-zero text-matrix scale; otherwise reported/effective item height
  fontName?: string;         // stable page-local alias e.g. "font1"
}
```

Each public span corresponds to one retained positioned pdf.js text item, whose `text` may be one character, a word, or a longer string. Adjacent items are not merged or split in public `spans[]`, except by the text corrections described under `text` in `pdfvision docs schema`: an overdrawn copy is dropped or trimmed to its new part, a justified CJK line set one glyph per item becomes one span, and a superscript or subscript joins the span it is attached to (`10^19`, its bbox widened to cover the script); layout/search may reconstruct lines or slice match boxes without changing that granularity. The rounded bbox is the item's aggregate axis-aligned envelope, not individual glyph outlines. Deduplication runs before normalization. Its key uses raw `str`, raw `fontName` (or empty), width, effective height, and every transform component rounded to three decimals (`no-transform` when absent). Effective height is a positive reported height, otherwise the largest finite non-zero text-matrix scale, otherwise zero. `fontSize` uses that largest usable matrix scale first and falls back to the reported/effective item height only when both matrix scales are unusable. Matching keys keep the first item and OR `hasEOL`; the same raw text at different transforms remains distinct, while different raw items may normalize to identical public text. Items without a transform, likely prepress-production text, whitespace-only items, and items empty after normalization are omitted. `fontName` is a stable page-local alias. Geometry can substantially enlarge output.
