import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildAnnotations, hasVisibleAnnotationAppearance, isPageAnnotation } from '../annotations/index.js';
import { resolveDestinationPage } from '../document/destinations.js';
import { buildMarkedContentTextMap } from '../document/markedContentText.js';
import { buildPageStructure } from '../document/structure.js';
import { buildStructureTables } from '../document/structureTables.js';
import { normalizeJavaScriptActions } from '../document/viewer.js';
import { buildFormFields, isFormFieldAnnotation } from '../formFields/index.js';
import { normalizeRotation } from '../geometry/displayFrame.js';
import {
  annotationsInFrame,
  operatorListInFrame,
  structTreeInFrame,
  textContentInFrame,
} from '../geometry/displayFrameInputs.js';
import { resolvePageFrame } from '../geometry/pageFrame.js';
import { buildImageBoxes, type ImageOps } from '../graphics/imageBoxes.js';
import { collectInvisibleTextEvidence, type TextRenderingOps } from '../graphics/invisibleText.js';
import { collectOpaqueFillTextEvidence, type OpaqueFillTextOps } from '../graphics/opaqueFillText.js';
import type { FontGeometryInfo } from '../graphics/textGlyphs.js';
import { buildVectorBoxes } from '../graphics/vectorBoxes.js';
import { countVectorPaintOps } from '../graphics/vectorOps.js';
import { buildLayout } from '../layout/index.js';
import { buildLinks, isLinkAnnotation } from '../links/index.js';
import { nonPrintableStats } from '../quality/nonPrintable.js';
import { isRasterBackedTextLayer } from '../quality/rasterBackedTextLayer.js';
import type { PageData, PageFlags } from './pageData.js';
import { extractPageText } from './pageText.js';
import { normalizeText, round2 } from './textUtils.js';

function hasPushButtonWidget(annotation: unknown): boolean {
  if (!annotation || typeof annotation !== 'object') return false;
  const raw = annotation as { subtype?: unknown; fieldType?: unknown; pushButton?: unknown };
  return raw.subtype === 'Widget' && raw.fieldType === 'Btn' && raw.pushButton === true;
}

/**
 * Extract a page's text plus rough density metadata.
 *
 * `imageCount` and `textCoverage` let agents detect "looks fine but the
 * real content is rasterised" pages (common in Google Slides exports)
 * and decide whether to re-run with `--render`.
 */
export async function extractPageData(
  doc: PDFDocumentProxy,
  pageNum: number,
  ops: ImageOps,
  textRenderingOps: TextRenderingOps,
  opaqueFillTextOps: OpaqueFillTextOps,
  flags: PageFlags,
  getWidgetAppearanceCaptions?: () => ReadonlyMap<string, string>,
): Promise<PageData> {
  const page = await doc.getPage(pageNum);
  // Every geometry field is reported in the displayed frame (after
  // /Rotate), unless that would turn upright stored text sideways — see
  // resolvePageFrame. On a rotated page the pdf.js inputs are mapped into a
  // virtual upright page first, so text lines, layout, boxes and annotations
  // are all rebuilt along the axes a reader sees.
  const rawContent = page.getTextContent({ includeMarkedContent: true });
  const frame = await resolvePageFrame(page, rawContent);
  const content = textContentInFrame(await rawContent, frame);
  const optionalContentText = content.items.some(isOptionalContentTextMarker);

  // pdf.js page.view is the visible page box: CropBox intersected with
  // MediaBox when that intersection is distinct and valid, otherwise
  // MediaBox.
  const { width, height, viewMinX: xMin, viewMinY: yMin } = frame;
  const rotation = normalizeRotation(page.rotate) || undefined;
  const readUnrotated = rotation !== undefined && frame.rotation === 0;
  const userUnit = normalizePageUserUnit(page.userUnit);

  const {
    text,
    rawText: preservedRaw,
    nonPrintableSourceText,
    textArea,
    spans,
    searchSpans,
  } = extractPageText({
    content,
    flags,
    pageHeight: height,
    viewMinX: xMin,
    viewMinY: yMin,
  });

  // Always expand image-bbox per instance — counting ops would under-
  // report when pdf.js's QueueOptimizer collapses N draws of the same
  // XObject into a single Repeat / Group op. Expanded boxes serve as
  // both the public `imageBoxes` payload (when requested) and the source
  // of `imageCount`, which keeps the two trivially consistent.
  const rawOpList = await page.getOperatorList();
  const opList = operatorListInFrame(rawOpList, ops.transform, frame);
  const invisibleText = collectInvisibleTextEvidence(
    rawOpList.fnArray,
    rawOpList.argsArray as unknown[][],
    textRenderingOps,
  );
  const opaqueFillText = collectOpaqueFillTextEvidence(
    opList.fnArray,
    opList.argsArray as unknown[][],
    opaqueFillTextOps,
    height,
    xMin,
    yMin,
    cachedFontGeometry(page.commonObjs),
  );
  const allBoxes = buildImageBoxes(opList.fnArray, opList.argsArray as unknown[][], ops, height, xMin, yMin);
  const imageCount = allBoxes.length;
  const imageBoxes = flags.imageBoxes ? allBoxes : undefined;
  const vectorCount = countVectorPaintOps(
    opList.fnArray,
    opList.argsArray as unknown[][],
    ops,
    width,
    height,
    xMin,
    yMin,
  );
  const allVectorBoxes =
    vectorCount > 0
      ? buildVectorBoxes(opList.fnArray, opList.argsArray as unknown[][], ops, width, height, xMin, yMin)
      : [];
  const vectorBoxes = flags.vectorBoxes ? allVectorBoxes : undefined;
  // Build layout internally for form-field labels and visual-region table
  // hints, but only expose pages[].layout when --layout is explicitly on.
  const internalLayout =
    flags.layout ||
    flags.visualRegions ||
    flags.formFields ||
    flags.links ||
    flags.needFormFieldsForSearch ||
    flags.needLinksForSearch
      ? buildLayout(spans, round2(width), round2(height), { vectorBoxes: allVectorBoxes, imageBoxes: allBoxes })
      : undefined;
  const layout = flags.layout ? internalLayout : undefined;
  const annotations = annotationsInFrame(await page.getAnnotations({ intent: 'display' }), frame);
  const formFieldCount = annotations.filter(isFormFieldAnnotation).length;
  const linkCount = annotations.filter(isLinkAnnotation).length;
  const annotationCount = annotations.filter(isPageAnnotation).length;
  const visibleAnnotationAppearance = hasVisibleAnnotationAppearance(annotations);
  const widgetAppearanceCaptions = annotations.some(hasPushButtonWidget) ? getWidgetAppearanceCaptions?.() : undefined;
  const allFormFields =
    flags.formFields || flags.visualRegions || flags.needFormFieldsForSearch
      ? buildFormFields(
          annotations,
          height,
          xMin,
          yMin,
          flags.formFields || flags.visualRegions || flags.needFormFieldsForSearch
            ? [
                ...(internalLayout?.blocks.flatMap((block) =>
                  (block.lines.length > 0 ? block.lines : [block]).map((item) => ({
                    text: item.text,
                    x: item.x,
                    y: item.y,
                    width: item.width,
                    height: item.height,
                    ...('fontSize' in item && item.fontSize !== undefined && { fontSize: item.fontSize }),
                  })),
                ) ?? []),
                ...spans.map((span) => ({
                  text: span.text,
                  x: span.x,
                  y: span.y,
                  width: span.width,
                  height: span.height,
                  fontSize: span.fontSize,
                })),
              ]
            : [],
          { widgetAppearanceCaptions },
        )
      : undefined;
  const formFields = flags.formFields ? allFormFields : undefined;
  const internalFormFields = flags.needFormFieldsForSearch ? allFormFields : undefined;
  const allLinks =
    flags.links || flags.needLinksForSearch
      ? await buildLinks(annotations, height, xMin, yMin, {
          resolveDestinationPage: (target) => resolveDestinationPage(doc, target),
          labelLines:
            internalLayout?.blocks.flatMap((block) =>
              (block.lines.length > 0 ? block.lines : [block]).map((item) => ({
                text: item.text,
                x: item.x,
                y: item.y,
                width: item.width,
                height: item.height,
              })),
            ) ?? [],
        })
      : undefined;
  const links = flags.links ? allLinks : undefined;
  const internalLinks = flags.needLinksForSearch ? allLinks : undefined;
  const allPageAnnotations =
    flags.annotations || flags.visualRegions || flags.annotationAppearanceHints || flags.needAnnotationsForSearch
      ? buildAnnotations(annotations, height, xMin, yMin, {
          normalizeText: flags.normalize ? normalizeText : undefined,
        })
      : undefined;
  const pageAnnotations = flags.annotations ? allPageAnnotations : undefined;
  const internalAnnotations = flags.needAnnotationsForSearch ? allPageAnnotations : undefined;
  const structure = flags.structure
    ? buildPageStructure(structTreeInFrame(await page.getStructTree(), frame), {
        normalizeText: flags.normalize ? normalizeText : undefined,
        pageHeight: height,
        viewMinX: xMin,
        viewMinY: yMin,
      })
    : undefined;
  const structureTables = flags.structure
    ? buildStructureTables(
        structure ?? null,
        buildMarkedContentTextMap(content, {
          normalizeText: flags.normalize ? normalizeText : undefined,
        }),
      )
    : undefined;
  const jsActions = flags.viewer
    ? normalizeJavaScriptActions(await page.getJSActions(), {
        normalizeText: flags.normalize ? normalizeText : undefined,
      })
    : undefined;

  const pageArea = width * height;
  const rawCoverage = pageArea > 0 ? textArea / pageArea : 0;
  const textCoverage = Math.max(0, Math.min(1, rawCoverage));
  const rasterBackedTextLayer = isRasterBackedTextLayer({
    imageCount,
    vectorCount,
    textCoverage,
    charCount: text.length,
    imageBoxes: allBoxes,
    pageWidth: width,
    pageHeight: height,
  });

  const visualRegionInput = flags.visualRegions
    ? {
        pageWidth: round2(width),
        pageHeight: round2(height),
        imageBoxes: allBoxes,
        vectorBoxes: allVectorBoxes,
        layout: internalLayout,
        formFields: allFormFields,
        annotations: allPageAnnotations,
      }
    : undefined;

  // Measured on the pre-strip normalization source so C0 controls still
  // contribute to the quality signal even though they are removed from
  // returned `text`. Cheap (one string walk), so always on — this is the
  // primary signal for catching ToUnicode-CMap-less PDFs that look 100%
  // covered but emit raw glyph indices. Surfacing the raw count alongside
  // the ratio keeps sparse occurrences (a handful of control chars in a
  // long body page) discriminable from "zero" when the 3dp ratio rounds
  // them down.
  const npStats = nonPrintableStats(nonPrintableSourceText);

  return {
    text,
    rawText: preservedRaw,
    charCount: text.length,
    imageCount,
    rasterBackedTextLayer,
    optionalContentText,
    vectorCount,
    textCoverage: Math.round(textCoverage * 1000) / 1000,
    nonPrintableRatio: npStats.ratio,
    nonPrintableCount: npStats.count,
    ...(rotation !== undefined && { rotation }),
    ...(readUnrotated && { _readUnrotated: true }),
    ...(userUnit !== undefined && { userUnit }),
    // Round to 2dp; raw page-view dimensions are commonly integers (Letter
    // 612×792 at UserUnit 1) but encrypted/cropped PDFs can carry fractions.
    width: round2(width),
    height: round2(height),
    // Spans are only exposed publicly when --geometry is on; layout /
    // imageBoxes each have their own opt-in flags and are independent
    // of `geometry`. `_internalSpans` only rides along when search
    // actually needs them — `--layout` alone already consumed the
    // span list during `buildLayout` above, so re-emitting them on
    // PageData would waste memory on the typical extraction.
    ...(flags.geometry && { spans }),
    ...(flags.needSpansForSearch && { _internalSpans: searchSpans ?? spans }),
    ...(flags.needSpansForWarnings && { _warningSpans: spans }),
    ...(invisibleText !== undefined && { _invisibleText: invisibleText }),
    ...(opaqueFillText !== undefined && { _opaqueFillText: opaqueFillText }),
    ...(layout !== undefined && { layout }),
    ...(flags.needSpansForSearch && internalLayout !== undefined && { _internalLayout: internalLayout }),
    ...(imageBoxes !== undefined && { imageBoxes }),
    _warningImageBoxes: allBoxes,
    ...(vectorBoxes !== undefined && { vectorBoxes }),
    _warningVectorBoxes: allVectorBoxes,
    ...(allPageAnnotations !== undefined && { _warningAnnotations: allPageAnnotations }),
    ...(visualRegionInput !== undefined && { _visualRegionInput: visualRegionInput }),
    ...(visibleAnnotationAppearance && { hasVisibleAnnotationAppearance: true }),
    ...(formFieldCount > 0 && { formFieldCount }),
    ...(formFields !== undefined && { formFields }),
    ...(internalFormFields !== undefined && { _internalFormFields: internalFormFields }),
    ...(linkCount > 0 && { linkCount }),
    ...(links !== undefined && { links }),
    ...(internalLinks !== undefined && { _internalLinks: internalLinks }),
    ...(annotationCount > 0 && { annotationCount }),
    ...(pageAnnotations !== undefined && { annotations: pageAnnotations }),
    ...(internalAnnotations !== undefined && { _internalAnnotations: internalAnnotations }),
    ...(structure !== undefined && { structure }),
    ...(structureTables && structureTables.length > 0 && { structureTables }),
    ...(jsActions !== undefined && { jsActions }),
  };
}

function isOptionalContentTextMarker(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false;
  const marker = item as { type?: unknown; tag?: unknown };
  return marker.type === 'beginMarkedContentProps' && marker.tag === 'OC';
}

function normalizePageUserUnit(userUnit: number | undefined): number | undefined {
  if (typeof userUnit !== 'number' || !Number.isFinite(userUnit) || userUnit <= 0 || userUnit === 1) return undefined;
  return userUnit;
}

/**
 * Font facts glyph placement needs, read from the fonts pdf.js already
 * loaded for this page's operator list. A font that is not there (or not
 * resolved yet) yields undefined, and placement falls back to pdf.js's
 * default 1/1000 font matrix.
 */
function fontGeometry(
  commonObjs: { has(id: string): boolean; get(id: string): unknown } | undefined,
  loadedName: string,
): FontGeometryInfo | undefined {
  try {
    if (!commonObjs?.has(loadedName)) return undefined;
    const font = commonObjs.get(loadedName) as { fontMatrix?: unknown; vertical?: unknown } | null;
    if (!font || typeof font !== 'object') return undefined;
    const matrix = font.fontMatrix as ArrayLike<unknown> | undefined;
    const fontMatrix =
      matrix && typeof matrix === 'object' && matrix.length >= 4
        ? Array.from(matrix).filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
        : undefined;
    return { ...(fontMatrix && fontMatrix.length >= 4 && { fontMatrix }), vertical: font.vertical === true };
  } catch {
    return undefined;
  }
}

function cachedFontGeometry(
  commonObjs: { has(id: string): boolean; get(id: string): unknown } | undefined,
): (loadedName: string) => FontGeometryInfo | undefined {
  const cache = new Map<string, FontGeometryInfo | undefined>();
  return (loadedName) => {
    if (cache.has(loadedName)) return cache.get(loadedName);
    const info = fontGeometry(commonObjs, loadedName);
    cache.set(loadedName, info);
    return info;
  };
}
