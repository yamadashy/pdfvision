import type { LayoutBlock, LayoutLine, PageWarning } from '../../types/index.js';
import { horizontalOverlap } from '../warningTextOverlap.js';

/** Tolerance for off-page detection. PDFs commonly have sub-point
 *  fractional coordinates from cropping / rounding; treating anything
 *  inside this slack as on-page avoids false positives on otherwise
 *  pristine pages. */
const OFF_PAGE_TOLERANCE_PT = 1;

/** Bottom-edge threshold. The smaller of `EDGE_NEAR_BOTTOM_ABS` and
 *  `EDGE_NEAR_BOTTOM_REL × pageHeight` — so a tiny page (a slide
 *  thumbnail, a stamp) doesn't trigger on what would be a normal
 *  margin for a US Letter page. 18pt = 0.25 inch; typical body
 *  bottom margins are ≥ 36pt. */
const EDGE_NEAR_BOTTOM_ABS = 18;
const EDGE_NEAR_BOTTOM_REL = 0.025;

/** Max vertical gap (in PDF points) between a non-repeated body
 *  block's bottom and a repeated block's top before we consider the
 *  two visually mashed together. 6pt is roughly half a body line — at
 *  this distance the LLM-rendered Markdown joins the lines into one
 *  paragraph and the footer reads as body text. */
const CHROME_TOO_CLOSE_GAP_PT = 6;

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

/** CJK closing punctuation whose ink sits in the left half of the
 *  full-width advance box, plus the ASCII forms NFKC normalization
 *  folds them into (）→ ), ］→ ], ｝→ }, ．→ ., ，→ ,). The ASCII
 *  forms only count when the line itself contains CJK text — a Latin
 *  line ending in ")" has a narrow advance and can't explain a
 *  half-em overhang. */
const TRAILING_CLOSING_PUNCT = /[）」』】〕〉》｝］〙〗。、，．)\]},.]$/u;
const CONTAINS_CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}！-｠]/u;

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

export function detectNearBottomEdge(
  blocks: LayoutBlock[],
  pageWidth: number,
  pageHeight: number,
  out: PageWarning[],
): void {
  // Only non-repeated body blocks — a footer at the bottom edge is
  // by definition "near the bottom edge" and that's not a finding.
  const threshold = Math.min(EDGE_NEAR_BOTTOM_ABS, pageHeight * EDGE_NEAR_BOTTOM_REL);
  const bodyFontSize = dominantPageFontSize(blocks);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.repeated) continue;
    if (isBottomReference(b)) continue;
    if (isCenteredBottomLabel(b, pageWidth)) continue;
    if (isSourceFootnoteCaption(b)) continue;
    if (isTinyFontCaption(b, bodyFontSize)) continue;
    const distance = pageHeight - (b.y + b.height);
    if (distance < 0) continue; // off_page handles this case
    if (distance >= threshold) continue;
    out.push({
      code: 'near_bottom_edge',
      severity: 'warning',
      message: `body block ends ${distance.toFixed(1)}pt above the page bottom (threshold ${threshold.toFixed(1)}pt) — text may be crowded against the lower margin`,
      blockIndex: i,
    });
  }
}

function isCenteredBottomLabel(block: LayoutBlock, pageWidth: number): boolean {
  const text = block.text.trim();
  if (text.length === 0 || text.length > 120) return false;
  if (block.lines.length > 2) return false;
  if (block.width > pageWidth * 0.35) return false;
  const center = block.x + block.width / 2;
  return Math.abs(center - pageWidth / 2) <= pageWidth * 0.15;
}

function isBottomReference(block: LayoutBlock): boolean {
  const text = block.text.trim();
  if (text.length === 0 || text.length > 160) return false;
  if (block.width <= 40 && /^\d{1,4}$/u.test(text)) return true;
  if (block.width <= 40 && isRomanNumeralPageLabel(text)) return true;
  if (block.width <= 100 && /^page\s+\d{1,4}(?:\s+of\s+\d{1,4})?$/iu.test(text)) return true;
  if (block.width <= 180 && /^(?:[\w:.-]+\s+)?(?:lecture|slide)\s+\d+\s*[-–]\s*\d{1,4}$/iu.test(text)) {
    return true;
  }
  if (block.width <= 120 && isShortDateFooter(text)) return true;
  return /\b(?:https?:\/\/|www\.|doi:|arxiv:)/i.test(text);
}

/** Caption-vs-body font ratio. A block set at ≤ 70% of the page's
 *  dominant font size near the bottom edge reads as a footnote or
 *  source caption, not as body text crowding the margin. */
const TINY_FONT_CAPTION_RATIO = 0.7;
const TINY_FONT_CAPTION_MAX_CHARS = 300;

/** Char-weighted median font size across every layout line on the
 *  page — the size a human would call "the body text". Returns 0 when
 *  no block carries line data (hand-built layouts in unit tests),
 *  which disables the tiny-font caption rule. */
function dominantPageFontSize(blocks: LayoutBlock[]): number {
  const weighted: { fontSize: number; weight: number }[] = [];
  let total = 0;
  for (const block of blocks) {
    for (const line of block.lines) {
      const weight = line.text.trim().length;
      if (weight === 0 || line.fontSize <= 0) continue;
      weighted.push({ fontSize: line.fontSize, weight });
      total += weight;
    }
  }
  if (total === 0) return 0;
  weighted.sort((a, b) => a.fontSize - b.fontSize);
  let cumulative = 0;
  for (const entry of weighted) {
    cumulative += entry.weight;
    if (cumulative >= total / 2) return entry.fontSize;
  }
  return weighted[weighted.length - 1].fontSize;
}

/** True for short blocks set well below the page's body font size —
 *  e.g. a 6.5pt wrapped citation tail (「(第1回)事務局資料」) at the
 *  bottom of a 9.6pt-body slide. Tiny type at the bottom edge is
 *  always intentional caption/footnote design. */
function isTinyFontCaption(block: LayoutBlock, bodyFontSize: number): boolean {
  if (bodyFontSize <= 0) return false;
  if (block.text.trim().length > TINY_FONT_CAPTION_MAX_CHARS) return false;
  let maxFontSize = 0;
  let hasLine = false;
  for (const line of block.lines) {
    if (line.text.trim().length === 0) continue;
    hasLine = true;
    if (line.fontSize > maxFontSize) maxFontSize = line.fontSize;
  }
  if (!hasLine) return false;
  return maxFontSize <= bodyFontSize * TINY_FONT_CAPTION_RATIO;
}

/** Max length for a source/footnote caption. Longer than the generic
 *  isBottomReference cap (160) because Japanese statistical footnotes
 *  (※…) routinely run two dense lines. */
const SOURCE_FOOTNOTE_CAPTION_MAX_CHARS = 300;

/** Source attributions and footnotes sit at the bottom edge of chart
 *  slides and report pages by design — 「(出典)…」「※…」「…を基に作成」,
 *  "Source: …". Flagging them as crowded body text is pure noise
 *  (govt white-paper decks fire it on almost every page). Markers are
 *  matched against the NFKC-normalized text the layout pass carries,
 *  so full-width parens appear here in their ASCII form. */
const SOURCE_FOOTNOTE_PREFIX = /^[（(〔[［]?(?:出典|出所|資料|注\d*)[）)〕\]］：:.．]/u;
const SOURCE_FOOTNOTE_SUFFIX =
  /(?:を(?:基|もと)に(?:筆者)?(?:作成|加工|編集)|より(?:筆者)?(?:作成|引用|抜粋|転載))[。.]?$/u;

function isSourceFootnoteCaption(block: LayoutBlock): boolean {
  const text = block.text.trim();
  if (text.length === 0 || text.length > SOURCE_FOOTNOTE_CAPTION_MAX_CHARS) return false;
  if (text.startsWith('※')) return true;
  if (SOURCE_FOOTNOTE_PREFIX.test(text)) return true;
  if (SOURCE_FOOTNOTE_SUFFIX.test(text)) return true;
  if (text.length <= 180 && /資料/u.test(text) && /[」』][）)]?$/u.test(text)) return true;
  // Bare citation shape: organization + quoted publication title,
  // e.g. 総務省「情報通信メディアの利用時間と情報行動に関する調査」.
  if (text.length <= 100 && /^[^「」]{0,30}「[^「」]+」$/u.test(text)) return true;
  return /^(?:sources?|notes?)\s*[:：]/iu.test(text);
}

function isRomanNumeralPageLabel(text: string): boolean {
  const normalized = text.toLowerCase();
  if (!/^[ivxlcdm]{1,12}$/u.test(normalized)) return false;
  return /^m{0,4}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/u.test(normalized);
}

function isShortDateFooter(text: string): boolean {
  return /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2},?(?:\s+\d{4})?$/iu.test(
    text,
  );
}

function offPageTolerance(pageWidth: number, pageHeight: number): number {
  const relative = Math.min(pageWidth, pageHeight) * OFF_PAGE_REL_TOLERANCE;
  return Math.min(OFF_PAGE_MAX_TOLERANCE_PT, Math.max(OFF_PAGE_TOLERANCE_PT, relative));
}

export function detectBodyNearRepeatedChrome(blocks: LayoutBlock[], out: PageWarning[]): void {
  // For each non-repeated body block, look at every repeated chrome
  // block on the page and pick the worst geometric relationship to
  // report:
  //
  //   - **Overlap**: the bboxes vertically intersect. Magnitude is
  //     the true intersection depth (`min(bodyBottom, chromeBottom)
  //     - max(bodyTop, chrome.y)`), not `-gap`. The naive `-gap`
  //     would be wildly off when chrome encroaches on the body's
  //     top edge from above — e.g. a 40pt header sitting at y=80
  //     with body at y=100,h=600 overlaps by 20pt, but `-gap`
  //     (`-(80 - 700) = 620`) would report a 620pt overlap and let
  //     that header outrank a footer that's barely touching the
  //     body's bottom.
  //
  //   - **Gap**: chrome sits strictly below the body bottom with a
  //     vertical gap < CHROME_TOO_CLOSE_GAP_PT.
  //
  // Overlap always wins over gap (it's a worse readability problem
  // for an LLM reader), and within each category the worst case
  // wins — deepest overlap, or smallest gap.
  for (let i = 0; i < blocks.length; i++) {
    const body = blocks[i];
    if (body.repeated) continue;
    const bodyTop = body.y;
    const bodyBottom = body.y + body.height;
    let worstOverlap: { depth: number; index: number } | null = null;
    let worstGap: { gap: number; index: number } | null = null;
    for (let j = 0; j < blocks.length; j++) {
      if (i === j) continue;
      const chrome = blocks[j];
      if (!chrome.repeated) continue;
      // Chrome that lives entirely above the body (a running header
      // above the first body block) is a different geometric
      // relationship and isn't what this rule is meant to catch.
      // Comparing chrome-bottom against body-top lets a header that
      // dips into the body's top STILL fire (overlap case).
      const chromeBottom = chrome.y + chrome.height;
      if (chromeBottom <= bodyTop) continue;
      if (!horizontalOverlap(body, chrome)) continue;
      const overlapDepth = Math.min(bodyBottom, chromeBottom) - Math.max(bodyTop, chrome.y);
      if (overlapDepth > 0) {
        if (worstOverlap === null || overlapDepth > worstOverlap.depth) {
          worstOverlap = { depth: overlapDepth, index: j };
        }
      } else {
        const gap = chrome.y - bodyBottom;
        if (gap >= 0 && gap < CHROME_TOO_CLOSE_GAP_PT) {
          if (worstGap === null || gap < worstGap.gap) {
            worstGap = { gap, index: j };
          }
        }
      }
    }
    if (worstOverlap !== null) {
      out.push({
        code: 'body_near_repeated_chrome',
        severity: 'warning',
        message: `body block overlaps a repeated chrome block by ${worstOverlap.depth.toFixed(1)}pt — body text and footer/header are visually colliding`,
        blockIndex: i,
        otherBlockIndex: worstOverlap.index,
      });
    } else if (worstGap !== null) {
      out.push({
        code: 'body_near_repeated_chrome',
        severity: 'warning',
        message: `body block ends ${worstGap.gap.toFixed(1)}pt above a repeated chrome block (threshold ${CHROME_TOO_CLOSE_GAP_PT}pt) — body text and footer/header may run together for LLM readers`,
        blockIndex: i,
        otherBlockIndex: worstGap.index,
      });
    }
  }
}
