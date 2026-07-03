import type { PageQuality } from './quality.js';

/**
 * Compact per-page density summary surfaced at the top of the
 * `DocumentResult` so JSON and Markdown consumers can scan outliers
 * (image-flattened slides, blank pages, unusually dense pages) before
 * walking `pages[]` or scrolling the rendered body. Pure aggregation —
 * every field also appears on the corresponding `PageResult`.
 */
export interface PageOverview {
  page: number;
  /**
   * Viewer-visible page label for this page, present iff `pageLabels` was
   * requested and the PDF defines labels.
   */
  pageLabel?: string;
  charCount: number;
  imageCount: number;
  /**
   * Same field as {@link PageResult.vectorCount}. Mirrored on the overview
   * so agents can spot vector-heavy pages (forms, charts, diagrams,
   * slides with shapes but no raster images) before walking `pages[]`.
   */
  vectorCount: number;
  textCoverage: number;
  /**
   * Same field as on {@link PageResult.nonPrintableRatio}. Mirrored on
   * the overview so agents can spot CMap-garbage pages (text looks
   * full but is binary) from the top-level summary without scanning
   * `pages[]`.
   */
  nonPrintableRatio: number;
  /** Raw count companion to {@link nonPrintableRatio}; see PageResult. */
  nonPrintableCount: number;
  /**
   * Same field as {@link PageResult.renderContentRatio} — mirrored on the
   * overview so an agent can spot blank-rendered pages from the top-level
   * summary without scanning `pages[]`. Present only when `--render` or
   * `--ocr` triggered a raster on at least the corresponding page.
   */
  renderContentRatio?: number;
  /**
   * Mirror of {@link PageResult.rotation}, present only for rotated pages
   * so multi-page consumers can spot pages whose rendered PNG orientation
   * differs from the MediaBox coordinate system.
   */
  rotation?: number;
  /**
   * Mirror of {@link PageResult.quality} so the overview can flag
   * unusable / blank pages at a glance without descending into
   * `pages[]`.
   */
  quality: PageQuality;
  /**
   * Count of page anomalies detected on the page (mirror of
   * `pages[].warnings.length`). Surfaced on the overview so an agent
   * can spot problem pages from the top-level table without descending
   * into `pages[]`. Omitted when no warnings were emitted for the page.
   */
  warningCount?: number;
  /**
   * Count of search hits on the page (mirror of
   * `pages[].matches.length`). Lets an agent jump straight to the
   * pages a query landed on from the overview, without scanning
   * `pages[].matches` for each entry. Omitted when no `search` was
   * requested; present-with-`0` when search ran but the page had no
   * hits so consumers can tell "ran, found none" from "didn't run".
   */
  matchCount?: number;
  /**
   * Count of emitted vector path boxes on the page (mirror of
   * `pages[].vectorBoxes.length`). Omitted when `vectorBoxes` was not
   * requested; present-with-`0` when extraction ran but no path bboxes
   * were available.
   */
  vectorBoxCount?: number;
  /**
   * Count of crop-ready visual regions on the page (mirror of
   * `pages[].visualRegions.length`). Omitted when `visualRegions` was
   * not requested; present-with-`0` when extraction ran but no candidate
   * visual region was found.
   */
  visualRegionCount?: number;
  /**
   * Count of interactive form fields on the page (mirror of
   * `pages[].formFields.length`). Omitted when `formFields` was not
   * requested; present-with-`0` when extraction ran but the page has no
   * widget fields.
   */
  formFieldCount?: number;
  /**
   * Count of clickable PDF links on the page (mirror of
   * `pages[].links.length`). Omitted when `links` was not requested;
   * present-with-`0` when extraction ran but no link annotations exist.
   */
  linkCount?: number;
  /**
   * Count of non-link PDF annotations on the page (mirror of
   * `pages[].annotations.length`). Omitted when `annotations` was not
   * requested; present-with-`0` when extraction ran but no comments /
   * markup annotations exist.
   */
  annotationCount?: number;
  /**
   * Count of tagged-PDF structure nodes on the page. Omitted when
   * `structure` was not requested; present-with-`0` when extraction ran
   * but no page structure tree exists.
   */
  structureNodeCount?: number;
  width: number;
  height: number;
}
