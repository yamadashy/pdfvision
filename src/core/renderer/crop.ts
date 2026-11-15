import type { RenderRegion } from '../../types/index.js';
import { type DisplayFrame, framePointToPdf } from '../geometry/displayFrame.js';

export interface ViewportCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageViewportLike {
  convertToViewportPoint(x: number, y: number): number[];
  convertToPdfPoint(x: number, y: number): number[];
}

export function viewportCropForRegion(
  frame: DisplayFrame,
  viewport: PageViewportLike,
  region: RenderRegion,
): ViewportCrop {
  // `region` is in the page frame spans / imageBoxes / layout.blocks use
  // (the viewport's own rotation), so map its corners back to PDF user
  // space and let pdf.js's viewport apply rotation, UserUnit and scale.
  const topLeft = viewport.convertToViewportPoint(...framePointToPdf(frame, region.x, region.y));
  const bottomRight = viewport.convertToViewportPoint(
    ...framePointToPdf(frame, region.x + region.width, region.y + region.height),
  );
  const rect = [topLeft[0], topLeft[1], bottomRight[0], bottomRight[1]];
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
