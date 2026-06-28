import { pageArea, unionBox, visiblePageBox } from './geometry.js';
import { isNearFullPageBox } from './predicates.js';
import type { BoxLike, BuildVisualRegionsInput, Candidate } from './types.js';

const MIN_VECTOR_BOXES = 20;
const MIN_LAYOUT_BLOCKS = 20;
const MIN_HORIZONTAL_CLUSTERS = 4;
const MIN_LAYOUT_WIDTH_RATIO = 0.7;
const MIN_LAYOUT_HEIGHT_RATIO = 0.55;
const MAX_LAYOUT_AREA_RATIO = 0.85;
const NARROW_BLOCK_MAX_WIDTH_RATIO = 0.35;
const SHORT_BLOCK_MAX_HEIGHT_RATIO = 0.25;
const NARRATIVE_BLOCK_MIN_WIDTH_RATIO = 0.55;
const NARRATIVE_BLOCK_MIN_CHARS = 90;
const NARRATIVE_BLOCK_MIN_LINES = 3;
const NARRATIVE_LINE_MIN_WIDTH_RATIO = 0.45;
const NARRATIVE_LINE_MIN_CHARS = 24;
const FOOTER_BLOCK_MIN_Y_RATIO = 0.96;
const SIDE_CHROME_BLOCK_MAX_WIDTH_RATIO = 0.05;
const SIDE_CHROME_BLOCK_EDGE_RATIO = 0.06;

export function addLabeledPageDiagramCandidate(input: BuildVisualRegionsInput, candidates: Candidate[]): void {
  const vectorBoxes = input.vectorBoxes ?? [];
  const blocks = input.layout?.blocks.filter((block) => !block.repeated && isDiagramTextBlock(block, input)) ?? [];
  if (input.imageBoxes.length > 0) return;
  if (vectorBoxes.length < MIN_VECTOR_BOXES || blocks.length < MIN_LAYOUT_BLOCKS) return;
  if (!vectorBoxes.some((box) => isNearFullPageBox(box, input.pageWidth, input.pageHeight))) return;
  if (countHorizontalBlockClusters(blocks, input.pageWidth, input.pageHeight) < MIN_HORIZONTAL_CLUSTERS) return;

  const blockField = visiblePageBox(
    blocks.reduce<BoxLike>((box, block) => unionBox(box, block), blocks[0]),
    input.pageWidth,
    input.pageHeight,
  );
  if (blockField.width < input.pageWidth * MIN_LAYOUT_WIDTH_RATIO) return;
  if (blockField.height < input.pageHeight * MIN_LAYOUT_HEIGHT_RATIO) return;
  if (pageArea(input) > 0 && (blockField.width * blockField.height) / pageArea(input) > MAX_LAYOUT_AREA_RATIO) {
    return;
  }

  candidates.push({
    ...blockField,
    kind: 'vector',
    priority: 2,
    reason: `${blocks.length} labeled blocks arranged across broad vector page diagram`,
    sources: vectorBoxes.map((_, index) => ({ type: 'vectorBox' as const, index })),
  });
}

function isDiagramTextBlock(
  block: NonNullable<BuildVisualRegionsInput['layout']>['blocks'][number],
  input: BuildVisualRegionsInput,
): boolean {
  if (block.text.trim().length === 0) return false;
  if (block.y > input.pageHeight * 0.93 && /^\s*\d+\s*$/u.test(block.text)) return false;
  if (isPageChromeTextBlock(block, input)) return false;
  if (isNarrativeProseBlock(block, input)) return false;
  return true;
}

function isNarrativeProseBlock(
  block: NonNullable<BuildVisualRegionsInput['layout']>['blocks'][number],
  input: BuildVisualRegionsInput,
): boolean {
  const normalized = block.text.replace(/\s+/gu, ' ').trim();
  if (
    normalized.length >= NARRATIVE_LINE_MIN_CHARS &&
    block.width >= input.pageWidth * NARRATIVE_LINE_MIN_WIDTH_RATIO &&
    block.lines.length <= 1 &&
    block.role !== 'heading'
  ) {
    return true;
  }
  if (normalized.length < NARRATIVE_BLOCK_MIN_CHARS) return false;
  if (block.width < input.pageWidth * NARRATIVE_BLOCK_MIN_WIDTH_RATIO) return false;
  return block.lines.length >= NARRATIVE_BLOCK_MIN_LINES || block.height >= input.pageHeight * 0.12;
}

function isPageChromeTextBlock(
  block: NonNullable<BuildVisualRegionsInput['layout']>['blocks'][number],
  input: BuildVisualRegionsInput,
): boolean {
  if (block.y > input.pageHeight * FOOTER_BLOCK_MIN_Y_RATIO) return true;
  return (
    block.x <= input.pageWidth * SIDE_CHROME_BLOCK_EDGE_RATIO &&
    block.width <= input.pageWidth * SIDE_CHROME_BLOCK_MAX_WIDTH_RATIO
  );
}

function countHorizontalBlockClusters(
  blocks: readonly NonNullable<BuildVisualRegionsInput['layout']>['blocks'][number][],
  pageWidth: number,
  pageHeight: number,
): number {
  const minGap = Math.max(36, pageWidth * 0.08);
  const centers = blocks
    .filter(
      (block) =>
        block.width <= pageWidth * NARROW_BLOCK_MAX_WIDTH_RATIO &&
        block.height <= pageHeight * SHORT_BLOCK_MAX_HEIGHT_RATIO,
    )
    .map((block) => block.x + block.width / 2)
    .sort((a, b) => a - b);
  let clusters = 0;
  let lastCenter = Number.NEGATIVE_INFINITY;
  for (const center of centers) {
    if (center - lastCenter < minGap) continue;
    clusters++;
    lastCenter = center;
  }
  return clusters;
}
