---
title: Layout and Warnings
description: Understand pdfvision layout reconstruction, visual regions, geometry, and page warnings.
---

# Layout and Warnings

PDF meaning often lives in placement: columns, headings, form labels, tables, footnotes, figures, links, annotations, and repeated headers or footers. `--layout` keeps those signals available instead of reducing the page to one text stream.

For AI agents, this matters because a plausible text stream can still be wrong. A two-column paper can be read across columns, a financial table can lose row boundaries, a form value can drift away from its label, or a footer can be mistaken for body text. pdfvision exposes layout and warning signals so the agent can notice those cases.

## Layout Reconstruction

```bash
pdfvision document.pdf --layout --format json
```

Layout output includes:

- `pages[].layout.blocks[].lines`: reconstructed text lines with geometry.
- `pages[].layout.blocks`: reading-order blocks with roles and bounding boxes. Lines are split at the column gutters the whole page shows, so narrow gutters between columns set on their own baselines do not fuse neighbouring columns, and a layout table that is only those text columns read across is not reported; text rotated in the page margin (print-production lines, arXiv stamps) is read after the page body. Framed or tinted boxes, bands between matching rules (pull quotes, ruled tables) and vector figures with their labels are read as one unit, so a boxed warning's body follows its heading and a ruled table reads row by row; a column interrupted by a photo, pull quote or sidebar is read to its end before the next column, and a sidebar beside a full-width abstract is read after it instead of line by line.
- `pages[].layout.tables`: numeric-table hints when rows and columns may be flattened in native text. Each cell carries its geometric `column` (plus `columnSpan` when a header or merged value's text overlaps several columns; a centered group header narrower than its group covers only the columns under its text, so render to confirm a group's width), so an empty cell stays an empty column instead of shifting later values left. Rows that continue the grid stay in the table — a row that is `—` in every column between two table rows, a group heading or a sparse row between them, word-valued rows such as `Yes | No` right after the last row — and a wrapped label or cell line joins the row it sits clearly closer to; a header row set as widely spaced words stays a row of its own instead of being glued onto the first label, and a `Table 1 (continued)` caption stays out of the table. A value carrying several footnote markers (`(9,350) (a)(b)`) is a value, so its row keeps its label. A table drawn as a ruled grid is read from its rules, merged cells repeated in every row they span; a booktabs table keeps text beyond its rules out and takes the header between them; two grids side by side come back as two tables; clock times are values; a header joined across a narrow gap is split at the columns below it; a group heading above a row label stays a row of its own; and text columns read across are not reported as a table. A merged cell of a ruled table is repeated in each row it spans; in JSON, XML and TOON each copy carries `rowSpan`, the number of rows that one cell covers. A wrapped header cell's second line and a group label under the header no longer cut the header off, header lines that are wrapped cells are joined per column (`Release date`), a group label centred in a rule band of its own (`Closed source`) stays a row of the table, blocks set side by side (an invoice's recipient and issuer addresses) are not read as one table, and a one- or two-row table of prose lines across a column gutter is dropped.
- vertical CJK text recovery when text should be read as a vertical stack. On a page set in vertical writing, each column is one line, columns read right to left and tiers (段) top to bottom, and a two-page spread reads its right page first; 縦中横 digits, vertical dashes and brackets, and a column-head number with its blank em box (`第八条 市町村の…`) stay in their column.
- code blocks: monospaced rows set apart from the page's prose and on one character grid become `role: "code"` blocks with their indentation rebuilt as leading spaces and any line-number gutter left out of the text (reported as `codeLineNumbers`); Markdown fences them.
- a paper's author grid (centred stacks of name, affiliation and email side by side) is read one block per author, row by row, with each footnote mark on its name.
- margin line numbers (pleading paper, bills, review drafts: a page-high column of consecutive integers on the text's line pitch) are left out of the text and set on the lines they number as `lineNumber` (`pages[].layout.lineNumbers` gives the range); Markdown starts each numbered line with its number, under a note naming the range, so a line can be cited page:line.
- nested list items and index or contents entries keep their depth: two leading spaces per level in the text and `indent` on the line. Ordinary paragraphs (first-line indents, block quotes, hanging indents) stay flush.
- two-dimensional math read onto one line: a fraction (a vector rule with a run centred above and below it and a relation beside it) reads `(c (1 + z))/H_0`, a big operator with its limits `∑_{k=1}^N`, a matrix between vector brackets `[[a, b], [c, d]]`, and an equation number joins its equation (`… , (1)`). A formula of that shape that cannot be read soundly keeps its fragments and is named by `display_math_layout`.
- `pages[].layout.markedText`: passages marked only by a drawn line beside them — the side lines (傍線) of a vertical 新旧対照表 that show what an amendment changed — listed with their bounding boxes (Markdown: a `### Marked text` table with `--layout`).
- turned text: a sideways table or text box on an upright page, or a landscape sheet set onto a portrait page without `/Rotate`, is read in its own upright frame — lines, row order and tables as a reader turning the page sees them. Its blocks and tables carry `rotation` (the clockwise turn that shows it upright, as `/Rotate` counts it) and keep page-frame bboxes; Markdown notes where the region starts. A turned axis title, margin stamp or header cell is left as before.
- names set one glyph per text object along a curve or a turned line (map labels, seals) are joined in curve order into one run, so `QUAYSIDE WALK` reads and searches as written.
- a justified line stretched so far that its word spaces look like column gutters is read as one line when a prose line beside it fills the same measure.
- a column chart set in its own frame reads value then category for each bar.

Markdown output can use recovered layout order when the native text stream diverges from visual reading order. It also renders detected `layout.tables[]` as per-page layout table sections, preserving row/value relationships for financial statements and other numeric tables in chat-readable output.

Use layout when:

- the page has columns, sidebars, captions, or footnotes.
- the task depends on headings or section hierarchy.
- a form label must be associated with a value.
- table rows and columns matter.
- repeated page chrome should not be treated as body content.
- search results or extracted fields need visual coordinates for verification.

`layout.blocks` is not meant to hide native text. It gives the agent an alternate reading-order view with geometry and role hints, while `pages[].text` remains available for comparison.

## Geometry

```bash
pdfvision document.pdf --geometry --format json
```

`--geometry` emits one span per retained positioned pdf.js text item. An item may contain a character, word, or longer string; adjacent items remain separate. Each bbox is the rounded aggregate axis-aligned envelope, not glyph outlines. Each span also carries an approximate `fontSize` for uses such as heading detection. Layout/search can reconstruct lines or slice match boxes without changing public span granularity.

## Visual Boxes and Regions

```bash
pdfvision document.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

Important visual fields include:

- `pages[].imageBoxes` for raster image draws.
- `pages[].vectorBoxes` for vector drawings such as chart paths, table rules, form boxes, and slide shapes.
- `pages[].visualRegions` for crop-ready figure, chart, table, form, and diagram regions.

Use `--render-visual-regions` when the agent needs to inspect only those regions.

This is the key difference between "extract everything as text" and "look at the PDF". A slide chart, signature box, callout diagram, or table grid may have little useful native text, but its image/vector geometry tells the agent where to look.

Visual regions are useful as a bridge to multimodal models:

1. Use `--visual-regions` to discover candidate regions.
2. Pick a region with the right kind, page, bbox, and associated text.
3. Re-run with `--render-region` or use `--render-visual-regions`.
4. Ask a vision model to inspect only that evidence.

## Page Warnings

`pages[].warnings` describes anomalies that an agent should consider before trusting native text.

Common warning families include:

- overlapping text or off-page text boxes.
- body text crowded against repeated headers or footers.
- flattened numeric tables.
- layout table hints whose cells did not resolve into one consistent grid (`layout_table_uncertain`), including a wrapped label whose first lines could belong to the row above as well as to its own values, and a label set in two lines around its values' line.
- vector chart labels kept together but not paired with their bars (`vector_chart_labels`), naming the chart region to render.
- display math (a fraction or bracketed matrix) that could not be read onto one line (`display_math_layout`), naming the region to render.
- signs set in a symbol font whose character map reports them as ordinary characters, so `−52%` reads as `252%` (`symbol_font_substitution`).
- native-vs-visual reading order divergence.
- rotated pages read in their stored orientation because `/Rotate` would turn their text sideways (`rotated_page_read_unrotated`).
- most of a page drawn turned with no `/Rotate` to match, read in its own upright frame (`rotated_text_read_upright`): bboxes stay in the page frame, and a render shows the text turned.
- glyph-garbage native text, private-use glyph strings, or localized mojibake.
- right-to-left script text whose inter-word spaces or paired brackets may degrade.
- OCR text layers over full-page scans, including symbol noise or word fragmentation.
- raster-dominated pages with no native text.
- low-confidence OCR on scan-like pages.
- large raster regions whose internal labels may need vision.
- dense vector pages such as forms, charts, or diagrams.
- coloured bars stacked in text rows, such as Gantt task bars or a horizontal bar chart, whose dates, durations, values or status are not in the text (`text_row_vector_bars`); the warning names the region to render.

### Hidden Native Text

A PDF can contain successfully extracted and searchable native text that is not visible on the rendered page. These checks run by default—no geometry or vector flag is required—and they leave the original extracted text unchanged. Inspect `pages[].warnings` separately from `quality.nativeTextStatus`, which can still be `ok`.

| Code | What it means |
| --- | --- |
| `invisible_text` | Text was shown while PDF text rendering mode `Tr 3` was active, so it remains in native extraction but is not painted for a viewer. |
| `text_under_opaque_fill` | A later opaque dark rectangular fill covers extracted text, decided per glyph so a box over a few words inside a sentence counts. The message names each covered passage with a bbox for `--render-region`. This can reveal a specific visual-only redaction failure, but it is not a general redaction detector. |
| `text_matches_background` | Extracted text is filled in the colour of the paint behind it, such as white text on a white page, so a reader sees blank space. It fires only where that background is provably known (a plain rectangle or the bare page), never over images, gradients, or complex shapes. Severity is `warning`: the usual cause is invisible production metadata such as a printer slug, not concealment, but the text is still not what a reader sees. The message names each passage with a bbox. |
| `faint_text` | Extracted text is drawn faint: after its opacity, it stands only a little apart from the known paint behind it (black at 15% opacity, light grey on white). On slide decks built up over overlay pages these are the items not yet revealed on that step; elsewhere a watermark or dimmed text. Ordinary grey text does not fire it. The message names each passage with a bbox. |

To avoid expected scan/OCR layers, `invisible_text` is suppressed when a full-page raster backs the page, while `text_under_opaque_fill` and `text_matches_background` are suppressed when `raster_backed_text_layer` applies. Inspect the affected page as rendered:

```bash
pdfvision document.pdf -p 3 --render --format json
```

A render establishes only what the page visibly shows. Neither a warning nor its absence validates whether redaction succeeded, and absence does not certify visibility, correctness, or safety. These detectors do not find arbitrary hidden text or prompt injection. See `pdfvision docs warnings <code>` for each detector's full details and limits, and [Security and Privacy](./security-and-privacy.md) before acting on or sharing PDF-derived content.

Warnings are not final judgments. They are inspection cues that tell the agent which page or region deserves a closer look.

## How Agents Should Use Warnings

Treat warnings as routing signals:

- If native text is glyph-corrupted, compare a render or OCR before summarizing.
- If `rtl_script_text` appears, verify exact wording and paired brackets against a render.
- If reading order diverges, prefer layout blocks over raw page text for narrative order. When the warning says the layout-rebuilt order is unreliable here too, side-by-side blocks were read line by line or run together, so render the page instead of trusting either order.
- If a table warning appears, preserve row and column evidence and crop the table when values matter. `layout_table_uncertain` names the table and its bbox: render that region before trusting its cells.
- If `symbol_font_substitution` appears, do not report a sign, direction, bound, or p-value from native text: render the region the warning names and read the minus, `<`, `>`, `±`, and `=` signs from the image.
- If large raster or dense vector warnings appear, assume labels may be visual-only until verified.
- If repeated chrome is involved, avoid mixing headers, footers, page numbers, and body text.
- If a code's inline message is not enough, `pdfvision docs warnings <code>` prints that one code's meaning, limits, and next step; `pdfvision docs warnings` lists every code with a one-line gloss.

The important habit is not to fail the whole extraction. pdfvision gives the agent enough evidence to choose the next observation step.
