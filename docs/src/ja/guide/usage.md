---
title: 使い方
description: ローカル PDF、リモート PDF、ページ範囲、レンダリング、レイアウト、OCR、暗号化 PDF の基本操作。
---

# 使い方

このページではよく使うコマンドパターンをまとめます。未知の PDF では、まず構造化された初回パスを取り、ページ overview を見てから、根拠が必要な箇所にだけレイアウト、レンダリング、OCR、検索、視覚領域を追加します。

## 推奨される初回パス

```bash
pdfvision document.pdf --json
```

この出力で次を判断します。

- どのページに使えるネイティブテキストがあるか。
- どのページが視覚的、スキャン風、または glyph-corrupted か。
- どのページに警告があるか。
- どのページにレイアウト復元、OCR、レンダリングクロップが必要か。

## ローカル PDF

```bash
pdfvision document.pdf
```

## リモート PDF

```bash
pdfvision --remote https://example.com/document.pdf --format json
```

リモート PDF はキャッシュされ、PDF として検証されてから抽出されます。URL が HTML、ログインページ、チャレンジページを返す場合はキャッシュ前に失敗します。

`--remote` は HTTP(S) URL のみを受け付け、リダイレクトを追跡し、レスポンス本文の先頭付近に PDF ヘッダーがない場合は拒否します。既定のダウンロード制限は保守的で、最大 100 MB、ネットワークタイムアウト 60 秒です。

リモートキャッシュは URL ごとに管理されます。安定した URL の中身が差し替えられる場合は、1 回だけ新しく取得するなら `--no-cache`、キャッシュを消すなら `--clear-cache` を使います。

```bash
pdfvision --remote https://example.com/document.pdf --no-cache --format json
```

## ページ範囲

```bash
pdfvision document.pdf --pages 1-3
pdfvision document.pdf --pages 1,3,5 --format json
```

ページ範囲は 1 始まりの物理ページ番号です。カンマで複数の指定を組み合わせ、範囲は両端を含み、重複ページはソートされた出力にまとめられます。

有効な例:

- `1`
- `1-5`
- `1,3,5`
- `2-4,7`

空の区切り、0、負数、`5-3` のような降順範囲、不正な範囲は推測せずにエラーになります。指定に文書末尾を超えるページが含まれていても、実在ページが 1 つ以上選ばれていれば、そのページを抽出し、スキップされたページについて警告を出します。

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

2 段組み論文、スライド、財務レポート、表、フォーム、グラフ、ダイアグラムなど、視覚的な配置で意味が変わるページに使います。

## 重要領域だけをレンダリング

```bash
pdfvision document.pdf --render-visual-regions --render-output ./regions --format json
```

ページ全体ではなく、図、表、フォーム、チャートなどの領域だけを確認したいときに使います。

## 検索してズーム

```bash
pdfvision report.pdf --search "revenue" --format json
pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-output ./crops --format json
```

検索結果には、位置を特定できる場合に bbox が含まれます。その bbox を `--render-region` に渡すと、視覚確認用の小さなクロップを作れます。

回答を監査可能な PDF 根拠に結びつけたい場合に有効です。用語を検索し、該当ページと bbox を選び、必要最小限のクロップだけをレンダリングします。

## スキャンページの OCR

```bash
pdfvision scan.pdf --ocr --ocr-lang eng --format json
pdfvision japanese-scan.pdf --ocr --ocr-lang eng+jpn --format json
```

OCR 結果にはテキスト、信頼度、言語、単語ボックスが含まれます。

OCR はネイティブテキストの横に付与されます。`pages[].text` を置き換えないため、エージェントはネイティブ抽出と OCR を比較して、どちらの根拠を信頼するか判断できます。

## フォーム、リンク、注釈

```bash
pdfvision form.pdf --layout --form-fields --annotations --links --format json
```

PDF にウィジェット値、チェックボックス、ラジオグループ、見えるコメント、リンク、またはページ上の位置に依存するフォームラベルが含まれる場合に使います。

## アウトライン、ページラベル、文書機能

```bash
pdfvision document.pdf --page-labels --outline --viewer --layers --format json
```

物理ページ番号と異なるページラベル、しおり、open action、optional content layer、viewer preference など、PDF viewer での見え方が意味を持つ場合に使います。

## 暗号化 PDF

```bash
pdfvision encrypted.pdf --password your-password --format json
printf "your-password\n" | pdfvision encrypted.pdf --password-stdin --format json
```

パスワードをシェル履歴やプロセス引数に残したくない場合は `--password-stdin` を優先してください。

## キャッシュ制御

```bash
pdfvision document.pdf --no-cache --json
pdfvision --clear-cache
```

pdfvision は抽出結果、レンダリング画像、リモートダウンロード、OCR データをキャッシュし、エージェントが同じ PDF を繰り返し読むときの待ち時間を減らします。機密性の高い 1 回限りの実行では `--no-cache`、キャッシュ削除には `--clear-cache` を使います。

アプリケーション側でキャッシュ場所を固定したい場合は `PDFVISION_CACHE_DIR` を設定します。

```bash
PDFVISION_CACHE_DIR=/secure/pdfvision-cache pdfvision document.pdf --json
```

リモート PDF では、`--no-cache` はリモート PDF キャッシュもスキップし、新しくダウンロードしたバイト列を直接抽出に渡します。URL が private、期限付き、またはバージョンなしで変わる場合に最も安全です。
