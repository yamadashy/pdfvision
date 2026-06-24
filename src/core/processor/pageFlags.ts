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
    // Inspect annotation metadata even for baseline text extraction so
    // visible FreeText appearances that are not in the native text stream
    // can produce completeness warnings without exposing annotations[].
    annotationAppearanceHints: true,
    structure: !!options.structure,
    viewer: !!options.viewer,
    // Search needs span-level bbox to populate `matches[*].bbox`;
    // build spans internally even if the caller didn't ask for the
    // full `pages[].spans` payload via --geometry.
    needSpansForSearch: state.hasSearch,
    needFormFieldsForSearch: state.hasSearch,
    needLinksForSearch: state.hasSearch,
    needAnnotationsForSearch: state.hasSearch,
  };
}
