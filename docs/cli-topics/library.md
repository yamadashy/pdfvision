---
name: library
description: The processDocument() / processFile() Node.js API and the full list of exported types. Use when calling pdfvision from a Node process instead of shelling out to the CLI.
---

# Library API

## Library API (Node.js consumers)

If the consumer is itself a Node.js process, prefer the library API over invoking the CLI:

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

`processFile()` returns the formatted string output (`markdown` / `json` / `xml` / `toon`) — the same string the CLI prints for those options (the CLI only adds a trailing newline). `processDocument()` returns the structured object directly.

## Picking one

`processDocument(filePath, options?)` → `Promise<DocumentResult>`; `processFile(filePath, options)` → `Promise<string>`. Options are the same set except that `ProcessOptions` requires `format` and `noCache`, and adds the two formatter-only fields `matchesOnly` and `stripRepeated`; `ProcessDocumentOptions` is entirely optional.

Prefer `processDocument()` when the caller reads fields: routing pages on `overview[]` / `quality`, handing `pages[].image` or a visual-region crop to a vision model, feeding a `matches[].bbox` into a follow-up crop, diffing `pages[].text` against `pages[].ocr.text`, persisting `pages[].warnings` alongside the extracted data. Prefer `processFile()` when the formatted text itself is the integration boundary — Markdown / XML / TOON going straight into a model's context window.

## Bytes already in memory

`sourceData` (a `Uint8Array`) makes pdfvision parse those bytes instead of reading from disk. `filePath` stays a label and comes back unchanged as `result.file`, so pass something meaningful — a URL, an upload id, the original name.

```ts
const result = await processDocument('document.pdf', { sourceData: bytes, layout: true });
```

## Warnings

`onWarning(message)` is called once per non-fatal warning (page range past the end of the document, match cap hit, regex budget exceeded, render-output path collisions). It defaults to `undefined`, which is silent — a library caller gets nothing on stderr, unlike the CLI. Page-specific warnings are also structured on `pages[].warnings`; `onWarning` is the only way to see the document-level ones. Warnings are recorded with the cached result and replayed on a later identical call, capped at 50 with the last slot reporting the real total.

## Conditional second pass

The library shape of the usual agent loop: one cheap pass decides which pages earn an expensive observation.

```ts
const first = await processDocument('./report.pdf', { search: ['revenue'], layout: true });

for (const page of first.pages) {
  if (page.quality.nativeTextStatus === 'ok' && !page.warnings && !page.matches?.length) continue;
  const rendered = await processDocument('./report.pdf', { pages: String(page.page), render: true });
  console.log(rendered.pages[0].image);
}
```

Any bbox from `matches[]`, `layout.blocks[]`, `imageBoxes[]`, `vectorBoxes[]`, or `visualRegions[]` passes unchanged into `renderRegion` (`{ x, y, width, height }`); `matches[].page` carries the page number even when the match was plucked out of a flattened list. `renderRegion` throws unless `render: true` or `ocr: true` is also set, and unless `pages` resolves to exactly one page.

## Exports

The whole runtime surface is three functions: `processDocument`, `processFile`, and `parsePageRange(range, totalPages)`. Cache internals and the pdf.js-level renderers are deliberately not exported — use `pdfvision clear-cache` and `processDocument({ render: true })`.

Exported types: `DocumentResult`, `DocumentMetadata`, `DocumentAttachment`, `DocumentLayerGroup`, `DocumentLayerOrderItem`, `DocumentLayers`, `DocumentLayerUsage`, `DocumentOutlineItem`, `DocumentOutlineTargetType`, `DocumentViewerState`, `DocumentOpenAction`, `DocumentPermissions`, `DocumentPermission`, `DocumentMarkInfo`, `JsonScalar`, `JsonValue`, `PageOverview`, `PageResult`, `PageQuality`, `PageWarning`, `SearchMatch`, `LayoutBlock`, `LayoutLine`, `LayoutTable`, `LayoutTableRow`, `LayoutTableCell`, `PageLayout`, `ImageBox`, `VectorBox`, `PageLink`, `PageLinkTarget`, `PageLinkType`, `FormField`, `FormFieldChoiceOption`, `FormFieldLabel`, `FormFieldLabelRelation`, `FormFieldResetFormAction`, `FormFieldType`, `PageAnnotation`, `PageAnnotationBorder`, `PageAnnotationBox`, `PageAnnotationFileAttachment`, `PageAnnotationFlag`, `PageAnnotationLine`, `PageAnnotationPoint`, `PageStructureContent`, `PageStructureItem`, `PageStructureNode`, `PageStructureTable`, `PageStructureTableRow`, `PageStructureTableCell`, `VisualRegion`, `VisualRegionAssociatedText`, `VisualRegionAssociatedTextRelation`, `VisualRegionKind`, `VisualRegionSource`, `VisualRegionSourceType`, `RenderRegion`, `RenderedContentBox`, `TextSpan`, `PageOcr`, `OcrWord`, `OutputFormat`, `ProcessDocumentOptions`, `ProcessOptions`.
