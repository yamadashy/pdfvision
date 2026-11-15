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
 * bottom.
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
  items.sort(compareLayoutBlocks);

  const stands = new Set(unitOf.keys());
  const ordered = reorderForColumns(items, pageWidth, pageHeight, stands);
  const merged = ordered !== items ? mergeAdjacentColumnBlocks(ordered, pageWidth, stands) : ordered;
  return merged.flatMap((item) => {
    const unit = unitOf.get(item);
    return unit ? orderUnit(unit, regions) : [item];
  });
}

function orderUnit(unit: LayoutRegion, regions: readonly LayoutRegion[]): LayoutBlock[] {
  const members = [...unit.blocks].sort(compareLayoutBlocks);
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
 * reading by rows would list every value before any category.
 */
function readByStacks(blocks: readonly LayoutBlock[]): LayoutBlock[] {
  const stacks: { left: number; right: number; blocks: LayoutBlock[] }[] = [];
  for (const block of [...blocks].sort((a, b) => a.x - b.x)) {
    const stack = stacks.find((s) => block.x < s.right && block.x + block.width > s.left);
    if (stack) {
      stack.blocks.push(block);
      stack.left = Math.min(stack.left, block.x);
      stack.right = Math.max(stack.right, block.x + block.width);
    } else {
      stacks.push({ left: block.x, right: block.x + block.width, blocks: [block] });
    }
  }
  return stacks.sort((a, b) => a.left - b.left).flatMap((stack) => stack.blocks.sort((a, b) => a.y - b.y));
}
