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

`processFile()` returns the formatted string output (`markdown` / `json` / `xml` / `toon`). `processDocument()` returns the structured object directly.

Exported types: `DocumentResult`, `DocumentMetadata`, `DocumentAttachment`, `DocumentLayerGroup`, `DocumentLayerOrderItem`, `DocumentLayers`, `DocumentLayerUsage`, `DocumentOutlineItem`, `DocumentOutlineTargetType`, `DocumentViewerState`, `DocumentOpenAction`, `DocumentPermissions`, `DocumentPermission`, `DocumentMarkInfo`, `JsonScalar`, `JsonValue`, `PageOverview`, `PageResult`, `PageQuality`, `PageWarning`, `SearchMatch`, `LayoutBlock`, `LayoutLine`, `LayoutTable`, `LayoutTableRow`, `LayoutTableCell`, `PageLayout`, `ImageBox`, `VectorBox`, `PageLink`, `PageLinkTarget`, `PageLinkType`, `FormField`, `FormFieldChoiceOption`, `FormFieldLabel`, `FormFieldLabelRelation`, `FormFieldType`, `PageAnnotation`, `PageAnnotationBorder`, `PageAnnotationBox`, `PageAnnotationFileAttachment`, `PageAnnotationFlag`, `PageAnnotationLine`, `PageAnnotationPoint`, `PageStructureContent`, `PageStructureItem`, `PageStructureNode`, `VisualRegion`, `VisualRegionAssociatedText`, `VisualRegionAssociatedTextRelation`, `VisualRegionKind`, `VisualRegionSource`, `VisualRegionSourceType`, `RenderRegion`, `TextSpan`, `PageOcr`, `OcrWord`, `OutputFormat`, `ProcessDocumentOptions`, `ProcessOptions`.
