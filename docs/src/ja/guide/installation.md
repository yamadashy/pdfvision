---
title: インストール
description: npx、npm、ライブラリ依存として pdfvision を使う方法。
---

# インストール

## 要件

pdfvision には Node.js 22.13.0 以上が必要です。

レンダリングには `@napi-rs/canvas` を使います。OCR は任意依存の `tesseract.js` を使い、`--ocr` が指定されたときだけ読み込まれます。

## インストールせずに実行

```bash
npx pdfvision document.pdf
```

一度だけ抽出する場合に最も簡単です。

## グローバルインストール

```bash
npm install -g pdfvision
pdfvision document.pdf
```

エージェントやローカルスクリプトから繰り返し呼ぶ場合に向いています。

## ライブラリとしてインストール

```bash
npm install pdfvision
```

```ts
import { processDocument } from 'pdfvision';

const result = await processDocument('./document.pdf', { pages: '1-3', render: true });
console.log(result.totalPages);
```

## OCR 依存を省く

OCR を使わない場合は任意依存を省けます。

```bash
npm install --omit=optional pdfvision
```
