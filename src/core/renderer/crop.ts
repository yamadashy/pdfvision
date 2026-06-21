import type { PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { RenderRegion } from '../../types/index.js';

export interface ViewportCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageViewportLike {
  convertToViewportRectangle(rect: [number, number, number, number]): number[];
  convertToPdfPoint(x: number, y: number): number[];
}

export function viewportCropForRegion(
  page: PDFPageProxy,
  viewport: PageViewportLike,
  region: RenderRegion,
): ViewportCrop {
  const view = page.view;
  const viewMinX = Math.min(view[0], view[2]);
  const viewMaxY = Math.max(view[1], view[3]);
  const leftPdf = viewMinX + region.x;
  const rightPdf = leftPdf + region.width;
  const topPdf = viewMaxY - region.y;
  const bottomPdf = topPdf - region.height;
  const rect = viewport.convertToViewportRectangle([leftPdf, topPdf, rightPdf, bottomPdf]);
  const left = Math.min(rect[0], rect[2]);
  const top = Math.min(rect[1], rect[3]);
  const right = Math.max(rect[0], rect[2]);
  const bottom = Math.max(rect[1], rect[3]);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}
