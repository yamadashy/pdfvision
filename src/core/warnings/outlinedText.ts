import type { PageResult, PageWarning } from '../../types/index.js';
import type { PageWarningContext } from './index.js';

/** At most this many regions are named on one page; the rest are counted. */
const MAX_NAMED_REGIONS = 3;

/**
 * Words and values drawn as glyph outlines on a page that has a text
 * layer elsewhere: a package drawing's dimensions, an exported chart's
 * labels. The page reads cleanly, so nothing else says that the drawing
 * holds text the reading lacks. A page with no text at all is left to
 * `vector_graphics_no_native_text`.
 */
export function detectVectorOutlinedText(page: PageResult, context: PageWarningContext, out: PageWarning[]): void {
  const regions = context.vectorFigures?.outlinedText;
  if (!regions || regions.length === 0 || page.charCount === 0 || context.rasterBackedTextLayer) return;
  const sorted = [...regions].sort((a, b) => b.glyphs - a.glyphs);
  const named = sorted.slice(0, MAX_NAMED_REGIONS).map((region) => {
    const box = [region.x, region.y, region.width, region.height].map((n) => Math.round(n)).join(',');
    return { box, region };
  });
  const first = named[0];
  const more = sorted.length - named.length;
  const others = named
    .slice(1)
    .map((item) => ` and ${item.box} (${item.region.glyphs} glyphs)`)
    .join('');
  out.push({
    code: 'vector_outlined_text',
    severity: 'warning',
    message: `vector drawing at ${first.box} holds about ${first.region.glyphs} letter-shaped outlines in ${first.region.runs} rows${others}${more > 0 ? ` (and ${more} more region${more === 1 ? '' : 's'})` : ''} with no text behind them — labels, dimensions or values drawn as outlines are missing from the text; render the region (--render-region ${first.box}) to read them`,
  });
}
