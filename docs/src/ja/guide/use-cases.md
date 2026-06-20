---
title: ユースケース
description: AI エージェントが研究論文、スライド、行政フォーム、スキャン PDF、レポート、表、図表、多言語文書を読むための pdfvision ワークフロー。
---

# ユースケース

pdfvision は、PDF を手作業でプロンプトに貼るのではなく、AI エージェントが根拠付きで読む必要がある場面で役立ちます。

共通するテーマは検証です。pdfvision は単なる「PDF to text」コマンドではありません。テキスト抽出だけで十分か、レイアウトが意味を変えていないか、特定の視覚領域を確認すべきかをエージェントが判断するための信号を出します。

## 未知の PDF

まず低コストな構造化パスから始めます。

```bash
pdfvision document.pdf --json
```

overview をルーティング表として使います。

- `quality.nativeTextStatus: "ok"` は、ネイティブテキストが最初の情報源として妥当であることが多いです。
- `empty_but_visual_content` は、ページにレンダリングや OCR が必要な可能性を示します。
- 高い `imageCount` や `vectorCount` は、グラフ、スクリーンショット、フォーム、スライド図形に意味がある可能性を示します。
- warning は、人間なら抽出結果を信頼する前に立ち止まるページを示します。

必要な信号だけを追加します。

```bash
pdfvision document.pdf --layout --image-boxes --vector-boxes --visual-regions --json
```

## 研究論文

まずネイティブテキストを使い、段組み、図、数式、表が重要ならレイアウトを追加します。

```bash
pdfvision paper.pdf --layout --image-boxes --format json
```

引用語、数式、主張文の位置を確認したい場合は、`--search` で候補を探してから `--render-region` でクロップします。

追加で確認したい点:

- `overview[]` で疎なページや glyph-corrupted なページを確認する。
- `--search` で引用語、数式、主張文を探してからクロップをレンダリングする。
- 図、数式、表の断片には `--render-region` を使う。
- LLM に直接渡す場合は XML または TOON も検討する。
- 2 段組みページでは `layout.blocks` と warning を確認してから読み順を信頼する。
- `imageBoxes` と `visualRegions` で、どの図や表をマルチモーダル確認に回すか決める。

## スライドとレポート

スライドは画像、ベクター図形、相対配置に意味があることが多いです。

```bash
pdfvision deck.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

必要なら重要領域だけをレンダリングします。

```bash
pdfvision deck.pdf --render-visual-regions --format json
```

戦略資料、カンファレンススライド、製品 PDF、ダッシュボードの PDF 書き出しで有効です。テキスト層には箇条書きだけが入っていても、結論はグラフ、矢印、タイムライン、スクリーンショット、図形の相対位置にある場合があります。

## 財務レポートと密な表

年次報告書、決算 PDF、請求書、ベンチマークレポートでは、行と列の関係が混乱したテキストストリームに平坦化されることがあります。

```bash
pdfvision report.pdf --layout --vector-boxes --visual-regions --search "Total revenue" --json
```

pdfvision を使うと、次を確認できます。

- 指標や行ラベルがあるページと bbox。
- 行と列が視覚的に揃っている場合の数値表ヒント。
- ネイティブテキスト順が視覚的な表と一致しない可能性があるページ。
- vision model に確認させる前のグラフ、表、脚注クロップ。

```bash
pdfvision report.pdf --pages 12 --render --render-region 72,210,468,240 --render-output ./evidence --json
```

## 行政フォームと税務文書

フォームはラベル、ウィジェット、チェックボックス、注釈、罫線が組み合わさっています。

```bash
pdfvision form.pdf --layout --form-fields --annotations --links --format json
```

フィールドとラベルの関係が曖昧な場合は、それぞれの bbox を使って `--render-region` で確認します。`--form-fields` は値、フィールド種別、ラベル、選択状態、read-only/required フラグ、widget metadata を出すため、ラベルと値の視覚的関係が失われる失敗を避けやすくなります。

## スキャン文書

概要シグナルでネイティブテキスト不足を確認し、必要なページだけ OCR します。

```bash
pdfvision scan.pdf --pages 1-5 --ocr --ocr-lang eng --format json
```

多言語ページでは、主言語を先に置きます。

```bash
pdfvision scan.pdf --ocr --ocr-lang jpn+eng --format json
```

OCR はネイティブテキストを置き換えず、横に付与されます。エージェントは両方の信号を比較し、信頼度を見ながら、小さな文字や表が必要な場合は高スケールのクロップを追加できます。

## 図表と視覚的な表

視覚構造と領域検出から始めます。

```bash
pdfvision report.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

必要な箇所だけクロップして確認します。

```bash
pdfvision report.pdf --pages 8 --render --render-region 80,140,430,260 --render-output ./regions
```

チャート凡例、プロットラベル、アーキテクチャ図、スクリーンショット、地図、フォームセクション、意味がグラフィカルな表で使います。座標がまだ分からないときは `--visual-regions` が特に有効です。

## 検索してズームする検証

特定の条項、フィールド、引用、指標、ラベルを検証するときは、まず検索します。

```bash
pdfvision contract.pdf --search "termination" --search "governing law" --json
```

一致にはページ、source、context、bbox が含まれる場合があります。エージェントは文書全体をレンダリングせず、該当領域だけをクロップできます。

```bash
pdfvision contract.pdf --pages 9 --render --render-region 96,320,420,96 --render-output ./crops --json
```

これは抽出テキストだけでなく、監査可能な PDF 根拠が必要な retrieval-augmented agent に向いています。

## 多言語と CJK PDF

日本語、中国語、混在言語の PDF は、テキストだけのツールが扱いにくいスペーシングや glyph 問題を持つことがあります。

```bash
pdfvision document.pdf --layout --search "請求書" --json
```

pdfvision は既定で Unicode を正規化し、正規化で変化した場合は raw text を保持し、CJK を考慮した結合テキストや縦書き CJK のレイアウト信号を扱えます。スキャンでは OCR 言語を組み合わせます。

```bash
pdfvision scan.pdf --ocr --ocr-lang jpn+eng --json
```

## Agentic PDF Triage

未知の PDF では、低コストな overview から始めます。

```bash
pdfvision document.pdf --format json
```

その後に分岐します。

- 読み順、表、フォーム、警告が重要なら `--layout` を追加する。
- ページが視覚的、またはネイティブテキストが怪しいなら `--render` を追加する。
- ネイティブテキストが欠落し、レンダリングページに見える文字があるなら `--ocr` を追加する。
- 図、グラフ、フォーム、ダイアグラムを狙って確認するなら `--visual-regions` を追加する。

目的は、エージェントに誠実な読み方をさせることです。根拠を見て、次に必要な view を選び、空または平坦化されたテキストストリームを PDF 全体だと扱わないようにします。
