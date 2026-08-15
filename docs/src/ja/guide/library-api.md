---
title: "ライブラリ API"
description: "Node.js プロセスから pdfvision を呼び出す processDocument() / processFile() API と、エクスポートされる型の一覧。CLI を介さず Node プロセスから直接呼び出す場合に使います。"
sourceHash: b120aaaf49ec
---

<!-- Translated from docs/src/en/guide/library-api.md, which is generated from docs/cli-topics/library.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# ライブラリ API

## ライブラリ API（Node.js から利用する場合）

呼び出し元自体が Node.js プロセスなら、CLI を起動するよりライブラリ API を使う方が適しています。

```ts
import { processDocument } from 'pdfvision';

const result = await processDocument('./doc.pdf', {
  pages: '1-3',
  layout: true,
  imageBoxes: true,
  ocr: true,
  ocrLang: 'eng+jpn',
});

// `result` is a typed DocumentResult — no JSON.parse, no string formatting.
for (const page of result.pages) {
  if (page.ocr) console.log(page.ocr.text);
}
```

`processFile()` は整形済みの文字列出力（`markdown` / `json` / `xml` / `toon`）を返します。これは、それぞれのオプションで CLI が出力するのと同じ文字列です（CLI は末尾に改行を追加するだけです）。`processDocument()` は構造化されたオブジェクトをそのまま返します。

## どちらを使うか

`processDocument(filePath, options?)` → `Promise<DocumentResult>`、`processFile(filePath, options)` → `Promise<string>`。オプションはほぼ同じセットですが、`ProcessOptions` は `format` と `noCache` を必須とし、フォーマッター専用の 2 つのフィールド `matchesOnly` と `stripRepeated` を追加で持ちます。`ProcessDocumentOptions` はすべて省略可能です。

呼び出し側がフィールドを読み取る場合は `processDocument()` を優先してください。`overview[]` / `quality` によるページのルーティング、`pages[].image` や視覚領域のクロップを vision モデルに渡す、`matches[].bbox` を後続のクロップに渡す、`pages[].text` と `pages[].ocr.text` の差分を取る、`pages[].warnings` を抽出データと一緒に永続化する、といった用途です。整形済みのテキスト自体が連携の境界になる場合 — Markdown / XML / TOON をそのままモデルのコンテキストウィンドウに渡す場合 — は `processFile()` を優先してください。

## メモリ上に既にあるバイト列

`sourceData`（`Uint8Array`）を渡すと、pdfvision はディスクから読み込む代わりにそのバイト列をパースします。`filePath` はラベルのままで `result.file` にそのまま返るので、URL、アップロード ID、元のファイル名など意味のある値を渡してください。

```ts
const result = await processDocument('document.pdf', { sourceData: bytes, layout: true });
```

## 警告

`onWarning(message)` は、致命的でない警告（文書末尾を超えるページ範囲、一致数上限への到達、正規表現の予算超過、`--render-output` のパス衝突など）1 件につき 1 回呼ばれます。デフォルトは `undefined` で、これは無音を意味します — ライブラリの呼び出し元には、CLI と違って stderr に何も出力されません。ページ単位の警告は `pages[].warnings` にも構造化されて記録されます。`onWarning` は文書レベルの警告を確認できる唯一の手段です。警告はキャッシュされた結果と一緒に記録され、後で同一の呼び出しが行われたときに再生されます。上限は 50 件で、最後のスロットには実際の合計件数が入ります。

## 条件付きの 2 回目のパス

よくあるエージェントループをライブラリの形で表すと次のようになります。安価な 1 回目のパスで、どのページにコストのかかる観測をかけるかを決めます。

```ts
const first = await processDocument('./report.pdf', { search: ['revenue'], layout: true });

for (const page of first.pages) {
  if (page.quality.nativeTextStatus === 'ok' && !page.warnings && !page.matches?.length) continue;
  const rendered = await processDocument('./report.pdf', { pages: String(page.page), render: true });
  console.log(rendered.pages[0].image);
}
```

`matches[]`、`layout.blocks[]`、`imageBoxes[]`、`vectorBoxes[]`、`visualRegions[]` のいずれかから得た bbox は、そのまま変更せずに `renderRegion`（`{ x, y, width, height }`）に渡せます。`matches[].page` は、フラット化されたリストから抜き出した一致であってもページ番号を保持します。`renderRegion` は、`render: true` または `ocr: true` のいずれかが設定されていない場合、また `pages` が厳密に 1 ページに解決されない場合に例外を投げます。

## エクスポート

ランタイムの表面全体は、`processDocument`、`processFile`、`parsePageRange(range, totalPages)` の 3 つの関数だけです。キャッシュの内部実装と pdf.js レベルのレンダラーは意図的にエクスポートされていません — 代わりに `pdfvision clear-cache` と `processDocument({ render: true })` を使ってください。

エクスポートされる型: `DocumentResult`, `DocumentMetadata`, `DocumentAttachment`, `DocumentLayerGroup`, `DocumentLayerOrderItem`, `DocumentLayers`, `DocumentLayerUsage`, `DocumentOutlineItem`, `DocumentOutlineTargetType`, `DocumentViewerState`, `DocumentOpenAction`, `DocumentPermissions`, `DocumentPermission`, `DocumentMarkInfo`, `JsonScalar`, `JsonValue`, `PageOverview`, `PageResult`, `PageQuality`, `PageWarning`, `SearchMatch`, `LayoutBlock`, `LayoutLine`, `LayoutTable`, `LayoutTableRow`, `LayoutTableCell`, `PageLayout`, `ImageBox`, `VectorBox`, `PageLink`, `PageLinkTarget`, `PageLinkType`, `FormField`, `FormFieldChoiceOption`, `FormFieldLabel`, `FormFieldLabelRelation`, `FormFieldResetFormAction`, `FormFieldType`, `PageAnnotation`, `PageAnnotationBorder`, `PageAnnotationBox`, `PageAnnotationFileAttachment`, `PageAnnotationFlag`, `PageAnnotationLine`, `PageAnnotationPoint`, `PageStructureContent`, `PageStructureItem`, `PageStructureNode`, `PageStructureTable`, `PageStructureTableRow`, `PageStructureTableCell`, `VisualRegion`, `VisualRegionAssociatedText`, `VisualRegionAssociatedTextRelation`, `VisualRegionKind`, `VisualRegionSource`, `VisualRegionSourceType`, `RenderRegion`, `RenderedContentBox`, `TextSpan`, `PageOcr`, `OcrWord`, `OutputFormat`, `ProcessDocumentOptions`, `ProcessOptions`.
