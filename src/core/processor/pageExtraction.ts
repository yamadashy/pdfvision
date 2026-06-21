import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildAnnotations, hasVisibleAnnotationAppearance } from '../annotations/index.js';
import { resolveDestinationPage } from '../document/destinations.js';
import { buildPageStructure } from '../document/structure.js';
import { normalizeJavaScriptActions } from '../document/viewer.js';
import { buildFormFields } from '../formFields/index.js';
import { buildImageBoxes, type ImageOps } from '../graphics/imageBoxes.js';
import { buildVectorBoxes } from '../graphics/vectorBoxes.js';
import { countVectorPaintOps } from '../graphics/vectorOps.js';
import { buildLayout } from '../layout/index.js';
import { buildLinks } from '../links/index.js';
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
  flags: PageFlags,
  getWidgetAppearanceCaptions?: () => ReadonlyMap<string, string>,
): Promise<PageData> {
  const page = await doc.getPage(pageNum);
  const content = await page.getTextContent({ includeMarkedContent: true });
  const optionalContentText = content.items.some(isOptionalContentTextMarker);

  const view = page.view;
  // MediaBox is normally [minX, minY, maxX, maxY] but the spec allows the
  // pairs in either order; use abs so a flipped box still yields a sensible
  // area instead of falling through to 0 coverage.
  const width = Math.abs(view[2] - view[0]);
  const height = Math.abs(view[3] - view[1]);
  const xMin = Math.min(view[0], view[2]);
  const yMin = Math.min(view[1], view[3]);
  const rotation = normalizePageRotation(page.rotate);

  const {
    text,
    rawText: preservedRaw,
    textArea,
    spans,
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
  const opList = await page.getOperatorList();
  const allBoxes = buildImageBoxes(opList.fnArray, opList.argsArray as unknown[][], ops, height, view[0], yMin);
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
    flags.layout || flags.visualRegions || flags.formFields || flags.links || flags.needFormFieldsForSearch
      ? buildLayout(spans, round2(width), round2(height))
      : undefined;
  const layout = flags.layout ? internalLayout : undefined;
  const needsAnnotations =
    flags.formFields ||
    flags.links ||
    flags.annotations ||
    flags.visualRegions ||
    flags.annotationAppearanceHints ||
    flags.needAnnotationsForSearch ||
    flags.needFormFieldsForSearch;
  const annotations = needsAnnotations ? await page.getAnnotations({ intent: 'display' }) : undefined;
  const visibleAnnotationAppearance = annotations ? hasVisibleAnnotationAppearance(annotations) : false;
  const widgetAppearanceCaptions = annotations?.some(hasPushButtonWidget) ? getWidgetAppearanceCaptions?.() : undefined;
  const allFormFields =
    flags.formFields || flags.visualRegions || flags.needFormFieldsForSearch
      ? buildFormFields(
          annotations ?? [],
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
  const links = flags.links
    ? await buildLinks(annotations ?? [], height, xMin, yMin, {
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
  const allPageAnnotations =
    flags.annotations || flags.visualRegions || flags.annotationAppearanceHints || flags.needAnnotationsForSearch
      ? buildAnnotations(annotations ?? [], height, xMin, yMin, {
          normalizeText: flags.normalize ? normalizeText : undefined,
        })
      : undefined;
  const pageAnnotations = flags.annotations ? allPageAnnotations : undefined;
  const internalAnnotations = flags.needAnnotationsForSearch ? allPageAnnotations : undefined;
  const structure = flags.structure
    ? buildPageStructure(await page.getStructTree(), {
        normalizeText: flags.normalize ? normalizeText : undefined,
        pageHeight: height,
        viewMinX: xMin,
        viewMinY: yMin,
      })
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

  // Measured on the text we actually return (post-normalize) so the
  // count + ratio match what an agent sees in `text`. Cheap (one
  // string walk), so always on — this is the primary signal for
  // catching ToUnicode-CMap-less PDFs that look 100% covered but emit
  // raw glyph indices. Surfacing the raw count alongside the ratio
  // keeps sparse occurrences (a handful of control chars in a long
  // body page) discriminable from "zero" when the 3dp ratio rounds
  // them down.
  const npStats = nonPrintableStats(text);

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
    // Round to 2dp; PDF dimensions are nominally integers (Letter 612×792,
    // A4 595×842) but encrypted/cropped PDFs can carry sub-point fractions.
    width: round2(width),
    height: round2(height),
    // Spans are only exposed publicly when --geometry is on; layout /
    // imageBoxes each have their own opt-in flags and are independent
    // of `geometry`. `_internalSpans` only rides along when search
    // actually needs them — `--layout` alone already consumed the
    // span list during `buildLayout` above, so re-emitting them on
    // PageData would waste memory on the typical extraction.
    ...(flags.geometry && { spans }),
    ...(flags.needSpansForSearch && { _internalSpans: spans }),
    ...(layout !== undefined && { layout }),
    ...(imageBoxes !== undefined && { imageBoxes }),
    _warningImageBoxes: allBoxes,
    ...(vectorBoxes !== undefined && { vectorBoxes }),
    _warningVectorBoxes: allVectorBoxes,
    ...(allPageAnnotations !== undefined && { _warningAnnotations: allPageAnnotations }),
    ...(visualRegionInput !== undefined && { _visualRegionInput: visualRegionInput }),
    ...(visibleAnnotationAppearance && { hasVisibleAnnotationAppearance: true }),
    ...(formFields !== undefined && { formFields }),
    ...(internalFormFields !== undefined && { _internalFormFields: internalFormFields }),
    ...(links !== undefined && { links }),
    ...(pageAnnotations !== undefined && { annotations: pageAnnotations }),
    ...(internalAnnotations !== undefined && { _internalAnnotations: internalAnnotations }),
    ...(structure !== undefined && { structure }),
    ...(jsActions !== undefined && { jsActions }),
  };
}

function isOptionalContentTextMarker(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false;
  const marker = item as { type?: unknown; tag?: unknown };
  return marker.type === 'beginMarkedContentProps' && marker.tag === 'OC';
}

function normalizePageRotation(rotation: number | undefined): number | undefined {
  if (typeof rotation !== 'number' || !Number.isFinite(rotation)) return undefined;
  const normalized = ((Math.round(rotation) % 360) + 360) % 360;
  return normalized === 0 ? undefined : normalized;
}
