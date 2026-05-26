import type { LayoutBlock, PageResult, PageWarning } from '../types/index.js';

/** Context flags the orchestrator passes to the detector so the
 *  rules can route on facts that the page alone doesn't know. */
export interface PageWarningContext {
  /** True when the cross-page repeated-chrome pass had enough pages
   *  (≥ 2 with layout) to produce meaningful `block.repeated` flags.
   *  Defaults to `true` so unit tests that hand-build pages with
   *  explicit `repeated: true` flags don't have to thread the field
   *  through their helpers. */
  chromeDetectionReliable?: boolean;
  /** True when a full-page raster scan backs a dense text layer. In
   *  that case layout bboxes describe hidden OCR text, not the pixels a
   *  human sees, so geometry-driven warnings are more noise than signal. */
  rasterBackedTextLayer?: boolean;
}

/**
 * Detect geometry-driven layout anomalies on a single page.
 *
 * Runs after `markRepeatedBlocks` so the cross-page chrome detection
 * has already flagged running headers / footers / page numbers — body
 * vs chrome distinctions are routed through `block.repeated`. All
 * rules are pure functions of `page.layout` (+ `page.width`,
 * `page.height`), so the detector can be tested without a real PDF.
 *
 * The rule catalog is intentionally narrow for v1 — the goal is to
 * catch the high-signal cases (the colopl page-13 footer-overlap kind
 * of thing) without firing on every benign layout. New rules should
 * cite a real-world failure mode before being added.
 *
 * Returns an empty array (rather than `undefined`) so callers can
 * uniformly `for (...)` over it. `processor.ts` is responsible for
 * omitting the field from the public output when the array is empty.
 */
export function detectPageWarnings(page: PageResult, context: PageWarningContext = {}): PageWarning[] {
  if (!page.layout || page.layout.blocks.length === 0) return [];
  if (context.rasterBackedTextLayer) return [];
  const warnings: PageWarning[] = [];
  const blocks = page.layout.blocks;
  // Default true: keep the unit tests' hand-built pages (which set
  // `repeated: true` directly on blocks) free to exercise rules
  // without threading the context through every helper.
  const chromeDetectionReliable = context.chromeDetectionReliable !== false;

  detectOffPage(blocks, page.width, page.height, warnings);
  detectTextOverlap(blocks, warnings);
  // `near_bottom_edge` only distinguishes body from chrome via the
  // `repeated` flag, which is meaningless when chrome detection
  // didn't run reliably (single-page extraction, or every layout
  // page deselected). Suppress to avoid false positives where a
  // running footer reads as "body crowded against the bottom".
  if (chromeDetectionReliable) {
    detectNearBottomEdge(blocks, page.height, warnings);
  }
  detectBodyNearRepeatedChrome(blocks, warnings);

  // Stable sort by (severity error first, then code, then blockIndex)
  // so the rendered output is deterministic across runs and easy to
  // diff in tests / golden files.
  warnings.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    const ai = a.blockIndex ?? -1;
    const bi = b.blockIndex ?? -1;
    return ai - bi;
  });
  return warnings;
}

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

/** Real text collisions overlap deeply on the y axis. PDF text bboxes
 *  routinely include ascender / descender slack that makes adjacent lines
 *  touch by a few points, especially in forms and title blocks. Require
 *  at least 50% of the smaller line/block height to overlap before
 *  treating the pair as a visual collision. */
const TEXT_OVERLAP_MIN_DEPTH_RATIO = 0.5;

/** Tiny one-line fragments are often superscripts, subscripts, footnote
 *  markers, or equation indices that intentionally sit inside a paragraph
 *  line's bbox. A human reads them as inline math, not as colliding blocks.
 *  Suppress only when the fragment is clearly small relative to its
 *  neighbour so true small callouts can still be reported. */
const INLINE_FRAGMENT_MAX_CHARS = 12;
const INLINE_FRAGMENT_MAX_WIDTH_PT = 40;
const INLINE_FRAGMENT_MAX_HEIGHT_PT = 12;
const OFF_PAGE_REL_TOLERANCE = 0.006;
const OFF_PAGE_MAX_TOLERANCE_PT = 6;
const MATH_ANNOTATION_MAX_HEIGHT_RATIO = 0.85;
const MATH_ANNOTATION_MAX_CHARS = 80;

function detectOffPage(blocks: LayoutBlock[], pageWidth: number, pageHeight: number, out: PageWarning[]): void {
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
    const offTop = top < -tolerance;
    const offRight = right > pageWidth + tolerance;
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

function detectTextOverlap(blocks: LayoutBlock[], out: PageWarning[]): void {
  // Only non-repeated pairs — repeated chrome (footers, page numbers)
  // legitimately occupies the bottom margin where body sometimes
  // bleeds, and the `body_near_repeated_chrome` rule covers the case
  // we actually care about there.
  for (let i = 0; i < blocks.length; i++) {
    const a = blocks[i];
    if (a.repeated) continue;
    for (let j = i + 1; j < blocks.length; j++) {
      const b = blocks[j];
      if (b.repeated) continue;
      if (!boxesIntersect(a, b)) continue;
      if (isInlineFragmentPair(a, b)) continue;
      // Compute intersection area to give the message a concrete
      // anchor — a 0.1 pt² nick at a column boundary reads very
      // differently from a half-page overlap.
      const overlapArea = textOverlapArea(a, b);
      // Tiny rounding-fringe overlaps shouldn't fire — < 1 pt² is
      // typically just adjacent blocks whose bbox includes glyph
      // ascender/descender slack.
      if (overlapArea < 1) continue;
      out.push({
        code: 'text_overlap',
        severity: 'warning',
        message: `block bboxes overlap (${overlapArea.toFixed(1)}pt²) — text from different blocks may visually collide`,
        blockIndex: i,
        otherBlockIndex: j,
      });
    }
  }
}

function isInlineFragmentPair(a: LayoutBlock, b: LayoutBlock): boolean {
  return isInlineFragment(a, b) || isInlineFragment(b, a) || isMathAnnotation(a, b) || isMathAnnotation(b, a);
}

function isInlineFragment(fragment: LayoutBlock, neighbour: LayoutBlock): boolean {
  const text = fragment.text.replace(/\s+/g, '');
  if (text.length === 0 || text.length > INLINE_FRAGMENT_MAX_CHARS) return false;
  if (fragment.lines.length > 1) return false;
  if (fragment.width > INLINE_FRAGMENT_MAX_WIDTH_PT || fragment.height > INLINE_FRAGMENT_MAX_HEIGHT_PT) return false;
  if (neighbour.width < fragment.width * 4) return false;
  if (!sitsOnNeighbourLine(fragment, neighbour)) return false;
  return true;
}

function isMathAnnotation(annotation: LayoutBlock, neighbour: LayoutBlock): boolean {
  if (annotation.lines.length !== 1 || neighbour.lines.length === 0) return false;
  const compact = annotation.text.replace(/\s+/g, '');
  if (compact.length === 0 || compact.length > MATH_ANNOTATION_MAX_CHARS) return false;
  if (annotation.height > neighbour.height * MATH_ANNOTATION_MAX_HEIGHT_RATIO) return false;
  if (!isMathLikeAnnotationText(annotation.text, neighbour.text)) return false;
  if (!sitsOnNeighbourLine(annotation, neighbour)) return false;
  return true;
}

function isMathLikeAnnotationText(text: string, neighbourText: string): boolean {
  const compact = text.replace(/\s+/g, '');
  if (/[\d±=+\-−×÷∫√∞≤≥<>()[\].,]/u.test(compact)) return true;
  if (/[\u0370-\u03ff]/u.test(compact)) return true;
  const singleLetterTokens = text
    .trim()
    .split(/\s+/)
    .every((part) => /^[A-Za-z]$/u.test(part));
  return singleLetterTokens && /[\d±=+\-−×÷∫√∞≤≥<>()[\].,]/u.test(neighbourText);
}

function sitsOnNeighbourLine(fragment: LayoutBlock, neighbour: LayoutBlock): boolean {
  const fragmentBox = fragment.lines[0] ?? fragment;
  const fragmentCenterX = fragmentBox.x + fragmentBox.width / 2;
  const fragmentCenterY = fragmentBox.y + fragmentBox.height / 2;
  for (const line of neighbour.lines) {
    if (fragmentCenterX < line.x || fragmentCenterX > line.x + line.width) continue;
    if (!boxesIntersect(fragmentBox, line)) continue;
    const depth = verticalIntersectionDepth(fragmentBox, line);
    const minHeight = Math.max(Math.min(fragmentBox.height, line.height), 0.001);
    if (depth / minHeight < TEXT_OVERLAP_MIN_DEPTH_RATIO) continue;
    const lineCenterY = line.y + line.height / 2;
    if (Math.abs(fragmentCenterY - lineCenterY) < line.height * 0.12) continue;
    return true;
  }
  return false;
}

function textOverlapArea(a: LayoutBlock, b: LayoutBlock): number {
  const aBoxes = a.lines.length > 0 ? a.lines : [a];
  const bBoxes = b.lines.length > 0 ? b.lines : [b];
  let total = 0;
  for (const aa of aBoxes) {
    for (const bb of bBoxes) {
      const depth = verticalIntersectionDepth(aa, bb);
      const minHeight = Math.max(Math.min(aa.height, bb.height), 0.001);
      if (depth / minHeight < TEXT_OVERLAP_MIN_DEPTH_RATIO) continue;
      total += intersectionArea(aa, bb);
    }
  }
  return total;
}

function detectNearBottomEdge(blocks: LayoutBlock[], pageHeight: number, out: PageWarning[]): void {
  // Only non-repeated body blocks — a footer at the bottom edge is
  // by definition "near the bottom edge" and that's not a finding.
  const threshold = Math.min(EDGE_NEAR_BOTTOM_ABS, pageHeight * EDGE_NEAR_BOTTOM_REL);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.repeated) continue;
    if (isBottomReference(b)) continue;
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

function isBottomReference(block: LayoutBlock): boolean {
  const text = block.text.trim();
  if (text.length === 0 || text.length > 160) return false;
  if (block.width <= 40 && /^\d{1,4}$/u.test(text)) return true;
  return /\b(?:https?:\/\/|www\.|doi:|arxiv:)/i.test(text);
}

function offPageTolerance(pageWidth: number, pageHeight: number): number {
  const relative = Math.min(pageWidth, pageHeight) * OFF_PAGE_REL_TOLERANCE;
  return Math.min(OFF_PAGE_MAX_TOLERANCE_PT, Math.max(OFF_PAGE_TOLERANCE_PT, relative));
}

function detectBodyNearRepeatedChrome(blocks: LayoutBlock[], out: PageWarning[]): void {
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

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function boxesIntersect(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function intersectionArea(a: Box, b: Box): number {
  const dx = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const dy = verticalIntersectionDepth(a, b);
  if (dx <= 0 || dy <= 0) return 0;
  return dx * dy;
}

function verticalIntersectionDepth(a: Box, b: Box): number {
  return Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
}

function horizontalOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x;
}
