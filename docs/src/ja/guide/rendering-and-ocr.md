---
title: レンダリングと OCR
description: pdfvision でページ全体、視覚領域、スキャン PDF を扱う方法。
---

# レンダリングと OCR

スキャン、スライド、図表、スクリーンショット、視覚的なフォームでは、ネイティブ PDF テキストだけでは足りません。レンダリングと OCR によりページを確認可能にします。

## ページ全体をレンダリング

```bash
pdfvision document.pdf --render --render-output ./images --format json
```

選択ページに画像パスが付きます。レンダリング画像はレイアウト bbox と同じ上始点の座標系で扱えます。

```bash
pdfvision document.pdf --render --render-scale 3
```

小さい倍率は画像サイズを抑え、大きい倍率は小さなラベルや密な図に向いています。

## 1 領域だけをレンダリング

```bash
pdfvision document.pdf --pages 2 --render --render-region 120,180,360,240 --render-output ./regions
```

`--render-region` は PDF ポイントの矩形を指定します。レイアウトブロックや視覚領域で見つけた場所を拡大する用途に向いています。

検索結果の bbox からも同じ流れでクロップできます。詳しくは [検索と領域ズーム](./search-and-region-zoom.md) を参照してください。

## 視覚領域をレンダリング

```bash
pdfvision document.pdf --render-visual-regions --render-output ./regions --format json
```

図、チャート、フォーム、表、ダイアグラムなどの重要領域だけをクロップします。

## OCR

```bash
pdfvision scan.pdf --ocr --ocr-lang eng --format json
```

OCR 出力にはテキスト、信頼度、言語、単語ボックスが含まれます。

複数言語は `+` でつなぎます。

```bash
pdfvision scan.pdf --ocr --ocr-lang eng+jpn --format json
```
