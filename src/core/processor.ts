import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {
  DocumentResult,
  ImageBox,
  PageResult,
  ProcessDocumentOptions,
  ProcessOptions,
  VectorBox,
} from '../types/index.js';
import { getCacheDir, pdfFingerprint } from './io/cache.js';
import { markRepeatedBlocks } from './layout/index.js';
import { buildCacheKey } from './processor/cacheKey.js';
import { extractDocumentFeatures } from './processor/documentFeatures.js';
import { buildOverview } from './processor/overview.js';
import type { PageFlags } from './processor/pageData.js';
import { extractPageData } from './processor/pageExtraction.js';
import { buildPageResult } from './processor/pageResult.js';
import { resolvePageNumbers } from './processor/pageSelection.js';
import { fingerprintData, withTruncationHint } from './processor/pdfBytes.js';
import { buildImageOps, buildPdfJsDocumentOptions } from './processor/pdfJsSetup.js';
import { capturePdfJsWarnings } from './processor/pdfJsWarnings.js';
import { buildProcessDocumentOptions, validateProcessFileOptions } from './processor/processFileOptions.js';
import { prepareRenderImagesDir, validateRenderRegion, validateRenderScale } from './processor/renderOptions.js';
import { renderResult } from './processor/renderResult.js';
import { readCachedResult, writeCachedResult } from './processor/resultCache.js';
import { normalizeText } from './processor/textUtils.js';
import { derivePageQuality } from './quality/pageQuality.js';
import { runParallel } from './runtime/parallel.js';
import { type CompiledSearch, compileSearch, searchPage, suppressDuplicateOcrMatches } from './search/index.js';
import { type BuildVisualRegionsInput, buildVisualRegions } from './visualRegions/index.js';
import { detectPageWarnings } from './warnings/index.js';
import { extractWidgetAppearanceCaptions } from './widgetAppearance/index.js';

/**
 * Extract a structured representation of a PDF.
 *
 * Returns a `DocumentResult` so library callers can consume metadata /
 * pages / image paths directly with full type information, without
 * formatting + re-parsing through JSON.
 *
 * For the formatted (string) variant used by the CLI, see {@link processFile}.
 */
export async function processDocument(filePath: string, options: ProcessDocumentOptions = {}): Promise<DocumentResult> {
  const { sourceData, ...cacheRelevantOptions } = options;
  const pdfData = sourceData ? new Uint8Array(sourceData) : undefined;
  // Reject malformed renderScale up front — before fingerprint hashing
  // or pdfjs load — so callers see the error fast even when --render
  // isn't on (the validation is cheap and a leftover flag in a script
  // shouldn't be quietly ignored).
  const renderScale = validateRenderScale(options.renderScale);
  // Same posture for renderRegion: shape (positive width/height, no
  // negatives, finite numbers) gets validated synchronously; the
  // single-page + within-bounds + non-rotated-page checks come after
  // page resolution and pdfjs load below.
  const renderRegion = validateRenderRegion(options.renderRegion);
  // Compile search queries up front so a bad regex or empty query
  // surfaces immediately rather than after the extraction budget
  // is partly spent. `compileSearch` returns undefined when search
  // isn't requested — the per-page loop below skips on undefined.
  const compiledSearch: CompiledSearch | undefined = compileSearch(options.search, {
    regex: options.searchRegex,
    caseSensitive: options.searchCaseSensitive,
    normalize: options.normalize,
  });
  // renderRegion only makes sense when rasterisation actually runs.
  // The CLI already enforces this, but library callers can bypass it
  // and we'd then hit two real bugs: (1) the result cache slot is
  // shared with text-only extractions (renderRegion isn't part of the
  // text-only cache key), so back-to-back calls with different regions
  // would return stale `renderRegion` echoes; (2) the single-page +
  // bounds checks below sit inside the `options.render || options.ocr`
  // branch, so they'd silently no-op. Fail loud at the boundary instead.
  if (renderRegion && !options.render && !options.ocr) {
    throw new Error('renderRegion requires render: true or ocr: true');
  }
  const renderVisualRegions = !!options.renderVisualRegions;
  const wantsVisualRegions = !!options.visualRegions || renderVisualRegions;
  // Compute the per-PDF fingerprint up front when any code path below
  // needs it (caching, or render output isolation). Hashing the file is
  // the most expensive sync step in this function, so do it once and
  // share — the cache layer accepts a precomputed fingerprint to avoid
  // re-reading the same file.
  const needFingerprint =
    !options.noCache ||
    !!(options.render && options.renderOutput) ||
    !!(renderVisualRegions && options.renderOutput) ||
    !!(options.attachments && options.attachmentOutput);
  const fingerprint = needFingerprint ? (pdfData ? fingerprintData(pdfData) : pdfFingerprint(filePath)) : null;
  const cacheDir = options.noCache ? null : getCacheDir(filePath, fingerprint ?? undefined);
  const attachmentOutputDir =
    options.attachments && options.attachmentOutput
      ? join(resolve(options.attachmentOutput), fingerprint as string)
      : undefined;

  const cacheKey = buildCacheKey({ ...cacheRelevantOptions, renderScale, renderRegion });
  const cachedResult = readCachedResult({
    cacheDir,
    cacheKey,
    filePath,
    render: !!options.render,
    renderVisualRegions,
    attachmentOutputDir,
  });
  if (cachedResult) return cachedResult;

  // pdfjs-dist is multiple MB and dominates startup time; only pull it in
  // once we've confirmed there's no cache hit and we actually need to parse.
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const docOptions = buildPdfJsDocumentOptions({
    pdfData,
    filePath,
    password: options.password,
  });
  const loadingTask = getDocument(docOptions);
  let doc: PDFDocumentProxy;
  try {
    doc = await loadingTask.promise;
  } catch (error) {
    try {
      await loadingTask.destroy();
    } catch {
      // Preserve the original parse failure; cleanup here is best-effort.
    }
    throw withTruncationHint(error, pdfData, filePath);
  }
  const pdfJsWarnings: string[] = [];
  const restorePdfJsWarningCapture = capturePdfJsWarnings(pdfJsWarnings);
  try {
    const totalPages = doc.numPages;
    const pageNumbers = await resolvePageNumbers({ doc, options, renderRegion });

    const { metadata, pageLabels, attachments, outline, viewer, layers, hasHiddenOptionalContent } =
      await extractDocumentFeatures(doc, options, attachmentOutputDir);

    let imagePaths: string[] | null = null;
    // Parallel array to imagePaths: renderContentRatio for each rendered
    // page (or undefined slots when --render is off). Surfaced on the
    // PageResult so an agent can spot blank-rendered pages directly from
    // the structured output instead of inferring from "OCR confidence 0".
    let renderRatios: (number | undefined)[] = [];
    const imagesDir =
      options.render || renderVisualRegions
        ? prepareRenderImagesDir({
            renderOutput: options.renderOutput,
            cacheDir,
            fingerprint,
            renderScale,
          })
        : null;
    if (options.render) {
      // renderer pulls in @napi-rs/canvas (native binding); only load it
      // when --render is requested.
      const { renderPagesWithStats } = await import('./renderer/index.js');
      const rendered = await renderPagesWithStats(doc, pageNumbers, imagesDir as string, renderScale, renderRegion);
      imagePaths = rendered.map((r) => r.path);
      renderRatios = rendered.map((r) => r.contentRatio);
    }

    const flags: PageFlags = {
      normalize: options.normalize !== false,
      geometry: !!options.geometry,
      layout: !!options.layout,
      imageBoxes: !!options.imageBoxes,
      vectorBoxes: !!options.vectorBoxes,
      visualRegions: wantsVisualRegions,
      formFields: !!options.formFields,
      links: !!options.links,
      annotations: !!options.annotations,
      annotationAppearanceHints: !!options.render || !!options.ocr,
      structure: !!options.structure,
      viewer: !!options.viewer,
      // Search needs span-level bbox to populate `matches[*].bbox`;
      // build spans internally even if the caller didn't ask for the
      // full `pages[].spans` payload via --geometry.
      needSpansForSearch: compiledSearch !== undefined,
      needFormFieldsForSearch: compiledSearch !== undefined,
      needAnnotationsForSearch: compiledSearch !== undefined,
    };
    const ocrEnabled = !!options.ocr;
    const ocrLang = options.ocrLang ?? 'eng';
    const rasterBackedTextLayerByPage = new Map<number, boolean>();
    const optionalContentTextByPage = new Map<number, boolean>();
    const warningImageBoxesByPage = new Map<number, ImageBox[]>();
    const warningVectorBoxesByPage = new Map<number, VectorBox[]>();
    const visualRegionInputsByPage = new Map<number, BuildVisualRegionsInput>();
    const annotationAppearanceByPage = new Map<number, boolean>();
    const imageOps = buildImageOps(OPS);
    let widgetAppearanceCaptions: ReadonlyMap<string, string> | undefined;
    const getWidgetAppearanceCaptions = (): ReadonlyMap<string, string> => {
      if (widgetAppearanceCaptions !== undefined) return widgetAppearanceCaptions;
      try {
        const rawCaptions = extractWidgetAppearanceCaptions(pdfData ?? readFileSync(filePath));
        widgetAppearanceCaptions = flags.normalize
          ? new Map(Array.from(rawCaptions, ([id, caption]) => [id, normalizeText(caption)]))
          : rawCaptions;
      } catch {
        widgetAppearanceCaptions = new Map();
      }
      return widgetAppearanceCaptions;
    };
    // Parallelise per-page extraction. pdfjs's PDFDocumentProxy is safe
    // to call concurrently — each `getPage` resolves through its own
    // worker queue — and runParallel preserves input order so the output
    // pages[] still reads top-to-bottom of the selected range. The cap
    // (defaultConcurrency) keeps memory bounded on large multi-page
    // docs where every concurrent page builds its own canvas / op list.
    const pages: PageResult[] = await runParallel(pageNumbers, async (pageNum, i) => {
      const data = await extractPageData(doc, pageNum, imageOps, flags, getWidgetAppearanceCaptions);
      rasterBackedTextLayerByPage.set(pageNum, data.rasterBackedTextLayer);
      optionalContentTextByPage.set(pageNum, data.optionalContentText);
      warningImageBoxesByPage.set(pageNum, data._warningImageBoxes ?? []);
      warningVectorBoxesByPage.set(pageNum, data._warningVectorBoxes ?? []);
      if (data._visualRegionInput) visualRegionInputsByPage.set(pageNum, data._visualRegionInput);
      if (data.hasVisibleAnnotationAppearance) annotationAppearanceByPage.set(pageNum, true);
      return buildPageResult({
        data,
        pageNum,
        pageLabel: pageLabels?.[pageNum - 1],
        renderRegion,
        imagePath: imagePaths?.[i],
        renderRatio: renderRatios[i],
        hasVisibleAnnotationAppearance: annotationAppearanceByPage.get(pageNum) ?? false,
        compiledSearch,
        onWarning: options.onWarning,
      });
    });

    // Repeated-chrome detection has to wait until every selected page is
    // populated, since a single page can't tell its own chrome from its
    // body. Run it on public layout when --layout is on and on the
    // internal layout used by visualRegions otherwise, so
    // caption association can suppress repeated header/footer text
    // without exposing pages[].layout.
    if (flags.layout || flags.visualRegions) {
      const pagesForRepeated = pages.map((page) => {
        const layout = page.layout ?? visualRegionInputsByPage.get(page.page)?.layout;
        return layout ? { ...page, layout } : page;
      });
      markRepeatedBlocks(pagesForRepeated);
    }

    if (flags.visualRegions) {
      for (const page of pages) {
        const input = visualRegionInputsByPage.get(page.page);
        page.visualRegions = input
          ? buildVisualRegions({
              ...input,
              visualStatus: page.quality.visualStatus,
              nativeTextStatus: page.quality.nativeTextStatus,
            }).map((region, index) => ({
              ...region,
              id: `p${page.page}-vr${index}`,
            }))
          : [];
      }
    }

    if (renderVisualRegions) {
      const jobs = pages.flatMap((page) => (page.visualRegions ?? []).map((region) => ({ page, region })));
      if (jobs.length > 0) {
        const { renderPageWithStats } = await import('./renderer/index.js');
        await runParallel(jobs, async ({ page, region }) => {
          const rendered = await renderPageWithStats(doc, page.page, imagesDir as string, renderScale, region);
          region.image = rendered.path;
          region.renderContentRatio = rendered.contentRatio;
          if (rendered.renderedContentBox) region.renderedContentBox = rendered.renderedContentBox;
        });
      }
    }
    // OCR runs after the main pass so it can attach to already-built
    // PageResults. The pdfjs-derived `text` stays untouched — agents that
    // care about the difference can compare `text` vs `ocr.text` directly.
    if (ocrEnabled) {
      const { attachOcr } = await import('./ocr/index.js');
      // Hand the already-rendered PNG paths to attachOcr so we don't
      // re-rasterise the same pages a second time when both `--render`
      // and `--ocr` are on. attachOcr falls back to its own pdf.js
      // raster for any slot where the path is missing (no `--render`,
      // or a cache-hit slot that returned `contentRatio: undefined`).
      await attachOcr(doc, pageNumbers, pages, ocrLang, imagePaths ?? undefined, renderScale, renderRegion);
    }

    // Compute the derived `quality` field *after* OCR so the OCR-only
    // path's renderContentRatio participates in visual-status decisions.
    for (const p of pages) {
      p.quality = derivePageQuality(p, {
        hasVisibleAnnotationAppearance: annotationAppearanceByPage.get(p.page) ?? false,
      });
    }

    // Warning detection runs after `markRepeatedBlocks` so geometry
    // rules can route on `block.repeated`, and after OCR/quality so
    // OCR-confidence rules see the final page signals. Empty arrays are
    // omitted to keep the common "no warnings" page from carrying an
    // empty field in JSON.
    //
    // `chromeDetectionReliable` tells the detector whether the upstream
    // cross-page pass had enough material to produce meaningful `repeated`
    // flags. On a single-page extraction (or one where every page came
    // back with empty layout) every block stays unflagged-as-chrome, so
    // rules that distinguish body from chrome on the `repeated` axis
    // (`near_bottom_edge`) would mis-fire on what's really a running footer.
    const pagesWithLayout = pages.filter((p) => p.layout && p.layout.blocks.length > 0).length;
    const chromeDetectionReliable = pagesWithLayout >= 2;
    for (const p of pages) {
      const warnings = detectPageWarnings(p, {
        chromeDetectionReliable,
        rasterBackedTextLayer: rasterBackedTextLayerByPage.get(p.page),
        optionalContentText: optionalContentTextByPage.get(p.page),
        hasHiddenOptionalContent,
        imageBoxes: warningImageBoxesByPage.get(p.page),
        vectorBoxes: warningVectorBoxesByPage.get(p.page),
        pdfJsWarnings,
      });
      if (warnings.length > 0) p.warnings = warnings;
      else delete p.warnings;
    }

    // OCR search pass. The native pass ran in the per-page loop above
    // (spans were in scope); OCR results only exist after attachOcr,
    // so this second pass adds OCR-source matches at the end of each
    // page's `matches[]`. Skipped when OCR wasn't enabled — no
    // ocr.text to search.
    if (compiledSearch && ocrEnabled) {
      for (const p of pages) {
        if (!p.ocr) continue;
        const ocrMatches = searchPage(undefined, p.ocr, p.page, p.width, p.height, compiledSearch, options.onWarning);
        p.matches = (p.matches ?? []).concat(suppressDuplicateOcrMatches(p.matches, ocrMatches, compiledSearch));
      }
    }

    const overview = buildOverview(pages, { includeSearchMatches: compiledSearch !== undefined });

    const result: DocumentResult = {
      file: filePath,
      totalPages,
      metadata,
      ...(pageLabels !== undefined && { pageLabels }),
      ...(attachments !== undefined && { attachments }),
      ...(outline !== undefined && { outline }),
      ...(viewer !== undefined && { viewer }),
      ...(layers !== undefined && { layers }),
      ...(overview && { overview }),
      pages,
    };

    writeCachedResult(cacheDir, cacheKey, result);

    return result;
  } finally {
    restorePdfJsWarningCapture();
    await loadingTask.destroy();
  }
}

/**
 * Format-applied variant of {@link processDocument}. Used by the CLI.
 *
 * Returns the formatted string ("text" or "json"). Library callers
 * usually want `processDocument()` instead.
 */
export async function processFile(filePath: string, options: ProcessOptions): Promise<string> {
  validateProcessFileOptions(options);
  const result = await processDocument(filePath, buildProcessDocumentOptions(options));
  return renderResult(result, options);
}
