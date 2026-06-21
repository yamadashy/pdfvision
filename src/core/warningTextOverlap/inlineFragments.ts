import type { LayoutBlock, LayoutLine } from '../../types/index.js';
import { boxesIntersect, horizontalIntersectionDepth, verticalIntersectionDepth } from './geometry.js';

const TEXT_OVERLAP_MIN_DEPTH_RATIO = 0.5;
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

export function isInlineFragmentPair(a: LayoutBlock, b: LayoutBlock): boolean {
  return (
    isInlineFragment(a, b) ||
    isInlineFragment(b, a) ||
    isInlinePunctuation(a, b) ||
    isInlinePunctuation(b, a) ||
    isMathAnnotation(a, b) ||
    isMathAnnotation(b, a)
  );
}

export function isInlinePunctuationLinePair(a: LayoutLine | LayoutBlock, b: LayoutLine | LayoutBlock): boolean {
  if (isInlinePunctuationBox(a, b)) return boxesIntersect(a, b);
  if (isInlinePunctuationBox(b, a)) return boxesIntersect(a, b);
  return false;
}

export function isMathAnnotationLinePair(
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

function isInlineFragment(fragment: LayoutBlock, neighbour: LayoutBlock): boolean {
  const text = fragment.text.replace(/\s+/g, '');
  if (text.length === 0 || text.length > INLINE_FRAGMENT_MAX_CHARS) return false;
  if (fragment.lines.length > 1) return false;
  if (fragment.width > INLINE_FRAGMENT_MAX_WIDTH_PT || fragment.height > INLINE_FRAGMENT_MAX_HEIGHT_PT) return false;
  if (neighbour.width < fragment.width * 4) return false;
  return sitsOnNeighbourLine(fragment, neighbour);
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
  return (
    hasMathSignal(text) ||
    /\b[A-Z]\s*(?:,|and)\s*[A-Z]\b/u.test(text) ||
    hasFormulaVariableSequence(text) ||
    isVariableTokenList(text)
  );
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

function hasFormulaVariableSequence(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (
    !/\b(?:attention|dimension|dimensions|head|heads|key|keys|matrices|matrix|model|models|parameter|parameters|projection|projections|queries|query|value|values|vector|vectors)\b/iu.test(
      normalized,
    )
  ) {
    return false;
  }
  return /(?:^|[\s(])(?:[A-Za-z]\s*(?:[,;]|\band\b|\bor\b)\s*)+[A-Za-z](?:[\s).,;]|$)/u.test(normalized);
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
