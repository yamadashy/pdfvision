---
title: 構造化出力
description: pdfvision の DocumentResult、PageResult、overview、quality、layout、OCR、warnings、座標系、PDF 機能フィールドの概要。
---

# 構造化出力

`--format json`, `--format xml`, `--format toon` は同じ `DocumentResult` データを別形式で表します。JSON はプログラム向け、XML はタグ指向のプロンプト向け、TOON は配列が多い出力のトークン節約向けです。

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

オプションに応じて `pageLabels`, `attachments`, `outline`, `viewer`, `layers` が追加されます。

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

## Page Result

各 `pages[]` には、`text`, `rawText`, ページ寸法、密度フィールド、必要に応じて `spans`, `layout`, `imageBoxes`, `vectorBoxes`, `visualRegions`, `formFields`, `links`, `annotations`, `structure`, `ocr`, `warnings`, `matches` が入ります。

OCR はネイティブテキストを上書きしません。利用側が `page.text` と `page.ocr?.text` を比較して選びます。

## 座標系

すべての bbox は PDF user-space points で左上原点です。`x` は右、`y` は下に増え、`--render-region` にそのまま使いやすい形式です。
