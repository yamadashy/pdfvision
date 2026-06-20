---
title: レイアウトと警告
description: pdfvision のレイアウト復元、視覚領域、ジオメトリ、ページ警告を説明します。
---

# レイアウトと警告

PDF の意味は、文字だけでなく配置にもあります。段組み、見出し、フォームラベル、表、脚注、図、リンク、注釈、繰り返しヘッダーやフッターは、読み方に影響します。`--layout` はそれらの信号を平坦化せずに保持します。

AI エージェントでは、もっともらしいテキストストリームが間違っていることがあります。2 段組み論文を列をまたいで読んだり、財務表の行境界を失ったり、フォーム値がラベルから離れたり、フッターを本文として扱ったりします。pdfvision は、エージェントがそれに気づけるようにレイアウトと warning を出します。

## レイアウト復元

```bash
pdfvision document.pdf --layout --format json
```

主な出力:

- `pages[].layout.lines`: ジオメトリ付きの復元行。
- `pages[].layout.blocks`: 読み順ブロック、役割、bbox。
- `pages[].layout.tables`: ネイティブテキストで崩れやすい数値表のヒント。
- 縦書き CJK テキストの復元。

Markdown 出力では、ネイティブテキストストリームと視覚的読み順が乖離する場合に、復元された layout order を利用できます。

layout が必要な場面:

- 段組み、サイドバー、キャプション、脚注がある。
- 見出しや section hierarchy がタスクに関わる。
- フォームラベルと値を関連付ける必要がある。
- 表の行と列が重要。
- 繰り返しのページ chrome を本文として扱いたくない。
- search result や抽出フィールドに、検証用の視覚座標が必要。

`layout.blocks` はネイティブテキストを隠すためのものではありません。geometry と role hints を持つ別の reading-order view を提供し、`pages[].text` と比較できるようにします。

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

`--render-visual-regions` は、エージェントがその領域だけを見たい場合に使います。

これは「すべてをテキストとして抽出する」と「PDF を見る」の違いです。スライドのグラフ、署名欄、吹き出し図、表の罫線は有用なネイティブテキストをほとんど持たないことがありますが、image/vector geometry が見るべき場所を教えます。

visual regions は multimodal model への橋渡しとして使えます。

1. `--visual-regions` で候補領域を見つける。
2. kind、page、bbox、関連テキストが合う領域を選ぶ。
3. `--render-region` または `--render-visual-regions` でレンダリングする。
4. vision model にその根拠だけを検査させる。

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
- フォーム、グラフ、ダイアグラムのような密なベクターページ。

警告は最終判断ではなく、エージェントが次に確認すべき場所を示す手がかりです。

## エージェントは警告をどう使うべきか

warning は routing signal として扱います。

- ネイティブテキストが glyph-corrupted なら、要約前に render または OCR と比較する。
- 読み順が乖離しているなら、物語的な順序には raw page text より layout blocks を優先する。
- table warning があるなら、行/列の根拠を保持し、値が重要なら表を crop する。
- large raster や dense vector の warning があるなら、検証するまで label が visual-only だと仮定する。
- repeated chrome が関わるなら、ヘッダー、フッター、ページ番号、本文を混ぜない。

重要なのは、抽出全体を失敗扱いにしないことです。pdfvision はエージェントが次の観測ステップを選べるだけの根拠を返します。
