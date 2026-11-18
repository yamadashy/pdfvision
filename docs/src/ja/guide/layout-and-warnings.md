---
title: レイアウトと警告
description: pdfvision のレイアウト復元、視覚領域、ジオメトリ、ページ警告を説明します。
---

# レイアウトと警告

PDF の意味は、文字だけでなく配置にもあります。段組み、見出し、フォームラベル、表、脚注、図、リンク、注釈、繰り返しヘッダーやフッターは、読み方に影響します。`--layout` はそれらの信号を平坦化せずに保持します。

AI エージェントでは、もっともらしいテキストストリームが間違っていることがあります。2 段組み論文を列をまたいで読んだり、財務表の行境界を失ったり、フォーム値がラベルから離れたり、フッターを本文として扱ったりします。pdfvision は、エージェントがそれに気づけるようにレイアウトと warning を出します。

## レイアウト復元

```bash
pdfvision document.pdf --layout --format json
```

主な出力:

- `pages[].layout.blocks[].lines`: ジオメトリ付きの復元行。
- `pages[].layout.blocks`: 読み順ブロック、役割、bbox。Lines are split at the column gutters the whole page shows, so narrow gutters between columns set on their own baselines do not fuse neighbouring columns, and a layout table that is only those text columns read across is not reported; text rotated in the page margin (print-production lines, arXiv stamps) is read after the page body. Framed or tinted boxes, bands between matching rules (pull quotes, ruled tables) and vector figures with their labels are read as one unit, so a boxed warning's body follows its heading and a ruled table reads row by row; a column interrupted by a photo, pull quote or sidebar is read to its end before the next column, and a sidebar beside a full-width abstract is read after it instead of line by line. Short runs set as rows on one column grid (a contents entry and its page number, a hazard code and its statement, a rule-less table) are read as one line per row, cells in reading order; text columns, lists set side by side and margin line numbers are left as they were.
- `pages[].layout.tables`: ネイティブテキストで崩れやすい数値表のヒント。Each cell carries its geometric `column` (plus `columnSpan` when a header or merged value's text overlaps several columns; a centered group header narrower than its group covers only the columns under its text, so render to confirm a group's width), so an empty cell stays an empty column instead of shifting later values left. Rows that continue the grid stay in the table — a row that is `—` in every column between two table rows, a group heading or a sparse row between them, word-valued rows such as `Yes | No` right after the last row — and a wrapped label or cell line joins the row it sits clearly closer to; a header row set as widely spaced words stays a row of its own instead of being glued onto the first label, and a `Table 1 (continued)` caption stays out of the table. A value carrying several footnote markers (`(9,350) (a)(b)`) is a value, so its row keeps its label. A table drawn as a ruled grid is read from its rules, merged cells repeated in every row they span; a booktabs table keeps text beyond its rules out and takes the header between them; two grids side by side come back as two tables; clock times are values; a header joined across a narrow gap is split at the columns below it; a group heading above a row label stays a row of its own; and text columns read across are not reported as a table. A merged cell of a ruled table is repeated in each row it spans; in JSON, XML and TOON each copy carries `rowSpan`, the number of rows that one cell covers. A wrapped header cell's second line and a group label under the header no longer cut the header off, header lines that are wrapped cells are joined per column (`Release date`), a group label centred in a rule band of its own (`Closed source`) stays a row of the table, blocks set side by side (an invoice's recipient and issuer addresses) are not read as one table, and a one- or two-row table of prose lines across a column gutter is dropped. A rule-less table whose rows sometimes carry a detail line under a cell (a bank statement's reference line) is still found.
- 縦書き CJK テキストの復元。On a page set in vertical writing, each column is one line, columns read right to left and tiers (段) top to bottom, and a two-page spread reads its right page first; 縦中横 digits, vertical dashes and brackets, and a column-head number with its blank em box (`第八条 市町村の…`) stay in their column.
- code blocks: monospaced rows set apart from the page's prose and on one character grid become `role: "code"` blocks with their indentation rebuilt as leading spaces and any line-number gutter left out of the text (reported as `codeLineNumbers`); Markdown fences them.
- two-dimensional math read onto one line: a fraction (a vector rule with a run centred above and below it and a relation beside it) reads `(c (1 + z))/H_0`, a big operator with its limits `∑_{k=1}^N`, a matrix between vector brackets `[[a, b], [c, d]]`, and an equation number joins its equation (`… , (1)`). A formula of that shape that cannot be read soundly keeps its fragments and is named by `display_math_layout`.
- `pages[].layout.markedText`: passages marked only by a drawn line beside them — the side lines (傍線) of a vertical 新旧対照表 that show what an amendment changed — listed with their bounding boxes (Markdown: a `### Marked text` table with `--layout`).
- a justified line stretched so far that its word spaces look like column gutters is read as one line when a prose line beside it fills the same measure.
- a column chart set in its own frame reads value then category for each bar.

Markdown 出力では、ネイティブテキストストリームと視覚的読み順が乖離する場合に、復元された layout order を利用できます。

layout が必要な場面:

- 段組み、サイドバー、キャプション、脚注がある。
- 見出しや section hierarchy がタスクに関わる。
- フォームラベルと値を関連付ける必要がある。
- 表の行と列が重要。
- 繰り返しのページ chrome を本文として扱いたくない。
- search result や抽出フィールドに、検証用の視覚座標が必要。

`layout.blocks` はネイティブテキストを隠すためのものではありません。geometry と role hints を持つ別の reading-order view を提供し、`pages[].text` と比較できるようにします。

## ジオメトリ

```bash
pdfvision document.pdf --geometry --format json
```

`--geometry` は保持された位置付き pdf.js テキスト項目ごとに 1 つの span を `pages[].spans` に出します。項目は 1 文字、単語、より長い文字列の場合があり、隣接項目は別々のままです。bbox はグリフ輪郭ではなく、項目全体を囲む丸め済みの軸平行矩形です。各 span には、見出し判定などに使える概算フォントサイズ `fontSize` も含まれます。

## 視覚ボックスと領域

```bash
pdfvision document.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

重要なフィールド:

- `pages[].imageBoxes`: ラスター画像。
- `pages[].vectorBoxes`: チャートパス、罫線、フォームボックス、図形などのベクター描画。
- `pages[].visualRegions`: 図、チャート、表、フォーム、ダイアグラムのクロップ可能領域。

`--render-visual-regions` は、エージェントがその領域だけを見たい場合に使います。

これは「すべてをテキストとして抽出する」と「PDF を見る」の違いです。スライドのグラフ、署名欄、吹き出し図、表の罫線は有用なネイティブテキストをほとんど持たないことがありますが、image/vector geometry が見るべき場所を教えます。

visual regions は multimodal model への橋渡しとして使えます。

1. `--visual-regions` で候補領域を見つける。
2. kind、page、bbox、関連テキストが合う領域を選ぶ。
3. `--render-region` または `--render-visual-regions` でレンダリングする。
4. vision model にその根拠だけを検査させる。

## ページ警告

`pages[].warnings` は、ネイティブテキストを信用する前に確認すべき違和感を示します。

代表例:

- 重なった文字やページ外の文字。
- 本文と繰り返しヘッダー、フッターの衝突。
- 平坦化された数値表。
- layout table hints whose cells did not resolve into one consistent grid (`layout_table_uncertain`), including a wrapped label whose first lines could belong to the row above as well as to its own values, and a label set in two lines around its values' line.
- vector chart labels kept together but not paired with their bars (`vector_chart_labels`), naming the chart region to render.
- display math (a fraction or bracketed matrix) that could not be read onto one line (`display_math_layout`), naming the region to render.
- signs set in a symbol font whose character map reports them as ordinary characters, so `−52%` reads as `252%` (`symbol_font_substitution`).
- ネイティブテキストと視覚的な読み順の不一致。
- rotated pages read in their stored orientation because `/Rotate` would turn their text sideways (`rotated_page_read_unrotated`).
- グリフ文字列、PUA 文字、局所的な文字化け。
- フルページスキャン上の OCR テキストレイヤー。
- スキャン風ページでの低信頼 OCR。
- 画像内ラベルを視覚モデルで読むべき大きなラスター領域。
- フォーム、グラフ、ダイアグラムのような密なベクターページ。
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

警告は最終判断ではなく、エージェントが次に確認すべき場所を示す手がかりです。

## エージェントは警告をどう使うべきか

warning は routing signal として扱います。

- ネイティブテキストが glyph-corrupted なら、要約前に render または OCR と比較する。
- 読み順が乖離しているなら、物語的な順序には raw page text より layout blocks を優先する。When the warning says the layout-rebuilt order is unreliable here too, side-by-side blocks were read line by line or run together, so render the page instead of trusting either order.
- table warning があるなら、行/列の根拠を保持し、値が重要なら表を crop する。`layout_table_uncertain` names the table and its bbox: render that region before trusting its cells.
- If `symbol_font_substitution` appears, do not report a sign, direction, bound, or p-value from native text: render the region the warning names and read the minus, `<`, `>`, `±`, and `=` signs from the image.
- large raster や dense vector の warning があるなら、検証するまで label が visual-only だと仮定する。
- repeated chrome が関わるなら、ヘッダー、フッター、ページ番号、本文を混ぜない。
- If a code's inline message is not enough, `pdfvision docs warnings <code>` prints that one code's meaning, limits, and next step; `pdfvision docs warnings` lists every code with a one-line gloss.

重要なのは、抽出全体を失敗扱いにしないことです。pdfvision はエージェントが次の観測ステップを選べるだけの根拠を返します。
