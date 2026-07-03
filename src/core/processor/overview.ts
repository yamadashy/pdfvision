import type { DocumentResult, PageResult } from '../../types/index.js';
import { countStructureNodes } from '../document/structure.js';

export function buildOverview(
  pages: PageResult[],
  options: { includeSearchMatches: boolean },
): DocumentResult['overview'] {
  if (pages.length <= 1) return undefined;

  return pages.map((page) => ({
    page: page.page,
    ...(page.pageLabel !== undefined && { pageLabel: page.pageLabel }),
    charCount: page.charCount,
    imageCount: page.imageCount,
    vectorCount: page.vectorCount,
    textCoverage: page.textCoverage,
    nonPrintableRatio: page.nonPrintableRatio,
    nonPrintableCount: page.nonPrintableCount,
    // Mirror the per-page renderContentRatio onto the overview row
    // so an agent can spot blank-rendered pages from the top-level
    // summary alone. Stays optional when neither --render nor --ocr
    // produced a raster.
    ...(page.renderContentRatio !== undefined && { renderContentRatio: page.renderContentRatio }),
    ...(page.rotation !== undefined && { rotation: page.rotation }),
    quality: page.quality,
    // Mirror the warnings count from each page so the top-level
    // table flags problem pages at a glance. Omitted when no
    // warnings fired, matching the PageResult.warnings field's
    // optional shape.
    ...(page.warnings && page.warnings.length > 0 && { warningCount: page.warnings.length }),
    // Search hits per page. Present-with-`0` is meaningful
    // ("search ran, no hits on this page"); omitted when
    // `search` wasn't requested at all so the overview stays
    // clean for the default extraction.
    ...(options.includeSearchMatches && { matchCount: page.matches?.length ?? 0 }),
    ...(page.vectorBoxes !== undefined && { vectorBoxCount: page.vectorBoxes.length }),
    ...(page.visualRegions !== undefined && { visualRegionCount: page.visualRegions.length }),
    ...(page.formFields !== undefined && { formFieldCount: page.formFields.length }),
    ...(page.links !== undefined && { linkCount: page.links.length }),
    ...(page.annotations !== undefined && { annotationCount: page.annotations.length }),
    ...(page.structure !== undefined && { structureNodeCount: countStructureNodes(page.structure) }),
    width: page.width,
    height: page.height,
  }));
}
