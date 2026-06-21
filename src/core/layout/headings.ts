import type { LayoutBlock } from '../../types/index.js';
import { median } from './geometry.js';
import {
  isDecimalSectionHeadingText,
  isHeadingCandidateText,
  isLetteredSectionHeadingText,
  isLikelyBodyFragmentForLevel3,
  isLikelyBodySentenceFragment,
  isNumberedHeadingText,
} from './headingText.js';

export { isNumberedHeadingText } from './headingText.js';

/** Min non-whitespace chars at the body font size required before low-tier
 *  (level 2 with structural support, or level 3) headings may fire. Pages
 *  with less body text than this — slide decks, posters, title pages — only
 *  get level 1 headings, so a uniform-large page doesn't end up tagged as
 *  "all headings". Empirically ~100 chars is one short paragraph. */
const MIN_BODY_CHARS_FOR_LOW_TIER = 100;
const TOP_TITLE_MAX_Y = 120;
const TOP_TITLE_MIN_WIDTH = 180;
const TOP_TITLE_MIN_CHARS = 25;
const TOP_BYLINE_MAX_GAP = 260;
const TOP_SLIDE_TITLE_MIN_FONT_SIZE = 24;
const TOP_SLIDE_TITLE_MIN_WIDTH = 120;
const SPARSE_COVER_TITLE_MIN_FONT_SIZE = 24;
const SPARSE_COVER_TITLE_MAX_Y_RATIO = 0.4;
const SPARSE_COVER_TITLE_MAX_Y_PT = 220;
const SPARSE_COVER_TITLE_MIN_WIDTH = 160;
const SPARSE_COVER_TITLE_CENTER_TOLERANCE_RATIO = 0.35;
const TOP_CENTERED_ALL_CAPS_TITLE_MAX_CHARS = 180;
const TOP_CENTERED_ALL_CAPS_TITLE_CENTER_TOLERANCE_RATIO = 0.12;

/** Tolerance around the body fontSize used when counting how many chars sit
 *  at the body font class. PDFs from LaTeX commonly drift by ±0.5pt between
 *  body lines (footnote refs, math runs) so a strict-equal would underflow
 *  the body-char count. ±5% covers the observed drift. */
const BODY_FONT_TOLERANCE = 0.05;

/** Max non-whitespace chars before a block is "long" — long blocks are body
 *  paragraphs even when their dominant fontSize lifts them off the median. */
const MAX_HEADING_CHARS = 100;
const COMPACT_LABEL_MAX_HEADING_CHARS = 4;
const TALL_SIDE_LABEL_MIN_HEIGHT_PT = 80;
const TALL_SIDE_LABEL_MAX_WIDTH_PT = 48;
const TALL_SIDE_LABEL_MIN_ASPECT = 4;

function isTallNarrowSideLabel(block: LayoutBlock, lineCount: number): boolean {
  if (lineCount !== 1 || block.writingMode === 'vertical') return false;
  if (block.width > TALL_SIDE_LABEL_MAX_WIDTH_PT || block.height < TALL_SIDE_LABEL_MIN_HEIGHT_PT) return false;
  return block.height / Math.max(block.width, 1) >= TALL_SIDE_LABEL_MIN_ASPECT;
}

function isCompactDiagramLabelText(text: string, nonWsChars: number, ratio: number): boolean {
  if (ratio >= 1.25) return false;
  if (nonWsChars > COMPACT_LABEL_MAX_HEADING_CHARS) return false;
  const trimmed = text.trim();
  if (isNumberedHeadingText(trimmed)) return false;
  return !/\s/u.test(trimmed);
}

function isTopTitleCandidate(block: LayoutBlock, ratio: number, lineCount: number, nonWsChars: number): boolean {
  if (ratio < 1.25) return false;
  if (block.y > TOP_TITLE_MAX_Y) return false;
  if (block.width < TOP_TITLE_MIN_WIDTH) return false;
  return lineCount > 1 || nonWsChars >= TOP_TITLE_MIN_CHARS;
}

function isTopSlideTitleCandidate(
  block: LayoutBlock,
  fontSize: number,
  lineCount: number,
  nonWsChars: number,
): boolean {
  if (block.y > TOP_TITLE_MAX_Y) return false;
  if (fontSize < TOP_SLIDE_TITLE_MIN_FONT_SIZE) return false;
  if (block.width < TOP_SLIDE_TITLE_MIN_WIDTH) return false;
  if (lineCount > 2) return false;
  if (nonWsChars > MAX_HEADING_CHARS) return false;
  return true;
}

function isSparseCoverTitleCandidate(
  block: LayoutBlock,
  pageWidth: number,
  pageHeight: number,
  fontSize: number,
  lineCount: number,
  nonWsChars: number,
  hasCredibleBody: boolean,
): boolean {
  if (hasCredibleBody) return false;
  if (fontSize < SPARSE_COVER_TITLE_MIN_FONT_SIZE) return false;
  if (lineCount > 2) return false;
  if (nonWsChars > MAX_HEADING_CHARS) return false;
  if (pageWidth > 0 && block.width < Math.min(pageWidth * 0.25, SPARSE_COVER_TITLE_MIN_WIDTH)) return false;
  const maxY = pageHeight > 0 ? pageHeight * SPARSE_COVER_TITLE_MAX_Y_RATIO : SPARSE_COVER_TITLE_MAX_Y_PT;
  if (block.y > maxY) return false;
  if (pageWidth <= 0) return true;
  const center = block.x + block.width / 2;
  return Math.abs(center - pageWidth / 2) <= pageWidth * SPARSE_COVER_TITLE_CENTER_TOLERANCE_RATIO;
}

function isAllCapsTitleLine(text: string): boolean {
  const letters = text.match(/[A-Za-z]/gu) ?? [];
  if (letters.length < 8) return false;
  const uppercase = letters.filter((char) => char === char.toLocaleUpperCase('en-US')).length;
  return uppercase / letters.length >= 0.85;
}

function isParentheticalSubtitleLine(text: string): boolean {
  return /^\s*\([^)]{1,160}\)\s*$/u.test(text.trim());
}

function isTopCenteredAllCapsTitleCandidate(
  block: LayoutBlock,
  pageWidth: number,
  lineCount: number,
  nonWsChars: number,
): boolean {
  if (pageWidth <= 0) return false;
  if (block.y > TOP_TITLE_MAX_Y) return false;
  if (block.width < TOP_TITLE_MIN_WIDTH) return false;
  if (lineCount > 2) return false;
  if (nonWsChars > TOP_CENTERED_ALL_CAPS_TITLE_MAX_CHARS) return false;
  const center = block.x + block.width / 2;
  if (Math.abs(center - pageWidth / 2) > pageWidth * TOP_CENTERED_ALL_CAPS_TITLE_CENTER_TOLERANCE_RATIO) {
    return false;
  }
  const [titleLine, subtitleLine] = block.lines;
  if (!titleLine || !isAllCapsTitleLine(titleLine.text)) return false;
  if (!subtitleLine) return true;
  return isAllCapsTitleLine(subtitleLine.text) || isParentheticalSubtitleLine(subtitleLine.text);
}

function isPersonBylineText(text: string): boolean {
  const trimmed = text
    .trim()
    .replace(/[∗*†‡§¶]\d*/gu, '')
    .replace(/\b\d+\b/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  if (trimmed.length > 80) return false;
  if (/[0-9@{}[\]/\\:;,]/u.test(trimmed)) return false;
  const words = trimmed.split(/\s+/u).filter((word) => !/^(?:and|&)$/iu.test(word));
  if (words.length < 2 || words.length > 8) return false;
  return words.every((word) => /^[A-Z][\p{L}.'-]*$/u.test(word) || /^[A-Z]\.$/u.test(word));
}

function isTopAffiliationMetadataText(text: string): boolean {
  const trimmed = text.trim().replace(/\s+/gu, ' ');
  if (trimmed.length === 0 || trimmed.length > 100) return false;
  if (/[.!?]/u.test(trimmed)) return false;
  const parts = trimmed.split(',').map((part) => part.trim());
  if (parts.length < 2 || parts.length > 6) return false;
  return parts.every((part) => {
    const words = part.split(/\s+/u).filter(Boolean);
    if (words.length === 0 || words.length > 4) return false;
    return /^[\p{Lu}\p{N}][\p{L}\p{N}&.' -]{0,40}$/u.test(part);
  });
}

function demoteTopBylineHeadings(blocks: LayoutBlock[]): void {
  const topTitle = blocks.find((b) => b.role === 'heading' && b.level === 1 && b.y <= TOP_TITLE_MAX_Y);
  if (!topTitle) return;
  const titleBottom = topTitle.y + topTitle.height;
  for (const b of blocks) {
    if (b.role !== 'heading') continue;
    if (b.y <= titleBottom || b.y > titleBottom + TOP_BYLINE_MAX_GAP) continue;
    if (!isPersonBylineText(b.text) && !isTopAffiliationMetadataText(b.text)) continue;
    b.role = undefined;
    b.level = undefined;
    b.roleConfidence = undefined;
  }
}

/**
 * Classify each block as a heading (with a tiered confidence `level`) or
 * leave it as body. Body fontSize is the char-weighted median of every
 * line's fontSize, so a short 24pt heading doesn't pull the median up
 * against a 12pt body.
 *
 * Three tiers, all driven by `ratio = block.lines[0].fontSize / bodyFs`:
 *   - level 1 (`ratio ≥ 1.40`, or top-of-page document titles in the
 *     `ratio ≥ 1.25` band): paper / page titles. The 1.40 band fires
 *     unconditionally so a one-block slide or poster keeps a recognisable title.
 *   - level 2 (`ratio ≥ 1.25`): preserves the legacy threshold for full-
 *     confidence headings, gated only by the page having enough body text
 *     to make "heading vs body" a meaningful distinction.
 *   - level 2 (`1.15 ≤ ratio < 1.25`): catches the LaTeX/arxiv pattern
 *     (`12pt heading / 10pt body = 1.20`). Requires short + standalone
 *     + locally larger than neighbours, because that band overlaps with
 *     ordinary body-fontSize jitter.
 *   - level 3 (`1.08 ≤ ratio < 1.15`): subsection candidates
 *     (ResNet-style `3.1.` at 10.96/9.96 ≈ 1.10). Strict gates: short,
 *     single-line, standalone, locally larger.
 *
 * Below `1.08` the signal collapses into body-text jitter and is left
 * unclassified.
 *
 * Mutates each qualifying block in place by setting `role = 'heading'`
 * and `level`. Blocks that don't qualify keep both fields undefined.
 */
export function classifyHeadings(blocks: LayoutBlock[], pageWidth = 0, pageHeight = 0): void {
  if (blocks.length === 0) return;
  const charWeighted: number[] = [];
  for (const b of blocks) {
    for (const line of b.lines) {
      const weight = Math.max(line.text.length, 1);
      for (let i = 0; i < weight; i++) charWeighted.push(line.fontSize);
    }
  }
  if (charWeighted.length === 0) return;
  const bodyFontSize = median(charWeighted);
  if (bodyFontSize <= 0) return;

  // How many chars sit at the body font class? Low-tier classification
  // (level 2 structural / level 3) requires "the page actually has body
  // text"; without that, fontSize differences are just typography.
  // Manual counter loop to avoid the intermediate array `filter().length`
  // would build — `charWeighted` carries one entry per character on the
  // page, so dense documents would allocate thousands of slots only to
  // discard them.
  let bodyChars = 0;
  for (const fs of charWeighted) {
    if (Math.abs(fs - bodyFontSize) / bodyFontSize <= BODY_FONT_TOLERANCE) {
      bodyChars++;
    }
  }
  const hasCredibleBody = bodyChars >= MIN_BODY_CHARS_FOR_LOW_TIER;

  // For the "standalone" / "locally larger" structural checks we need each
  // block's vertical neighbours. Pre-sort by y once so the per-block lookup
  // stays O(1).
  const byY = [...blocks].sort((a, b) => a.y - b.y);
  const yIndex = new Map<LayoutBlock, number>();
  for (let i = 0; i < byY.length; i++) yIndex.set(byY[i], i);

  // Dominant fontSize per block, char-weighted across the block's lines.
  // The "locally larger" check below compares against this rather than
  // `lines[0].fontSize` — a body paragraph that opens with inline math /
  // footnote ref / sub-superscript can have a noisy first-line fontSize
  // (e.g. 11.96pt run inside a 9.96pt body), which would otherwise let a
  // 10.96pt subheading look "not locally larger" than its body neighbour.
  const dominantFs = new Map<LayoutBlock, number>();
  for (const b of blocks) {
    const fontWeights: number[] = [];
    for (const line of b.lines) {
      const weight = Math.max(line.text.replace(/\s/g, '').length, 1);
      for (let i = 0; i < weight; i++) fontWeights.push(line.fontSize);
    }
    dominantFs.set(b, fontWeights.length > 0 ? median(fontWeights) : (b.lines[0]?.fontSize ?? bodyFontSize));
  }

  // Map a heading block's geometric features to a 0..1 confidence. Used
  // to populate `roleConfidence` whenever a block is classified — agents
  // that want a high-precision slice can threshold (e.g. `>= 0.7`) instead
  // of relying on the discrete `level`. The formula is intentionally
  // simple and inspectable: half the score comes from how far the
  // candidate's fontSize sits above body (saturating at ratio 1.5), the
  // other half from how many of the 4 structural gates passed (each
  // worth 0.125). See LayoutBlock.roleConfidence in types/index.ts for
  // the band guidance that surfaces in JSDoc.
  const computeRoleConfidence = (
    ratio: number,
    isShort: boolean,
    standalone: boolean,
    locallyLarger: boolean,
    singleLine: boolean,
  ): number => {
    const fontRatioScore = Math.max(0, Math.min(1, (ratio - 1.0) / 0.5));
    const passed = (isShort ? 1 : 0) + (standalone ? 1 : 0) + (locallyLarger ? 1 : 0) + (singleLine ? 1 : 0);
    return Math.round((0.5 * fontRatioScore + 0.125 * passed) * 100) / 100;
  };

  for (const b of blocks) {
    if (!isHeadingCandidateText(b.text)) continue;
    const repFont = b.lines[0]?.fontSize ?? bodyFontSize;
    const ratio = repFont / bodyFontSize;

    const nonWsChars = b.lines.reduce((acc, l) => acc + l.text.replace(/\s/g, '').length, 0);
    const isShort = nonWsChars <= MAX_HEADING_CHARS;
    const lineCount = b.lines.length;
    const likelyBodySentenceFragment = isLikelyBodySentenceFragment(b.text);
    const topTitle = isTopTitleCandidate(b, ratio, lineCount, nonWsChars) && !likelyBodySentenceFragment;
    const topSlideTitle = isTopSlideTitleCandidate(b, repFont, lineCount, nonWsChars);
    const sparseCoverTitle = isSparseCoverTitleCandidate(
      b,
      pageWidth,
      pageHeight,
      repFont,
      lineCount,
      nonWsChars,
      hasCredibleBody,
    );
    const topCenteredAllCapsTitle = isTopCenteredAllCapsTitleCandidate(b, pageWidth, lineCount, nonWsChars);
    const decimalSectionHeading = isDecimalSectionHeadingText(b.text);
    const letteredSectionHeading = isLetteredSectionHeadingText(b.text);
    if (
      ratio < 1.08 &&
      !topSlideTitle &&
      !sparseCoverTitle &&
      !topCenteredAllCapsTitle &&
      !decimalSectionHeading &&
      !letteredSectionHeading
    )
      continue;
    if (isTallNarrowSideLabel(b, lineCount)) continue;
    if (isCompactDiagramLabelText(b.text, nonWsChars, ratio)) continue;

    // "Above" / "below" must be the candidate's same-column neighbours,
    // not just the y-adjacent blocks. On multi-column pages a subheading
    // in the left column has the right column's body sitting at the same
    // y; without an x-overlap filter, the structural checks compare against
    // the wrong neighbour and the gap reads as negative ("they overlap").
    const cx0 = b.x;
    const cx1 = b.x + b.width;
    const xOverlaps = (other: LayoutBlock): boolean => other.x < cx1 && other.x + other.width > cx0;
    const idx = yIndex.get(b) ?? 0;
    let above: LayoutBlock | undefined;
    for (let i = idx - 1; i >= 0; i--) {
      if (xOverlaps(byY[i])) {
        above = byY[i];
        break;
      }
    }
    let below: LayoutBlock | undefined;
    for (let i = idx + 1; i < byY.length; i++) {
      if (xOverlaps(byY[i])) {
        below = byY[i];
        break;
      }
    }
    // "Standalone" = visibly separated from both neighbours. Use the
    // candidate's own line height as the unit so a 24pt heading needs a
    // bigger gap than an 8pt footer to count.
    const halfLine = repFont * 0.5;
    const gapAbove = above ? b.y - (above.y + above.height) : Number.POSITIVE_INFINITY;
    const gapBelow = below ? below.y - (b.y + b.height) : Number.POSITIVE_INFINITY;
    const standalone = gapAbove >= halfLine && gapBelow >= halfLine;
    // "Locally larger" = bigger than the adjacent block's dominant fontSize
    // (not just its first line). Edge-of-page blocks (no neighbour) pass
    // trivially via Array.every on an empty array, no special-casing needed.
    const neighbours = [above, below].filter((n): n is LayoutBlock => n !== undefined);
    const locallyLarger = neighbours.every((n) => repFont > (dominantFs.get(n) ?? bodyFontSize));

    const singleLine = lineCount === 1;
    if ((decimalSectionHeading || letteredSectionHeading) && ratio < 1.08) {
      if (!hasCredibleBody) continue;
      if (!isShort) continue;
      if (!singleLine) continue;
      if (!standalone) continue;
      if (likelyBodySentenceFragment) continue;
      b.role = 'heading';
      b.level = 2;
      b.roleConfidence = Math.max(0.65, computeRoleConfidence(1.15, isShort, standalone, locallyLarger, singleLine));
    } else if (ratio >= 1.4 || topSlideTitle || sparseCoverTitle || topCenteredAllCapsTitle) {
      // Level 1: titles. Always classify, even on poster/slide pages with
      // no body text — losing the title hurts more than a rare false
      // positive on a page that's nothing but a single big word.
      if (!topSlideTitle && !topCenteredAllCapsTitle && likelyBodySentenceFragment) continue;
      b.role = 'heading';
      b.level = 1;
      const confidence = computeRoleConfidence(
        topCenteredAllCapsTitle ? Math.max(ratio, 1.25) : ratio,
        isShort,
        standalone,
        locallyLarger,
        singleLine,
      );
      b.roleConfidence = topCenteredAllCapsTitle || sparseCoverTitle ? Math.max(0.75, confidence) : confidence;
    } else if (ratio >= 1.25) {
      // Level 2 (legacy band). The historical 1.25× rule, kept intact
      // except for one new guard: if the page lacks a credible body, we
      // demote so a uniform-large page doesn't tag every block.
      if (!hasCredibleBody) continue;
      if (likelyBodySentenceFragment) continue;
      b.role = 'heading';
      b.level = topTitle ? 1 : 2;
      b.roleConfidence = computeRoleConfidence(ratio, isShort, standalone, locallyLarger, singleLine);
    } else if (ratio >= 1.15) {
      // Level 2 (structural band). Catches arxiv-style 12pt section
      // headings over 10pt body. Requires the page to have real body
      // text AND the block to look heading-shaped.
      if (!hasCredibleBody) continue;
      if (!isShort) continue;
      if (lineCount > 2) continue;
      if (!standalone && !locallyLarger) continue;
      b.role = 'heading';
      b.level = 2;
      b.roleConfidence = computeRoleConfidence(ratio, isShort, standalone, locallyLarger, singleLine);
    } else {
      // Level 3 (subsection band). Strict gates — short + single-line +
      // locally-larger-than-same-column-neighbours + credible body. The
      // gap-based "standalone" check is intentionally NOT required here:
      // on multi-column pages the body block's bbox spans the full page
      // width (union of left + right column lines), so gap-to-next-block
      // can read negative even when the actual same-column content is
      // far below. locallyLarger uses the neighbour's dominant fontSize,
      // which doesn't suffer from that geometry issue, and is strict
      // enough on its own to catch arxiv subsections (10.96/9.96 ≈ 1.10).
      if (!hasCredibleBody) continue;
      if (!isShort) continue;
      if (lineCount > 1) continue;
      if (!locallyLarger) continue;
      if (isLikelyBodyFragmentForLevel3(b.text)) continue;
      b.role = 'heading';
      b.level = 3;
      b.roleConfidence = computeRoleConfidence(ratio, isShort, standalone, locallyLarger, singleLine);
    }
  }
  demoteTopBylineHeadings(blocks);
}
