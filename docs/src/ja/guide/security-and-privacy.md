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

## パスワード

PDF パスワードは pdf.js の復号にのみ使われ、出力には含まれません。

```bash
printf "your-password\n" | pdfvision encrypted.pdf --password-stdin --format json
```

CLI では `--password-stdin` を優先してください。

## 共有前の確認

構造化出力には本文、メタデータ、注釈、フォーム値、リンク、JavaScript action、添付ファイル名、レンダリング画像パスが含まれ得ます。第三者の AI サービスに渡す前に必ず確認してください。
