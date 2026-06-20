---
title: レイアウトと警告
description: pdfvision のレイアウト復元、視覚領域、ジオメトリ、ページ警告を説明します。
---

# レイアウトと警告

PDF の意味は、文字だけでなく配置にもあります。段組み、見出し、フォームラベル、表、脚注、図、リンク、注釈、繰り返しヘッダーやフッターは、読み方に影響します。`--layout` はそれらの信号を平坦化せずに保持します。

## レイアウト復元

```bash
pdfvision document.pdf --layout --format json
```

主な出力:

- `pages[].layout.lines`: ジオメトリ付きの復元行。
- `pages[].layout.blocks`: 読み順ブロック、役割、bbox。
- `pages[].layout.tables`: ネイティブテキストで崩れやすい数値表のヒント。
- 縦書き CJK テキストの復元。

## ジオメトリ

```bash
pdfvision document.pdf --geometry --format json
```

`--geometry` は `pages[].spans` に低レベルのテキスト項目、bbox、フォントサイズを出します。検索ハイライト、オーバーレイ、根拠マッピングに使えます。

## 視覚ボックスと領域

```bash
pdfvision document.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

重要なフィールド:

- `pages[].imageBoxes`: ラスター画像。
- `pages[].vectorBoxes`: チャートパス、罫線、フォームボックス、図形などのベクター描画。
- `pages[].visualRegions`: 図、チャート、表、フォーム、ダイアグラムのクロップ可能領域。

## ページ警告

`pages[].warnings` は、ネイティブテキストを信用する前に確認すべき違和感を示します。

代表例:

- 重なった文字やページ外の文字。
- 本文と繰り返しヘッダー、フッターの衝突。
- 平坦化された数値表。
- ネイティブテキストと視覚的な読み順の不一致。
- グリフ文字列、PUA 文字、局所的な文字化け。
- フルページスキャン上の OCR テキストレイヤー。
- スキャン風ページでの低信頼 OCR。
- 画像内ラベルを視覚モデルで読むべき大きなラスター領域。

警告は最終判断ではなく、エージェントが次に確認すべき場所を示す手がかりです。
