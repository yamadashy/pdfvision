export { getCacheDir, getCached, setCache } from './core/cache.js';
export { parsePageRange } from './core/pageRange.js';
export { processDocument, processFile } from './core/processor.js';
export { renderPage, renderPages } from './core/renderer.js';
export type {
  DocumentMetadata,
  DocumentResult,
  ImageBox,
  LayoutBlock,
  LayoutLine,
  OutputFormat,
  PageLayout,
  PageOverview,
  PageResult,
  ProcessDocumentOptions,
  ProcessOptions,
  TextSpan,
} from './types/index.js';
