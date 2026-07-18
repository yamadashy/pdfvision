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

XML は同じ `DocumentResult` データをタグ形式で再エンコードします。

`<page>`、`<text>`、`<warning>`、match、layout block の明示的な境界を前提とする利用側やプロンプトで使います。

## TOON

```bash
pdfvision document.pdf --format toon
```

TOON は同じ構造化結果をロスなく再エンコードします。同じスカラーフィールドを持つオブジェクト配列は、フィールド名を一度だけ宣言する表形式になり、キーの反復を減らせます。

ネストされた値を含む配列や、要素間でフィールドが異なる配列はリスト形式のままです。

この条件を満たす均一な配列が結果の多くを占める場合に TOON を検討してください。トークンを重視するワークフローで採用する前に、実際の文書と対象モデルのコンテキストで各形式を比較します。

## 実用的な既定値

- 人間が読む簡単な抽出には Markdown。
- tools や agent controllers には JSON。
- 明示的なタグを前提とするプロンプトワークフローには XML。
- 同じスカラーフィールドを持つオブジェクト配列が多い場合は TOON を検討し、実際の文書で JSON と比較する。

debugging と再現性には JSON を優先します。モデルに直接読ませる場合は、実際の文書と対象モデルのコンテキストで各形式を比較します。
