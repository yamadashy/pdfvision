import type { ProcessDocumentOptions } from '../../types/index.js';
import type { PageFlags } from './pageData.js';

interface BuildPageFlagsOptions {
  visualRegions: boolean;
  hasSearch: boolean;
}

export function buildPageFlags(options: ProcessDocumentOptions, state: BuildPageFlagsOptions): PageFlags {
  return {
    normalize: options.normalize !== false,
    geometry: !!options.geometry,
    layout: !!options.layout,
    imageBoxes: !!options.imageBoxes,
    vectorBoxes: !!options.vectorBoxes,
    visualRegions: state.visualRegions,
    formFields: !!options.formFields,
    links: !!options.links,
    annotations: !!options.annotations,
    annotationAppearanceHints: !!options.render || !!options.ocr,
    structure: !!options.structure,
    viewer: !!options.viewer,
    // Search needs span-level bbox to populate `matches[*].bbox`;
    // build spans internally even if the caller didn't ask for the
    // full `pages[].spans` payload via --geometry.
    needSpansForSearch: state.hasSearch,
    needFormFieldsForSearch: state.hasSearch,
    needAnnotationsForSearch: state.hasSearch,
  };
}
