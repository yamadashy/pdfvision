---
title: レンダリングと OCR
description: pdfvision でページ全体、視覚領域、スキャン PDF を扱う方法。
---

# レンダリングと OCR

スキャン、スライド、図表、スクリーンショット、視覚的なフォームでは、ネイティブ PDF テキストだけでは足りません。レンダリングと OCR によりページを確認可能にします。

pdfvision はレンダリングを最後の手段ではなく、根拠の一種として扱います。エージェントはまずネイティブテキストを読み、ページが視覚的に埋まっている、または抽出結果が疑わしいと気づいたら、ページ全体か小さなクロップだけをレンダリングできます。これにより、マルチモーダル呼び出しを絞り込み、監査可能な形にできます。

## いつレンダリングするか

ページの意味が視覚的な場合、または抽出シグナルが「ネイティブテキストは人間が見る内容を表していないかもしれない」と示す場合にレンダリングします。よくあるトリガーは、高い image/vector count、見える内容があるのに疎なテキスト、図表中心のページ、フォーム、スクリーンショット、地図、スライド、OCR レイヤーや glyph-corrupted text の warning です。

すべてをレンダリングする必要はありません。overview から始め、重要なページまたは領域だけをレンダリングします。

## ページ全体をレンダリング

```bash
pdfvision document.pdf --render --render-output ./images --format json
```

選択ページに画像パスが付きます。レンダリング画像はレイアウト bbox と同じ上始点の座標系で扱えます。

```bash
pdfvision document.pdf --render --render-scale 3
```

小さい倍率は画像サイズを抑え、大きい倍率は小さなラベルや密な図に向いています。

ページ全体をレンダリングする典型例:

- PDF がスキャン、スライド、図表中心レポート、スクリーンショット、地図、パンフレットである。
- warning がネイティブテキストの疎さ、文字化け、視覚との矛盾を示す。
- タスクが正確な視覚配置に依存する。
- モデルがテキストだけでなくページの見た目を確認する必要がある。

画像パスは `pages[].image` に返るため、エージェントは vision-capable model に直接渡せます。

## 1 領域だけをレンダリング

```bash
pdfvision document.pdf --pages 2 --render --render-region 120,180,360,240 --render-output ./regions
```

`--render-region` は PDF ポイントの矩形を指定します。レイアウトブロックや視覚領域で見つけた場所を拡大する用途に向いています。

検索結果の bbox からも同じ流れでクロップできます。詳しくは [検索と領域ズーム](./search-and-region-zoom.md) を参照してください。

領域レンダリングは次に向いています。

- 契約条項や表セルを 1 つだけ検証する。
- グラフ凡例や軸ラベルを読む。
- checkbox group やフォーム値を確認する。
- 数式、図キャプション、スクリーンショットの細部を確認する。
- vision model に渡す画像 token を、根拠領域だけに抑える。

## 視覚領域をレンダリング

```bash
pdfvision document.pdf --render-visual-regions --render-output ./regions --format json
```

図、チャート、フォーム、表、ダイアグラムなどの重要領域だけをクロップします。

エージェントがまだ座標を知らない場合に使います。pdfvision は layout、image、vector、annotation、form evidence から visual region を提案し、それぞれを PNG としてレンダリングできます。

## OCR

```bash
pdfvision scan.pdf --ocr --ocr-lang eng --format json
```

OCR 出力にはテキスト、信頼度、言語、単語ボックスが含まれます。

複数言語は `+` でつなぎます。

```bash
pdfvision scan.pdf --ocr --ocr-lang eng+jpn --format json
```

OCR は、密度シグナルや warning がネイティブテキストの欠落、疎さ、scan-like、低品質を示すときに最も有効です。

OCR はネイティブテキストを上書きしません。第 2 の信号として付与されるため、エージェントは次を比較できます。

- PDF text layer 由来のネイティブテキスト。
- レンダリングされた pixels 由来の OCR テキスト。
- OCR confidence と word boxes。
- page quality と warnings。

この比較は、隠し OCR レイヤーを持つスキャン PDF で重要です。見た目とは一致しない不可視テキスト層がある PDF でも、pdfvision は両方の信号を見える状態にし、食い違いがあれば warning します。

## 実用的な戦略

次の順でエスカレーションします。

1. `pdfvision document.pdf --json` を実行する。
2. ページが視覚的または疑わしければ `--render` を使う。
3. 見えている文字がネイティブ抽出に無ければ `--ocr` を使う。
4. 1 領域だけが重要なら、`--search`、`--visual-regions`、layout boxes からクロップする。
5. 小さな文字が読みにくければ `--render-scale` を上げる。

多くのページがすでに読める場合に、全ページで OCR や full-page vision を走らせる必要はありません。
