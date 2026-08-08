---
title: 出力形式
description: pdfvision の Markdown、JSON、XML、TOON 出力の選び方。
---

# 出力形式

pdfvision は同じ抽出根拠を複数の形式で表現できますが、シリアライズ契約は形式ごとに異なります。

出力を読む相手に応じて形式を選びます。人間、LLM prompt、tool、token 制約のある agent loop では適した表現が違います。抽出される根拠フィールドは同じで、形式だけが変わります。

## Markdown

```bash
pdfvision document.pdf
pdfvision document.pdf --format markdown
```

Markdown はデフォルトです。会話型 AI のコンテキストに渡しやすいよう、概要テーブル、ページごとの本文、警告、レンダリング画像リンクを含みます。構造化フィールドは意図的に変換・省略され、`rawText` は出力されません。`--strip-repeated` は繰り返しブロックを本文から除きます。

人間または chat model が直接読む場合に使います。会話の中で文書を推論し、次に実行すべき pdfvision コマンドを出す初回パスにも向いています。

## JSON

```bash
pdfvision document.pdf --format json
```

JSON は完全な `DocumentResult` スキーマを出力します。ツール、エージェント、テスト、後続処理に最適です。

代表的なフィールド:

- `pages[].layout`
- `pages[].warnings`
- `pages[].spans`
- `pages[].imageBoxes`
- `pages[].visualRegions`
- `pages[].ocr`
- `outline`, `attachments`, `layers`, `viewer`

プログラムで分岐したい場合に使います。OCR すべきページを選ぶ、検索一致を render region に変換する、warning を抽出結果と一緒に保存する、画像パスを別ツールへ渡す、といった用途に最適です。

## XML

```bash
pdfvision document.pdf --format xml
```

XML はタグ形式の near-parity 表示用 projection であり、可逆な `DocumentResult` シリアライズではありません。`page` は `no`、`pageLabel` は `label` に対応し、ネストされた `quality` はページ属性へ平坦化されます。ページ結果の rotation は属性に残りますが、overview の rotation は現在省略され、空フィールドの扱いも異なります。

`rawText` は兄弟の `<rawText>`、`repeated: true` は `<block repeated="true">`、トップレベルの `xfa: true` は `<document xfa="true">` になります。

XML 1.0 では、ほとんどの C0 制御文字、`U+FFFE` / `U+FFFF`、単独の UTF-16 サロゲートを扱えません。pdfvision は XML を整形式に保つため、禁止されたコードユニットを `[[pdfvision:U+XXXX]]` として表します。元のテキストにある `[[pdfvision:` は `[[pdfvision:literal:` に変換するので、通常の文字列と生成したマーカーは衝突しません。元のコードユニットが必要な場合は、XML の parse 後に左から一度だけ走査します。`literal:` の escape は元の prefix に戻し、戻した prefix を再走査せず、生成されたコードユニットマーカーだけをデコードしてください。

`<page>`、`<text>`、`<warning>`、match、layout block の明示的な境界を前提とする利用側やプロンプトで使います。

## TOON

```bash
pdfvision document.pdf --format toon
```

出力された TOON は、デコードすると JSON のデータモデルと完全に一致します。未設定の `undefined` フィールドも存在しません。ただし TOON の文字列文法では、単独の UTF-16 サロゲートを UTF-8 の境界越しに保持できません。この場合、pdfvision は文字化けさせずにエラーとし、JSON の利用を案内します。正しいサロゲートペアと、文字どおりの `\uD800` は保持されます。フィールドが同じオブジェクト配列は、フィールド名を一度だけ宣言する表形式にできます。形が揃ったネストされたオブジェクトはヘッダーに畳み込まれます（例: `overview[]` の `quality{nativeTextStatus}`）。

要素間でフィールドが異なる配列、配列値のフィールドを持つ配列、形の異なるネストされたオブジェクトを含む配列は、リスト形式のままです。

この条件を満たす均一な配列が結果の多くを占める場合に TOON を検討してください。トークンを重視するワークフローで採用する前に、実際の文書と対象モデルのコンテキストで各形式を比較します。

## 実用的な既定値

- 人間が読む簡単な抽出には Markdown。
- tools や agent controllers には JSON。
- 明示的なタグを前提とするプロンプトワークフローには XML。
- 同じスカラーフィールドを持つオブジェクト配列が多い場合は TOON を検討し、実際の文書で JSON と比較する。

debugging と再現性には JSON を優先します。モデルに直接読ませる場合は、実際の文書と対象モデルのコンテキストで各形式を比較します。
