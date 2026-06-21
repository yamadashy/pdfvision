import type { LayoutBlock, LayoutLine, PageWarning } from '../../../types/index.js';

/** Tolerance for off-page detection. PDFs commonly have sub-point
 *  fractional coordinates from cropping / rounding; treating anything
 *  inside this slack as on-page avoids false positives on otherwise
 *  pristine pages. */
const OFF_PAGE_TOLERANCE_PT = 1;
const OFF_PAGE_REL_TOLERANCE = 0.006;
const OFF_PAGE_MAX_TOLERANCE_PT = 6;
const MINOR_TOP_BLEED_BLOCK_RATIO = 0.1;
const MINOR_TOP_BLEED_MAX_PT = 12;
/** A full-width CJK glyph's advance is one em, but closing punctuation
 *  (）」。、 …) only inks the left ~40% of the box. A line that ends
 *  flush with the page edge can therefore report up to ~0.65em of
 *  advance past the edge with zero visible ink (observed on 総務省
 *  white-paper citations). 0.7 em keeps a little slack for fonts whose
 *  side bearings differ. */
const TRAILING_FULLWIDTH_ADVANCE_BLEED_EM = 0.7;

/** CJK closing punctuation whose ink sits in the left half of the
 *  full-width advance box, plus the ASCII forms NFKC normalization
 *  folds them into (）→ ), ］→ ], ｝→ }, ．→ ., ，→ ,). The ASCII
 *  forms only count when the line itself contains CJK text — a Latin
 *  line ending in ")" has a narrow advance and can't explain a
 *  half-em overhang. */
const TRAILING_CLOSING_PUNCT = /[）」』】〕〉》｝］〙〗。、，．)\]},.]$/u;
const CONTAINS_CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}！-｠]/u;

export function detectOffPage(blocks: LayoutBlock[], pageWidth: number, pageHeight: number, out: PageWarning[]): void {
  // pageWidth / pageHeight come from the MediaBox; cropbox / trim
  // boxes might be inside that, but for "is this likely a broken
  // render" the outer MediaBox is the right yardstick.
  const tolerance = offPageTolerance(pageWidth, pageHeight);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const left = b.x;
    const top = b.y;
    const right = b.x + b.width;
    const bottom = b.y + b.height;
    const offLeft = left < -tolerance;
    const offTop = top < -tolerance && !isMinorFontMetricTopBleed(b, tolerance);
    const offRight = right > pageWidth + tolerance && !isTrailingFullWidthAdvanceBleed(b, pageWidth);
    const offBottom = bottom > pageHeight + tolerance;
    if (!offLeft && !offTop && !offRight && !offBottom) continue;
    const sides: string[] = [];
    if (offLeft) sides.push('left');
    if (offTop) sides.push('top');
    if (offRight) sides.push('right');
    if (offBottom) sides.push('bottom');
    out.push({
      code: 'off_page',
      severity: 'error',
      message: `block bbox extends past the page ${sides.join('/')} edge (page ${pageWidth.toFixed(0)}×${pageHeight.toFixed(0)}pt, block ${left.toFixed(1)},${top.toFixed(1)}→${right.toFixed(1)},${bottom.toFixed(1)})`,
      blockIndex: i,
    });
  }
}

/** True when a block's right-edge overhang is explained by the trailing
 *  advance of full-width closing punctuation on its rightmost line —
 *  the glyph's ink ends on the page even though its advance does not.
 *  Real-world case: 総務省白書 title slide whose 34.5pt title ends in
 *  「（概要）」 flush against the right edge, reporting a 15pt phantom
 *  overhang. */
function isTrailingFullWidthAdvanceBleed(block: LayoutBlock, pageWidth: number): boolean {
  const overflow = block.x + block.width - pageWidth;
  if (overflow <= 0) return false;
  let rightmost: LayoutLine | undefined;
  for (const line of block.lines) {
    if (!rightmost || line.x + line.width > rightmost.x + rightmost.width) rightmost = line;
  }
  if (!rightmost) return false;
  // Only the rightmost line's advance can explain the block overhang.
  if (rightmost.x + rightmost.width < block.x + block.width - 0.5) return false;
  const text = rightmost.text.trimEnd();
  if (!TRAILING_CLOSING_PUNCT.test(text)) return false;
  if (!CONTAINS_CJK.test(text)) return false;
  const em = rightmost.fontSize ?? rightmost.height;
  if (em <= 0) return false;
  return overflow <= em * TRAILING_FULLWIDTH_ADVANCE_BLEED_EM;
}

function isMinorFontMetricTopBleed(block: LayoutBlock, tolerance: number): boolean {
  const bleed = -block.y;
  if (bleed <= tolerance) return true;
  if (block.height <= 0) return false;
  const allowed = Math.max(tolerance, Math.min(MINOR_TOP_BLEED_MAX_PT, block.height * MINOR_TOP_BLEED_BLOCK_RATIO));
  return bleed <= allowed;
}

function offPageTolerance(pageWidth: number, pageHeight: number): number {
  const relative = Math.min(pageWidth, pageHeight) * OFF_PAGE_REL_TOLERANCE;
  return Math.min(OFF_PAGE_MAX_TOLERANCE_PT, Math.max(OFF_PAGE_TOLERANCE_PT, relative));
}
