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

interface FaintTextContext {
  opaqueFillText?: OpaqueFillTextEvidence;
  imageBoxes?: readonly ImageBox[];
  rasterBackedTextLayer?: boolean;
}

const MAX_GLYPH_COMPARISONS = 2_000_000;

/**
 * Native text drawn faint — at a fraction of full contrast against the
 * known paint behind it. Extraction returns it like any other text, but a
 * reader sees it greyed out: on a slide deck built up over overlay pages it
 * is the items not yet revealed (Beamer's `\setbeamercovered{transparent}`
 * draws them at 15% opacity), elsewhere a watermark or deliberately dimmed
 * text. Background knowledge and exclusions are those of
 * `text_matches_background`, which takes the glyphs that are not visible at all.
 */
export function detectFaintText(page: PageResult, context: FaintTextContext, out: PageWarning[]): void {
  const runs = context.opaqueFillText?.glyphRuns;
  if (context.rasterBackedTextLayer || !runs) return;
  const glyphs = flattenGlyphs(runs);
  if (!glyphs.some((ref) => ref.glyph.faint)) return;

  const images = context.imageBoxes ?? [];
  const budget = createComparisonBudget(MAX_GLYPH_COMPARISONS);
  const faint = new Set<GlyphRef>();
  for (const ref of glyphs) {
    const { glyph } = ref;
    if (!glyph.faint || !isOnPage(glyph.core, page.width, page.height)) continue;
    if (images.some((image) => overlapArea(glyph.box, image) > 0)) continue;
    const later = firstGlyphAtOrAfterRun(glyphs, ref.run + 1);
    if (isRepaintedOver(glyph, glyphs, later, budget, (other) => other.glyph.faint === true)) continue;
    if (budget.exhausted) return;
    faint.add(ref);
  }
  const passages = hiddenPassages(glyphs, (ref) => faint.has(ref));
  if (passages.length === 0) return;

  const plural = passages.length !== 1;
  out.push({
    code: 'faint_text',
    severity: 'warning',
    message: `${passages.length} extracted native text passage${plural ? 's are' : ' is'} drawn faint, at low contrast against the paint behind ${plural ? 'them' : 'it'}: ${describePassages(passages, page.userUnit)} — a reader sees ${plural ? 'them' : 'it'} greyed out, while the text above carries ${plural ? 'them' : 'it'} like any other line; on a slide deck this is usually an item not yet revealed on this overlay step, elsewhere a watermark or dimmed text; render a listed bbox (--render-region x,y,w,h) before treating it as content the page shows`,
  });
}
