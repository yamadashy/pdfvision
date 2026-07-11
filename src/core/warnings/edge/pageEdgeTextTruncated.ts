import type { LayoutBlock, PageWarning, TextSpan } from '../../../types/index.js';

const MIN_RUN_CODE_POINTS = 8;
const MIN_RUN_ADVANCE_EM = 6;
const MAX_BOUNDARY_OVERFLOW_EM = 1.25;
const PRIMARY_AXIS_RATIO = 1.5;
const TRAILING_NATURAL_TERMINATOR = /[\p{P}\p{S}]$/u;

type PageEdge = 'left' | 'top' | 'right' | 'bottom';

export function detectPageEdgeTextTruncated(
  spans: readonly TextSpan[],
  pageWidth: number,
  pageHeight: number,
  blocks: readonly LayoutBlock[] | undefined,
  out: PageWarning[],
): void {
  const emitted = new Set<string>();
  for (const span of spans) {
    const edge = truncatedPageEdge(span, pageWidth, pageHeight);
    if (!edge) continue;
    const blockIndex = findContainingBlockIndex(span, blocks);
    const key = blockIndex === undefined ? edge : `${blockIndex}:${edge}`;
    if (emitted.has(key)) continue;
    emitted.add(key);
    out.push({
      code: 'page_edge_text_truncated',
      severity: 'error',
      message: `text run ${sampleText(span.text)} reaches/crosses the page ${edge} boundary; glyphs beyond the page box are not extractable because pdf.js drops them, so native text may be truncated — inspect --render or --render-region to see what the page actually shows`,
      ...(blockIndex !== undefined && { blockIndex }),
    });
  }
}

export function truncatedPageEdge(
  span: Pick<TextSpan, 'text' | 'x' | 'y' | 'width' | 'height' | 'fontSize'>,
  pageWidth: number,
  pageHeight: number,
): PageEdge | undefined {
  const text = span.text.trim();
  const fontSize = span.fontSize > 0 ? span.fontSize : Math.min(span.width, span.height);
  if (fontSize <= 0 || Array.from(text).length < MIN_RUN_CODE_POINTS || TRAILING_NATURAL_TERMINATOR.test(text)) {
    return undefined;
  }

  if (span.width >= span.height * PRIMARY_AXIS_RATIO && span.width >= fontSize * MIN_RUN_ADVANCE_EM) {
    if (isBoundaryStraddle(-span.x, fontSize)) return 'left';
    if (isBoundaryStraddle(span.x + span.width - pageWidth, fontSize)) return 'right';
  }
  if (span.height >= span.width * PRIMARY_AXIS_RATIO && span.height >= fontSize * MIN_RUN_ADVANCE_EM) {
    if (isBoundaryStraddle(-span.y, fontSize)) return 'top';
    if (isBoundaryStraddle(span.y + span.height - pageHeight, fontSize)) return 'bottom';
  }
  return undefined;
}

export function suppressOffPageForTruncatedBlocks(out: PageWarning[]): void {
  const truncatedBlocks = new Set(
    out
      .filter((warning) => warning.code === 'page_edge_text_truncated' && warning.blockIndex !== undefined)
      .map((warning) => warning.blockIndex),
  );
  if (truncatedBlocks.size === 0) return;
  for (let i = out.length - 1; i >= 0; i--) {
    const warning = out[i];
    if (warning.code === 'off_page' && warning.blockIndex !== undefined && truncatedBlocks.has(warning.blockIndex)) {
      out.splice(i, 1);
    }
  }
}

function isBoundaryStraddle(overflow: number, fontSize: number): boolean {
  return overflow > 0 && overflow <= fontSize * MAX_BOUNDARY_OVERFLOW_EM;
}

function findContainingBlockIndex(span: TextSpan, blocks: readonly LayoutBlock[] | undefined): number | undefined {
  if (!blocks) return undefined;
  const spanArea = span.width * span.height;
  if (spanArea <= 0) return undefined;
  let bestIndex: number | undefined;
  let bestOverlap = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const overlapWidth = Math.max(0, Math.min(span.x + span.width, block.x + block.width) - Math.max(span.x, block.x));
    const overlapHeight = Math.max(
      0,
      Math.min(span.y + span.height, block.y + block.height) - Math.max(span.y, block.y),
    );
    const overlapRatio = (overlapWidth * overlapHeight) / spanArea;
    if (overlapRatio > bestOverlap) {
      bestOverlap = overlapRatio;
      bestIndex = i;
    }
  }
  return bestOverlap >= 0.8 ? bestIndex : undefined;
}

function sampleText(text: string): string {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  const sample = normalized.length > 40 ? `${normalized.slice(0, 37)}...` : normalized;
  return JSON.stringify(sample);
}
