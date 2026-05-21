import type { LayoutBlock, PageResult, PageWarning } from '../types/index.js';

/** Context flags the orchestrator passes to the detector so the
 *  rules can route on facts that the page alone doesn't know.
 *  Right now the only such fact is "did chrome detection have enough
 *  pages to run reliably?" — `markRepeatedBlocks` needs at least
 *  two pages with layout to call anything `repeated`, so on a
 *  single-page extraction every block is "body" by default and the
 *  `near_bottom_edge` rule would mis-fire on running footers. */
export interface PageWarningContext {
  /** True when the cross-page repeated-chrome pass had enough pages
   *  (≥ 2 with layout) to produce meaningful `block.repeated` flags.
   *  Defaults to `true` so unit tests that hand-build pages with
   *  explicit `repeated: true` flags don't have to thread the field
   *  through their helpers. */
  chromeDetectionReliable?: boolean;
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

function detectOffPage(blocks: LayoutBlock[], pageWidth: number, pageHeight: number, out: PageWarning[]): void {
  // pageWidth / pageHeight come from the MediaBox; cropbox / trim
  // boxes might be inside that, but for "is this likely a broken
  // render" the outer MediaBox is the right yardstick.
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const left = b.x;
    const top = b.y;
    const right = b.x + b.width;
    const bottom = b.y + b.height;
    const offLeft = left < -OFF_PAGE_TOLERANCE_PT;
    const offTop = top < -OFF_PAGE_TOLERANCE_PT;
    const offRight = right > pageWidth + OFF_PAGE_TOLERANCE_PT;
    const offBottom = bottom > pageHeight + OFF_PAGE_TOLERANCE_PT;
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
      // Compute intersection area to give the message a concrete
      // anchor — a 0.1 pt² nick at a column boundary reads very
      // differently from a half-page overlap.
      const overlapArea = intersectionArea(a, b);
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

function detectNearBottomEdge(blocks: LayoutBlock[], pageHeight: number, out: PageWarning[]): void {
  // Only non-repeated body blocks — a footer at the bottom edge is
  // by definition "near the bottom edge" and that's not a finding.
  const threshold = Math.min(EDGE_NEAR_BOTTOM_ABS, pageHeight * EDGE_NEAR_BOTTOM_REL);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.repeated) continue;
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

function detectBodyNearRepeatedChrome(blocks: LayoutBlock[], out: PageWarning[]): void {
  // For each non-repeated body block, find the nearest repeated block
  // and flag when the body either crowds against it (gap below
  // CHROME_TOO_CLOSE_GAP_PT) or actually overlaps it (negative gap).
  // The overlap case is the worse one — it's the colopl page-13
  // scenario where the body line's bbox literally intersects the
  // footer's bbox — and the earlier draft skipped it because we
  // also exclude repeated blocks from the generic `text_overlap`
  // rule, leaving body↔chrome overlap with no detection channel at
  // all.
  for (let i = 0; i < blocks.length; i++) {
    const body = blocks[i];
    if (body.repeated) continue;
    const bodyTop = body.y;
    const bodyBottom = body.y + body.height;
    let nearest: { gap: number; index: number } | null = null;
    for (let j = 0; j < blocks.length; j++) {
      if (i === j) continue;
      const chrome = blocks[j];
      if (!chrome.repeated) continue;
      // Chrome that lives entirely above the body (a running header
      // above the first body block) is a different geometric
      // relationship and isn't what this rule is meant to catch.
      // The check uses chrome-bottom vs body-top so that a header
      // overlapping the body's top STILL fires (overlap case).
      const chromeBottom = chrome.y + chrome.height;
      if (chromeBottom <= bodyTop) continue;
      if (!horizontalOverlap(body, chrome)) continue;
      const gap = chrome.y - bodyBottom;
      // Negative gap → bboxes overlap; positive gap → chrome below
      // body with a vertical gap. Both are worth flagging when the
      // gap is below the threshold; the message differentiates.
      if (nearest === null || gap < nearest.gap) {
        nearest = { gap, index: j };
      }
    }
    if (nearest === null || nearest.gap >= CHROME_TOO_CLOSE_GAP_PT) continue;
    const message =
      nearest.gap < 0
        ? `body block overlaps a repeated chrome block by ${(-nearest.gap).toFixed(1)}pt — body text and footer/header are visually colliding`
        : `body block ends ${nearest.gap.toFixed(1)}pt above a repeated chrome block (threshold ${CHROME_TOO_CLOSE_GAP_PT}pt) — body text and footer/header may run together for LLM readers`;
    out.push({
      code: 'body_near_repeated_chrome',
      severity: 'warning',
      message,
      blockIndex: i,
      otherBlockIndex: nearest.index,
    });
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
  const dy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (dx <= 0 || dy <= 0) return 0;
  return dx * dy;
}

function horizontalOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x;
}
