import type { LayoutBlock } from '../../types/index.js';
import type { BBox } from './geometry.js';
import { type Candidate, clusterBoxes, isFiniteBox, MIN_FIGURE_GRAPHICS, ruleBands } from './regionCandidates.js';

/** Painted geometry the layout pass can use as evidence of page structure. */
export interface LayoutGraphics {
  vectorBoxes?: readonly BBox[];
  imageBoxes?: readonly BBox[];
}

/**
 * A part of the page that the drawing itself sets apart from the text
 * flow: a framed or tinted box, a band between matching horizontal rules
 * (a pull quote, a ruled table), or a figure made of vector paths with its
 * text labels. Its blocks are read together, wherever the region falls in
 * the reading order.
 *
 * - `frame`: the region holds prose; its blocks keep the page's own
 *   reading-order rules inside the region.
 * - `figure`: the region holds only short labels (chart values, axis
 *   ticks, legend entries, table cells); they are read top to bottom.
 */
export interface LayoutRegion extends BBox {
  kind: 'frame' | 'figure';
  blocks: LayoutBlock[];
  /** Number of painted boxes the region was built from. */
  graphicCount: number;
  /** Painted boxes inside the region that hold no text: bars, plot marks. */
  marks: number;
  /** Most marks are taller than wide (a vertical bar chart): its labels
   *  stack above and below their bars and read best bar by bar. */
  verticalMarks: boolean;
  /** At least three marks share a width (or a height) but differ in the
   *  other dimension: bars of a bar chart, not icons or callout circles. */
  bars: boolean;
}

/** Pages with more painted boxes than this are maps or dense diagrams;
 *  their boxes say nothing reliable about text structure, and pairing
 *  them would cost more than the layout pass itself. */
const MAX_GRAPHIC_BOXES = 4000;
const MIN_REGION_WIDTH_PT = 20;
const MIN_REGION_HEIGHT_PT = 10;
const MAX_REGION_AREA_RATIO = 0.5;
const CONTAIN_TOLERANCE_PT = 2;
/** A prose block this much inside a candidate, yet not contained by it,
 *  means the box does not partition the text (a highlight, a background
 *  plate under part of a column). */
const STRADDLE_AREA_RATIO = 0.3;
/** Labels hug the figure they belong to: axis ticks and category names
 *  sit within a few points of the plot frame, a value label within about
 *  its own size above its bar. Body text runs around a figure with a wider
 *  standoff. */
const LABEL_ABSORB_GAP_PT = 8;
const LABEL_ABSORB_GAP_EM = 0.8;
const LABEL_ABSORB_ROUNDS = 4;
const LABEL_MAX_LINES = 2;
const LABEL_MAX_CHARS = 40;
const MARK_MIN_SIZE_PT = 2;
const MAX_MARK_AREA_RATIO = 0.25;
const VERTICAL_MARK_SHARE = 2 / 3;
const MIN_BARS = 3;
const MAX_BAR_SHARE = 0.2;
const BAR_SIZE_TOLERANCE_PT = 1;

export function isLabelLikeBlock(block: LayoutBlock): boolean {
  if (block.lines.length > LABEL_MAX_LINES) return false;
  return block.text.replace(/\s+/gu, '').length <= LABEL_MAX_CHARS;
}

/**
 * Regions of the page that painted geometry sets apart, each with the
 * text blocks it holds. Regions never share a block; where candidates
 * nest, every candidate is returned so callers can order nested regions
 * inside their parent — see {@link outermostRegions}.
 */
export function detectLayoutRegions(
  blocks: readonly LayoutBlock[],
  graphics: LayoutGraphics | undefined,
  pageWidth: number,
  pageHeight: number,
): LayoutRegion[] {
  if (!graphics || pageWidth <= 0 || pageHeight <= 0) return [];
  const vectors = (graphics.vectorBoxes ?? []).filter(isFiniteBox);
  const images = (graphics.imageBoxes ?? []).filter(isFiniteBox);
  if (vectors.length + images.length === 0 || vectors.length + images.length > MAX_GRAPHIC_BOXES) return [];
  const textBlocks = blocks.filter((block) => block.writingMode !== 'vertical' && block.lines.length > 0);
  if (textBlocks.length < 2) return [];

  const candidates: Candidate[] = [
    ...vectors.map((box) => ({ box, parts: [box], graphicCount: 1, drawing: false })),
    ...images.map((box) => ({ box, parts: [box], graphicCount: 1, drawing: true })),
    ...clusterBoxes([...vectors, ...images]).filter((c) => c.graphicCount > 1),
    ...ruleBands(vectors, pageHeight),
  ];
  const pageArea = pageWidth * pageHeight;
  const regions: LayoutRegion[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const region = evaluateCandidate(candidate, textBlocks, pageArea);
    if (!region) continue;
    const key = region.blocks
      .map((block) => textBlocks.indexOf(block))
      .sort((a, b) => a - b)
      .join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    regions.push(region);
  }
  return regions;
}

/**
 * The regions not inside another one, largest first. A region whose blocks
 * only partly overlap a larger one is dropped: two boxes that cut the same
 * text differently give no single grouping to trust.
 */
export function outermostRegions(regions: readonly LayoutRegion[], pool: ReadonlySet<LayoutBlock>): LayoutRegion[] {
  const sorted = regions
    .filter((region) => region.blocks.every((block) => pool.has(block)) && region.blocks.length < pool.size)
    .sort((a, b) => b.blocks.length - a.blocks.length || b.width * b.height - a.width * a.height);
  const taken = new Set<LayoutBlock>();
  const out: LayoutRegion[] = [];
  for (const region of sorted) {
    if (region.blocks.some((block) => taken.has(block))) continue;
    for (const block of region.blocks) taken.add(block);
    out.push(region);
  }
  return out;
}

function evaluateCandidate(
  candidate: Candidate,
  blocks: readonly LayoutBlock[],
  pageArea: number,
): LayoutRegion | undefined {
  const { box } = candidate;
  if (box.width < MIN_REGION_WIDTH_PT || box.height < MIN_REGION_HEIGHT_PT) return undefined;
  if (box.width * box.height > pageArea * MAX_REGION_AREA_RATIO) return undefined;
  const members: LayoutBlock[] = [];
  for (const block of blocks) {
    if (contains(box, block)) {
      members.push(block);
      continue;
    }
    const overlap = intersectionArea(box, block);
    if (overlap <= 0) continue;
    const blockArea = Math.max(block.width * block.height, 1);
    if (overlap < blockArea * STRADDLE_AREA_RATIO) continue;
    // A label on the frame's edge (a legend over the plot border) belongs
    // to it; prose across the edge means the box does not enclose text.
    if (!isLabelLikeBlock(block)) return undefined;
    members.push(block);
  }
  const prose = members.some((block) => !isLabelLikeBlock(block));
  const region: LayoutRegion = {
    kind: prose ? 'frame' : 'figure',
    ...box,
    blocks: members,
    graphicCount: candidate.graphicCount,
    marks: 0,
    verticalMarks: false,
    bars: false,
  };
  if (!prose && candidate.drawing) absorbLabels(region, blocks);
  if (region.blocks.length < 2) return undefined;
  if (region.width * region.height > pageArea * MAX_REGION_AREA_RATIO) return undefined;
  const marks = textFreeMarks(region, candidate.parts);
  region.marks = marks.length;
  region.verticalMarks =
    marks.length >= MIN_FIGURE_GRAPHICS - 1 &&
    marks.filter((mark) => mark.height > mark.width).length >= marks.length * VERTICAL_MARK_SHARE;
  region.bars = hasBars(marks, 'width', 'height', region.width) || hasBars(marks, 'height', 'width', region.height);
  return region;
}

function hasBars(
  marks: readonly BBox[],
  shared: 'width' | 'height',
  varying: 'width' | 'height',
  span: number,
): boolean {
  // A bar is narrow across the plot; a band as wide as the figure is a
  // table row shading or a panel, not a bar.
  const sorted = marks.filter((mark) => mark[shared] <= span * MAX_BAR_SHARE).sort((a, b) => a[shared] - b[shared]);
  for (let i = 0; i + MIN_BARS - 1 < sorted.length; i++) {
    const group = sorted.filter((mark) => Math.abs(mark[shared] - sorted[i][shared]) <= BAR_SIZE_TOLERANCE_PT);
    if (group.length < MIN_BARS) continue;
    const lengths = group.map((mark) => mark[varying]);
    if (Math.max(...lengths) - Math.min(...lengths) > BAR_SIZE_TOLERANCE_PT * 2) return true;
  }
  return false;
}

/** Pull in the short labels just outside a figure: axis ticks, category
 *  names, a legend line, each within a few points of the drawing or of a
 *  label already pulled in. */
function absorbLabels(region: LayoutRegion, blocks: readonly LayoutBlock[]): void {
  const members = new Set(region.blocks);
  for (let round = 0; round < LABEL_ABSORB_ROUNDS; round++) {
    let grew = false;
    for (const block of blocks) {
      if (members.has(block) || !isLabelLikeBlock(block)) continue;
      const fontSize = block.lines[0]?.fontSize ?? 0;
      if (!hugs(region, block, Math.max(LABEL_ABSORB_GAP_PT, fontSize * LABEL_ABSORB_GAP_EM))) continue;
      members.add(block);
      region.blocks.push(block);
      const right = Math.max(region.x + region.width, block.x + block.width);
      const bottom = Math.max(region.y + region.height, block.y + block.height);
      region.x = Math.min(region.x, block.x);
      region.y = Math.min(region.y, block.y);
      region.width = right - region.x;
      region.height = bottom - region.y;
      grew = true;
    }
    if (!grew) return;
  }
}

function textFreeMarks(region: LayoutRegion, parts: readonly BBox[]): BBox[] {
  const regionArea = Math.max(region.width * region.height, 1);
  return parts.filter(
    (part) =>
      part.width >= MARK_MIN_SIZE_PT &&
      part.height >= MARK_MIN_SIZE_PT &&
      part.width * part.height <= regionArea * MAX_MARK_AREA_RATIO &&
      !region.blocks.some((block) => containsPoint(part, block.x + block.width / 2, block.y + block.height / 2)),
  );
}

function containsPoint(box: BBox, x: number, y: number): boolean {
  return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
}

function hugs(region: BBox, block: BBox, gap: number): boolean {
  const dx = Math.max(0, block.x - (region.x + region.width), region.x - (block.x + block.width));
  const dy = Math.max(0, block.y - (region.y + region.height), region.y - (block.y + block.height));
  return (dx === 0 && dy <= gap) || (dy === 0 && dx <= gap);
}

function contains(outer: BBox, inner: BBox): boolean {
  return (
    inner.x >= outer.x - CONTAIN_TOLERANCE_PT &&
    inner.y >= outer.y - CONTAIN_TOLERANCE_PT &&
    inner.x + inner.width <= outer.x + outer.width + CONTAIN_TOLERANCE_PT &&
    inner.y + inner.height <= outer.y + outer.height + CONTAIN_TOLERANCE_PT
  );
}

function intersectionArea(a: BBox, b: BBox): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
