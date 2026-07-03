import type { VectorBox } from '../../types/index.js';
import {
  areaRatio,
  horizontalOverlapRatio,
  isFinitePositiveBox,
  overlapOfSmaller,
  pageArea,
  touches,
  unionBox,
} from './geometry.js';
import type { BoxLike, BuildVisualRegionsInput, Candidate } from './types.js';

const RULED_FORM_CLUSTER_GAP_PT = 14;
const RULED_FORM_MIN_LINE_COUNT = 12;
const RULED_FORM_MIN_HORIZONTAL_LINES = 3;
const RULED_FORM_MIN_VERTICAL_LINES = 2;
const RULED_FORM_MAX_LINE_THICKNESS_PT = 1.5;
const RULED_FORM_MIN_HORIZONTAL_LINE_LENGTH_PT = 80;
const RULED_FORM_MIN_VERTICAL_LINE_LENGTH_PT = 8;
const RULED_FORM_MIN_WIDTH_PT = 120;
const RULED_FORM_MIN_HEIGHT_PT = 32;
const RULED_FORM_MAX_AREA_RATIO = 0.85;

const DOTTED_FORM_DASH_MIN_LENGTH_PT = 0.5;
const DOTTED_FORM_DASH_MAX_LENGTH_PT = 8;
const DOTTED_FORM_ROW_Y_TOLERANCE_PT = 2;
const DOTTED_FORM_MIN_DASHES_PER_ROW = 20;
const DOTTED_FORM_MIN_ROW_WIDTH_PT = 120;
const DOTTED_FORM_MIN_ROWS = 3;
const DOTTED_FORM_MAX_ROW_GAP_PT = 48;
const DOTTED_FORM_MIN_HEIGHT_PT = 32;
const DOTTED_FORM_MIN_HORIZONTAL_OVERLAP_RATIO = 0.5;

interface OrientedLineItem {
  box: VectorBox;
  index: number;
  orientation: 'horizontal' | 'vertical';
}

interface VectorItem {
  box: VectorBox;
  index: number;
}

export function addRuledFormVectorCandidates(
  input: BuildVisualRegionsInput,
  candidates: Candidate[],
  isChromeBox: (box: BoxLike) => boolean,
): void {
  if (!input.vectorBoxes || input.vectorBoxes.length === 0) return;
  addRuledGridCandidates(input, candidates, isChromeBox);
  addDottedWriteInLineCandidates(input, candidates);
}

function addRuledGridCandidates(
  input: BuildVisualRegionsInput,
  candidates: Candidate[],
  isChromeBox: (box: BoxLike) => boolean,
): void {
  const items = input.vectorBoxes
    ?.map((box, index) => ({ box, index, orientation: ruledFormLineOrientation(box, isChromeBox) }))
    .filter((item): item is OrientedLineItem => item.orientation !== undefined);
  if (!items || items.length < RULED_FORM_MIN_LINE_COUNT) return;

  for (const cluster of vectorClusters(items, RULED_FORM_CLUSTER_GAP_PT)) {
    if (cluster.items.length < RULED_FORM_MIN_LINE_COUNT) continue;
    const horizontalCount = cluster.items.filter((item) => item.orientation === 'horizontal').length;
    const verticalCount = cluster.items.filter((item) => item.orientation === 'vertical').length;
    if (horizontalCount < RULED_FORM_MIN_HORIZONTAL_LINES || verticalCount < RULED_FORM_MIN_VERTICAL_LINES) continue;
    if (cluster.box.width < RULED_FORM_MIN_WIDTH_PT || cluster.box.height < RULED_FORM_MIN_HEIGHT_PT) continue;
    if (areaRatio(cluster.box, pageArea(input)) > RULED_FORM_MAX_AREA_RATIO) continue;
    if (candidates.some((candidate) => candidate.kind === 'table' && overlapOfSmaller(cluster.box, candidate) >= 0.9)) {
      continue;
    }

    candidates.push({
      ...cluster.box,
      kind: 'form',
      priority: 3,
      reason: `${cluster.items.length} ruled form vector lines`,
      sources: cluster.items.map(({ index }) => ({ type: 'vectorBox', index })),
    });
  }
}

function ruledFormLineOrientation(
  box: BoxLike,
  isChromeBox: (box: BoxLike) => boolean,
): 'horizontal' | 'vertical' | undefined {
  if (!isFinitePositiveBox(box)) return undefined;
  if (isChromeBox(box)) return undefined;
  const thickness = Math.min(box.width, box.height);
  if (thickness > RULED_FORM_MAX_LINE_THICKNESS_PT) return undefined;
  if (box.height <= RULED_FORM_MAX_LINE_THICKNESS_PT && box.width >= RULED_FORM_MIN_HORIZONTAL_LINE_LENGTH_PT) {
    return 'horizontal';
  }
  if (box.width <= RULED_FORM_MAX_LINE_THICKNESS_PT && box.height >= RULED_FORM_MIN_VERTICAL_LINE_LENGTH_PT) {
    return 'vertical';
  }
  return undefined;
}

function addDottedWriteInLineCandidates(input: BuildVisualRegionsInput, candidates: Candidate[]): void {
  const rows = dottedLineRows(input.vectorBoxes ?? []);
  if (rows.length < DOTTED_FORM_MIN_ROWS) return;

  for (const cluster of rowClusters(rows)) {
    if (cluster.items.length < DOTTED_FORM_MIN_ROWS) continue;
    if (cluster.box.height < DOTTED_FORM_MIN_HEIGHT_PT) continue;
    candidates.push({
      ...cluster.box,
      kind: 'form',
      priority: 2,
      reason: `${cluster.items.flatMap((row) => row.items).length} dotted form line segments across ${
        cluster.items.length
      } write-in lines`,
      sources: cluster.items.flatMap((row) => row.items.map(({ index }) => ({ type: 'vectorBox' as const, index }))),
    });
  }
}

function dottedLineRows(vectorBoxes: readonly VectorBox[]): { box: BoxLike; items: VectorItem[] }[] {
  const rows: { box: BoxLike; items: VectorItem[] }[] = [];
  for (const item of vectorBoxes
    .map((box, index) => ({ box, index }))
    .filter(({ box }) => isDottedFormDash(box))
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)) {
    const row = rows.find((candidate) => Math.abs(candidate.box.y - item.box.y) <= DOTTED_FORM_ROW_Y_TOLERANCE_PT);
    if (!row) {
      rows.push({ box: item.box, items: [item] });
      continue;
    }
    row.box = unionBox(row.box, item.box);
    row.items.push(item);
  }
  return rows.filter(
    (row) => row.items.length >= DOTTED_FORM_MIN_DASHES_PER_ROW && row.box.width >= DOTTED_FORM_MIN_ROW_WIDTH_PT,
  );
}

function isDottedFormDash(box: BoxLike): boolean {
  if (!isFinitePositiveBox(box)) return false;
  if (box.height > RULED_FORM_MAX_LINE_THICKNESS_PT) return false;
  return box.width >= DOTTED_FORM_DASH_MIN_LENGTH_PT && box.width <= DOTTED_FORM_DASH_MAX_LENGTH_PT;
}

function rowClusters<T extends { box: BoxLike }>(rows: readonly T[]): { box: BoxLike; items: T[] }[] {
  const clusters: { box: BoxLike; items: T[] }[] = [];
  for (const row of rows) {
    const match = clusters.find(
      (cluster) =>
        row.box.y - (cluster.box.y + cluster.box.height) <= DOTTED_FORM_MAX_ROW_GAP_PT &&
        horizontalOverlapRatio(row.box, cluster.box) >= DOTTED_FORM_MIN_HORIZONTAL_OVERLAP_RATIO,
    );
    if (!match) {
      clusters.push({ box: row.box, items: [row] });
      continue;
    }
    match.box = unionBox(match.box, row.box);
    match.items.push(row);
  }
  return clusters;
}

function vectorClusters<T extends { box: BoxLike }>(items: readonly T[], gap: number): { box: BoxLike; items: T[] }[] {
  const clusters: { box: BoxLike; items: T[] }[] = [];
  for (const item of items) {
    const matches: number[] = [];
    for (let i = 0; i < clusters.length; i++) {
      if (touches(clusters[i].box, item.box, gap)) matches.push(i);
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
