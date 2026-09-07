---
title: 検索と領域ズーム
description: pdfvision で PDF テキスト、フォーム、注釈、OCR 出力を検索し、一致した領域だけを PNG クロップとしてレンダリングする方法。
---

# 検索と領域ズーム

pdfvision は、まずテキストの根拠を探し、その一致領域だけをレンダリングできます。条項、表セル、図のラベル、フォーム値、OCR 結果を、ページ全体の画像を渡さずに確認したいときに有効です。

これは pdfvision の中でも特にエージェント向きのワークフローです。テキスト検索を低コストな locator として使い、本当に必要な場所だけ視覚的な根拠に切り替えます。

## PDF を検索する

```bash
pdfvision report.pdf --search "revenue" --matches-only --json
```

With `--matches-only`, JSON and TOON emit compact hits in the top-level `matches[]` array without page bodies. Each hit includes its page, `queryIndex` linked to the top-level `queries` array, source, text, optional context, tight `bbox`, and crop-ready `region`. Without `--matches-only`, full JSON and TOON keep hits in `pages[].matches[]` alongside the page payload; those full hits include `bbox`, but not `region`.

Full Markdown output still shows a per-page `Search matches` table when `--search` is used. With `--matches-only`, Markdown becomes a compact flat report, while JSON, XML, or TOON remain the better choice when another tool needs to consume coordinates directly.

If any selected page has a non-default PDF `/UserUnit`, the compact report preserves it as `pageUserUnits: [{ page, userUnit }]` in JSON/TOON, equivalent `<pageUserUnits>` entries in XML, and a `Page UserUnits` summary in Markdown. The metadata is omitted when every selected page uses UserUnit 1.

Compact output still retains optional diagnostics for every selected page with warnings or non-OK native or visual quality, including pages with no hits and searches with zero total results. JSON/TOON expose `pageDiagnostics` with raw quality and complete warnings; XML and Markdown present the same information in compact diagnostic sections. Inspect it before treating a hit or miss as visible evidence. Native quality describes native text only and does not rule out OCR or field hits. When applicable, `unreadableSource` keeps document-wide XFA placeholder scope and recovery guidance; rendering a confirmed XFA placeholder only renders the placeholder, so open it in Adobe Acrobat/Reader instead.

複数の query は `--search` を繰り返します。

```bash
pdfvision paper.pdf --search "transformer" --search "attention" --json
```

既定ではリテラル検索、大文字小文字を区別しない検索、NFKC を考慮した検索です。必要なときだけ regex や厳密な大小文字一致を使います。

```bash
pdfvision report.pdf --search "Q[1-4] revenue" --search-regex --json
pdfvision report.pdf --search "PDF" --search-case-sensitive --json
```

検索対象として有効なもの:

- 契約条項やポリシー用語。
- 財務指標ラベル。
- 表の行名。
- フォーム値。
- 図キャプションやグラフラベル。
- スキャンページ上の OCR テキスト。
- Unicode 形式が揺れやすい多言語語句。

## 検索対象

検索は次の信号を対象にできます。

- PDF のネイティブテキスト。
- `--form-fields` のテキスト値、choice 値、checkbox / radio の export value。
- `--links` のクリック可能なリンク target。
- `--annotations` の表示される FreeText 注釈。
- `--ocr` の OCR テキスト。利用できる場合は OCR word box を使います。

ネイティブ、フォーム、リンク、注釈の match と重複する OCR match は抑制されるため、同じ表示テキストが二重に出にくくなります。リンクの hit が同じように抑制されるのは、表示されるアンカーテキストが target を言い換えているとき（URL がそのまま印字されている場合など）だけです。target と単語をひとつ共有しているだけの文章アンカーでは、文とリンク先は別の根拠なので、両方の hit が残ります。

ネイティブ match の `context` は、ページ本文と同じ再構成結果の行を引用します。これは特に右横書き（RTL）の文字体系で重要で、素の match テキストにはない語間スペースと括弧の向きを再構成が補います。引用されるのは、その行が match の行だと明確に言える場合だけです（match のボックスの大半を覆い、かつ一致した文字列を含むこと）。行をまたいで繋がった hit や、再構成が別の行に割り当てた hit は、従来どおり素のスパン結合の context にフォールバックします。

match の `source` は、エージェントがどの程度信頼すべきかを判断する手がかりです。

- `native`: PDF text layer 由来。
- `formField`: 見える widget value、display value、または checkbox / radio の export value 由来。
- `link`: クリック可能な link target 由来。
- `annotation`: 見える FreeText annotation 由来。
- `ocr`: ページ pixels 由来で、confidence の確認が必要な場合があります。

複数 query の検索では、`queryIndex` により、どの `--search` フラグからの hit かを呼び出し側で追跡できます。

## 一致領域をレンダリングする

`bbox` locates the matched text itself. The compact hit's `region` optionally expands that box to a detected containing table row or visual line, then adds padding and clamps the result within the page. Without a containing structure, it is the padded match geometry. The crop provides nearby visual evidence, but it does not guarantee that an entire table, all headers, or relevant footnotes are included. Compact search computes this region internally, so it does not need `--layout`.

Choose a compact hit by its `page`, `source`, and `context`, then pass its `region` unchanged. For example, if the chosen hit reports the illustrative values `page: 3` and `region: { x: 120, y: 180, width: 360, height: 140 }`, run:

```bash
pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-output ./crops --json
```

`--render-region` requires exactly one selected page. The region uses raw unrotated page-view units with a top-left origin; compact regions are already clamped, while a custom region must stay within the page bounds. Physical points = raw value × UserUnit; pixels = raw region × UserUnit × render scale. Read UserUnit from `pages[].userUnit` in the full report or the selected page's `pageUserUnits` entry in the compact report (1 when omitted).

Use `--render-scale` when the crop contains small labels, superscripts, dense table cells, or chart legends:

```bash
pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-scale 3 --render-output ./crops --json
```

Start with the emitted `region` unchanged. If the task needs different context, a custom narrower or wider crop remains available within the page bounds.

## エージェントの流れ

1. Run `--search "…" --matches-only --json` to locate candidate evidence without page bodies.
2. Inspect top-level `matches[]` and choose the hit with the right page, source, and context.
3. Re-run with exactly that hit's `page` and unchanged `region` in `--pages`, `--render`, and `--render-region`.
4. Ask the vision model to compare the crop against the native text, OCR text, or extracted table data.

テキスト検索できない視覚領域には、[レンダリングと OCR](./rendering-and-ocr.md) の `--visual-regions` または `--render-visual-regions` を使います。

## 例: 監査可能な claim check

```bash
pdfvision annual-report.pdf --search "Net sales" --search "Operating income" --matches-only --json
```

An agent can inspect top-level `matches[]`, choose the hit with the right page, source, and context, then pass its `region` to the crop command. No `--layout` flag is needed because compact search computes the region internally. If that selected hit reports the following illustrative page and region, the follow-up is:

```bash
pdfvision annual-report.pdf --pages 42 --render --render-region 72,180,468,180 --render-output ./evidence --json
```

最終回答では、抽出テキストとレンダリングされた根拠領域の両方を参照できます。
