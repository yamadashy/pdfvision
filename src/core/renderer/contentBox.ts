import type { RenderedContentBox, RenderRegion } from '../../types/index.js';
import { type DisplayFrame, pdfPointToFrame } from '../geometry/displayFrame.js';
import type { PixelContentBox } from './contentStats.js';
import type { PageViewportLike, ViewportCrop } from './crop.js';

export function contentBoxFromViewportPixels(
  frame: DisplayFrame,
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
  const framePoints = corners.map(([x, y]) => pdfPointToFrame(frame, x, y));
  const xs = framePoints.map((point) => point[0]);
  const ys = framePoints.map((point) => point[1]);
  let contentLeft = Math.min(...xs);
  let contentTop = Math.min(...ys);
  let contentRight = Math.max(...xs);
  let contentBottom = Math.max(...ys);

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
