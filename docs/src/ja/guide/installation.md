---
title: インストール
description: npx、npm、ライブラリ依存として pdfvision を使う方法。
---

# インストール

pdfvision は npm package として配布されています。`npx` で直接実行する、繰り返し使うためにグローバルインストールする、またはアプリケーションが型付き PDF evidence を必要とする場合に依存として追加できます。

## 要件

pdfvision には Node.js 22.13.0 以上が必要です。

レンダリングには `@napi-rs/canvas` を使います。OCR は任意依存の `tesseract.js` を使い、`--ocr` が指定されたときだけ読み込まれます。

pdfvision は modern ESM、pdf.js、レンダリング、任意 OCR 依存に依存するため、新しい Node.js を使ってください。

## インストールせずに実行

```bash
npx pdfvision document.pdf
```

一度だけ抽出する場合に最も簡単です。

`npx` が向いている場合:

- エージェントが PDF を 1 回だけ確認する。
- project を変更せずに最新公開版を使いたい。
- npm 起動の overhead を script が許容できる。

## グローバルインストール

```bash
npm install -g pdfvision
pdfvision document.pdf
```

エージェントやローカルスクリプトから繰り返し呼ぶ場合に向いています。

ローカルのエージェントワークフローでは、どの shell からも `pdfvision` を直接呼べるため便利です。

## ライブラリとしてインストール

```bash
npm install pdfvision
```

```ts
import { processDocument } from 'pdfvision';

const result = await processDocument('./document.pdf', { pages: '1-3', render: true });
console.log(result.totalPages);
```

ライブラリが向いている場合:

- `overview[]`、`quality`、warnings に基づいてページを振り分ける。
- レンダリング画像パスを vision model に渡す。
- search match boxes を後続の render regions に変換する。
- `DocumentResult`、`PageResult`、オプションの PDF 機能フィールドの TypeScript 型を保つ。

## OCR 依存を省く

OCR を使わない場合は任意依存を省けます。

```bash
npm install --omit=optional pdfvision
```

通常インストールでは `@napi-rs/canvas` が core dependency として入るため、レンダリングはそのまま使えます。任意依存を省くと OCR だけが使えなくなります。

## インストール確認

```bash
pdfvision --version
pdfvision --help
```

その後、小さな抽出を実行します。

```bash
pdfvision document.pdf --json
```

PDF がスキャン、視覚的、または不自然に空に見える場合は、[レンダリングと OCR](./rendering-and-ocr.md) に進みます。
