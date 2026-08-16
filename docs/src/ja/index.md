---
layout: home
title: pdfvision
titleTemplate: AI エージェント向け PDF 信号抽出
hero:
  name: pdfvision
  text: 気づけない PDF の失敗を、立て直せる失敗に
  tagline: 空のスキャン、化けた字形、崩れた段組み。どれも成功したかのように返ってきます。pdfvision はテキスト、レイアウト、ページ画像を抽出し、問題をページ単位で警告し、次に取るべき手段まで示します。
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
  - title: 信頼する前に確かめる
    details: ページごとに、テキストだけでなく品質シグナルが付きます。警告は文字化け、画像化されたテキスト、読み順の乖離といったリスクを名指しし、次に取るべき手段で締めくくります。
  - title: コンテキストは段階的に使う
    details: まず低コストなネイティブテキストから始め、長い文書はページで絞り込み、シグナルが精査を促した箇所だけレイアウト、OCR、レンダリングを有効にします。
  - title: 検索して、ズームして、レンダリング
    details: テキストの根拠を見つけ、一致した領域だけをレンダリングします。全ページの画像ではなく、小さなクロップ 1 枚だけが Vision モデルに届きます。
---

## なぜ pdfvision か

PDF 抽出のいちばん厄介な性質は、失敗が成功のように見えることです。スキャンは空のテキストを返し、壊れたフォントマップは一見読めそうなゴミを返し、2 段組みの論文は段が入り混じって返ってきます。そのどれもが、正常に成功した結果として返ってきます。それを信じたエージェントは、何かがおかしいと気づかないまま誤った答えを出します。

この領域の多くのツールが目指しているのは変換です。PDF をきれいな Markdown に変え、その結果が忠実であることを願います。pdfvision が目指すのは診断です。抽出を信頼できないページに印を付け、その箇所に絞った視覚的な根拠を取りにいきます。

pdfvision が前提にしているループはこうです。

1. PDF のネイティブ信号を抽出する。
2. その信号が信頼できるかを確認する。
3. 必要な根拠がある場所を特定する。
4. そのページや領域だけをレンダリングまたは OCR する。

これは人間が PDF を読む流れに近いものです。ページをざっと見て、視覚的なページと抽出テキストが食い違う場所に気づき、答えの決め手となるグラフやフォーム欄を拡大する、という流れです。

## エージェントに渡せるもの

- **すべてのページに品質シグナル。** 文字数、画像数、ベクター数、テキストカバレッジ、ネイティブテキスト状態に加えて、人間なら気づく手がかりを警告として返します。どの警告も対処法で終わるので、エージェントがフォントマップやコンテンツストリームを理解する必要はありません。
- **必要な場所にだけ根拠を。** ネイティブテキスト、フォーム値、注釈、リンク、OCR 出力を横断して検索できます。一致にはページ番号とバウンディングボックスが付くので、そのままクロップしてレンダリングできます。
- **エージェントがそのまま動ける構造化出力。** JSON、Markdown、TOON、XML で、レイアウトブロック、フォームフィールド、リンク、アウトライン、添付ファイルを出力します。いずれもオプトインなので、既定の呼び出しは軽いままです。

レイアウト復元、OCR、visual region など残りの機能は [ガイド](./guide/) で扱います。

## クイックスタート

インストールせずに実行します。

```bash
npx pdfvision document.pdf
```

抽出がうまくいかないときは、ページ自身がそう伝えます。次の例で警告が指摘しているのは見た目の順序とネイティブテキストの順序の乖離ですが、警告が引用している行はもうひとつの問題も明らかにします。この PDF のフォントマップでは、図のラベル列が文字化けするのです。

```console
$ pdfvision tracemonkey.pdf -p 10
_chars: 6944 · images: 0 · coverage: 42% · vectors: 17 · warnings: 1 · size: 612×792pt_
… page body …
### Warnings
> **warning** (reading_order_divergence): layout line "?>9@AJ.0A:</C./8-2#3$4%56#" appears
> after "?>9@AJ.D<F@-<>2.@A:0>#3$4,56#" visually but earlier in the native text stream —
> native line order diverges from what a human reads; the body above is that reading order,
> rebuilt from the layout — render the page when exact sequence is critical
```

この警告がなければ、エージェントは `?>9@AJ.0A:</C./8-2#3$4%56#` を抽出成功として読み、そのまま気づかずに終わります。

マルチモーダルモデル向けにページ画像をレンダリングします。

```bash
npx pdfvision document.pdf --render
```

URL から PDF を取得して JSON で抽出します。

```bash
npx pdfvision --remote https://raw.githubusercontent.com/mozilla/pdf.js-sample-files/master/tracemonkey.pdf --format json
```

根拠を検索し、一致領域だけをクロップします。

```bash
npx pdfvision report.pdf --search "revenue" --json
npx pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-output ./crops --json
```

全ページをレンダリングせずに視覚構造を調べます。

```bash
npx pdfvision slides.pdf --layout --image-boxes --vector-boxes --visual-regions --json
npx pdfvision slides.pdf --render-visual-regions --render-output ./regions --json
```

## ドキュメント

- [はじめに](./guide/) で基本の流れを確認できます。
- [ユースケース](./guide/use-cases) は PDF 種別ごとの実行パターンを整理しています。
- [CLI オプション](./guide/command-line-options) は用途別に主要フラグを整理しています。
- [構造化出力](./guide/structured-output) はエージェントやツールが読むフィールドを説明します。
- [レイアウトと警告](./guide/layout-and-warnings) は視覚構造のシグナルを詳しく扱います。
- [レンダリングと OCR](./guide/rendering-and-ocr) は画像出力、領域クロップ、スキャン文書を扱います。
- [検索と領域ズーム](./guide/search-and-region-zoom) はテキスト根拠を探し、一致領域だけをレンダリングする流れを説明します。
