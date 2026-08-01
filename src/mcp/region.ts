import { formatBox } from '../output/markdown/helpers.js';
import type { PageResult, RenderRegion } from '../types/index.js';

/**
 * Padding is deliberately wider than it is tall: text runs horizontally,
 * so a hit cropped to its own bbox plus a token margin cuts the
 * neighbouring words mid-glyph and reads as a broken render. Vertical
 * padding only needs to clear the line above and below.
 */
const MIN_PAD_X = 60;
const MIN_PAD_Y = 12;
/** Padding as a fraction of the region's own size, so a paragraph gets more breathing room than a word. */
const PAD_RATIO_X = 0.6;
const PAD_RATIO_Y = 0.3;

/**
 * A search hit's bbox hugs the glyphs, which renders as an unreadable
 * sliver with no surrounding context. Pad it, then clamp back inside the
 * page — `renderRegion` rejects out-of-bounds rectangles rather than
 * silently clipping them.
 */
export function padRegion(bbox: RenderRegion, page: Pick<PageResult, 'width' | 'height'>): RenderRegion {
  const padX = Math.max(MIN_PAD_X, bbox.width * PAD_RATIO_X);
  const padY = Math.max(MIN_PAD_Y, bbox.height * PAD_RATIO_Y);
  const x = Math.max(0, bbox.x - padX);
  const y = Math.max(0, bbox.y - padY);
  return {
    x,
    y,
    width: Math.min(page.width - x, bbox.width + padX * 2),
    height: Math.min(page.height - y, bbox.height + padY * 2),
  };
}

/**
 * Same `x,y,width,height` shape the Markdown output uses, rounded first:
 * padding produces long floats that cost tokens and help nobody, and the
 * value is round-tripped into `render_pdf` where 0.1 units is noise.
 */
export function formatRegion(region: RenderRegion): string {
  const round = (value: number) => Math.round(value * 10) / 10;
  return formatBox({
    x: round(region.x),
    y: round(region.y),
    width: round(region.width),
    height: round(region.height),
  });
}
