import type { PageResult, RenderRegion } from '../../types/index.js';
import { derivePageQuality } from '../quality/pageQuality.js';
import { type CompiledSearch, searchPage } from '../search/index.js';
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
    width: data.width,
    height: data.height,
    ...(data.spans !== undefined && { spans: data.spans }),
    ...(data.layout !== undefined && { layout: data.layout }),
    ...(data.imageBoxes !== undefined && { imageBoxes: data.imageBoxes }),
    ...(data.vectorBoxes !== undefined && { vectorBoxes: data.vectorBoxes }),
    ...(data.formFields !== undefined && { formFields: data.formFields }),
    ...(data.links !== undefined && { links: data.links }),
    ...(data.annotations !== undefined && { annotations: data.annotations }),
    ...(data.structure !== undefined && { structure: data.structure }),
    ...(data.jsActions !== undefined && { jsActions: data.jsActions }),
    // Initial classification using whatever signals we have so far.
    // OCR may attach a renderContentRatio later; the post-OCR pass
    // overwrites this with the final classification.
    quality: { nativeTextStatus: 'empty' },
  };

  page.quality = derivePageQuality(page, { hasVisibleAnnotationAppearance });

  if (compiledSearch) {
    page.matches = searchPage(
      data._internalSpans,
      undefined,
      pageNum,
      data.width,
      data.height,
      compiledSearch,
      onWarning,
      data._internalFormFields,
      data._internalAnnotations,
    );
  }

  return page;
}
