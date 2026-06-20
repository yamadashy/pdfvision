---
title: ライブラリ API
description: TypeScript または JavaScript から processDocument と processFile を使う方法。
---

# ライブラリ API

pdfvision は Node.js ライブラリとしても使えます。

アプリケーションやエージェント実行環境が、CLI を shell out せずに型付きの PDF 根拠を扱いたい場合に使います。CLI とライブラリは同じ抽出モデルを共有します。ネイティブテキスト、ページ品質、レイアウト、視覚的根拠、OCR、検索一致、警告、オプションの PDF 機能フィールドを同じ考え方で扱えます。

## `processDocument`

```ts
import { processDocument } from 'pdfvision';

const result = await processDocument('./document.pdf', {
  pages: '1-3',
  render: true,
  layout: true,
});

console.log(result.totalPages);

for (const page of result.pages) {
  console.log(page.page, page.text);
  if (page.image) console.log(page.image);
}
```

`processDocument()` は型付きの `DocumentResult` を返します。

呼び出し側がフィールドを直接見て判断する場合に使います。

- `overview[]` と `quality` でページを振り分ける。
- `pages[].image` や visual region 画像を vision model に渡す。
- `matches[].bbox` で後続クロップを要求する。
- ネイティブテキストと OCR テキストを比較する。
- ページ単位の warning を抽出データと一緒に保存する。

PDF の bytes がすでにメモリにある場合は `sourceData` を渡します。`filePath` 引数は `result.file` に表示されるラベルとして残り、実際の解析は渡された bytes に対して行われます。

```ts
import { readFile } from 'node:fs/promises';
import { processDocument } from 'pdfvision';

const bytes = await readFile('./document.pdf');
const result = await processDocument('document.pdf', {
  sourceData: bytes,
  layout: true,
});
```

非致命的な抽出警告をアプリケーションログやエージェント trace に残すには `onWarning` を使います。ページ固有の warning はページ出力にも表れます。

```ts
const warnings: string[] = [];

const result = await processDocument('./report.pdf', {
  pages: '1-100',
  search: ['revenue', 'operating income'],
  onWarning: (message) => warnings.push(message),
});
```

## `processFile`

```ts
import { processFile } from 'pdfvision';

const markdown = await processFile('./document.pdf', {
  format: 'markdown',
  pages: '1-2',
});
```

`processFile()` は CLI と同じ文字列出力を返します。

Markdown、XML、TOON などの整形済み表現をそのまま LLM context に入れる場合に使います。安定した型付きフィールド、座標、警告、後続レンダリング判断が必要なら `processDocument()` を優先し、整形済みテキスト自体が integration boundary なら `processFile()` を選びます。

## 典型的なエージェント統合

```ts
import { processDocument } from 'pdfvision';

const firstPass = await processDocument('./report.pdf', {
  search: ['revenue', 'operating income'],
  layout: true,
});

const pagesToRender = firstPass.pages.filter((page) => {
  return page.quality.nativeTextStatus !== 'ok' || page.warnings?.length || page.matches?.length;
});

for (const page of pagesToRender) {
  const rendered = await processDocument('./report.pdf', {
    pages: String(page.page),
    render: true,
    layout: true,
  });
  console.log(rendered.pages[0].image);
}
```

重要なのは、レンダリングや OCR を条件付きにすることです。最初のパスで、どのページや領域が高コストな観測に値するかをエージェントに判断させます。

region zoom では、`matches[]`、`layout.blocks[]`、`imageBoxes[]`、`vectorBoxes[]`、`visualRegions[]` から得た bbox を `renderRegion` に渡します。領域レンダリングには `render: true` または `ocr: true` が必要で、`pages` selector は 1 ページだけに解決される必要があります。

```ts
const [match] = firstPass.pages.flatMap((page) => page.matches ?? []);

if (match?.bbox) {
  const zoom = await processDocument('./report.pdf', {
    pages: String(match.page),
    render: true,
    renderRegion: match.bbox,
    renderScale: 3,
  });

  console.log(zoom.pages[0].image);
}
```

## 主な export

`parsePageRange`, `DocumentResult`, `PageResult`, `PageWarning`, `LayoutBlock`, `TextSpan`, `ImageBox`, `VisualRegion`, `PageOcr`, `ProcessDocumentOptions` などを export しています。
