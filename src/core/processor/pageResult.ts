import type { PageResult, RenderRegion } from '../../types/index.js';
import { derivePageQuality } from '../quality/pageQuality.js';
import { type CompiledSearch, type RegexSearchBudget, searchPage } from '../search/index.js';
import type { PageData } from './pageData.js';

interface BuildPageResultOptions {
  data: PageData;
  pageNum: number;
  pageLabel?: string;
  renderRegion?: RenderRegion;
  imagePath?: string;
  renderRatio?: number;
  hasVisibleAnnotationAppearance: boolean;
  compiledSearch?: CompiledSearch;
  /** Whole-request regex deadline; set only for regex-mode searches. */
  searchBudget?: RegexSearchBudget;
  onWarning?: (message: string) => void;
}

export function buildPageResult({
  data,
  pageNum,
  pageLabel,
  renderRegion,
  imagePath,
  renderRatio,
  hasVisibleAnnotationAppearance,
  compiledSearch,
  searchBudget,
  onWarning,
}: BuildPageResultOptions): PageResult {
  const page: PageResult = {
    page: pageNum,
    ...(pageLabel !== undefined && { pageLabel }),
    ...(renderRegion !== undefined && { renderRegion }),
    text: data.text,
    ...(data.rawText !== undefined && { rawText: data.rawText }),
    image: imagePath,
    charCount: data.charCount,
    imageCount: data.imageCount,
    vectorCount: data.vectorCount,
    textCoverage: data.textCoverage,
    nonPrintableRatio: data.nonPrintableRatio,
    nonPrintableCount: data.nonPrintableCount,
    ...(renderRatio !== undefined && { renderContentRatio: renderRatio }),
    ...(data.rotation !== undefined && { rotation: data.rotation }),
    ...(data.userUnit !== undefined && { userUnit: data.userUnit }),
    width: data.width,
    height: data.height,
    ...(data.spans !== undefined && { spans: data.spans }),
    ...(data.layout !== undefined && { layout: data.layout }),
    ...(data.imageBoxes !== undefined && { imageBoxes: data.imageBoxes }),
    ...(data.vectorBoxes !== undefined && { vectorBoxes: data.vectorBoxes }),
    ...(data.formFieldCount !== undefined && { formFieldCount: data.formFieldCount }),
    ...(data.formFields !== undefined && { formFields: data.formFields }),
    ...(data.linkCount !== undefined && { linkCount: data.linkCount }),
    ...(data.links !== undefined && { links: data.links }),
    ...(data.annotationCount !== undefined && { annotationCount: data.annotationCount }),
    ...(data.annotations !== undefined && { annotations: data.annotations }),
    ...(data.structure !== undefined && { structure: data.structure }),
    ...(data.structureTables !== undefined && { structureTables: data.structureTables }),
    ...(data.jsActions !== undefined && { jsActions: data.jsActions }),
    // Initial classification using whatever signals we have so far.
    // OCR may attach a renderContentRatio later; the post-OCR pass
    // overwrites this with the final classification.
    quality: { nativeTextStatus: 'empty' },
  };

  page.quality = derivePageQuality(page, { hasVisibleAnnotationAppearance });

  if (compiledSearch) {
    // A refused claim means the whole-request regex deadline has passed:
    // leave `matches` empty for this page rather than spending another
    // per-page budget on it. The single summary warning comes from the
    // budget itself once every pass is done.
    page.matches =
      searchBudget?.claimPage(pageNum) === false
        ? []
        : searchPage(
            data._internalSpans,
            undefined,
            pageNum,
            data.width,
            data.height,
            compiledSearch,
            onWarning,
            data._internalFormFields,
            data._internalAnnotations,
            data._internalLinks,
          );
  }

  return page;
}
