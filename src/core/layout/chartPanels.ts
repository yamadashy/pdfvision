import type { LayoutChart, LayoutTable, TextSpan } from '../../types/index.js';
import type { ChartMarks } from '../graphics/chartMarks.js';
import type { VectorShapeSet } from '../graphics/vectorShapes.js';
import { type BBox, unionBox } from './geometry.js';

/** A legend needs this many named entries inside one frame to mark it as a chart's panel. */
const MIN_LEGEND_ENTRIES = 2;
/** A frame is a panel only when it is well larger than the chart mark it holds. */
const PANEL_AREA_RATIO = 2;
/** A frame drawn tight round a legend is the legend's box; a chart's panel holds the plot too. */
const LEGEND_PANEL_AREA_RATIO = 3;
const MIN_FRAME_WIDTH = 40;
const MIN_FRAME_HEIGHT = 30;
/** Frames this close are drawn as one piece (the cells of a table grid). */
const TOUCH_PT = 1;
const MAX_FRAMES = 400;

/**
 * The drawn frames a slide or a dashboard sets its parts in. `charts` are
 * the frames that hold a chart: the smallest closed frame round a series
 * line, a pie, a chart whose values were read, or two legend entries and
 * the plot beside them. `others` are the frames beside them, neither inside
 * a chart's panel nor round one (a table's panel, a text box).
 */
export interface Panels {
  charts: BBox[];
  others: BBox[];
}

export function findPanels(
  shapes: VectorShapeSet | undefined,
  marks: ChartMarks | undefined,
  charts: readonly LayoutChart[],
  legendBoxes: readonly BBox[],
): Panels {
  const frames = dedupe(
    (shapes?.shapes ?? []).filter(
      (shape) =>
        shape.subpaths.length === 1 &&
        shape.subpaths[0].closed &&
        shape.width >= MIN_FRAME_WIDTH &&
        shape.height >= MIN_FRAME_HEIGHT,
    ),
  );
  if (frames.length === 0) return { charts: [], others: [] };
  const found = new Set<BBox>();
  const evidence: BBox[] = [...(marks?.lines ?? []), ...(marks?.pies ?? []), ...charts];
  for (const mark of evidence) {
    const frame = smallestFrame(mark, frames, PANEL_AREA_RATIO);
    if (frame) found.add(frame);
  }
  if (legendBoxes.length >= MIN_LEGEND_ENTRIES) {
    const legendPanels = frames.filter((frame) => {
      const inside = legendBoxes.filter((box) => containsBox(frame, box));
      if (inside.length < MIN_LEGEND_ENTRIES) return false;
      const legend = unionBox(inside);
      return frame.width * frame.height >= legend.width * legend.height * LEGEND_PANEL_AREA_RATIO;
    });
    // The innermost frame round a legend is its chart's panel, not the slide round it.
    for (const frame of legendPanels) {
      if (!legendPanels.some((other) => other !== frame && containsBox(frame, other))) found.add(frame);
    }
  }
  const chartPanels = [...found];
  if (chartPanels.length === 0) return { charts: [], others: [] };
  const beside = frames.filter(
    (frame) =>
      !chartPanels.includes(frame) &&
      !chartPanels.some((panel) => containsBox(panel, frame) || containsBox(frame, panel)),
  );
  // A page of hundreds of frames is a drawing or a form grid, not a few panels set side by side.
  if (beside.length > MAX_FRAMES) return { charts: chartPanels, others: [] };
  // Frames that touch are one panel (the cells of a drawn table grid), and a frame
  // inside another one (a highlight round one column of a table) is part of it.
  const merged = touchingGroups(beside).filter((box) => !chartPanels.some((panel) => overlaps(panel, box)));
  const others = merged.filter((box) => !merged.some((other) => other !== box && containsBox(other, box)));
  return { charts: chartPanels, others };
}

/**
 * Layout tables whose cells fall in two drawn panels, at least one of them
 * a chart's, fused the labels of neighbouring charts (or of a chart and the
 * table beside it) into rows. Such a table is read again panel by panel:
 * `read` rebuilds the tables of one panel's text as if it stood alone. A
 * table inside one panel, or beside a chart without a frame of its own, is
 * left as it is.
 */
export function splitTablesAtChartPanels(
  tables: LayoutTable[] | undefined,
  panels: Panels,
  spans: readonly TextSpan[],
  read: (spans: TextSpan[]) => LayoutTable[] | undefined,
): LayoutTable[] | undefined {
  if (!tables || panels.charts.length === 0) return tables;
  const zonesOf = new Map<LayoutTable, Set<BBox | undefined>>();
  for (const table of tables) {
    const zones = new Set<BBox | undefined>();
    for (const row of table.rows) for (const cell of row.cells) zones.add(zoneOf(cell, panels));
    const framed = [...zones].filter((zone) => zone !== undefined);
    if (table.rotation === undefined && framed.length >= 2 && framed.some((zone) => panels.charts.includes(zone))) {
      zonesOf.set(table, zones);
    }
  }
  if (zonesOf.size === 0) return tables;
  // A chart's panel, and the page outside every panel, are read again only where the fused
  // table was: the rest of a chart's text is its labels, not a table. Any other panel the
  // table reached (a table's own frame) is read whole, once.
  const panelsRead = new Set<BBox>();
  const piecesOf = new Map<LayoutTable, LayoutTable[]>();
  for (const [table, zones] of zonesOf) {
    const pieces: LayoutTable[] = [];
    for (const zone of zones) {
      if (zone === undefined || panels.charts.includes(zone)) {
        pieces.push(
          ...(read(spans.filter((span) => contains(table, centreOf(span)) && zoneOf(span, panels) === zone)) ?? []),
        );
      } else if (!panelsRead.has(zone)) {
        panelsRead.add(zone);
        pieces.push(...(read(spans.filter((span) => zoneOf(span, panels) === zone)) ?? []));
      }
    }
    piecesOf.set(
      table,
      pieces.sort((a, b) => a.y - b.y || a.x - b.x),
    );
  }
  // Each fused table gives way to its pieces where it stood. A table already read inside a
  // panel that was read again is replaced by that reading.
  return tables.flatMap((table) => {
    const pieces = piecesOf.get(table);
    if (pieces) return pieces;
    const replaced = table.rows.every((row) => row.cells.every((cell) => panelsRead.has(zoneOf(cell, panels) as BBox)));
    return replaced ? [] : [table];
  });
}

/** The chart panel round a box, else the other panel round it, else none. */
function zoneOf(box: BBox, panels: Panels): BBox | undefined {
  const c = centreOf(box);
  return smallestHolding(c, panels.charts) ?? smallestHolding(c, panels.others);
}

function smallestHolding(p: { x: number; y: number }, frames: readonly BBox[]): BBox | undefined {
  let best: BBox | undefined;
  for (const frame of frames) {
    if (!contains(frame, p)) continue;
    if (!best || frame.width * frame.height < best.width * best.height) best = frame;
  }
  return best;
}

function smallestFrame(mark: BBox, frames: readonly BBox[], ratio: number): BBox | undefined {
  let best: BBox | undefined;
  for (const frame of frames) {
    if (frame.width * frame.height < mark.width * mark.height * ratio || !containsBox(frame, mark)) continue;
    if (!best || frame.width * frame.height < best.width * best.height) best = frame;
  }
  return best;
}

function containsBox(outer: BBox, inner: BBox): boolean {
  return (
    inner.x >= outer.x - 1 &&
    inner.y >= outer.y - 1 &&
    inner.x + inner.width <= outer.x + outer.width + 1 &&
    inner.y + inner.height <= outer.y + outer.height + 1
  );
}

/** A filled frame and its stroked outline are drawn as two paths over one box. */
function dedupe(frames: readonly BBox[]): BBox[] {
  const unique: BBox[] = [];
  for (const frame of frames) {
    if (!unique.some((other) => sameBox(other, frame))) unique.push(frame);
  }
  return unique;
}

/** Frames grouped while they touch or overlap, each group as its bounding box. */
function touchingGroups(frames: readonly BBox[]): BBox[] {
  const groups: BBox[] = [...frames];
  // Merging grows a box, which may then reach a group it did not before: repeat until none do.
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < groups.length; i++) {
      for (let j = groups.length - 1; j > i; j--) {
        if (!touches(groups[i], groups[j])) continue;
        groups[i] = unionBox([groups[i], groups[j]]);
        groups.splice(j, 1);
        changed = true;
      }
    }
  }
  return groups;
}

function touches(a: BBox, b: BBox): boolean {
  return (
    a.x <= b.x + b.width + TOUCH_PT &&
    b.x <= a.x + a.width + TOUCH_PT &&
    a.y <= b.y + b.height + TOUCH_PT &&
    b.y <= a.y + a.height + TOUCH_PT
  );
}

function overlaps(a: BBox, b: BBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function sameBox(a: BBox, b: BBox): boolean {
  return (
    Math.abs(a.x - b.x) <= 1 &&
    Math.abs(a.y - b.y) <= 1 &&
    Math.abs(a.width - b.width) <= 1 &&
    Math.abs(a.height - b.height) <= 1
  );
}

function centreOf(box: BBox): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function contains(box: BBox, p: { x: number; y: number }): boolean {
  return p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height;
}
