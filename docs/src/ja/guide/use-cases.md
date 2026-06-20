---
title: ユースケース
description: AI エージェントが研究論文、スライド、行政フォーム、スキャン PDF、レポート、表、図表、多言語文書を読むための pdfvision ワークフロー。
---

# ユースケース

pdfvision は、PDF を手作業でプロンプトに貼るのではなく、AI エージェントが根拠付きで読む必要がある場面で役立ちます。

## 研究論文

まずネイティブテキストを使い、段組み、図、数式、表が重要ならレイアウトを追加します。

```bash
pdfvision paper.pdf --layout --image-boxes --format json
```

引用語、数式、主張文の位置を確認したい場合は、`--search` で候補を探してから `--render-region` でクロップします。

## スライドとレポート

スライドは画像、ベクター図形、相対配置に意味があることが多いです。

```bash
pdfvision deck.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

必要なら重要領域だけをレンダリングします。

```bash
pdfvision deck.pdf --render-visual-regions --format json
```

## 行政フォームと税務文書

フォームはラベル、ウィジェット、チェックボックス、注釈、罫線が組み合わさっています。

```bash
pdfvision form.pdf --layout --form-fields --annotations --links --format json
```

## スキャン文書

概要シグナルでネイティブテキスト不足を確認し、必要なページだけ OCR します。

```bash
pdfvision scan.pdf --pages 1-5 --ocr --ocr-lang eng --format json
```

## 図表と視覚的な表

視覚構造と領域検出から始めます。

```bash
pdfvision report.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

必要な箇所だけクロップして確認します。

```bash
pdfvision report.pdf --pages 8 --render --render-region 80,140,430,260 --render-output ./regions
```
