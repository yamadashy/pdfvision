---
title: CLI オプション
description: pdfvision の CLI フラグを入力、出力、レイアウト、レンダリング、OCR、PDF 機能、キャッシュごとに整理します。
---

# CLI オプション

このページでは主要フラグを用途別に整理します。正確な最新ヘルプは `pdfvision --help` を確認してください。

## 入力

| オプション | 用途 |
| --- | --- |
| `<file.pdf>` | ローカル PDF を読み込みます。 |
| `--remote <url>` | HTTP(S) PDF をキャッシュに取得し、検証してから抽出します。 |
| `--pages <range>` | `1-5`, `3`, `1,3,5` のようなページ範囲を指定します。 |
| `--password <value>` | 暗号化 PDF のパスワードを指定します。 |
| `--password-stdin` | 標準入力からパスワードを読みます。空なら `--password` にフォールバックします。 |

## 出力

| オプション | 用途 |
| --- | --- |
| `--format <type>` | `markdown`, `json`, `xml`, `toon` を選びます。 |
| `--no-normalize` | Unicode NFKC 正規化を無効化します。 |

## レンダリング

| オプション | 用途 |
| --- | --- |
| `--render` | 選択ページを PNG としてレンダリングします。 |
| `--render-output <dir>` | 画像の出力先ディレクトリを指定します。 |
| `--render-scale <n>` | ラスタライズ倍率を指定します。 |
| `--render-region <x,y,width,height>` | 1 ページ内の矩形だけをレンダリングします。 |

## レイアウトと視覚構造

| オプション | 用途 |
| --- | --- |
| `--geometry` | `pages[].spans` にテキスト項目の bbox とフォントサイズを出します。 |
| `--layout` | 行、ブロック、縦書き CJK、数値表ヒント、レイアウト警告を復元します。 |
| `--image-boxes` | ラスター画像の bbox を `pages[].imageBoxes` に出します。 |
| `--vector-boxes` | ベクター描画の bbox を `pages[].vectorBoxes` に出します。 |
| `--visual-regions` | 図、表、フォーム、チャートなどのクロップ可能な領域を出します。 |
| `--render-visual-regions` | 視覚領域のクロップ画像をレンダリングします。 |

## PDF 機能

| オプション | 用途 |
| --- | --- |
| `--form-fields` | ウィジェットフィールド、ラベル、選択肢、アクションなどを出します。 |
| `--links` | リンク注釈とリンク先を出します。 |
| `--annotations` | 非リンク注釈、添付、図形ジオメトリを出します。 |
| `--structure` | Tagged PDF の構造ツリーを出します。 |
| `--page-labels` | ビューア上のページラベルを出します。 |
| `--attachments` | 埋め込み添付ファイルのメタデータを出します。 |
| `--outline` | 目次、URL、アクションを出します。 |
| `--viewer` | ビューア設定と JavaScript アクションを出します。 |
| `--layers` | Optional Content Group とレイヤー順を出します。 |

## OCR とキャッシュ

| オプション | 用途 |
| --- | --- |
| `--ocr` | Tesseract OCR を実行し `pages[].ocr` を追加します。 |
| `--ocr-lang <lang>` | `eng`, `jpn`, `eng+jpn` のように OCR 言語を指定します。 |
| `--no-cache` | ディスクキャッシュを使いません。 |
| `--clear-cache` | キャッシュを削除して終了します。 |
