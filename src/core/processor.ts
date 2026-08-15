import { join, resolve } from 'node:path';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {
  DocumentResult,
  ImageBox,
  PageAnnotation,
  PageResult,
  ProcessDocumentOptions,
  ProcessOptions,
  RenderedContentBox,
  TextSpan,
  VectorBox,
} from '../types/index.js';
import type { InvisibleTextEvidence } from './graphics/invisibleText.js';
import type { OpaqueFillTextEvidence } from './graphics/opaqueFillText.js';
import { getCacheDir, pdfFingerprint } from './io/cache.js';
import { buildCacheKey } from './processor/cacheKey.js';
import { extractDocumentFeatures } from './processor/documentFeatures.js';
import { resolveFlatRenderPaths } from './processor/flatRenderPaths.js';
import { buildOverview } from './processor/overview.js';
import { extractPageData } from './processor/pageExtraction.js';
import { buildPageFlags } from './processor/pageFlags.js';
import { buildPageResult } from './processor/pageResult.js';
import { resolvePageNumbers } from './processor/pageSelection.js';
import { fingerprintData, withTruncationHint } from './processor/pdfBytes.js';
import {
  buildImageOps,
  buildOpaqueFillTextOps,
  buildPdfJsDocumentOptions,
  buildTextRenderingOps,
} from './processor/pdfJsSetup.js';
import { capturePdfJsWarnings } from './processor/pdfJsWarnings.js';
import { buildProcessDocumentOptions, validateProcessFileOptions } from './processor/processFileOptions.js';
import { prepareRenderImagesDir, validateRenderRegion, validateRenderScale } from './processor/renderOptions.js';
import { renderResult } from './processor/renderResult.js';
import { readCachedResult, writeCachedResult } from './processor/resultCache.js';
import { applyVisualRegionPostProcessing } from './processor/visualRegionPostProcessing.js';
import { createWidgetAppearanceCaptionLoader } from './processor/widgetAppearanceCaptions.js';
import { derivePageQuality } from './quality/pageQuality.js';
import { runParallel } from './runtime/parallel.js';
import {
  type CompiledSearch,
  compileSearch,
  createRegexSearchBudget,
  isRegexTimeoutWarning,
  searchOcrPage,
} from './search/index.js';
import type { BuildVisualRegionsInput } from './visualRegions/index.js';
import { detectPageWarnings } from './warnings/index.js';
import { buildXfaFormWarning } from './warnings/xfaForm.js';

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
  const needFingerprint = !options.noCache || !!(options.attachments && options.attachmentOutput);
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
  if (cachedResult) {
    // Warnings are part of the answer, not commentary on how it was
    // produced: "matches on this page hit the cap" and "the range ran
    // past the last page" describe the result itself. Replaying them
    // keeps the second identical call as honest as the first.
    for (const message of cachedResult.warnings) options.onWarning?.(message);
    return cachedResult.result;
  }

  // A regex-mode search interrupted by the per-page time budget produced
  // an incomplete result. Caching it would serve that silent zero on
  // every later identical call — with no warning, since warnings only
  // fire while actually searching — so track the interruption and skip
  // the cache write below.
  let searchInterrupted = false;
  const emittedWarnings: string[] = [];
  let warningCount = 0;
  const recordWarning = (message: string): void => {
    warningCount++;
    if (emittedWarnings.length < MAX_CACHED_WARNINGS) emittedWarnings.push(message);
    options.onWarning?.(message);
  };
  // Exactly at the cap everything is kept; past it the last slot gives
  // up its warning for a note carrying the real total, so the stored
  // list never exceeds the cap and never overstates what it dropped.
  const warningsToCache = (): string[] =>
    warningCount <= MAX_CACHED_WARNINGS
      ? emittedWarnings
      : [...emittedWarnings.slice(0, MAX_CACHED_WARNINGS - 1), cachedWarningsTruncated(warningCount)];
  const onSearchWarning = (message: string): void => {
    if (isRegexTimeoutWarning(message)) searchInterrupted = true;
    recordWarning(message);
  };

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
    const pageNumbers = await resolvePageNumbers({
      doc,
      options: { ...options, onWarning: recordWarning },
      renderRegion,
    });

    const {
      metadata,
      pageLabels,
      attachments,
      attachmentCount,
      javascriptActionCount,
      outlineCount,
      outline,
      viewer,
      layers,
      hasHiddenOptionalContent,
      isXfaPresent,
    } = await extractDocumentFeatures(doc, options, attachmentOutputDir);

    let imagePaths: string[] | null = null;
    // Parallel array to imagePaths: renderContentRatio for each rendered
    // page (or undefined slots when --render is off). Surfaced on the
    // PageResult so an agent can spot blank-rendered pages directly from
    // the structured output instead of inferring from "OCR confidence 0".
    let renderRatios: (number | undefined)[] = [];
    let renderContentBoxes: (RenderedContentBox | undefined)[] = [];
    const imagesDir =
      options.render || renderVisualRegions
        ? prepareRenderImagesDir({
            renderOutput: options.renderOutput,
            cacheDir,
            renderScale,
          })
        : null;
    if (options.render) {
      // renderer pulls in @napi-rs/canvas (native binding); only load it
      // when --render is requested.
      const { renderPagesWithStats } = await import('./renderer/index.js');
      // Explicit --render-output writes flat into the caller's dir, so
      // pre-resolve collision-safe paths (and disable disk reuse: a
      // same-named PNG there may belong to a different PDF).
      const pagesOptions = options.renderOutput
        ? {
            outputPaths: resolveFlatRenderPaths(imagesDir as string, pageNumbers, renderRegion, recordWarning),
            reuse: false,
          }
        : undefined;
      const rendered = await renderPagesWithStats(
        doc,
        pageNumbers,
        imagesDir as string,
        renderScale,
        renderRegion,
        pagesOptions,
      );
      imagePaths = rendered.map((r) => r.path);
      renderRatios = rendered.map((r) => r.contentRatio);
      renderContentBoxes = rendered.map((r) => r.renderedContentBox);
    }

    const flags = buildPageFlags(options, {
      visualRegions: wantsVisualRegions,
      hasSearch: compiledSearch !== undefined,
    });
    // Whole-request deadline for regex-mode searches. The per-page guard
    // bounds one page; without this a pathological pattern still costs
    // pages × the per-page budget and the caller (an MCP host especially)
    // gives up before pdfvision does.
    const searchBudget = compiledSearch?.regexMode
      ? createRegexSearchBudget(pageNumbers.length, options.regexSearchBudgetMs)
      : undefined;
    const ocrEnabled = !!options.ocr;
    const ocrLang = options.ocrLang ?? 'eng';
    const rasterBackedTextLayerByPage = new Map<number, boolean>();
    const optionalContentTextByPage = new Map<number, boolean>();
    const warningImageBoxesByPage = new Map<number, ImageBox[]>();
    const warningVectorBoxesByPage = new Map<number, VectorBox[]>();
    const warningAnnotationsByPage = new Map<number, PageAnnotation[]>();
    const warningSpansByPage = new Map<number, TextSpan[]>();
    const invisibleTextByPage = new Map<number, InvisibleTextEvidence>();
    const opaqueFillTextByPage = new Map<number, OpaqueFillTextEvidence>();
    const visualRegionInputsByPage = new Map<number, BuildVisualRegionsInput>();
    const annotationAppearanceByPage = new Map<number, boolean>();
    const imageOps = buildImageOps(OPS);
    const textRenderingOps = buildTextRenderingOps(OPS);
    const opaqueFillTextOps = buildOpaqueFillTextOps(OPS);
    const getWidgetAppearanceCaptions = createWidgetAppearanceCaptionLoader({
      pdfData,
      filePath,
      normalize: flags.normalize,
    });
    // Parallelise per-page extraction. pdfjs's PDFDocumentProxy is safe
    // to call concurrently — each `getPage` resolves through its own
    // worker queue — and runParallel preserves input order so the output
    // pages[] still reads top-to-bottom of the selected range. The cap
    // (defaultConcurrency) keeps memory bounded on large multi-page
    // docs where every concurrent page builds its own canvas / op list.
    const pages: PageResult[] = await runParallel(pageNumbers, async (pageNum, i) => {
      const data = await extractPageData(
        doc,
        pageNum,
        imageOps,
        textRenderingOps,
        opaqueFillTextOps,
        flags,
        getWidgetAppearanceCaptions,
      );
      rasterBackedTextLayerByPage.set(pageNum, data.rasterBackedTextLayer);
      optionalContentTextByPage.set(pageNum, data.optionalContentText);
      warningImageBoxesByPage.set(pageNum, data._warningImageBoxes ?? []);
      warningVectorBoxesByPage.set(pageNum, data._warningVectorBoxes ?? []);
      warningAnnotationsByPage.set(pageNum, data._warningAnnotations ?? []);
      warningSpansByPage.set(pageNum, data._warningSpans ?? []);
      if (data._invisibleText) invisibleTextByPage.set(pageNum, data._invisibleText);
      if (data._opaqueFillText) opaqueFillTextByPage.set(pageNum, data._opaqueFillText);
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
        searchBudget,
        onWarning: onSearchWarning,
      });
    });

    const renderContentBoxesByPage = new Map<number, RenderedContentBox>();
    for (let i = 0; i < pageNumbers.length; i++) {
      const box = renderContentBoxes[i];
      if (box) renderContentBoxesByPage.set(pageNumbers[i], box);
    }

    await applyVisualRegionPostProcessing({
      pages,
      layoutEnabled: flags.layout,
      visualRegionsEnabled: flags.visualRegions,
      renderVisualRegions,
      visualRegionInputsByPage,
      renderContentBoxesByPage,
      doc,
      imagesDir,
      flatImagesDir: options.renderOutput !== undefined,
      renderScale,
      onWarning: recordWarning,
    });
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
    // cross-page pass had enough material to produce meaningful repeated
    // header/footer flags. Single-page extraction can still mark
    // conservative vertical edge markers, but it cannot distinguish an
    // ordinary footer from real running chrome.
    const pagesWithLayout = pages.filter((p) => p.layout && p.layout.blocks.length > 0).length;
    const chromeDetectionReliable = pagesWithLayout >= 2;
    for (const p of pages) {
      const warningContext = {
        chromeDetectionReliable,
        rasterBackedTextLayer: rasterBackedTextLayerByPage.get(p.page),
        optionalContentText: optionalContentTextByPage.get(p.page),
        hasHiddenOptionalContent,
        imageBoxes: warningImageBoxesByPage.get(p.page),
        vectorBoxes: warningVectorBoxesByPage.get(p.page),
        annotations: warningAnnotationsByPage.get(p.page),
        spans: warningSpansByPage.get(p.page),
        invisibleText: invisibleTextByPage.get(p.page),
        opaqueFillText: opaqueFillTextByPage.get(p.page),
        pdfJsWarnings,
      };
      const warnings = detectPageWarnings(p, warningContext);
      if (warnings.length > 0) p.warnings = warnings;
      else delete p.warnings;
    }

    // XFA is a document-level fact, but agents scan per-page warnings, so
    // attach it once to the first extracted page. Placed after the per-page
    // detector loop so that loop's "no warnings → delete" reset cannot drop it.
    if (isXfaPresent && pages.length > 0) {
      pages[0].warnings = [buildXfaFormWarning(), ...(pages[0].warnings ?? [])];
    }

    // OCR search pass. The native pass ran in the per-page loop above
    // (spans were in scope); OCR results only exist after attachOcr,
    // so this second pass adds OCR-source matches at the end of each
    // page's `matches[]`. Skipped when OCR wasn't enabled — no
    // ocr.text to search.
    if (compiledSearch && ocrEnabled) {
      for (const p of pages) {
        if (!p.ocr) continue;
        if (searchBudget?.claimPage(p.page) === false) continue;
        const ocrMatches = searchOcrPage(p.ocr, p.page, p.width, p.height, compiledSearch, p.matches, onSearchWarning);
        p.matches = (p.matches ?? []).concat(ocrMatches);
      }
    }
    // One summary warning for the whole request, after every pass that
    // could have been cut short. Classified as a regex-timeout warning,
    // so it also keeps this partial result out of the cache.
    searchBudget?.report(onSearchWarning);

    const overview = buildOverview(pages, { includeSearchMatches: compiledSearch !== undefined });

    const result: DocumentResult = {
      file: filePath,
      totalPages,
      metadata,
      ...(pageLabels !== undefined && { pageLabels }),
      ...(attachments !== undefined && { attachments }),
      ...(attachmentCount !== undefined && { attachmentCount }),
      ...(javascriptActionCount !== undefined && { javascriptActionCount }),
      ...(outlineCount !== undefined && { outlineCount }),
      ...(isXfaPresent && { xfa: true }),
      ...(outline !== undefined && { outline }),
      ...(viewer !== undefined && { viewer }),
      ...(layers !== undefined && { layers }),
      ...(overview && { overview }),
      pages,
    };

    if (!searchInterrupted) writeCachedResult(cacheDir, cacheKey, result, warningsToCache());

    return result;
  } finally {
    restorePdfJsWarningCapture();
    await loadingTask.destroy();
  }
}

/**
 * Format-applied variant of {@link processDocument}. Used by the CLI.
 *
 * Returns a formatted Markdown, JSON, XML, or TOON string. Library callers
 * usually want `processDocument()` instead.
 */
/**
 * Warnings recorded for replay on a later cache hit. Bounded because the
 * per-page ones (match cap, OCR notes) scale with the document, and the
 * cache entry should not grow without limit to carry them. Past the cap
 * the count is reported rather than silently dropped.
 */
const MAX_CACHED_WARNINGS = 50;
const cachedWarningsTruncated = (total: number): string =>
  `${total} warnings were emitted on the run this cached result came from; the first ${MAX_CACHED_WARNINGS - 1} are above — re-run with --no-cache (or MCP: a different page range) to see the rest`;

export async function processFile(filePath: string, options: ProcessOptions): Promise<string> {
  validateProcessFileOptions(options);
  const result = await processDocument(filePath, buildProcessDocumentOptions(options));
  return renderResult(result, options);
}
