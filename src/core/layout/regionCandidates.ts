import type { BBox } from './geometry.js';

/** A box that may set text apart, with the painted boxes it is made of. */
export interface Candidate {
  box: BBox;
  parts: readonly BBox[];
  graphicCount: number;
  /** A cluster of several paths, or an image: label text around it belongs to it. */
  drawing: boolean;
}

/** Boxes of one drawing touch or nearly touch: a legend swatch sits a few
 *  points above the plot frame, tick marks touch the axis. */
const CLUSTER_GAP_PT = 8;
export const MIN_FIGURE_GRAPHICS = 4;
const RULE_MAX_THICKNESS_PT = 2;
const RULE_MIN_LENGTH_PT = 36;
const RULE_EXTENT_TOLERANCE_PT = 3;
const RULE_CHAIN_MAX_GAP_RATIO = 0.35;
const MIN_RULE_BAND_HEIGHT_PT = 8;

/** Connected groups of boxes that touch within {@link CLUSTER_GAP_PT}. */
export function clusterBoxes(boxes: readonly BBox[]): Candidate[] {
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[a].x - boxes[b].x);
  const parent = boxes.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let oi = 0; oi < order.length; oi++) {
    const a = boxes[order[oi]];
    const right = a.x + a.width + CLUSTER_GAP_PT;
    for (let oj = oi + 1; oj < order.length; oj++) {
      const b = boxes[order[oj]];
      if (b.x > right) break;
      if (b.y > a.y + a.height + CLUSTER_GAP_PT || a.y > b.y + b.height + CLUSTER_GAP_PT) continue;
      parent[find(order[oi])] = find(order[oj]);
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < boxes.length; i++) {
    const root = find(i);
    const group = groups.get(root);
    if (group) group.push(i);
    else groups.set(root, [i]);
  }
  return [...groups.values()].map((members) => ({
    box: unionOf(members.map((i) => boxes[i])),
    parts: members.map((i) => boxes[i]),
    graphicCount: members.length,
    drawing: members.length >= MIN_FIGURE_GRAPHICS,
  }));
}

/**
 * Bands between horizontal rules of the same extent: the rules above and
 * below a pull quote, or the top, middle and bottom rules of a booktabs
 * table. Consecutive rules join one band while each gap stays under a
 * third of the page height.
 */
export function ruleBands(vectors: readonly BBox[], pageHeight: number): Candidate[] {
  const rules = vectors
    .filter((box) => box.height <= RULE_MAX_THICKNESS_PT && box.width >= RULE_MIN_LENGTH_PT)
    .sort((a, b) => a.y - b.y);
  const used = new Set<number>();
  const bands: Candidate[] = [];
  for (let i = 0; i < rules.length; i++) {
    if (used.has(i)) continue;
    const chain = [rules[i]];
    used.add(i);
    for (let j = i + 1; j < rules.length; j++) {
      if (used.has(j) || !sameExtent(rules[i], rules[j])) continue;
      const last = chain[chain.length - 1];
      if (rules[j].y - last.y < MIN_RULE_BAND_HEIGHT_PT) {
        used.add(j);
        continue;
      }
      if (rules[j].y - last.y > pageHeight * RULE_CHAIN_MAX_GAP_RATIO) break;
      chain.push(rules[j]);
      used.add(j);
    }
    if (chain.length < 2) continue;
    const top = chain[0];
    const bottom = chain[chain.length - 1];
    bands.push({
      box: { x: top.x, y: top.y, width: top.width, height: bottom.y + bottom.height - top.y },
      parts: chain,
      graphicCount: chain.length,
      drawing: false,
    });
  }
  return bands;
}

function sameExtent(a: BBox, b: BBox): boolean {
  return (
    Math.abs(a.x - b.x) <= RULE_EXTENT_TOLERANCE_PT &&
    Math.abs(a.x + a.width - (b.x + b.width)) <= RULE_EXTENT_TOLERANCE_PT
  );
}

function unionOf(boxes: readonly BBox[]): BBox {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function isFiniteBox(box: BBox): boolean {
  return (
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    Number.isFinite(box.width) &&
    Number.isFinite(box.height) &&
    box.width >= 0 &&
    box.height >= 0
  );
}
