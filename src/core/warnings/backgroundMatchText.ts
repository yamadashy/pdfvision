import type { ImageBox, PageResult, PageWarning } from '../../types/index.js';
import type { OpaqueFillTextEvidence } from '../graphics/opaqueFillText.js';
import {
  createComparisonBudget,
  describePassages,
  firstGlyphAtOrAfterRun,
  flattenGlyphs,
  type GlyphRef,
  hiddenPassages,
  isOnPage,
  isRepaintedOver,
  overlapArea,
} from './hiddenGlyphPassages.js';

interface BackgroundMatchContext {
  opaqueFillText?: OpaqueFillTextEvidence;
  imageBoxes?: readonly ImageBox[];
  rasterBackedTextLayer?: boolean;
}

const MAX_GLYPH_COMPARISONS = 2_000_000;

/**
 * Native text filled in the colour of what is behind it — white text on a
 * white page, or on a white box — so a reader sees blank space where
 * extraction returns words.
 *
 * The collector only marks a glyph when the paint behind it is provably
 * known (an opaque rectangle of a device colour, or nothing at all). Here
 * the remaining unknowns are ruled out: a raster image anywhere under the
 * glyph (light text over a photo is legible, and image pixels are not in
 * the paint history), text repainted on top of the glyph (a halo or
 * knockout copy under visible text), and glyphs off the page.
 */
export function detectTextMatchesBackground(
  page: PageResult,
  context: BackgroundMatchContext,
  out: PageWarning[],
): void {
  const runs = context.opaqueFillText?.glyphRuns;
  if (context.rasterBackedTextLayer || !runs) return;
  const glyphs = flattenGlyphs(runs);
  if (!glyphs.some((ref) => ref.glyph.matchesBackground)) return;

  const images = context.imageBoxes ?? [];
  const budget = createComparisonBudget(MAX_GLYPH_COMPARISONS);
  const hidden = new Set<GlyphRef>();
  for (const ref of glyphs) {
    const { glyph } = ref;
    if (!glyph.matchesBackground || !isOnPage(glyph.core, page.width, page.height)) continue;
    if (images.some((image) => overlapArea(glyph.box, image) > 0)) continue;
    const later = firstGlyphAtOrAfterRun(glyphs, ref.run + 1);
    if (isRepaintedOver(glyph, glyphs, later, budget, (other) => other.glyph.matchesBackground === true)) continue;
    if (budget.exhausted) return;
    hidden.add(ref);
  }
  const passages = hiddenPassages(glyphs, (ref) => hidden.has(ref));
  if (passages.length === 0) return;

  const plural = passages.length !== 1;
  out.push({
    code: 'text_matches_background',
    // Not an error: the extraction is faithful to the file, and the common
    // real-world cause is invisible production metadata (printer slugs,
    // job IDs) rather than an attempt to hide content. A black box drawn
    // over text is a stronger claim and stays an error.
    severity: 'warning',
    message: `${passages.length} extracted native text passage${plural ? 's are' : ' is'} drawn in the same colour as the paint behind ${plural ? 'them' : 'it'} (for example white text on a white page): ${describePassages(passages, page.userUnit)} — a human viewer sees blank space there, so this text is not part of what the page shows (often production metadata, sometimes deliberately hidden content); render a listed bbox (--render-region x,y,w,h) before quoting it as visible`,
  });
}
