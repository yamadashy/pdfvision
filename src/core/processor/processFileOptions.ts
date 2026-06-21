import type { ProcessDocumentOptions, ProcessOptions } from '../../types/index.js';

export function validateProcessFileOptions(options: ProcessOptions): void {
  // Validate format-specific options up front so the caller doesn't pay
  // the extraction cost (potentially seconds of pdf.js / OCR work) only
  // to hit a render-time mismatch. `stripRepeated` depends on the
  // layout pass having tagged blocks with `repeated: true`, which only
  // happens when `layout: true` is requested.
  if (options.stripRepeated && !options.layout) {
    throw new Error('stripRepeated requires layout: true');
  }
  if (options.stripRepeated && options.format !== 'markdown') {
    // JSON / XML already expose `repeated: true` on each layout block,
    // so passing `stripRepeated` with those formats is a misconfigured
    // call (the flag would silently no-op against the formatter).
    // Match the CLI's posture and fail loudly so library users notice
    // the flag had no effect.
    throw new Error(`stripRepeated only applies to markdown output (got format: ${options.format})`);
  }
}

export function buildProcessDocumentOptions(options: ProcessOptions): ProcessDocumentOptions {
  return {
    pages: options.pages,
    sourceData: options.sourceData,
    password: options.password,
    render: options.render,
    noCache: options.noCache,
    renderOutput: options.renderOutput,
    renderScale: options.renderScale,
    renderRegion: options.renderRegion,
    search: options.search,
    searchRegex: options.searchRegex,
    searchCaseSensitive: options.searchCaseSensitive,
    normalize: options.normalize,
    geometry: options.geometry,
    layout: options.layout,
    imageBoxes: options.imageBoxes,
    vectorBoxes: options.vectorBoxes,
    visualRegions: options.visualRegions,
    renderVisualRegions: options.renderVisualRegions,
    formFields: options.formFields,
    links: options.links,
    annotations: options.annotations,
    structure: options.structure,
    pageLabels: options.pageLabels,
    attachments: options.attachments,
    attachmentOutput: options.attachmentOutput,
    outline: options.outline,
    viewer: options.viewer,
    layers: options.layers,
    ocr: options.ocr,
    ocrLang: options.ocrLang,
    onWarning: options.onWarning,
  };
}
