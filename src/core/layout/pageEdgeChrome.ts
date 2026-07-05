import type { LayoutBlock, PageResult } from '../../types/index.js';
import type { BBox } from './geometry.js';
import { markBlockAsRepeatedChrome } from './repeatedChrome.js';

const PAGE_EDGE_VERTICAL_CHROME_EDGE_RATIO = 0.08;
const PAGE_EDGE_VERTICAL_CHROME_MIN_EDGE_PT = 36;
const PAGE_EDGE_VERTICAL_CHROME_MAX_WIDTH_RATIO = 0.05;
const PAGE_EDGE_VERTICAL_CHROME_MIN_HEIGHT_RATIO = 0.1;
const PAGE_EDGE_VERTICAL_CHROME_MAX_NORMALIZED_CHARS = 12;
const PAGE_EDGE_VERTICAL_MARKER_MAX_CHARS = 3;
const PAGE_EDGE_VERTICAL_CHROME_MARKER_MAX_CHARS = 6;
const PAGE_EDGE_VERTICAL_MARKER_MAX_DISTANCE_PT = 80;
const PAGE_EDGE_VERTICAL_MARKER_CENTER_TOLERANCE_PT = 24;
const PAGE_EDGE_VERTICAL_CHROME_MARKER_RE = /^(?:[第章編部]|\p{N}+|第?\p{N}+[章編部]?)$/u;

interface PageEdgeChromeRef {
  pageIndex: number;
  block: LayoutBlock;
  key: string;
}

export function markPageEdgeChromeBlocks(pages: PageResult[]): void {
  const pagesWithLayout = pages.filter((p) => p.layout && p.layout.blocks.length > 0);
  if (pagesWithLayout.length === 0) return;

  const chromeRefs: PageEdgeChromeRef[] = [];
  const markerRefs: PageEdgeChromeRef[] = [];

  for (let pageIndex = 0; pageIndex < pagesWithLayout.length; pageIndex++) {
    const page = pagesWithLayout[pageIndex];
    if (page.width <= 0 || page.height <= 0) continue;
    const blocks = page.layout?.blocks ?? [];
    const verticalEdgeAnchors = blocks.filter((block) =>
      isPageEdgeVerticalChromeGeometryBlock(block, page.width, page.height),
    );
    if (verticalEdgeAnchors.length === 0) continue;

    for (const block of verticalEdgeAnchors) {
      const key = normalizedPageEdgeChromeText(block.text);
      if (!isPageEdgeVerticalChromeTextCandidate(key)) continue;
      chromeRefs.push({ pageIndex, block, key });
    }

    for (const block of blocks) {
      if (!isPageEdgeVerticalMarkerBlock(block, page.width, page.height, verticalEdgeAnchors)) continue;
      markerRefs.push({ pageIndex, block, key: normalizedPageEdgeChromeText(block.text) });
    }
  }

  if (pagesWithLayout.length === 1) {
    for (const ref of chromeRefs) {
      if (isPageEdgeVerticalChromeMarkerText(ref.key)) markBlockAsRepeatedChrome(ref.block);
    }
    for (const ref of markerRefs) {
      markBlockAsRepeatedChrome(ref.block);
    }
    return;
  }

  markRefsWithRecurringText(chromeRefs);
  markRefsWithRecurringText(markerRefs);
}

function markRefsWithRecurringText(refs: readonly PageEdgeChromeRef[]): void {
  const pagesByText = new Map<string, Set<number>>();
  for (const ref of refs) {
    const pages = pagesByText.get(ref.key);
    if (pages) pages.add(ref.pageIndex);
    else pagesByText.set(ref.key, new Set([ref.pageIndex]));
  }

  for (const ref of refs) {
    if ((pagesByText.get(ref.key)?.size ?? 0) < 2) continue;
    markBlockAsRepeatedChrome(ref.block);
  }
}

function isPageEdgeVerticalChromeGeometryBlock(block: LayoutBlock, pageWidth: number, pageHeight: number): boolean {
  if (block.writingMode !== 'vertical') return false;
  if (!isSideEdgeBox(block, pageWidth)) return false;
  if (block.width > pageWidth * PAGE_EDGE_VERTICAL_CHROME_MAX_WIDTH_RATIO) return false;
  return block.height >= pageHeight * PAGE_EDGE_VERTICAL_CHROME_MIN_HEIGHT_RATIO;
}

function isPageEdgeVerticalChromeTextCandidate(text: string): boolean {
  if (text.length === 0) return false;
  if (/[。、]/u.test(text)) return false;
  return Array.from(text).length <= PAGE_EDGE_VERTICAL_CHROME_MAX_NORMALIZED_CHARS;
}

function isPageEdgeVerticalChromeMarkerText(text: string): boolean {
  return (
    Array.from(text).length > 0 &&
    Array.from(text).length <= PAGE_EDGE_VERTICAL_CHROME_MARKER_MAX_CHARS &&
    PAGE_EDGE_VERTICAL_CHROME_MARKER_RE.test(text)
  );
}

function isPageEdgeVerticalMarkerBlock(
  block: LayoutBlock,
  pageWidth: number,
  pageHeight: number,
  verticalEdgeAnchors: readonly LayoutBlock[],
): boolean {
  const text = normalizedPageEdgeChromeText(block.text);
  const textLength = Array.from(text).length;
  if (textLength === 0 || textLength > PAGE_EDGE_VERTICAL_MARKER_MAX_CHARS) return false;
  if (!PAGE_EDGE_VERTICAL_CHROME_MARKER_RE.test(text)) return false;
  if (!isSideEdgeBox(block, pageWidth)) return false;
  if (block.height > pageHeight * 0.05 || block.width > pageWidth * 0.05) return false;

  const markerCenter = { x: block.x + block.width / 2, y: block.y + block.height / 2 };
  return verticalEdgeAnchors.some((chrome) => {
    if (sideEdge(chrome, pageWidth) !== sideEdge(block, pageWidth)) return false;
    const chromeCenterX = chrome.x + chrome.width / 2;
    if (Math.abs(markerCenter.x - chromeCenterX) > PAGE_EDGE_VERTICAL_MARKER_CENTER_TOLERANCE_PT) return false;
    return (
      markerCenter.y >= chrome.y - PAGE_EDGE_VERTICAL_MARKER_MAX_DISTANCE_PT &&
      markerCenter.y <= chrome.y + chrome.height + PAGE_EDGE_VERTICAL_MARKER_MAX_DISTANCE_PT
    );
  });
}

function normalizedPageEdgeChromeText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, '').trim();
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
