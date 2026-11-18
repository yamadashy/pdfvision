import type { TextSpan } from '../../types/index.js';
import { isBlankFill, isFilledDot } from './shapeKinds.js';
import type { VectorShape, VectorShapeSet } from './vectorShapes.js';

/**
 * Text drawn as glyph outlines: a package drawing's dimensions, a chart
 * exported with "text to outlines", a CAD title block. Each glyph is a
 * small filled path of curves, and glyphs stand in rows on one baseline,
 * set as close as letters are. A region holding several such rows and no
 * text layer has words and values only the render shows.
 *
 * A row of three glyphs or more is a run; a region needs several runs,
 * so a logo or a wordmark (one run, maybe a tagline) is not reported. Dots,
 * rating stars and other polygon icons are not glyphs: a glyph outline
 * has curves (or, for straight-sided letters, sits in a run with curved ones).
 */

const GLYPH_MIN_HEIGHT_PT = 2.5;
const GLYPH_MAX_HEIGHT_PT = 24;
const RUN_MIN_GLYPHS = 3;
const PATTERN_MIN_REPEATS = 5;
/** Glyphs of one word sit at most this many glyph heights apart. */
const RUN_GAP = 0.7;
const REGION_MIN_RUNS = 4;
const REGION_MIN_GLYPHS = 12;
/** Runs of one drawing lie within this many glyph heights of each other. */
const REGION_GAP = 12;
const MAX_GLYPHS = 4000;

export interface OutlinedTextRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  glyphs: number;
  runs: number;
}

interface Glyph {
  x: number;
  y: number;
  width: number;
  height: number;
  curved: boolean;
}

export function findOutlinedText(
  set: VectorShapeSet | undefined,
  spans: readonly TextSpan[],
  page?: { width: number; height: number },
): OutlinedTextRegion[] {
  if (!set || set.shapes.length === 0) return [];
  const glyphs: Glyph[] = [];
  for (const shape of set.shapes) {
    for (const glyph of glyphsOf(shape)) {
      // Paths painted off the page are not seen.
      const cx = glyph.x + glyph.width / 2;
      const cy = glyph.y + glyph.height / 2;
      if (page && (cx < 0 || cy < 0 || cx > page.width || cy > page.height)) continue;
      glyphs.push(glyph);
    }
    if (glyphs.length > MAX_GLYPHS) return [];
  }
  if (glyphs.length < REGION_MIN_GLYPHS) return [];
  const isRun = (run: Glyph[]) =>
    run.length >= RUN_MIN_GLYPHS && run.filter((glyph) => glyph.curved).length * 2 >= run.length && !isPattern(run);
  const runs = runsOf(glyphs).filter(isRun);
  // A label turned a quarter turn (a vertical dimension) runs up the page: read it with x and y swapped.
  const inRuns = new Set(runs.flat());
  const turned = runsOf(glyphs.filter((glyph) => !inRuns.has(glyph)).map(transpose))
    .filter(isRun)
    .map((run) => run.map(transpose));
  runs.push(...turned);
  if (runs.length < REGION_MIN_RUNS) return [];
  const regions: OutlinedTextRegion[] = [];
  for (const group of groupRuns(runs)) {
    const count = group.reduce((sum, run) => sum + run.length, 0);
    if (group.length < REGION_MIN_RUNS || count < REGION_MIN_GLYPHS) continue;
    const all = group.flat();
    const x = Math.min(...all.map((g) => g.x));
    const y = Math.min(...all.map((g) => g.y));
    const box = {
      x,
      y,
      width: Math.max(...all.map((g) => g.x + g.width)) - x,
      height: Math.max(...all.map((g) => g.y + g.height)) - y,
    };
    // Outlines under a text layer (a searchable logo, a drawn heading with its text behind it) are read.
    const covered = all.filter((glyph) => spans.some((span) => overlaps(span, glyph))).length;
    if (covered > all.length * 0.2) continue;
    regions.push({ ...box, glyphs: count, runs: group.length });
  }
  return regions;
}

/** A filled outline the size of a letter; a path with several letters is split into its outer contours. */
function glyphsOf(shape: VectorShape): Glyph[] {
  if (shape.fill === undefined || isBlankFill(shape.fill) || shape.stroke !== undefined) return [];
  if (Math.min(shape.height, shape.width) > GLYPH_MAX_HEIGHT_PT * 1.5) return [];
  if (Math.max(shape.height, shape.width) > GLYPH_MAX_HEIGHT_PT * 30) return [];
  if (isFilledDot(shape)) return [];
  const boxes = shape.subpaths.map((subpath) => boundsOf(subpath.points));
  const outer = boxes.filter((box, i) => !boxes.some((other, j) => j !== i && containsBox(other, box)));
  const curved = shape.curves > 0;
  return outer
    .filter((box) => letterSized(box.height, box.width) || letterSized(box.width, box.height))
    .map((box) => ({ ...box, curved }));
}

/**
 * A long row of one shape repeated (a breadboard's holes, a dot grid, a
 * pin header) is a pattern, not a word: words mix letters of different
 * widths. A short run of one shape (\`000\`) can still be text.
 */
function isPattern(run: readonly Glyph[]): boolean {
  if (run.length < PATTERN_MIN_REPEATS) return false;
  const same = (values: number[]) => Math.max(...values) <= Math.min(...values) * 1.05 + 0.05;
  return same(run.map((glyph) => glyph.width)) && same(run.map((glyph) => glyph.height));
}

/** A letter's box, upright (`size` its height) or turned a quarter turn. */
function letterSized(size: number, across: number): boolean {
  return size >= GLYPH_MIN_HEIGHT_PT && size <= GLYPH_MAX_HEIGHT_PT && across > 0.15 && across <= size * 1.6;
}

function transpose(glyph: Glyph): Glyph {
  return { x: glyph.y, y: glyph.x, width: glyph.height, height: glyph.width, curved: glyph.curved };
}

function boundsOf(points: readonly number[]) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i + 1 < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Glyphs on one baseline, each within a fraction of its height of the
 * last. Rotated labels (a vertical dimension) stand in a column instead;
 * they are read as runs of their own along y.
 */
function runsOf(glyphs: readonly Glyph[]): Glyph[][] {
  const runs: Glyph[][] = [];
  const sorted = [...glyphs].sort((a, b) => a.x - b.x);
  const open: Array<{ run: Glyph[]; bottom: number; right: number; size: number }> = [];
  for (const glyph of sorted) {
    const bottom = glyph.y + glyph.height;
    const target = open.find(
      (item) =>
        Math.abs(item.bottom - bottom) <= Math.max(0.6, item.size * 0.2) &&
        glyph.x - item.right <= item.size * RUN_GAP &&
        glyph.x - item.right >= -item.size * 0.2 &&
        glyph.height <= item.size * 2.2 &&
        glyph.height >= item.size / 2.2,
    );
    if (target) {
      target.run.push(glyph);
      target.right = Math.max(target.right, glyph.x + glyph.width);
      target.size = Math.max(target.size, glyph.height);
    } else {
      const item = { run: [glyph], bottom, right: glyph.x + glyph.width, size: glyph.height };
      open.push(item);
      runs.push(item.run);
    }
  }
  return runs;
}

function groupRuns(runs: readonly Glyph[][]): Glyph[][][] {
  const boxes = runs.map((run) => {
    const x = Math.min(...run.map((g) => g.x));
    const y = Math.min(...run.map((g) => g.y));
    const size = Math.max(...run.map((g) => g.height));
    return {
      x,
      y,
      right: Math.max(...run.map((g) => g.x + g.width)),
      bottom: Math.max(...run.map((g) => g.y + g.height)),
      size,
    };
  });
  const parent = runs.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    parent[i] = root;
    return root;
  };
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const reach = Math.max(a.size, b.size) * REGION_GAP;
      const dx = Math.max(0, b.x - a.right, a.x - b.right);
      const dy = Math.max(0, b.y - a.bottom, a.y - b.bottom);
      if (dx <= reach && dy <= reach) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, Glyph[][]>();
  runs.forEach((run, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), run]);
  });
  return [...groups.values()];
}

function containsBox(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height &&
    (inner.width < outer.width || inner.height < outer.height)
  );
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
