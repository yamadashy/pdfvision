---
title: はじめに
description: pdfvision で AI エージェント向けに PDF のテキスト、レイアウト、レンダリング画像、OCR を抽出する基本を説明します。
---

# はじめに

pdfvision は、AI エージェントが PDF を読むための CLI とライブラリです。ページごとに、テキスト、レイアウト、画像、OCR、警告をまとめて扱えます。

基本方針は **エージェントが判断し、pdfvision は根拠を渡す** ことです。単一の平坦なテキストだけを返すのではなく、ネイティブ抽出が不完全なときに気づけるシグナルを出します。

## 最初の抽出

```bash
npx pdfvision document.pdf
```

デフォルトは Markdown 出力です。ページごとのテキストと、文字数、画像数、ベクター数、テキストカバレッジ、ネイティブテキスト品質などの概要テーブルを含みます。

プログラムやエージェントが結果を読む場合は JSON を使います。

```bash
npx pdfvision document.pdf --format json
```

## 視覚的な根拠を追加する

PDF がスキャン、スライド、図表中心、またはレイアウト依存の場合はページをレンダリングします。

```bash
npx pdfvision document.pdf --render --format json
```

ネイティブテキストが無い、または不十分な場合は OCR を使います。

```bash
npx pdfvision scan.pdf --ocr --ocr-lang eng --format json
```

読み順、段組み、表、フォーム、警告が重要な場合はレイアウトを復元します。

```bash
npx pdfvision document.pdf --layout --image-boxes --vector-boxes --format json
```

## 次に読むもの

- [インストール](./installation.md)
- [使い方](./usage.md)
- [出力形式](./output.md)
- [レイアウトと警告](./layout-and-warnings.md)
