import type { OutputFormat, RenderRegion } from './common.js';

export interface ProcessOptions {
  pages?: string;
  /** See {@link ProcessDocumentOptions.sourceData}. */
  sourceData?: Uint8Array;
  /** See {@link ProcessDocumentOptions.password}. */
  password?: string;
  format: OutputFormat;
  noCache: boolean;
  render?: boolean;
  renderOutput?: string;
  /** See {@link ProcessDocumentOptions.renderScale}. */
  renderScale?: number;
  /** See {@link ProcessDocumentOptions.renderRegion}. */
  renderRegion?: RenderRegion;
  /** See {@link ProcessDocumentOptions.search}. */
  search?: string | string[];
  /** See {@link ProcessDocumentOptions.searchRegex}. */
  searchRegex?: boolean;
  /** See {@link ProcessDocumentOptions.searchCaseSensitive}. */
  searchCaseSensitive?: boolean;
  normalize?: boolean;
  geometry?: boolean;
  layout?: boolean;
  imageBoxes?: boolean;
  /** See {@link ProcessDocumentOptions.vectorBoxes}. */
  vectorBoxes?: boolean;
  /** See {@link ProcessDocumentOptions.visualRegions}. */
  visualRegions?: boolean;
  /** See {@link ProcessDocumentOptions.renderVisualRegions}. */
  renderVisualRegions?: boolean;
  /** See {@link ProcessDocumentOptions.formFields}. */
  formFields?: boolean;
  /** See {@link ProcessDocumentOptions.links}. */
  links?: boolean;
  /** See {@link ProcessDocumentOptions.annotations}. */
  annotations?: boolean;
  /** See {@link ProcessDocumentOptions.structure}. */
  structure?: boolean;
  /** See {@link ProcessDocumentOptions.pageLabels}. */
  pageLabels?: boolean;
  /** See {@link ProcessDocumentOptions.attachments}. */
  attachments?: boolean;
  /** See {@link ProcessDocumentOptions.attachmentOutput}. */
  attachmentOutput?: string;
  /** See {@link ProcessDocumentOptions.outline}. */
  outline?: boolean;
  /** See {@link ProcessDocumentOptions.viewer}. */
  viewer?: boolean;
  /** See {@link ProcessDocumentOptions.layers}. */
  layers?: boolean;
  ocr?: boolean;
  ocrLang?: string;
  /**
   * Drop repeated-chrome blocks (running headers, footers, page numbers
   * detected by the cross-page layout pass) from the rendered Markdown
   * body so an LLM doesn't have to read the same footer N times.
   *
   * Only applies when `format` is `'markdown'`. Passing it with `'json'`
   * or `'xml'` throws — those formats already expose `repeated: true`
   * on each layout block, so downstream consumers can filter themselves
   * and a silent no-op there would be a footgun.
   *
   * Requires `layout: true` (the `repeated` flag is only set during the
   * cross-page layout pass); throws otherwise.
   */
  stripRepeated?: boolean;
  /** See {@link ProcessDocumentOptions.onWarning}. */
  onWarning?: (message: string) => void;
}
