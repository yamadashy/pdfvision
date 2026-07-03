import type { LayoutBlock } from '../../types/index.js';
import type { BBox } from './geometry.js';
import { markBlockAsRepeatedChrome } from './repeatedChrome.js';

const PAGE_EDGE_VERTICAL_CHROME_EDGE_RATIO = 0.08;
const PAGE_EDGE_VERTICAL_CHROME_MIN_EDGE_PT = 36;
const PAGE_EDGE_VERTICAL_CHROME_MAX_WIDTH_RATIO = 0.05;
const PAGE_EDGE_VERTICAL_CHROME_MIN_HEIGHT_RATIO = 0.1;
const PAGE_EDGE_VERTICAL_MARKER_MAX_CHARS = 3;
const PAGE_EDGE_VERTICAL_MARKER_MAX_DISTANCE_PT = 80;
const PAGE_EDGE_VERTICAL_MARKER_CENTER_TOLERANCE_PT = 24;

export function markPageEdgeChromeBlocks(blocks: LayoutBlock[], pageWidth: number, pageHeight: number): void {
  if (pageWidth <= 0 || pageHeight <= 0 || blocks.length === 0) return;

  const verticalChromeBlocks = blocks.filter((block) => isPageEdgeVerticalChromeBlock(block, pageWidth, pageHeight));
  if (verticalChromeBlocks.length === 0) return;

  for (const block of verticalChromeBlocks) {
    markBlockAsRepeatedChrome(block);
  }

  for (const block of blocks) {
    if (!isPageEdgeVerticalMarkerBlock(block, pageWidth, pageHeight, verticalChromeBlocks)) continue;
    markBlockAsRepeatedChrome(block);
  }
}

function isPageEdgeVerticalChromeBlock(block: LayoutBlock, pageWidth: number, pageHeight: number): boolean {
  if (block.writingMode !== 'vertical') return false;
  if (!isSideEdgeBox(block, pageWidth)) return false;
  if (block.width > pageWidth * PAGE_EDGE_VERTICAL_CHROME_MAX_WIDTH_RATIO) return false;
  return block.height >= pageHeight * PAGE_EDGE_VERTICAL_CHROME_MIN_HEIGHT_RATIO;
}

function isPageEdgeVerticalMarkerBlock(
  block: LayoutBlock,
  pageWidth: number,
  pageHeight: number,
  verticalChromeBlocks: readonly LayoutBlock[],
): boolean {
  const text = block.text.replace(/\s+/g, '').trim();
  if (text.length === 0 || text.length > PAGE_EDGE_VERTICAL_MARKER_MAX_CHARS) return false;
  if (!/^(?:[第章編部]|\p{N}+|[０-９]+)$/u.test(text)) return false;
  if (!isSideEdgeBox(block, pageWidth)) return false;
  if (block.height > pageHeight * 0.05 || block.width > pageWidth * 0.05) return false;

  const markerCenter = { x: block.x + block.width / 2, y: block.y + block.height / 2 };
  return verticalChromeBlocks.some((chrome) => {
    if (sideEdge(chrome, pageWidth) !== sideEdge(block, pageWidth)) return false;
    const chromeCenterX = chrome.x + chrome.width / 2;
    if (Math.abs(markerCenter.x - chromeCenterX) > PAGE_EDGE_VERTICAL_MARKER_CENTER_TOLERANCE_PT) return false;
    return (
      markerCenter.y >= chrome.y - PAGE_EDGE_VERTICAL_MARKER_MAX_DISTANCE_PT &&
      markerCenter.y <= chrome.y + chrome.height + PAGE_EDGE_VERTICAL_MARKER_MAX_DISTANCE_PT
    );
  });
}

function isSideEdgeBox(box: BBox, pageWidth: number): boolean {
  const edgeBand = Math.max(PAGE_EDGE_VERTICAL_CHROME_MIN_EDGE_PT, pageWidth * PAGE_EDGE_VERTICAL_CHROME_EDGE_RATIO);
  return box.x <= edgeBand || box.x + box.width >= pageWidth - edgeBand;
}

function sideEdge(box: BBox, pageWidth: number): 'left' | 'right' {
  const leftDistance = box.x;
  const rightDistance = pageWidth - (box.x + box.width);
  return leftDistance <= rightDistance ? 'left' : 'right';
}
