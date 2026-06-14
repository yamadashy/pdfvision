import type { LayoutBlock, LayoutLine, PageWarning } from '../types/index.js';

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
const MATH_ANNOTATION_MAX_LINES = 2;
const MATH_ANNOTATION_MULTI_LINE_MAX_HEIGHT_PT = 16;
const MATH_ANNOTATION_MAX_HEIGHT_RATIO = 0.85;
const MATH_ANNOTATION_MAX_CHARS = 80;
const MATH_ANNOTATION_LINE_MAX_CHARS = 24;
const MATH_ANNOTATION_HORIZONTAL_SLACK_PT = 6;
const MATH_ANNOTATION_PROSE_MIN_CHARS = 45;
const MATH_ANNOTATION_EDGE_OVERLAP_RATIO = 0.2;
const DISPLAY_NUMBER_MIN_HEIGHT_PT = 24;
const DISPLAY_NUMBER_LABEL_MAX_HEIGHT_PT = 18;
const DISPLAY_NUMBER_LABEL_MAX_CHARS = 40;
const DISPLAY_NUMBER_LABEL_ZONE_RATIO = 0.35;
const DISPLAY_NUMBER_TEXT = /^[\d０-９\s,，.．:：%％+\-−–—/／()（）※年月日現末在]+$/u;
const DISPLAY_NUMBER_MIN_DIGITS = 2;
const ICON_MARKER_MAX_CHARS = 3;
const ICON_MARKER_MAX_SIZE_PT = 36;
const DUPLICATE_EXACT_TEXT_MIN_CHARS = 3;
const DUPLICATE_VERTICAL_CJK_CONTAINED_MIN_CHARS = 4;
const DUPLICATE_TEXT_MIN_CHARS = 8;
const DUPLICATE_TEXT_MIN_NGRAM_COVERAGE = 0.72;
const DUPLICATE_TEXT_MIN_OVERLAP_RATIO = 0.6;
const TEXT_OVERLAP_MAX_DETAILED_WARNINGS = 8;

interface TextOverlapCandidate {
  blockIndex: number;
  otherBlockIndex: number;
  overlapArea: number;
}

export function detectTextOverlap(blocks: LayoutBlock[], out: PageWarning[]): void {
  const overlaps: TextOverlapCandidate[] = [];
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
      if (isLooseLineContinuationPair(a, b)) continue;
      if (isInlineFragmentPair(a, b)) continue;
      if (isDisplayNumberLabelPair(a, b)) continue;
      if (isIconMarkerPair(a, b)) continue;
      if (isDuplicateExtractionPair(a, b)) continue;
      // Compute intersection area to give the message a concrete
      // anchor — a 0.1 pt² nick at a column boundary reads very
      // differently from a half-page overlap.
      const overlapArea = textOverlapArea(a, b);
      // Tiny rounding-fringe overlaps shouldn't fire — < 1 pt² is
      // typically just adjacent blocks whose bbox includes glyph
      // ascender/descender slack.
      if (overlapArea < 1) continue;
      overlaps.push({ blockIndex: i, otherBlockIndex: j, overlapArea });
    }
  }
  emitTextOverlapWarnings(overlaps, out);
}

function emitTextOverlapWarnings(overlaps: TextOverlapCandidate[], out: PageWarning[]): void {
  const sorted = [...overlaps].sort(
    (a, b) => b.overlapArea - a.overlapArea || a.blockIndex - b.blockIndex || a.otherBlockIndex - b.otherBlockIndex,
  );
  for (const overlap of sorted.slice(0, TEXT_OVERLAP_MAX_DETAILED_WARNINGS)) {
    out.push({
      code: 'text_overlap',
      severity: 'warning',
      message: `block bboxes overlap (${overlap.overlapArea.toFixed(1)}pt²) — text from different blocks may visually collide`,
      blockIndex: overlap.blockIndex,
      otherBlockIndex: overlap.otherBlockIndex,
    });
  }
  const omitted = sorted.length - TEXT_OVERLAP_MAX_DETAILED_WARNINGS;
  if (omitted <= 0) return;
  out.push({
    code: 'text_overlap',
    severity: 'warning',
    message: `${omitted} additional block bbox overlap${omitted === 1 ? '' : 's'} omitted after showing the ${TEXT_OVERLAP_MAX_DETAILED_WARNINGS} largest overlaps`,
  });
}

function isInlineFragmentPair(a: LayoutBlock, b: LayoutBlock): boolean {
  return (
    isInlineFragment(a, b) ||
    isInlineFragment(b, a) ||
    isInlinePunctuation(a, b) ||
    isInlinePunctuation(b, a) ||
    isMathAnnotation(a, b) ||
    isMathAnnotation(b, a)
  );
}

function isDisplayNumberLabelPair(a: LayoutBlock, b: LayoutBlock): boolean {
  return isLabelNearDisplayNumber(a, b) || isLabelNearDisplayNumber(b, a);
}

function isIconMarkerPair(a: LayoutBlock, b: LayoutBlock): boolean {
  return isIconMarkerNearText(a, b) || isIconMarkerNearText(b, a);
}

function isDuplicateExtractionPair(a: LayoutBlock, b: LayoutBlock): boolean {
  const overlap = intersectionArea(a, b);
  if (overlap <= 0) return false;
  const smallerArea = Math.max(0.001, Math.min(a.width * a.height, b.width * b.height));
  if (overlap / smallerArea < DUPLICATE_TEXT_MIN_OVERLAP_RATIO) return false;

  const aText = normalizeDuplicateText(a.text);
  const bText = normalizeDuplicateText(b.text);
  const shorter = aText.length <= bText.length ? aText : bText;
  const longer = aText.length <= bText.length ? bText : aText;
  if (shorter === longer && shorter.length >= DUPLICATE_EXACT_TEXT_MIN_CHARS) return true;
  if (
    shorter.length >= DUPLICATE_VERTICAL_CJK_CONTAINED_MIN_CHARS &&
    isVerticalLikePair(a, b) &&
    isCjkDominant(shorter) &&
    longer.includes(shorter)
  ) {
    return true;
  }
  if (shorter.length < DUPLICATE_TEXT_MIN_CHARS) return false;
  if (longer.includes(shorter)) return true;
  return ngramCoverage(shorter, longer) >= DUPLICATE_TEXT_MIN_NGRAM_COVERAGE;
}

function isVerticalLikePair(a: LayoutBlock, b: LayoutBlock): boolean {
  return a.writingMode === 'vertical' || b.writingMode === 'vertical';
}

function isCjkDominant(text: string): boolean {
  const chars = Array.from(text);
  if (chars.length === 0) return false;
  const cjkCount = chars.filter((char) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(char)).length;
  return cjkCount / chars.length >= 0.6;
}

function normalizeDuplicateText(text: string): string {
  return text.replace(/[^\p{Letter}\p{Number}]/gu, '');
}

function ngramCoverage(shorter: string, longer: string): number {
  const shorterNgrams = ngramSet(shorter);
  if (shorterNgrams.size === 0) return 0;
  const longerNgrams = ngramSet(longer);
  let shared = 0;
  for (const ngram of shorterNgrams) {
    if (longerNgrams.has(ngram)) shared++;
  }
  return shared / shorterNgrams.size;
}

function ngramSet(text: string): Set<string> {
  const chars = Array.from(text);
  const size = chars.length >= 3 ? 3 : chars.length;
  const out = new Set<string>();
  for (let i = 0; i <= chars.length - size; i++) {
    out.add(chars.slice(i, i + size).join(''));
  }
  return out;
}

function isIconMarkerNearText(marker: LayoutBlock, text: LayoutBlock): boolean {
  const compact = marker.text.replace(/\s+/g, '');
  if (compact.length === 0 || compact.length > ICON_MARKER_MAX_CHARS) return false;
  if (/[\p{L}\p{N}]/u.test(compact)) return false;
  if (marker.lines.length !== 1 || text.lines.length === 0) return false;
  if (marker.width > ICON_MARKER_MAX_SIZE_PT || marker.height > ICON_MARKER_MAX_SIZE_PT) return false;
  if (text.width < marker.width * 4) return false;

  const line = text.lines[0];
  const verticalDepth = verticalIntersectionDepth(marker.lines[0] ?? marker, line);
  const minHeight = Math.max(Math.min(marker.height, line.height), 0.001);
  if (verticalDepth / minHeight < TEXT_OVERLAP_MIN_DEPTH_RATIO) return false;

  const leadingGap = line.x - (marker.x + marker.width);
  return Math.abs(leadingGap) <= marker.width * 0.75;
}

function isLabelNearDisplayNumber(label: LayoutBlock, value: LayoutBlock): boolean {
  if (!isCompactInfographicLabel(label)) return false;
  if (!isDisplayNumberBlock(value)) return false;
  if (!horizontalOverlap(label, value)) return false;
  const labelCenterY = label.y + label.height / 2;
  const numberLine = value.lines[0];
  if (!numberLine) return false;
  const topZone = Math.max(value.height * DISPLAY_NUMBER_LABEL_ZONE_RATIO, numberLine.fontSize * 0.8);
  return labelCenterY >= value.y - 2 && labelCenterY <= value.y + topZone;
}

function isCompactInfographicLabel(block: LayoutBlock): boolean {
  const text = block.text.replace(/\s+/g, '');
  return (
    text.length > 0 &&
    text.length <= DISPLAY_NUMBER_LABEL_MAX_CHARS &&
    block.lines.length === 1 &&
    block.height <= DISPLAY_NUMBER_LABEL_MAX_HEIGHT_PT
  );
}

function isDisplayNumberBlock(block: LayoutBlock): boolean {
  const text = block.text.trim();
  const digitCount = text.match(/[\d０-９]/gu)?.length ?? 0;
  return (
    block.lines.length === 1 &&
    block.height >= DISPLAY_NUMBER_MIN_HEIGHT_PT &&
    digitCount >= DISPLAY_NUMBER_MIN_DIGITS &&
    DISPLAY_NUMBER_TEXT.test(text)
  );
}

function isLooseLineContinuationPair(a: LayoutBlock, b: LayoutBlock): boolean {
  const [upper, lower] = a.y <= b.y ? [a, b] : [b, a];
  const upperLine = upper.lines.at(-1);
  const lowerLine = lower.lines[0];
  if (!upperLine || !lowerLine) return false;
  const baselineDelta = lowerLine.y - upperLine.y;
  if (baselineDelta <= 0 || baselineDelta > Math.max(upperLine.fontSize, lowerLine.fontSize) * 1.4) return false;
  if (lowerLine.y >= upperLine.y + upperLine.height) return false;
  const continuationIndent =
    lowerLine.x >= upperLine.x - 2 && lowerLine.x - upperLine.x <= Math.max(42, upperLine.fontSize * 4);
  if (!continuationIndent || !horizontalOverlap(upperLine, lowerLine)) return false;
  // Inline superscripts/subscripts can inflate either adjacent line's bbox
  // even when the visible baselines are normally separated.
  const inlineMathSlack = upperLine.height > upperLine.fontSize * 1.35 || lowerLine.height > lowerLine.fontSize * 1.35;
  // Only leading !/bullet markers are list markers; trailing punctuation
  // should not suppress a real visual overlap.
  return inlineMathSlack || /^[!•▲▶►▸]\s/u.test(upperLine.text.trim()) || /[-‐‑–]\s*$/u.test(upperLine.text.trim());
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

function isInlinePunctuation(fragment: LayoutBlock, neighbour: LayoutBlock): boolean {
  if (fragment.lines.length > 1) return false;
  if (!isInlinePunctuationBox(fragment, neighbour)) return false;
  return sitsOnNeighbourLine(fragment, neighbour, { allowCentered: true });
}

function isInlinePunctuationBox(fragment: LayoutLine | LayoutBlock, neighbour: LayoutLine | LayoutBlock): boolean {
  const text = fragment.text.replace(/\s+/g, '');
  if (text.length === 0 || text.length > 3) return false;
  if (/[\p{L}\p{N}]/u.test(text)) return false;
  if (!/^[\p{P}\p{S}]+$/u.test(text)) return false;
  if (fragment.width > INLINE_FRAGMENT_MAX_WIDTH_PT || fragment.height > INLINE_FRAGMENT_MAX_HEIGHT_PT) return false;
  if (neighbour.width < fragment.width * 4) return false;
  return true;
}

function isInlinePunctuationLinePair(a: LayoutLine | LayoutBlock, b: LayoutLine | LayoutBlock): boolean {
  if (isInlinePunctuationBox(a, b)) return boxesIntersect(a, b);
  if (isInlinePunctuationBox(b, a)) return boxesIntersect(a, b);
  return false;
}

function isMathAnnotation(annotation: LayoutBlock, neighbour: LayoutBlock): boolean {
  if (
    annotation.lines.length === 0 ||
    annotation.lines.length > MATH_ANNOTATION_MAX_LINES ||
    neighbour.lines.length === 0
  ) {
    return false;
  }
  const compact = annotation.text.replace(/\s+/g, '');
  if (compact.length === 0 || compact.length > MATH_ANNOTATION_MAX_CHARS) return false;
  if (annotation.lines.length > 1 && annotation.height > MATH_ANNOTATION_MULTI_LINE_MAX_HEIGHT_PT) return false;
  if (annotation.height > neighbour.height * MATH_ANNOTATION_MAX_HEIGHT_RATIO) return false;
  if (!isMathLikeAnnotationText(annotation.text, neighbour.text)) return false;
  if (annotation.lines.length > 1 && !isProseOrFormulaNeighbour(neighbour)) return false;
  return annotation.lines.every((line) =>
    sitsBoxOnNeighbourLine(line, neighbour, {
      allowCentered: true,
      horizontalSlack: MATH_ANNOTATION_HORIZONTAL_SLACK_PT,
    }),
  );
}

function isProseOrFormulaNeighbour(block: LayoutBlock): boolean {
  const normalized = block.text.replace(/\s+/g, ' ').trim();
  if (normalized.length >= MATH_ANNOTATION_PROSE_MIN_CHARS && /\p{L}{3,}\s+\p{L}{3,}/u.test(normalized)) {
    return true;
  }
  return hasFormulaContextSignal(normalized);
}

function isMathAnnotationLinePair(
  annotationLine: LayoutLine | LayoutBlock,
  neighbourLine: LayoutLine | LayoutBlock,
  annotationBlock: LayoutBlock,
  neighbourBlock: LayoutBlock,
): boolean {
  const compactLine = annotationLine.text.replace(/\s+/g, '');
  if (compactLine.length === 0 || compactLine.length > MATH_ANNOTATION_LINE_MAX_CHARS) return false;
  if (annotationLine.height > INLINE_FRAGMENT_MAX_HEIGHT_PT) return false;
  if (!isMathLikeAnnotationText(annotationBlock.text, neighbourBlock.text)) return false;
  if (!isProseOrFormulaNeighbour(neighbourBlock) && !hasFormulaContextSignal(neighbourLine.text)) return false;

  const depth = verticalIntersectionDepth(annotationLine, neighbourLine);
  const minHeight = Math.max(Math.min(annotationLine.height, neighbourLine.height), 0.001);
  if (depth / minHeight < TEXT_OVERLAP_MIN_DEPTH_RATIO) return false;

  const annotationCenterX = annotationLine.x + annotationLine.width / 2;
  if (
    annotationCenterX >= neighbourLine.x - MATH_ANNOTATION_HORIZONTAL_SLACK_PT &&
    annotationCenterX <= neighbourLine.x + neighbourLine.width + MATH_ANNOTATION_HORIZONTAL_SLACK_PT
  ) {
    return true;
  }

  const overlapWidth = horizontalIntersectionDepth(annotationLine, neighbourLine);
  const minWidth = Math.max(Math.min(annotationLine.width, neighbourLine.width), 0.001);
  return overlapWidth / minWidth <= MATH_ANNOTATION_EDGE_OVERLAP_RATIO;
}

function isMathLikeAnnotationText(text: string, neighbourText: string): boolean {
  const compact = text.replace(/\s+/g, '');
  const neighbourHasFormulaContext = hasFormulaContextSignal(neighbourText);
  if (hasMathSignal(compact) && (neighbourHasFormulaContext || isStrongStandaloneMath(compact))) return true;
  const singleLetterTokens = text
    .trim()
    .split(/\s+/)
    .every((part) => /^[A-Za-z]$/u.test(part));
  if (singleLetterTokens && neighbourHasFormulaContext) return true;
  const tokens = text.trim().split(/\s+/);
  const compactLabel =
    tokens.length <= 8 &&
    tokens.join('').length <= 24 &&
    tokens.every((part) => /^[A-Za-z0-9][A-Za-z0-9]*$/u.test(part));
  if (compactLabel && neighbourHasFormulaContext) return true;
  return isSymbolDense(compact) && neighbourHasFormulaContext;
}

function hasFormulaContextSignal(text: string): boolean {
  return hasMathSignal(text) || /\b[A-Z]\s*(?:,|and)\s*[A-Z]\b/u.test(text) || isVariableTokenList(text);
}

function hasMathSignal(text: string): boolean {
  return /[±=+\-−×÷∫√∞≤≥<>()[\]|_^{}∑∏∂∆∇∈∉∪∩⊂⊃⊆⊇≈≠≡∝∀∃∥‖′″]/u.test(text) || /[\u0370-\u03ff]/u.test(text);
}

function isStrongStandaloneMath(text: string): boolean {
  return /[±=+\-−×÷∫√∞≤≥<>|_^{}∑∏∂∆∇∈∉∪∩⊂⊃⊆⊇≈≠≡∝∀∃∥‖′″]/u.test(text) || /[\u0370-\u03ff]/u.test(text);
}

function isSymbolDense(text: string): boolean {
  if (text.length === 0 || text.length > 12) return false;
  const symbolCount = Array.from(text).filter((char) => /[^A-Za-z0-9\s]/u.test(char)).length;
  return symbolCount / Array.from(text).length >= 0.5;
}

function isVariableTokenList(text: string): boolean {
  const tokens = text
    .replace(/[.,;:·…]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return tokens.length >= 2 && tokens.every((token) => /^[A-Za-z]$/u.test(token));
}

function sitsOnNeighbourLine(
  fragment: LayoutBlock,
  neighbour: LayoutBlock,
  options: { allowCentered?: boolean } = {},
): boolean {
  const fragmentBox = fragment.lines[0] ?? fragment;
  return sitsBoxOnNeighbourLine(fragmentBox, neighbour, options);
}

function sitsBoxOnNeighbourLine(
  fragmentBox: LayoutLine | LayoutBlock,
  neighbour: LayoutBlock,
  options: { allowCentered?: boolean; horizontalSlack?: number } = {},
): boolean {
  const fragmentCenterX = fragmentBox.x + fragmentBox.width / 2;
  const fragmentCenterY = fragmentBox.y + fragmentBox.height / 2;
  const horizontalSlack = options.horizontalSlack ?? 0;
  for (const line of neighbour.lines) {
    if (fragmentCenterX < line.x - horizontalSlack || fragmentCenterX > line.x + line.width + horizontalSlack) continue;
    if (!boxesIntersect(fragmentBox, line)) continue;
    const depth = verticalIntersectionDepth(fragmentBox, line);
    const minHeight = Math.max(Math.min(fragmentBox.height, line.height), 0.001);
    if (depth / minHeight < TEXT_OVERLAP_MIN_DEPTH_RATIO) continue;
    const lineCenterY = line.y + line.height / 2;
    if (!options.allowCentered && Math.abs(fragmentCenterY - lineCenterY) < line.height * 0.12) continue;
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
      if (isInlinePunctuationLinePair(aa, bb)) continue;
      if (isMathAnnotationLinePair(aa, bb, a, b) || isMathAnnotationLinePair(bb, aa, b, a)) continue;
      const depth = verticalIntersectionDepth(aa, bb);
      const minHeight = Math.max(Math.min(aa.height, bb.height), 0.001);
      if (depth / minHeight < TEXT_OVERLAP_MIN_DEPTH_RATIO) continue;
      total += intersectionArea(aa, bb);
    }
  }
  return total;
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
  const dx = horizontalIntersectionDepth(a, b);
  const dy = verticalIntersectionDepth(a, b);
  if (dx <= 0 || dy <= 0) return 0;
  return dx * dy;
}

function horizontalIntersectionDepth(a: Box, b: Box): number {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
}

function verticalIntersectionDepth(a: Box, b: Box): number {
  return Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
}

export function horizontalOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x;
}
