import { textMarkupRegions } from '../annotations/index.js';
import { buildRegionGlyphTextIndex, type RegionGlyphOps } from '../graphics/regionGlyphText.js';
import type { FontGeometryResolver, PageBox } from '../graphics/textGlyphs.js';
import { linkRegion } from '../links/index.js';

interface PageGlyphTextInput {
  annotations: readonly unknown[];
  /** Read text under Highlight / Underline / Squiggly / StrikeOut quads. */
  markup: boolean;
  /** Read text under link rectangles. */
  links: boolean;
  fnArray: readonly number[];
  argsArray: readonly unknown[][];
  ops: RegionGlyphOps;
  pageHeight: number;
  viewMinX: number;
  viewMinY: number;
  resolveFont?: FontGeometryResolver;
  normalize?: (value: string) => string;
}

/**
 * One glyph-replay pass over the regions whose text links and markup
 * annotations report. Undefined when there is nothing to ask about or the
 * page's glyphs could not be placed.
 */
export function buildPageGlyphText(
  input: PageGlyphTextInput,
): ((boxes: readonly PageBox[]) => string | undefined) | undefined {
  const { annotations, pageHeight, viewMinX, viewMinY } = input;
  const regions: PageBox[] = [];
  for (const annotation of annotations) {
    if (input.markup) regions.push(...textMarkupRegions(annotation, pageHeight, viewMinX, viewMinY));
    const link = input.links ? linkRegion(annotation, pageHeight, viewMinX, viewMinY) : undefined;
    if (link) regions.push(link);
  }
  if (regions.length === 0) return undefined;
  const index = buildRegionGlyphTextIndex(
    input.fnArray,
    input.argsArray,
    input.ops,
    regions,
    pageHeight,
    viewMinX,
    viewMinY,
    input.resolveFont,
  );
  if (!index) return undefined;
  const { normalize } = input;
  return (boxes) => {
    const text = index.textIn(boxes);
    return text !== undefined && normalize ? normalize(text) : text;
  };
}
