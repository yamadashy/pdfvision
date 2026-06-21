import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {
  DocumentAttachment,
  DocumentLayers,
  DocumentOutlineItem,
  DocumentResult,
  DocumentViewerState,
  ImageBox,
  PageResult,
  ProcessDocumentOptions,
  ProcessOptions,
  VectorBox,
} from '../types/index.js';
import { buildAttachments } from './document/attachments.js';
import { buildLayers } from './document/layers.js';
import { buildOutline } from './document/outline.js';
import { countStructureNodes } from './document/structure.js';
import { buildViewerState } from './document/viewer.js';
import { getCacheDir, getCached, pdfFingerprint, setCache } from './io/cache.js';
import { markRepeatedBlocks } from './layout/index.js';
import { parsePageRangeWithSkipped } from './options/pageRange.js';
import { buildCacheKey } from './processor/cacheKey.js';
import {
  areUsableAttachments,
  areUsableVisualRegionImages,
  dropCachedSafe,
  isUsableImage,
} from './processor/cacheValidation.js';
import type { PageFlags } from './processor/pageData.js';
import { extractPageData } from './processor/pageExtraction.js';
import { fingerprintData, withTruncationHint } from './processor/pdfBytes.js';
import { buildImageOps, buildPdfJsDocumentOptions } from './processor/pdfJsSetup.js';
import { capturePdfJsWarnings } from './processor/pdfJsWarnings.js';
import { prepareRenderImagesDir, validateRenderRegion, validateRenderScale } from './processor/renderOptions.js';
import { renderResult } from './processor/renderResult.js';
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
  if (cacheDir) {
    const cached = getCached(cacheDir, cacheKey);
    if (cached) {
      try {
        const result = JSON.parse(cached) as DocumentResult;
        // For --render, ensure each referenced PNG is a regular non-empty
        // file (not a symlink, not a partial write left from a crash).
        const imagesUsable =
          (!options.render || result.pages.every((p) => isUsableImage(p.image))) &&
          (!renderVisualRegions || areUsableVisualRegionImages(result));
        // For --attachment-output, ensure each referenced file is still
        // present and matches the embedded-file byte length before returning
        // a cached path instead of re-saving the attachment bytes.
        const attachmentsUsable = areUsableAttachments(result.attachments, attachmentOutputDir);
        if (imagesUsable && attachmentsUsable) {
          // The cached payload is keyed by content hash, so the same bytes
          // at a different path would otherwise return the original `file`
          // value. Patch in the current invocation's path before returning.
          result.file = filePath;
          return result;
        }
        dropCachedSafe(cacheDir, cacheKey);
      } catch {
        // Cache file is corrupted (e.g. partial write, format change between
        // versions). Drop it and fall through to a fresh extraction.
        dropCachedSafe(cacheDir, cacheKey);
      }
    }
  }

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
    let pageNumbers: number[];
    if (options.pages) {
      const parsed = parsePageRangeWithSkipped(options.pages, totalPages);
      pageNumbers = parsed.pages;
      // Warn (not throw) when the request named pages past the end. A
      // hard error would over-rotate on the common case `--pages 1-50`
      // for a 30-page doc; a silent drop lost real data (codex flagged
      // this on the apple-10-k sample). The middle path lets the
      // extraction succeed for the in-range pages while still telling
      // the caller something got skipped.
      // Library code must not write to stderr unsolicited; route the
      // notice through the caller-supplied `onWarning` callback if any
      // (the CLI passes one that prints to stderr).
      if (parsed.skipped.length > 0 && options.onWarning) {
        const more = parsed.skippedTruncated ? ` (+ more, truncated)` : '';
        options.onWarning(
          `--pages "${options.pages}" included page(s) past the end of the document (totalPages=${totalPages}); skipped: ${parsed.skipped.join(', ')}${more}`,
        );
      }
    } else {
      pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    // renderRegion is V1-strict: exactly one page selected. The use case
    // is "zoom into THIS region of THIS page"; applying the same xywh
    // to many pages (potentially with different sizes) needs a different
    // surface (e.g. per-page region map) we deliberately don't ship yet.
    if (renderRegion && pageNumbers.length !== 1) {
      throw new Error(
        `renderRegion requires exactly 1 page (resolved ${pageNumbers.length} from pages selector ${options.pages ? `"${options.pages}"` : '(all pages)'})`,
      );
    }
    // Bounds are checked against the MediaBox coordinate system exposed
    // by spans / imageBoxes / layout.blocks. The renderer maps that
    // region through pdf.js's viewport, so rotated pages still crop the
    // human-visible rotated page while callers keep one coordinate system.
    if (renderRegion && (options.render || options.ocr)) {
      const probePage = await doc.getPage(pageNumbers[0]);
      // Bounds against the page MediaBox dimensions — matches the
      // coordinate system pdfvision exposes via spans / imageBoxes
      // / layout.blocks, not the post-rotation viewport.
      const view = probePage.view;
      const pageW = Math.abs(view[2] - view[0]);
      const pageH = Math.abs(view[3] - view[1]);
      const right = renderRegion.x + renderRegion.width;
      const bottom = renderRegion.y + renderRegion.height;
      if (right > pageW || bottom > pageH) {
        throw new Error(
          `renderRegion ${right}×${bottom} (right×bottom) falls outside page ${pageNumbers[0]} bounds ${pageW}×${pageH} (width×height, PDF points)`,
        );
      }
    }

    const metadata = await doc.getMetadata();
    const info = metadata.info as Record<string, unknown> | null;
    const rawPageLabels = options.pageLabels ? await doc.getPageLabels() : undefined;
    const pageLabels =
      rawPageLabels === undefined
        ? undefined
        : (rawPageLabels ?? []).map((label) => (options.normalize !== false ? normalizeText(label) : label));
    const attachments: DocumentAttachment[] | undefined = options.attachments
      ? buildAttachments(await doc.getAttachments(), {
          normalizeText: options.normalize !== false ? normalizeText : undefined,
          outputDir: attachmentOutputDir,
        })
      : undefined;
    const outline: DocumentOutlineItem[] | undefined = options.outline
      ? await buildOutline(await doc.getOutline(), doc, {
          normalizeText: options.normalize !== false ? normalizeText : undefined,
        })
      : undefined;
    const viewer: DocumentViewerState | undefined = options.viewer
      ? await buildViewerState(doc, {
          normalizeText: options.normalize !== false ? normalizeText : undefined,
        })
      : undefined;
    const layerStateOptions = {
      normalizeText: options.normalize !== false ? normalizeText : undefined,
    };
    const layerState = options.layers
      ? await buildLayers(doc, layerStateOptions)
      : await buildLayers(doc, layerStateOptions).catch((): DocumentLayers => ({ groups: [] }));
    const layers: DocumentLayers | undefined = options.layers ? layerState : undefined;
    const hasHiddenOptionalContent = layerState.groups.some((group) => !group.visible);

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
      const renderRatio = renderRatios[i];
      const page: PageResult = {
        page: pageNum,
        ...(pageLabels?.[pageNum - 1] !== undefined && { pageLabel: pageLabels[pageNum - 1] }),
        ...(renderRegion !== undefined && { renderRegion }),
        text: data.text,
        ...(data.rawText !== undefined && { rawText: data.rawText }),
        image: imagePaths?.[i],
        charCount: data.charCount,
        imageCount: data.imageCount,
        vectorCount: data.vectorCount,
        textCoverage: data.textCoverage,
        nonPrintableRatio: data.nonPrintableRatio,
        nonPrintableCount: data.nonPrintableCount,
        ...(renderRatio !== undefined && { renderContentRatio: renderRatio }),
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
        // OCR may attach a renderContentRatio below; the post-OCR pass
        // overwrites this with the final classification.
        quality: { nativeTextStatus: 'empty' },
      };
      page.quality = derivePageQuality(page, {
        hasVisibleAnnotationAppearance: annotationAppearanceByPage.get(pageNum) ?? false,
      });
      // Run the native (span-based) search pass here while the internal
      // spans are still in scope. OCR-based matches are appended
      // post-OCR below — both produce the same SearchMatch shape, so
      // consumers iterate `pages[].matches` uniformly.
      if (compiledSearch) {
        const nativeMatches = searchPage(
          data._internalSpans,
          undefined,
          pageNum,
          data.width,
          data.height,
          compiledSearch,
          options.onWarning,
          data._internalFormFields,
          data._internalAnnotations,
        );
        page.matches = nativeMatches;
      }
      return page;
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

    const metaString = (raw: unknown): string | null => {
      if (typeof raw !== 'string') return null;
      return flags.normalize ? normalizeText(raw) : raw;
    };

    // Surface a top-level density summary when the result spans more than
    // one page. Same fields the Markdown formatter renders as a table, so
    // JSON consumers and Markdown readers can both scan outliers from the
    // top of the output without re-deriving anything from `pages[]`.
    const overview =
      pages.length > 1
        ? pages.map((p) => ({
            page: p.page,
            ...(p.pageLabel !== undefined && { pageLabel: p.pageLabel }),
            charCount: p.charCount,
            imageCount: p.imageCount,
            vectorCount: p.vectorCount,
            textCoverage: p.textCoverage,
            nonPrintableRatio: p.nonPrintableRatio,
            nonPrintableCount: p.nonPrintableCount,
            // Mirror the per-page renderContentRatio onto the overview row
            // so an agent can spot blank-rendered pages from the top-level
            // summary alone. Stays optional when neither --render nor --ocr
            // produced a raster.
            ...(p.renderContentRatio !== undefined && { renderContentRatio: p.renderContentRatio }),
            quality: p.quality,
            // Mirror the warnings count from each page so the top-level
            // table flags problem pages at a glance. Omitted when no
            // warnings fired, matching the PageResult.warnings field's
            // optional shape.
            ...(p.warnings && p.warnings.length > 0 && { warningCount: p.warnings.length }),
            // Search hits per page. Present-with-`0` is meaningful
            // ("search ran, no hits on this page"); omitted when
            // `search` wasn't requested at all so the overview stays
            // clean for the default extraction.
            ...(compiledSearch !== undefined && { matchCount: p.matches?.length ?? 0 }),
            ...(p.vectorBoxes !== undefined && { vectorBoxCount: p.vectorBoxes.length }),
            ...(p.visualRegions !== undefined && { visualRegionCount: p.visualRegions.length }),
            ...(p.formFields !== undefined && { formFieldCount: p.formFields.length }),
            ...(p.links !== undefined && { linkCount: p.links.length }),
            ...(p.annotations !== undefined && { annotationCount: p.annotations.length }),
            ...(p.structure !== undefined && { structureNodeCount: countStructureNodes(p.structure) }),
            width: p.width,
            height: p.height,
          }))
        : undefined;

    const result: DocumentResult = {
      file: filePath,
      totalPages,
      metadata: {
        title: metaString(info?.Title),
        author: metaString(info?.Author),
        subject: metaString(info?.Subject),
        creator: metaString(info?.Creator),
      },
      ...(pageLabels !== undefined && { pageLabels }),
      ...(attachments !== undefined && { attachments }),
      ...(outline !== undefined && { outline }),
      ...(viewer !== undefined && { viewer }),
      ...(layers !== undefined && { layers }),
      ...(overview && { overview }),
      pages,
    };

    if (cacheDir) {
      setCache(cacheDir, cacheKey, JSON.stringify(result));
    }

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
  const result = await processDocument(filePath, {
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
  });
  return renderResult(result, options);
}
