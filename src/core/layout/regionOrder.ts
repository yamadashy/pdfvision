import type { LayoutBlock } from '../../types/index.js';
import { mergeAdjacentColumnBlocks, reorderForColumns } from './columns.js';
import { type LayoutRegion, outermostRegions } from './regions.js';
import { compareLayoutBlocks } from './verticalText.js';

/**
 * Put `blocks` (in top-down order) into reading order, reading each
 * outermost {@link LayoutRegion} as one unit.
 *
 * A region stands in for its blocks while the page is ordered: a framed
 * warning is placed where the frame is, so its body cannot drift away
 * from its heading; a sidebar or pull quote inside a column is one item
 * of that column rather than a run of short blocks that the column pass
 * would scatter or treat as separators; a chart's labels travel together
 * instead of joining whichever column their x happens to match. The
 * unit's own blocks are then ordered inside it: a `frame` by the same
 * rules as the page (with any regions nested in it), a `figure` top to
 * bottom, `rows` (each row already one line) top to bottom.
 */
export function orderLayoutBlocks(
  blocks: LayoutBlock[],
  regions: readonly LayoutRegion[],
  pageWidth: number,
  pageHeight: number,
): LayoutBlock[] {
  const units = regions.length > 0 ? outermostRegions(regions, new Set(blocks)) : [];
  if (units.length === 0) {
    const ordered = reorderForColumns(blocks, pageWidth, pageHeight);
    return ordered !== blocks ? mergeAdjacentColumnBlocks(ordered, pageWidth) : ordered;
  }

  const members = new Set(units.flatMap((unit) => unit.blocks));
  const unitOf = new Map<LayoutBlock, LayoutRegion>();
  const items = blocks.filter((block) => !members.has(block));
  for (const unit of units) {
    const ordered = [...unit.blocks].sort(compareLayoutBlocks);
    // The unit starts where its text starts, so it clusters into the column
    // its text belongs to; it reaches as far right as its frame, which is
    // what says whether it spans the columns. Down the page it sits where its
    // text does, so a step number beside a framed step still reads first.
    const left = Math.min(...ordered.map((block) => block.x));
    const right = Math.max(unit.x + unit.width, ...ordered.map((block) => block.x + block.width));
    const top = Math.min(...ordered.map((block) => block.y));
    const bottom = Math.max(...ordered.map((block) => block.y + block.height));
    const stand: LayoutBlock = {
      text: ordered.map((block) => block.text).join('\n'),
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      lines: ordered.flatMap((block) => block.lines),
    };
    unitOf.set(stand, unit);
    items.push(stand);
  }
  sortOnBaselines(items);

  const stands = new Set(unitOf.keys());
  const ordered = reorderForColumns(items, pageWidth, pageHeight, stands);
  const merged = ordered !== items ? mergeAdjacentColumnBlocks(ordered, pageWidth, stands) : ordered;
  return merged.flatMap((item) => {
    const unit = unitOf.get(item);
    return unit ? orderUnit(unit, regions) : [item];
  });
}

/**
 * Top to bottom, and one-line items set on one baseline left to right:
 * by top edge alone, a cell drawn half a point higher (its font sits a
 * little differently) comes before the label to its left. Needed once
 * rows are read as units, which leaves such a row's label and options
 * as items of the page without a column pass to put them back in order.
 */
function sortOnBaselines(items: LayoutBlock[]): void {
  items.sort(compareLayoutBlocks);
  let start = 0;
  for (let i = 1; i <= items.length; i++) {
    if (i < items.length && isOneLine(items[i]) && isOneLine(items[start]) && sharesBaseline(items[start], items[i]))
      continue;
    const group = items.slice(start, i).sort((a, b) => a.x - b.x);
    items.splice(start, group.length, ...group);
    start = i;
  }
}

function isOneLine(block: LayoutBlock): boolean {
  return block.writingMode === undefined && block.lines.length === 1;
}

/**
 * Set on one baseline in one size: top and bottom within a fraction of a
 * point. Items a point or more apart (a page number beside a footer line)
 * keep their top-down order, which later passes rely on.
 */
function sharesBaseline(a: LayoutBlock, b: LayoutBlock): boolean {
  const tolerance = Math.max(BASELINE_MIN_TOLERANCE_PT, Math.min(a.height, b.height) * BASELINE_TOLERANCE);
  return Math.abs(a.y - b.y) <= tolerance && Math.abs(a.y + a.height - (b.y + b.height)) <= tolerance;
}

const BASELINE_TOLERANCE = 0.08;
const BASELINE_MIN_TOLERANCE_PT = 0.6;

function orderUnit(unit: LayoutRegion, regions: readonly LayoutRegion[]): LayoutBlock[] {
  const members = [...unit.blocks].sort(compareLayoutBlocks);
  if (unit.kind === 'rows') return members;
  const inner = regions.filter((region) => region !== unit);
  // A panel holding several charts is read chart by chart, not row by row
  // across all of them.
  const panels = unit.kind === 'figure' ? outermostRegions(inner, new Set(members)) : [];
  if (unit.kind === 'figure' && panels.length < 2) {
    return unit.verticalMarks ? readByStacks(members) : readByRows(members);
  }
  // A grid of label panels with labels outside them too (a form row above or
  // below the boxed rows) is read row by row, each panel as one item; panels
  // of prose keep the page's column rules.
  const inPanels = new Set(panels.flatMap((panel) => panel.blocks));
  if (
    unit.kind === 'figure' &&
    panels.every((panel) => panel.kind === 'figure') &&
    members.some((block) => !inPanels.has(block))
  ) {
    return readPanelsByRows(members, panels, inner);
  }
  // Bottom-note detection reads page geometry, which a unit does not have.
  // Lines of a box written alternately with the text beside it reach the
  // layout pass as one-line blocks; inside the box they are one paragraph.
  // Inside a frame every block is the frame's own text, so the page-wide
  // width guard on merging does not apply.
  return mergeAdjacentColumnBlocks(orderLayoutBlocks(members, inner, unit.width, 0), 0);
}

function readPanelsByRows(
  members: readonly LayoutBlock[],
  panels: readonly LayoutRegion[],
  regions: readonly LayoutRegion[],
): LayoutBlock[] {
  const inPanel = new Set(panels.flatMap((panel) => panel.blocks));
  const panelOf = new Map<LayoutBlock, LayoutRegion>();
  const items = members.filter((block) => !inPanel.has(block));
  for (const panel of panels) {
    const stand: LayoutBlock = {
      text: '',
      x: panel.x,
      y: panel.y,
      width: panel.width,
      height: panel.height,
      lines: [],
    };
    panelOf.set(stand, panel);
    items.push(stand);
  }
  return readByRows(items).flatMap((item) => {
    const panel = panelOf.get(item);
    return panel ? orderUnit(panel, regions) : [item];
  });
}

/**
 * Labels row by row, each row left to right. Blocks on one row share most
 * of their height; sorting by top edge alone would read a cell with a
 * superscript before the row's first cell.
 */
function readByRows(blocks: readonly LayoutBlock[]): LayoutBlock[] {
  const rows: { bottom: number; top: number; blocks: LayoutBlock[] }[] = [];
  for (const block of [...blocks].sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2))) {
    const row = rows[rows.length - 1];
    const center = block.y + block.height / 2;
    if (row && center >= row.top && center <= row.bottom) {
      row.blocks.push(block);
      row.top = Math.min(row.top, block.y);
      row.bottom = Math.max(row.bottom, block.y + block.height);
    } else {
      rows.push({ top: block.y, bottom: block.y + block.height, blocks: [block] });
    }
  }
  return rows.flatMap((row) => row.blocks.sort((a, b) => a.x - b.x));
}

/**
 * Labels stack by stack, left to right, each stack top to bottom. Over a
 * vertical bar chart a value sits above its bar and the category below it;
 * reading by rows would list every value before any category. Stacks are
 * built from the narrowest labels first. A label over two stacks (a group's
 * category under its pair of bars) joins them into one; a label across
 * more (the chart's title, an axis title) belongs to none, and is read
 * before the stacks when it sits above them, after them otherwise.
 */
function readByStacks(blocks: readonly LayoutBlock[]): LayoutBlock[] {
  type Stack = { left: number; right: number; top: number; blocks: LayoutBlock[] };
  let stacks: Stack[] = [];
  const across: LayoutBlock[] = [];
  const overlapping = (block: LayoutBlock) =>
    stacks.filter((stack) => block.x < stack.right && block.x + block.width > stack.left);
  const pending: LayoutBlock[] = [];
  for (const block of [...blocks].sort((a, b) => a.width - b.width || a.x - b.x)) {
    const hits = overlapping(block);
    if (hits.length > 1) pending.push(block);
    else if (hits[0]) addTo(hits[0], block);
    else stacks.push({ left: block.x, right: block.x + block.width, top: block.y, blocks: [block] });
  }
  for (const block of pending) {
    const hits = overlapping(block);
    if (hits.length > MAX_JOINED_STACKS) {
      across.push(block);
      continue;
    }
    const joined: Stack = { left: block.x, right: block.x + block.width, top: block.y, blocks: [block] };
    for (const hit of hits) for (const member of hit.blocks) addTo(joined, member);
    stacks = [...stacks.filter((stack) => !hits.includes(stack)), joined];
  }
  const stacksTop = Math.min(...stacks.map((stack) => stack.top));
  const byY = (a: LayoutBlock, b: LayoutBlock) => a.y - b.y || a.x - b.x;
  const before = across.filter((block) => block.y + block.height <= stacksTop).sort(byY);
  const after = across.filter((block) => block.y + block.height > stacksTop).sort(byY);
  return [...before, ...stacks.sort((a, b) => a.left - b.left).flatMap((stack) => stack.blocks.sort(byY)), ...after];
}

/** A label over this many stacks is a group's category; over more, it spans the chart. */
const MAX_JOINED_STACKS = 2;

function addTo(stack: { left: number; right: number; top: number; blocks: LayoutBlock[] }, block: LayoutBlock): void {
  stack.blocks.push(block);
  stack.left = Math.min(stack.left, block.x);
  stack.right = Math.max(stack.right, block.x + block.width);
  stack.top = Math.min(stack.top, block.y);
}
