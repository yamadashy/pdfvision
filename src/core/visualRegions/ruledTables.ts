import type { PageLayout, VectorBox } from '../../types/index.js';
import { horizontalOverlapRatio, isFinitePositiveBox, touches, unionBox } from './geometry.js';
import type { BoxLike, Candidate } from './types.js';

interface RuledTableVectorInput {
  pageWidth: number;
  pageHeight: number;
  vectorBoxes?: readonly VectorBox[];
  layout?: PageLayout;
}

const RULED_TABLE_VECTOR_CLUSTER_GAP_PT = 14;
const RULED_TABLE_MIN_LINE_COUNT = 8;
const RULED_TABLE_MIN_HORIZONTAL_LINES = 3;
const RULED_TABLE_MIN_VERTICAL_LINES = 2;
const RULED_TABLE_MAX_LINE_THICKNESS_PT = 1.5;
const RULED_TABLE_MIN_HORIZONTAL_LINE_LENGTH_PT = 80;
const RULED_TABLE_MIN_VERTICAL_LINE_LENGTH_PT = 8;
const RULED_TABLE_MIN_WIDTH_PT = 120;
const RULED_TABLE_MIN_HEIGHT_PT = 32;
const RULED_TABLE_CAPTION_MAX_GAP_PT = 64;
const RULED_TABLE_CAPTION_MIN_OVERLAP_RATIO = 0.2;

export function addRuledTableVectorCandidates(
  input: RuledTableVectorInput,
  candidates: Candidate[],
  isChromeBox: (box: BoxLike) => boolean,
): void {
  if (!input.vectorBoxes || input.vectorBoxes.length === 0 || !input.layout) return;
  const items = input.vectorBoxes
    .map((box, index) => ({
      box,
      index,
      orientation: ruledTableLineOrientation(box, isChromeBox),
    }))
    .filter(
      (
        item,
      ): item is {
        box: VectorBox;
        index: number;
        orientation: 'horizontal' | 'vertical';
      } => item.orientation !== undefined,
    );
  if (items.length < RULED_TABLE_MIN_LINE_COUNT) return;

  for (const cluster of ruledTableVectorClusters(items)) {
    if (cluster.items.length < RULED_TABLE_MIN_LINE_COUNT) continue;
    const horizontalCount = cluster.items.filter((item) => item.orientation === 'horizontal').length;
    const verticalCount = cluster.items.filter((item) => item.orientation === 'vertical').length;
    if (horizontalCount < RULED_TABLE_MIN_HORIZONTAL_LINES || verticalCount < RULED_TABLE_MIN_VERTICAL_LINES) continue;
    if (cluster.box.width < RULED_TABLE_MIN_WIDTH_PT || cluster.box.height < RULED_TABLE_MIN_HEIGHT_PT) continue;
    if (!hasNearbyTableCaption(input.layout, cluster.box)) continue;

    candidates.push({
      ...cluster.box,
      kind: 'table',
      priority: 3,
      reason: `${cluster.items.length} ruled table vector lines near table caption`,
      sources: cluster.items.map(({ index }) => ({ type: 'vectorBox', index })),
    });
  }
}

function ruledTableLineOrientation(
  box: BoxLike,
  isChromeBox: (box: BoxLike) => boolean,
): 'horizontal' | 'vertical' | undefined {
  if (!isFinitePositiveBox(box)) return undefined;
  if (isChromeBox(box)) return undefined;
  const thickness = Math.min(box.width, box.height);
  if (thickness > RULED_TABLE_MAX_LINE_THICKNESS_PT) return undefined;
  if (box.height <= RULED_TABLE_MAX_LINE_THICKNESS_PT && box.width >= RULED_TABLE_MIN_HORIZONTAL_LINE_LENGTH_PT) {
    return 'horizontal';
  }
  if (box.width <= RULED_TABLE_MAX_LINE_THICKNESS_PT && box.height >= RULED_TABLE_MIN_VERTICAL_LINE_LENGTH_PT) {
    return 'vertical';
  }
  return undefined;
}

function ruledTableVectorClusters<T extends { box: BoxLike }>(items: readonly T[]): { box: BoxLike; items: T[] }[] {
  const clusters: { box: BoxLike; items: T[] }[] = [];
  for (const item of items) {
    const matches: number[] = [];
    for (let i = 0; i < clusters.length; i++) {
      if (touches(clusters[i].box, item.box, RULED_TABLE_VECTOR_CLUSTER_GAP_PT)) matches.push(i);
    }
    if (matches.length === 0) {
      clusters.push({ box: item.box, items: [item] });
      continue;
    }

    const first = matches[0];
    clusters[first] = {
      box: unionBox(clusters[first].box, item.box),
      items: [...clusters[first].items, item],
    };
    for (let i = matches.length - 1; i >= 1; i--) {
      clusters[first] = {
        box: unionBox(clusters[first].box, clusters[matches[i]].box),
        items: [...clusters[first].items, ...clusters[matches[i]].items],
      };
      clusters.splice(matches[i], 1);
    }
  }
  return clusters;
}

function hasNearbyTableCaption(layout: PageLayout, box: BoxLike): boolean {
  return layout.blocks.some((block) => {
    if (!isTableCaptionText(block.text)) return false;
    const captionBottom = block.y + block.height;
    const gap = box.y - captionBottom;
    if (gap < -4 || gap > RULED_TABLE_CAPTION_MAX_GAP_PT) return false;
    return horizontalOverlapRatio(block, box) >= RULED_TABLE_CAPTION_MIN_OVERLAP_RATIO;
  });
}

function isTableCaptionText(text: string): boolean {
  return /^\s*(?:table|表)\s*[\p{N}０-９一二三四五六七八九十]+/iu.test(text);
}
