import type { PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { RenderedContentBox, RenderRegion } from '../../types/index.js';
import type { PixelContentBox } from './contentStats.js';
import type { PageViewportLike, ViewportCrop } from './crop.js';

export function contentBoxFromViewportPixels(
  page: PDFPageProxy,
  viewport: PageViewportLike,
  crop: ViewportCrop | undefined,
  box: PixelContentBox,
  region?: RenderRegion,
): RenderedContentBox {
  const left = (crop?.x ?? 0) + box.x;
  const top = (crop?.y ?? 0) + box.y;
  const right = left + box.width;
  const bottom = top + box.height;
  const corners = [
    viewport.convertToPdfPoint(left, top),
    viewport.convertToPdfPoint(right, top),
    viewport.convertToPdfPoint(right, bottom),
    viewport.convertToPdfPoint(left, bottom),
  ];
  const xs = corners.map((point) => point[0]);
  const ys = corners.map((point) => point[1]);
  const view = page.view;
  const viewMinX = Math.min(view[0], view[2]);
  const viewMaxY = Math.max(view[1], view[3]);
  const pdfLeft = Math.min(...xs);
  const pdfRight = Math.max(...xs);
  const pdfTop = Math.max(...ys);
  const pdfBottom = Math.min(...ys);
  let contentLeft = pdfLeft - viewMinX;
  let contentTop = viewMaxY - pdfTop;
  let contentRight = pdfRight - viewMinX;
  let contentBottom = viewMaxY - pdfBottom;

  if (region) {
    contentLeft = Math.max(contentLeft, region.x);
    contentTop = Math.max(contentTop, region.y);
    contentRight = Math.min(contentRight, region.x + region.width);
    contentBottom = Math.min(contentBottom, region.y + region.height);
  }

  return {
    x: round2(contentLeft),
    y: round2(contentTop),
    width: round2(Math.max(0, contentRight - contentLeft)),
    height: round2(Math.max(0, contentBottom - contentTop)),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
