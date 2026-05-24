// Public surface — kept narrow on purpose. Everything else lives under
// `src/core/*` and is internal implementation. In particular:
//
//   - `getCacheDir` / `getCached` / `setCache` were re-exported in
//     earlier versions but have no useful entry point for library
//     consumers — they expect cache-internal arguments and can corrupt
//     the on-disk cache if misused. Use `--clear-cache` (CLI) for
//     cache management.
//   - `renderPage` / `renderPages` took a `PDFDocumentProxy` directly,
//     which forced any caller to import `pdfjs-dist` themselves and
//     made pdf.js the de-facto public contract. The library entry
//     point is `processDocument({ render: true })` instead — it owns
//     the pdf.js lifetime and returns image paths on the page result.
export { parsePageRange } from './core/pageRange.js';
export { processDocument, processFile } from './core/processor.js';
export type {
  DocumentMetadata,
  DocumentResult,
  ImageBox,
  LayoutBlock,
  LayoutLine,
  OutputFormat,
  PageLayout,
  PageOcr,
  PageOverview,
  PageQuality,
  PageResult,
  PageWarning,
  ProcessDocumentOptions,
  ProcessOptions,
  RenderRegion,
  TextSpan,
} from './types/index.js';
