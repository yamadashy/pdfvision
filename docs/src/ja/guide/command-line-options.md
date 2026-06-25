---
title: CLI オプション
description: PDF 入力、出力形式、レンダリング、OCR、検索、レイアウト、メタデータ、キャッシュに関する pdfvision CLI オプションの一覧です。
---

# CLI オプション

このページでは CLI フラグを用途別に整理します。インストール済みバージョンの正確なヘルプは `pdfvision --help` を確認してください。

## 入力

| オプション | 用途 |
| --- | --- |
| `<file.pdf>` | ローカル PDF を読み込みます。 |
| `--remote <url>` | HTTP(S) PDF を取得し、PDF ヘッダーを検証してから抽出します。`--no-cache` がない限りキャッシュされます。 |
| `-p, --pages <range>` | `1`, `1-5`, `1,3,5`, `2-4,7` のようにページを指定します。既定は全ページです。 |
| `--password <value>` | 暗号化 PDF をパスワードで開きます。パスワードは出力されません。 |
| `--password-stdin` | 標準入力からパスワードを読みます。標準入力が空なら `--password` にフォールバックします。 |

## 出力形式

| オプション | 用途 |
| --- | --- |
| `-f, --format <type>` | `markdown`, `json`, `xml`, `toon` を出力します。既定は `markdown` です。 |
| `--markdown` | `--format markdown` のショートカットです。 |
| `--json` | `--format json` のショートカットです。 |
| `--xml` | `--format xml` のショートカットです。 |
| `--toon` | `--format toon` のショートカットです。 |
| `--no-normalize` | Unicode NFKC 正規化を無効にします。正規化が有効な場合、JSON/XML では変更前の文字列が `rawText` に残ります。 |

複数の出力ショートカットや、ショートカットと矛盾する `--format` の組み合わせはエラーになります。

## レンダリング

| オプション | 用途 |
| --- | --- |
| `-r, --render` | 選択ページを PNG としてレンダリングし、ページ結果に画像パスを付けます。 |
| `--render-output <dir>` | ページ PNG または視覚領域 PNG の出力先を指定します。`--render` または `--render-visual-regions` が必要です。 |
| `--render-scale <n>` | `--render`, `--render-visual-regions`, `--ocr` のラスタライズ倍率を指定します。既定は `2`、範囲は `(0, 4]` です。 |
| `--render-region <x,y,width,height>` | PDF ポイントの矩形だけをレンダリングします。`--render` または `--ocr` が必要で、`--pages` は 1 ページに解決される必要があります。 |

座標は左上原点で、`x` は右、`y` は下に増えます。layout block、image box、vector box、search match、visual region と同じ座標系です。

## レイアウトと視覚構造

| オプション | 用途 |
| --- | --- |
| `--geometry` | `pages[].spans` にテキスト項目の bbox とフォントサイズを出します。構造化形式向けです。 |
| `--layout` | 行、ブロック、縦書き CJK、数値表ヒント、Markdown のレイアウト順、レイアウト警告を復元します。 |
| `--image-boxes` | ラスター画像の bbox を `pages[].imageBoxes` に出します。 |
| `--vector-boxes` | ベクター描画の bbox を `pages[].vectorBoxes` に出します。 |
| `--visual-regions` | 図、チャート、表、フォーム、注釈、ラスター/ベクタークラスターのクロップ可能な領域を出します。 |
| `--render-visual-regions` | 視覚領域クロップを PNG としてレンダリングし、パス、content ratio、より狭い content box を付けます。`--visual-regions` を含みます。 |
| `--strip-repeated` | Markdown 出力から繰り返しヘッダー、フッター、ページ番号ブロックを除きます。`--layout` が必要で、Markdown のみです。 |

## 検索

| オプション | 用途 |
| --- | --- |
| `--search <query>` | 出現箇所を探し、ページ、source、text、query、bbox を含む `pages[].matches[]` を出します。繰り返し指定できます。 |
| `--search-regex` | 各 `--search` 値を JavaScript 正規表現として扱います。 |
| `--search-case-sensitive` | 大文字小文字を区別します。既定は区別しません。 |

検索は既定で NFKC を考慮し、ネイティブテキスト、フォームフィールド、link targets、表示される FreeText 注釈、`--ocr` 有効時の OCR テキストを対象にできます。

## PDF 機能

| オプション | 用途 |
| --- | --- |
| `--form-fields` | ウィジェットフィールド、フラグ、アクション、export value、選択肢、値、bbox、近くのラベルを出します。Markdown ではフォーム表も出ます。 |
| `--links` | リンク注釈、bbox、URL、名前付き destination、解決できた遷移先ページを出します。 |
| `--annotations` | コメント、ハイライト、スタンプ、ファイル添付、図形、ink などの非リンク注釈を出します。 |
| `--structure` | PDF が持つ tagged-PDF 構造ツリーを出します。 |
| `--page-labels` | `pageLabels` と `pages[].pageLabel` にビューア上のページラベルを出します。 |
| `--attachments` | 埋め込み添付ファイルのメタデータを出します。ファイル本体は構造化出力に埋め込みません。 |
| `--attachment-output <dir>` | 埋め込み添付ファイルをディスクへ書き出します。`--attachments` が必要です。 |
| `--outline` | 文書アウトライン/ブックマーク、階層、URL、アクション、解決できた destination を出します。 |
| `--viewer` | ビューア設定、open action、JavaScript action、権限、MarkInfo を出します。 |
| `--layers` | optional content group、表示状態、radio group、ビューアパネル順を出します。 |

## OCR

| オプション | 用途 |
| --- | --- |
| `--ocr` | Tesseract OCR を実行し、text、confidence、language、word box を含む `pages[].ocr` を追加します。 |
| `--ocr-lang <lang>` | `eng`, `jpn`, `eng+jpn` のように OCR 言語を指定します。既定は `eng` です。 |

OCR は `pages[].text` を上書きしません。ネイティブテキストの横に追加されるため、エージェントが両方を比較できます。

## キャッシュとヘルプ

| オプション | 用途 |
| --- | --- |
| `--no-cache` | ディスク上の抽出キャッシュを使いません。`--remote` ではダウンロードした PDF を remote-PDF キャッシュに書かず直接処理します。 |
| `--clear-cache` | 抽出、レンダリング PNG、remote download のキャッシュを削除して終了します。 |
| `-v, --version` | pdfvision のバージョンを表示します。 |
| `-h, --help` | CLI ヘルプを表示します。 |

## 終了コード

| コード | 意味 |
| --- | --- |
| `0` | 成功。 |
| `1` | 引数エラー、ファイル未検出、ネットワークエラー、抽出失敗。エラーメッセージは stderr に出ます。 |
