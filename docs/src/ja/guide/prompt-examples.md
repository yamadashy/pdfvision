---
title: プロンプト例
description: pdfvision 出力を使って PDF の確認、レイアウト検証、表抽出、スキャン OCR、フォーム分析を行うためのプロンプト例。
---

# プロンプト例

pdfvision の Markdown、XML、JSON、TOON 出力を AI エージェントに渡すときの例です。

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

## フォーム分析

```text
pdfvision の form fields と layout data を使って PDF フォームを分析してください。

返すもの:
1. ラベル、値、フィールド種別。
2. checkbox/radio group と選択状態。
3. hidden、read-only、required、no-view のフィールド。
4. ラベル関係が曖昧で crop 確認すべきフィールド。
```
