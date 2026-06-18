---
title: 使い方
description: ローカル PDF、リモート PDF、ページ範囲、レンダリング、レイアウト、OCR、暗号化 PDF の基本操作。
---

# 使い方

## ローカル PDF

```bash
pdfvision document.pdf
```

## リモート PDF

```bash
pdfvision --remote https://example.com/document.pdf --format json
```

リモート PDF はキャッシュされ、PDF として検証されてから抽出されます。URL が HTML、ログインページ、チャレンジページを返す場合はキャッシュ前に失敗します。

## ページ範囲

```bash
pdfvision document.pdf --pages 1-3
pdfvision document.pdf --pages 1,3,5 --format json
```

## ページをレンダリング

```bash
pdfvision document.pdf --render --render-output ./images --format json
```

`--render-scale` で画像の詳細度を調整できます。

```bash
pdfvision document.pdf --render --render-scale 3
```

## レイアウトと視覚構造

```bash
pdfvision document.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

レイアウトブロック、画像ボックス、ベクターボックス、視覚領域、レイアウト警告を追加します。

## 重要領域だけをレンダリング

```bash
pdfvision document.pdf --render-visual-regions --render-output ./regions --format json
```

ページ全体ではなく、図、表、フォーム、チャートなどの領域だけを確認したいときに使います。

## スキャンページの OCR

```bash
pdfvision scan.pdf --ocr --ocr-lang eng --format json
pdfvision japanese-scan.pdf --ocr --ocr-lang eng+jpn --format json
```

OCR 結果にはテキスト、信頼度、言語、単語ボックスが含まれます。

## 暗号化 PDF

```bash
pdfvision encrypted.pdf --password your-password --format json
printf "your-password\n" | pdfvision encrypted.pdf --password-stdin --format json
```

パスワードをシェル履歴やプロセス引数に残したくない場合は `--password-stdin` を優先してください。
