---
layout: home
title: pdfvision
titleTemplate: AI エージェント向け PDF 抽出
hero:
  name: pdfvision
  text: AI エージェントに人間のような PDF 視覚を
  tagline: PDF からテキスト、レイアウト、OCR、メタデータ、レンダリング画像を抽出し、エージェントが単一の平坦なテキストではなく根拠を確認できるようにします。
  image:
    src: /logo.svg
    alt: pdfvision
  actions:
    - theme: brand
      text: はじめる
      link: /ja/guide/
    - theme: alt
      text: GitHub
      link: https://github.com/yamadashy/pdfvision
features:
  - title: テキストと視覚的な根拠
    details: ネイティブテキスト、密度シグナル、レンダリング画像、OCR、ジオメトリをエージェントが扱いやすい 1 つの結果にまとめます。
  - title: レイアウトを理解した抽出
    details: 行、ブロック、表、フォームラベル、注釈、リンク、視覚領域を、PDF の生の信号を隠さずに復元します。
  - title: エージェントが判断に使える警告
    details: スキャン風ページ、文字化け、平坦化された表、重なった文字、ヘッダーやフッターとの衝突など、人間が気づく違和感を出力します。
---

## クイックスタート

インストールせずに実行します。

```bash
npx pdfvision document.pdf
```

マルチモーダルモデル向けにページ画像をレンダリングします。

```bash
npx pdfvision document.pdf --render
```

URL から PDF を取得して JSON で抽出します。

```bash
npx pdfvision --remote https://raw.githubusercontent.com/mozilla/pdf.js-sample-files/master/tracemonkey.pdf --format json
```

## ドキュメント

- [はじめに](./guide/) で基本の流れを確認できます。
- [ユースケース](./guide/use-cases) は PDF 種別ごとの実行パターンを整理しています。
- [CLI オプション](./guide/command-line-options) は用途別に主要フラグを整理しています。
- [構造化出力](./guide/structured-output) はエージェントやツールが読むフィールドを説明します。
- [レイアウトと警告](./guide/layout-and-warnings) は README の短い説明から分離すべき視覚構造の詳細です。
- [レンダリングと OCR](./guide/rendering-and-ocr) は画像出力、領域クロップ、スキャン文書を扱います。
