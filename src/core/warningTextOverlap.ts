import type { LayoutBlock, PageWarning } from '../types/index.js';

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
const MATH_ANNOTATION_MAX_HEIGHT_RATIO = 0.85;
const MATH_ANNOTATION_MAX_CHARS = 80;

export function detectTextOverlap(blocks: LayoutBlock[], out: PageWarning[]): void {
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
  // Only leading !/bullet markers are list markers; trailing punctuation
  // should not suppress a real visual overlap.
  return (
    upperLine.height > upperLine.fontSize * 1.35 ||
    /^[!•]\s/u.test(upperLine.text.trim()) ||
    /[-‐‑–]\s*$/u.test(upperLine.text.trim())
  );
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
  if (!sitsOnNeighbourLine(annotation, neighbour, { allowCentered: true })) return false;
  return true;
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
  const fragmentCenterX = fragmentBox.x + fragmentBox.width / 2;
  const fragmentCenterY = fragmentBox.y + fragmentBox.height / 2;
  for (const line of neighbour.lines) {
    if (fragmentCenterX < line.x || fragmentCenterX > line.x + line.width) continue;
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
  const dx = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const dy = verticalIntersectionDepth(a, b);
  if (dx <= 0 || dy <= 0) return 0;
  return dx * dy;
}

function verticalIntersectionDepth(a: Box, b: Box): number {
  return Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
}

export function horizontalOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x;
}
