---
title: FAQ
description: 空のテキスト、スキャン、レイアウト、OCR、レンダリング、キャッシュ、パスワードに関するよくある質問。
---

# FAQ

## 抽出テキストが空になるのはなぜですか？

スキャン、画像中心、暗号化、独自グリフエンコーディングなどが原因です。概要フィールドと `pages[].warnings` を確認し、`--render`, `--ocr`, `--layout` を試してください。

## `--layout` はいつ使いますか？

段組み、表、フォーム、脚注、繰り返しヘッダーやフッター、縦書き CJK、配置で意味が変わるページで使います。

## OCR はいつ使いますか？

ネイティブテキストが無い、少ない、スキャン風、またはレンダリング画像と明らかに違う場合に使います。

## 座標系はどうなっていますか？

bbox は PDF user-space points で、左上が原点です。`x` は右、`y` は下に増えます。

## キャッシュはどこにありますか？

OS の一時ディレクトリ配下に保存されます。`PDFVISION_CACHE_DIR=/path` で変更でき、`--no-cache` で無効化、`pdfvision --clear-cache` で削除できます。

## PDF パスワードはどう渡すべきですか？

プロセス引数に残らないよう `--password-stdin` を優先してください。

```bash
printf "your-password\n" | pdfvision encrypted.pdf --password-stdin --format json
```
