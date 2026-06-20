---
title: 出力形式
description: pdfvision の Markdown、JSON、XML、TOON 出力の選び方。
---

# 出力形式

pdfvision は同じ抽出結果を複数の形式で出力できます。

出力を読む相手に応じて形式を選びます。人間、LLM prompt、tool、token 制約のある agent loop では適した表現が違います。抽出される根拠フィールドは同じで、形式だけが変わります。

## Markdown

```bash
pdfvision document.pdf
pdfvision document.pdf --format markdown
```

Markdown はデフォルトです。会話型 AI のコンテキストに渡しやすいよう、概要テーブル、ページごとの本文、警告、レンダリング画像リンクを含みます。

人間または chat model が直接読む場合に使います。会話の中で文書を推論し、次に実行すべき pdfvision コマンドを出す初回パスにも向いています。

## JSON

```bash
pdfvision document.pdf --format json
```

JSON は完全な `DocumentResult` スキーマを出力します。ツール、エージェント、テスト、後続処理に最適です。

代表的なフィールド:

- `pages[].layout`
- `pages[].warnings`
- `pages[].spans`
- `pages[].imageBoxes`
- `pages[].visualRegions`
- `pages[].ocr`
- `outline`, `attachments`, `layers`, `viewer`

プログラムで分岐したい場合に使います。OCR すべきページを選ぶ、検索一致を render region に変換する、warning を抽出結果と一緒に保存する、画像パスを別ツールへ渡す、といった用途に最適です。

## XML

```bash
pdfvision document.pdf --format xml
```

XML は JSON と同じデータをタグ形式で表します。モデルによっては `<page>` や `<warning>` のようなタグを見つけやすい場合があります。

ページ、テキスト、warning、match、layout block の境界を明示したい LLM prompt に向いています。

## TOON

```bash
pdfvision document.pdf --format toon
```

TOON は同じ構造化結果をトークン効率よく表現する形式です。spans、image boxes、layout lines のような反復行が多い場合に JSON より短くなります。

geometry-heavy な出力で JSON の key repetition が prompt の大半を占める場合に向いています。エージェントは同じ根拠を受け取りつつ、反復行がよりコンパクトになります。

## 実用的な既定値

- 人間が読む簡単な抽出には Markdown。
- tools や agent controllers には JSON。
- explicit tags が効く prompt workflow には XML。
- tight context window で大きな構造化出力を扱う場合は TOON。

debugging と再現性には JSON を優先します。モデルに直接読ませる場合は、そのモデルが最も安定して従える表現を選びます。
