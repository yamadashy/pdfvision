import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ProcessDocumentOptions, RenderRegion } from '../../types/index.js';
import { parsePageRangeWithSkipped } from '../options/pageRange.js';

interface ResolvePageNumbersInput {
  doc: PDFDocumentProxy;
  options: Pick<ProcessDocumentOptions, 'pages' | 'onWarning' | 'render' | 'ocr'>;
  renderRegion?: RenderRegion;
}

const RENDER_REGION_BOUNDS_EPSILON_PT = 0.01;

export async function resolvePageNumbers({ doc, options, renderRegion }: ResolvePageNumbersInput): Promise<number[]> {
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
    if (right > pageW + RENDER_REGION_BOUNDS_EPSILON_PT || bottom > pageH + RENDER_REGION_BOUNDS_EPSILON_PT) {
      throw new Error(
        `renderRegion ${right}×${bottom} (right×bottom) falls outside page ${pageNumbers[0]} bounds ${pageW}×${pageH} (width×height, PDF points)`,
      );
    }
  }

  return pageNumbers;
}
