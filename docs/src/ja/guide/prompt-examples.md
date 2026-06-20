---
title: プロンプト例
description: pdfvision 出力を使って PDF の確認、レイアウト検証、表抽出、スキャン OCR、フォーム分析を行うためのプロンプト例。
---

# プロンプト例

pdfvision の Markdown、XML、JSON、TOON 出力を AI エージェントに渡すときの例です。

これらのプロンプトでは、pdfvision 出力を最終回答ではなく根拠として扱う前提です。多くのワークフローでは、モデル自身が追加の layout、rendering、OCR、search、region crop が必要かを判断します。

## PDF の初期確認

```text
この pdfvision 出力をページごとに確認してください。

各ページについて:
1. 見えている内容を要約する。
2. ネイティブテキストを信用する前に overview quality と warnings を確認する。
3. render、OCR、region inspection が必要なページを特定する。
4. 次に実行すべき pdfvision のフラグを具体的に返す。
```

## レイアウト依存の抽出

```text
pdfvision の layout blocks と warnings を使って、人間が読む順序を復元してください。

重視する点:
1. 見出しと階層。
2. 段組みの読み順。
3. 位置関係に意味がある表やフォームラベル。
4. native text order と visual order の不一致を示す警告。

layout warnings がある場合は pages[].text だけに依存しない。
```

## Evidence-First Summary

```text
pdfvision 出力を根拠として、この PDF を要約してください。

ルール:
1. overview quality fields と page warnings から始める。
2. ネイティブテキストが empty、sparse、glyph-corrupted のページは、欠けている根拠を明示せずに要約しない。
3. 結論が表、フォームフィールド、グラフ、図に依存する場合は、page と bbox を引用するか crop command を提案する。
4. テキストから確信できる主張と、視覚検証が必要な主張を分ける。
```

## 表の確認

```text
この pdfvision JSON から表を抽出してください。

各表について:
1. pages[].layout.tables があれば使う。
2. 行と列の関係を保持する。
3. 曖昧なセルや crop 確認が必要なセルを示す。
4. ページ番号と bbox の根拠を含める。
```

## 財務指標の検証

```text
この pdfvision 出力を使って財務指標を検証してください。

各指標について:
1. pages[].matches または layout table labels から候補を探す。
2. page、row/column context、bbox evidence を特定する。
3. table flattening、reading-order divergence、dense vectors、raster-only content の warnings を確認する。
4. 値が視覚的に符号化されている、または曖昧な場合は、最小限の crop を作る pdfvision --render-region コマンドを返す。
5. 行または列の alignment が不明な場合は、近くのテキストから値を作らない。
```

## スキャン文書 OCR

```text
この pdfvision 出力の native text と OCR text を比較してください。

各ページについて:
1. quality.nativeTextStatus と quality.visualStatus でページを分類する。
2. native text が usable な場合だけ優先する。
3. native text が empty、sparse、glyph-corrupted の場合だけ OCR を優先する。
4. low-confidence OCR や高解像度 render が必要なページを示す。
```

## フォーム分析

```text
pdfvision の form fields と layout data を使って PDF フォームを分析してください。

返すもの:
1. ラベル、値、フィールド種別。
2. checkbox/radio group と選択状態。
3. hidden、read-only、required、no-view のフィールド。
4. ラベル関係が曖昧で crop 確認すべきフィールド。
```

## 視覚的レポートのレビュー

```text
pdfvision 出力を使って、この視覚的な PDF レポートをレビューしてください。

重視する点:
1. imageCount または vectorCount が高いページ。
2. pages[].visualRegions と associated text。
3. visual-only labels、dense charts、sparse native text を示す warnings。
4. 重要な chart、diagram、screenshot を検証するための最小限の region crop。

視覚的な主張をする前に、提案する crop command を返してください。
```

## 検索してズームする根拠確認

```text
この pdfvision JSON の pages[].matches から、最も適切な根拠位置を選んでください。

関連する match ごとに:
1. page、query、source、matched text、bbox を報告する。
2. 視覚確認が必要か判断する。
3. 必要なら --pages、--render、--render-region を含む pdfvision コマンドを返す。
4. クロップ作成後、native text、OCR text、近くの layout block と比較する。
```

## モデル別メモ

- 正確なフィールドが必要な tools や agents には JSON を使う。
- 明示的な tag に従いやすいモデルには XML を使う。
- structured arrays が大きく token budget が重要なときは TOON を使う。
- 人間が読みやすい初回パスには Markdown を使う。
- 主張が text layer だけでなく視覚ページに依存する場合は rendered crops を使う。
