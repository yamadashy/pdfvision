---
title: セキュリティとプライバシー
description: pdfvision のローカル処理、リモート PDF、パスワード、キャッシュ、OCR traineddata、添付ファイル、JavaScript action の扱い。
---

# セキュリティとプライバシー

pdfvision はローカルで動作します。テレメトリを収集せず、PDF 内容をサービスにアップロードしません。

## ローカル処理

ローカルファイルの抽出は手元のマシンで行われます。レンダリング画像、OCR traineddata、リモートダウンロード、抽出キャッシュは pdfvision のキャッシュディレクトリに保存されます。

```bash
pdfvision --clear-cache
```

で pdfvision が管理するキャッシュを削除できます。

## リモート PDF

`--remote` は HTTP(S) URL をダウンロードし、PDF として検証してから抽出します。

```bash
pdfvision --remote https://example.com/document.pdf --format json
```

リモートサーバーにはアクセスが見えます。プライベート URL ではネットワークアクセスが許容できる場合だけ使ってください。

`http:` と `https:` のみ受け付けます。リダイレクトは追跡しますが、非 PDF response は remote cache に入る前に拒否されます。本文の先頭付近に PDF header があるかを確認し、download limit を超える response を拒否し、network timeout により stalled server が CLI を保持し続けないようにします。

private URL や期限付き URL で 1 回だけ取得する場合は、`--remote --no-cache` を使い、ダウンロードした PDF bytes を remote-PDF cache に残さないようにします。

## パスワード

PDF パスワードは pdf.js の復号にのみ使われ、出力には含まれません。

```bash
printf "your-password\n" | pdfvision encrypted.pdf --password-stdin --format json
```

CLI では `--password-stdin` を優先してください。

`--password <value>` も明示的な fallback として使えますが、shell history や process listings に残る可能性があります。

## キャッシュ場所と権限

既定では OS の temp directory 配下にキャッシュします。場所を制御するには `PDFVISION_CACHE_DIR` を設定します。

```bash
PDFVISION_CACHE_DIR=/secure/cache pdfvision document.pdf --format json
```

キャッシュには抽出テキスト、レンダリング PNG、リモート PDF、OCR traineddata、OCR output が含まれる可能性があります。処理する PDF と同じ機密度でキャッシュディレクトリを扱ってください。

pdfvision は POSIX 環境で制限的なファイル権限を使い、symlink や time-of-check/time-of-use に関連する一般的な cache 問題を避けるようにします。`--clear-cache` は設定された cache root 配下の pdfvision 管理データを削除します。

## 添付ファイルと JavaScript action

`--attachments` は埋め込みファイルの metadata を出し、`--attachment-output` を使うと埋め込みファイルを disk に書き出せます。抽出された attachment は untrusted file として扱ってください。

attachment filenames は書き出し前に sanitize されます。path separators と control characters は置換され、空の名前には fallback が入り、重複名は disambiguate されます。pdfvision は symlinked output directory への attachment output も拒否します。これらは filesystem risk を下げますが、埋め込みファイルを安全に開けるようにするものではありません。

`--viewer` と form-field actions は PDF JavaScript source を data として露出することがあります。pdfvision は PDF JavaScript を実行しません。

viewer permissions は document metadata として報告されます。PDF が reader に許可/拒否してほしいことを示すだけで、security boundary や DRM enforcement として扱うべきではありません。

## Search Regex の安全性

既定の検索は query を literal text として扱います。`--search-regex` は各 query を JavaScript regular expression としてコンパイルし、native text、form-field text、visible FreeText annotations、OCR 有効時の OCR text に対して実行します。

regex mode は信頼できる pattern にだけ使ってください。pdfvision は query、page、source ごとの出力 match 数を制限しますが、JavaScript regular expression は結果を出す前に catastrophic backtracking で長時間かかる可能性があります。untrusted user に regex search を公開するアプリケーションでは、独自の timeout や worker isolation を使ってください。

## 共有前の確認

構造化出力には本文、メタデータ、注釈、フォーム値、リンク、JavaScript action、添付ファイル名、レンダリング画像パスが含まれ得ます。第三者の AI サービスに渡す前に必ず確認してください。
