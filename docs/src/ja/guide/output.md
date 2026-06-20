---
title: 出力形式
description: pdfvision の Markdown、JSON、XML、TOON 出力の選び方。
---

# 出力形式

pdfvision は同じ抽出結果を複数の形式で出力できます。

## Markdown

```bash
pdfvision document.pdf
pdfvision document.pdf --format markdown
```

Markdown はデフォルトです。会話型 AI のコンテキストに渡しやすいよう、概要テーブル、ページごとの本文、警告、レンダリング画像リンクを含みます。

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

## XML

```bash
pdfvision document.pdf --format xml
```

XML は JSON と同じデータをタグ形式で表します。モデルによっては `<page>` や `<warning>` のようなタグを見つけやすい場合があります。

## TOON

```bash
pdfvision document.pdf --format toon
```

TOON は同じ構造化結果をトークン効率よく表現する形式です。spans、image boxes、layout lines のような反復行が多い場合に JSON より短くなります。
