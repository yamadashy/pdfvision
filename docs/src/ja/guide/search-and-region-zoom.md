---
title: 検索と領域ズーム
description: pdfvision で PDF テキスト、フォーム、注釈、OCR 出力を検索し、一致した領域だけを PNG クロップとしてレンダリングする方法。
---

# 検索と領域ズーム

pdfvision は、まずテキストの根拠を探し、その一致領域だけをレンダリングできます。条項、表セル、図のラベル、フォーム値、OCR 結果を、ページ全体の画像を渡さずに確認したいときに有効です。

## PDF を検索する

```bash
pdfvision report.pdf --search "revenue" --json
```

一致結果は `pages[].matches[]` に出ます。各 match にはページ番号、query、source、テキスト断片、位置を特定できた場合の bbox が含まれます。

複数の query は `--search` を繰り返します。

```bash
pdfvision paper.pdf --search "transformer" --search "attention" --json
```

既定ではリテラル検索、大文字小文字を区別しない検索、NFKC を考慮した検索です。必要なときだけ regex や厳密な大小文字一致を使います。

```bash
pdfvision report.pdf --search "Q[1-4] revenue" --search-regex --json
pdfvision report.pdf --search "PDF" --search-case-sensitive --json
```

## 検索対象

検索は次の信号を対象にできます。

- PDF のネイティブテキスト。
- `--form-fields` のテキスト値や choice 値。
- `--annotations` の表示される FreeText 注釈。
- `--ocr` の OCR テキスト。利用できる場合は OCR word box を使います。

ネイティブ、フォーム、注釈の match と重複する OCR match は抑制されるため、同じ表示テキストが二重に出にくくなります。

## 一致領域をレンダリングする

match の bbox を `--render-region` に渡します。

```bash
pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-output ./crops --json
```

`--render-region` は選択ページがちょうど 1 ページである必要があります。領域は左上原点の PDF ポイントで、ページ境界内に収まる必要があります。

小さいラベル、上付き文字、密な表セル、チャート凡例では `--render-scale` を上げます。

```bash
pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-scale 3 --render-output ./crops --json
```

## エージェントの流れ

1. `--search` で候補の根拠を探す。
2. `pages[].matches[]` から page、source、bbox が適切な match を選ぶ。
3. `--pages`、`--render`、`--render-region` で視覚クロップを作る。
4. クロップをネイティブテキスト、OCR テキスト、周辺 layout block と比較する。

テキスト検索できない視覚領域には、[レンダリングと OCR](./rendering-and-ocr.md) の `--visual-regions` または `--render-visual-regions` を使います。
