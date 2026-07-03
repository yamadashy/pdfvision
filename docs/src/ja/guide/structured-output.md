---
title: 構造化出力
description: pdfvision の DocumentResult、PageResult、overview、quality、layout、OCR、warnings、座標系、PDF 機能フィールドの概要。
---

# 構造化出力

`--format json`, `--format xml`, `--format toon` は同じ `DocumentResult` データを別形式で表します。JSON はプログラム向け、XML はタグ指向のプロンプト向け、TOON は配列が多い出力のトークン節約向けです。

この schema はエージェント向けの evidence model として設計されています。「テキストはこれです」だけでなく、どれだけテキストが見つかったか、どの視覚要素があるか、ネイティブテキストは信頼できそうか、根拠がページ上のどこにあるか、どの PDF 機能が存在したかを同時に伝えます。

## トップレベル

```ts
interface DocumentResult {
  file: string;
  totalPages: number;
  metadata: DocumentMetadata;
  overview?: PageOverview[];
  pages: PageResult[];
}
```

オプションに応じてトップレベルに次のフィールドが追加されます。

- `pageLabels`: `--page-labels`。
- `attachments`: `--attachments`。
- `outline`: `--outline`。
- `viewer`: `--viewer`。
- `layers`: `--layers`。

## Page Overview

`overview[]` はエージェントが最初に見るべき場所です。

- `charCount`
- `imageCount`
- `vectorCount`
- `textCoverage`
- `nonPrintableRatio`
- `renderContentRatio`
- `quality`
- warning count と match count

ネイティブテキストが空、疎、視覚的に矛盾、またはグリフ破損しているページを見つけるために使います。

長い文書では特に重要です。overview を見れば、深く調べるべきページを小さく絞れます。

- テキストが少なく画像/ベクターが多いページは、グラフ、スライド、スキャン、フォームの可能性があります。
- warning があるページは、要約前に検証すべきです。
- search match があるページは、直接クロップして視覚的な根拠にできます。
- blank や sparse な visual status のページは、OCR へ進める価値が低い場合があります。

## Page Result

各 `pages[]` には、`text`, `rawText`, ページ寸法、密度フィールド、必要に応じて `spans`, `layout`, `imageBoxes`, `vectorBoxes`, `visualRegions`, `formFields`, `links`, `annotations`, `structure`, `ocr`, `warnings`, `matches` が入ります。

OCR はネイティブテキストを上書きしません。利用側が `page.text` と `page.ocr?.text` を比較して選びます。

オプションフィールドは意図的に opt-in です。`--layout --form-fields` の JSON と、それらのフラグを付けていない JSON は別物です。要求した機能で要素が見つからなかった場合は、空配列や null-like な形を使い、「未要求」と「要求したが存在しない」を区別しやすくします。

## Quality Fields

`quality.nativeTextStatus` はネイティブテキスト層の状態を表します。

- `ok`
- `mixed_glyph_indices`
- `unusable_glyph_indices`
- `sparse_text_on_blank_visual`
- `sparse_text_with_visual_content`
- `empty_but_visual_content`
- `empty`

`quality.visualStatus` は、レンダリングまたは OCR により raster が作られたときに現れます。

- `ok`
- `sparse`
- `blank`

これらは命令ではなく観測値です。レンダリングするか、OCR するか、クロップするか、ネイティブテキストを信頼するかはエージェントが決めます。

実用上の読み方:

- `ok`: ネイティブテキストを最初の根拠として使いやすい。
- `mixed_glyph_indices` または `unusable_glyph_indices`: テキストを信頼する前にレンダリングや OCR で検証する。
- `sparse_text_with_visual_content`: テキストに表れていない視覚的な意味がある可能性が高い。
- `empty_but_visual_content`: レンダリングまたは OCR がほぼ必要。
- `sparse_text_on_blank_visual`: 不可視テキストや人間には見えない残骸の可能性がある。
- `visualStatus: "blank"`: raster では見える内容が確認できなかった。

## 座標系

すべての bbox は PDF user-space points で左上原点です。`x` は右、`y` は下に増え、`--render-region` にそのまま使いやすい形式です。

座標を持つフィールドには、spans、layout blocks/lines、image boxes、vector boxes、visual regions、form fields、links、annotations、structure references、OCR words、search matches が含まれます。これにより、エージェントは新しい座標系を発明せずに、構造化抽出から視覚クロップへ移れます。

## タスク別の根拠フィールド

次の対応を目安にしてください。

- テキスト読解: `pages[].text`, `rawText`, `quality`, `warnings`。
- レイアウト依存の読解: `layout.lines`, `layout.blocks`, `layout.tables`, `spans`。
- 視覚確認: `image`, `renderContentRatio`, `imageBoxes`, `vectorBoxes`, `visualRegions`。
- スキャン復元: `ocr.text`, `ocr.confidence`, `ocr.words`, `quality.visualStatus`。
- 根拠検索: `matches[].source`, `matches[].bbox`, `matches[].context`。
- フォーム分析: `formFields`, labels, values, selected state, flags, actions。
- ナビゲーションと文書機能: `pageLabels`, `outline`, `links`, `viewer`, `layers`, `structure`。
- ファイル棚卸し: `attachments` metadata と、明示的に抽出した attachment paths。

エージェントのワークフローでは、結論に至ったフィールドを残すことが重要です。要約が表セルに依存するなら page number と bbox を残します。OCR を使ったなら confidence と crop を残します。warning が抽出戦略を変えたなら warning code を残します。

## オプションの PDF 機能フィールド

PDF には plain text stream の外に意味があることがあります。pdfvision は軽量抽出を保つためにこれらを opt-in にしていますが、viewer 上の見え方に意味がある文書では重要です。

`--form-fields` は申請書、アンケート、行政フォームで使います。widget type、value、checked state、choices、flags、export values、actions、bbox、近傍ラベルを出します。空の box と選択済み checkbox、または可視 choice field を区別するのに役立ちます。

`--links` と `--outline` はナビゲーションが多い文書で使います。links は page-level annotation と bbox/target、outline は階層と解決済み destination を保持します。link targets は link output を要求していなくても `--search` の対象になります。引用、目次、マニュアル、レポートで「どこを指しているか」が根拠の一部になる場合に有効です。

`--annotations` はコメント、ハイライト、stamp、ink、shape、file attachment icon、可視 FreeText note が意味を変える可能性がある場合に使います。FreeText annotation は `pages[].text` に無いのに人間には見えることがあるため、annotation output を要求していなくても `--search` の対象になります。

`--viewer`, `--page-labels`, `--layers` は PDF の viewer state が意味を持つときに使います。物理ページ番号と異なるページラベル、open action、viewer preferences、optional content groups、既定 layer visibility、document permission flags を観測できます。これらは PDF に関する観測であり、実行すべき命令ではありません。

`--structure` は tagged PDF が accessibility role、figure alt text、language hint、論理グループを持つ可能性があるときに使います。tagged structure は PDF 作者が提供する情報なので、正確性が重要な場合は見えるページ根拠と照合します。

`--attachments` は attachment pane、page file-attachment icon、補足ファイルを含む PDF で使います。構造化出力には attachment metadata とサイズが入り、bytes は `--attachment-output` を明示した場合だけ書き出されます。attachment path はファイルが抽出された根拠であり、安全に開けるという意味ではありません。

## 詳細 schema

TypeScript パッケージは `DocumentResult`, `PageResult`, `PageWarning`, `LayoutBlock`, `LayoutLine`, `TextSpan`, `ImageBox`, `VectorBox`, `VisualRegion`, `FormField`, `PageOcr`, `ProcessDocumentOptions` などの schema 型を export しています。
