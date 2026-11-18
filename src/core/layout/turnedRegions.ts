import type { LayoutBlock, LayoutLine, LayoutTable, PageLayout, TextSpan } from '../../types/index.js';
import { type BBox, round2, unionBox } from './geometry.js';
import type { LayoutGraphics } from './regions.js';
import { hasExplicitSpaceBefore, markExplicitSpaceBefore, type QuarterTurn, spanTurn } from './spanMetadata.js';

/**
 * Text drawn turned on an upright page — a LaTeX `sidewaystable`, a word
 * processor's rotated text box, a landscape sheet printed onto a portrait
 * page without `/Rotate`.
 *
 * Every line, block and table pass reasons along horizontal baselines, so
 * turned text read in the page frame comes out transposed: each table
 * column becomes a line, rows read from the far end. A region whose text
 * shares one quarter (or half) turn and has the shape of real content —
 * table rows, or several long lines — is read the way a `/Rotate` page is:
 * its spans are mapped into the page turned upright, laid out there, and
 * the resulting blocks and tables are mapped back, so every bbox stays in
 * the page frame and `rotation` says the region was read turned.
 *
 * Short turned text keeps its current handling: an axis title, a margin
 * stamp, a column of turned tick labels or turned table headers is one
 * span per line with nothing beside it, which never qualifies.
 */

export interface TurnedRegion extends BBox {
  turn: QuarterTurn;
  spans: TextSpan[];
}

// Most of the page's characters set one way: the page is a sideways sheet.
const WHOLE_PAGE_SHARE = 0.6;
const MIN_REGION_CHARS = 40;
const MIN_REGION_LINES = 2;
const MIN_ROW_LINES = 3;
const MIN_LONG_LINES = 2;
const LONG_LINE_CHARS = 25;
const CELL_GAP_EM = 1;
const MIN_ROW_CELL_CHARS = 4;
// Clustering reach in the turned frame: across a table's column gaps, and a
// caption or note a couple of lines away from its table.
const CLUSTER_REACH_ALONG_EM = 8;
const CLUSTER_REACH_ACROSS_EM = 3;
const MAX_CLUSTER_SPANS = 4000;
const MAX_RULE_THICKNESS = 2;
// Turned header cells sit right above or below the upright cells of their column.
const HEADER_NEIGHBOUR_GAP_EM = 1.5;
const HEADER_NEIGHBOUR_MAX_WIDTH_EM = 6;

/**
 * Split `spans` into turned regions and the spans the page reads upright.
 * Returns undefined when the page has no turned region.
 */
export function findTurnedRegions(
  spans: readonly TextSpan[],
  pageWidth: number,
  pageHeight: number,
): { regions: TurnedRegion[]; upright: TextSpan[] } | undefined {
  if (pageWidth <= 0 || pageHeight <= 0) return undefined;
  const byTurn = new Map<QuarterTurn, TextSpan[]>();
  for (const span of spans) {
    const turn = spanTurn(span);
    if (turn === undefined) continue;
    const group = byTurn.get(turn);
    if (group) group.push(span);
    else byTurn.set(turn, [span]);
  }
  if (byTurn.size === 0) return undefined;
  const totalChars = charCount(spans);
  const upright = spans.filter((span) => spanTurn(span) === undefined);
  const regions: TurnedRegion[] = [];
  let bodyLeft = Number.POSITIVE_INFINITY;
  let bodyRight = Number.NEGATIVE_INFINITY;
  for (const span of upright) {
    bodyLeft = Math.min(bodyLeft, span.x);
    bodyRight = Math.max(bodyRight, span.x + span.width);
  }
  for (const [turn, group] of byTurn) {
    if (group.length > MAX_CLUSTER_SPANS) continue;
    const sheet = charCount(group) >= totalChars * WHOLE_PAGE_SHARE;
    // Turned text wholly beside the upright body is a margin stamp or print line, read after the body as before.
    const inMargin = (box: BBox) =>
      !sheet && upright.length > 0 && (box.x + box.width <= bodyLeft || box.x >= bodyRight);
    const content = clusters(group, turn, pageWidth, pageHeight).filter(
      (cluster) => !inMargin(region(turn, cluster)) && isTurnedContent(cluster, turn, upright, pageWidth, pageHeight),
    );
    if (content.length === 0) continue;
    // A page that is mostly one turned sheet keeps its turned running head and folio with it.
    if (sheet) regions.push(region(turn, group));
    else for (const cluster of content) regions.push(region(turn, cluster));
  }
  if (regions.length === 0) return undefined;
  const claimed = new Set(regions.flatMap((r) => r.spans));
  return { regions, upright: spans.filter((span) => !claimed.has(span)) };
}

/** Lay `region` out in its own upright frame with `build`, and map the result back to the page frame. */
export function readTurnedRegion(
  region: TurnedRegion,
  pageWidth: number,
  pageHeight: number,
  graphics: LayoutGraphics | undefined,
  build: (spans: TextSpan[], width: number, height: number, graphics: LayoutGraphics | undefined) => PageLayout,
): PageLayout {
  const { turn } = region;
  const [localWidth, localHeight] = turn === 180 ? [pageWidth, pageHeight] : [pageHeight, pageWidth];
  const toLocal = (box: BBox) => turnBox(box, turn, pageWidth, pageHeight);
  const toPage = (box: BBox) => unturnBox(box, turn, pageWidth, pageHeight);
  const localSpans = region.spans.map((span) => {
    const local: TextSpan = { ...span, ...toLocal(span) };
    if (hasExplicitSpaceBefore(span)) markExplicitSpaceBefore(local);
    return local;
  });
  const margin = 2 * medianFontSize(region.spans);
  const near = (box: BBox) => overlaps(box, region, margin);
  const localGraphics: LayoutGraphics | undefined = graphics && {
    // Rules are what a turned table needs; a figure's fills would only be weighed again as a chart.
    ...(graphics.vectorBoxes && {
      vectorBoxes: graphics.vectorBoxes.filter((box) => near(box) && isRule(box)).map(toLocal),
    }),
    ...(graphics.imageBoxes && { imageBoxes: graphics.imageBoxes.filter(near).map(toLocal) }),
    ...(graphics.maskRules && { maskRules: graphics.maskRules.filter(near).map(toLocal) }),
  };
  const layout = build(localSpans, localWidth, localHeight, localGraphics);
  const blocks: LayoutBlock[] = layout.blocks.map((block) => ({
    ...block,
    ...toPage(block),
    lines: block.lines.map((line) => ({ ...line, ...toPage(line) })),
    rotation: turn,
  }));
  const tables: LayoutTable[] | undefined = layout.tables?.map((table) => ({
    ...table,
    ...toPage(table),
    rows: table.rows.map((row) => {
      const box = toPage({ x: table.x, y: row.y, width: table.width, height: row.height });
      return {
        ...row,
        y: box.y,
        height: box.height,
        cells: row.cells.map((cell) => ({ ...cell, ...toPage(cell) })),
      };
    }),
    rotation: turn,
  }));
  return { blocks, ...(tables && tables.length > 0 && { tables }) };
}

/**
 * A turned table and the lines read with it, back in the upright frame
 * they were laid out in, for checks that reason along rows and columns.
 */
export function tableInOwnFrame(
  table: LayoutTable,
  lines: readonly LayoutLine[],
  pageWidth: number,
  pageHeight: number,
): { table: LayoutTable; lines: LayoutLine[] } {
  const turn = table.rotation;
  if (turn === undefined) return { table, lines: [...lines] };
  const local = (box: BBox) => turnBox(box, turn, pageWidth, pageHeight);
  const box = local(table);
  return {
    table: {
      ...table,
      ...box,
      rows: table.rows.map((row) => {
        const cells = row.cells.map((cell) => ({ ...cell, ...local(cell) }));
        const rowBox = cells.length > 0 ? unionBox(cells) : { y: box.y, height: box.height };
        return { ...row, y: rowBox.y, height: rowBox.height, cells };
      }),
    },
    lines: lines.map((line) => ({ ...line, ...local(line) })),
  };
}

/** Page box → the same box in the page turned upright for `turn`. */
export function turnBox(box: BBox, turn: QuarterTurn, pageWidth: number, pageHeight: number): BBox {
  const { x, y, width: w, height: h } = box;
  if (turn === 90) return rounded(pageHeight - y - h, x, h, w);
  if (turn === 270) return rounded(y, pageWidth - x - w, h, w);
  return rounded(pageWidth - x - w, pageHeight - y - h, w, h);
}

/** Inverse of {@link turnBox}. */
export function unturnBox(box: BBox, turn: QuarterTurn, pageWidth: number, pageHeight: number): BBox {
  const { x: u, y: v, width: w, height: h } = box;
  if (turn === 90) return rounded(v, pageHeight - u - w, h, w);
  if (turn === 270) return rounded(pageWidth - v - h, u, h, w);
  return rounded(pageWidth - u - w, pageHeight - v - h, w, h);
}

function rounded(x: number, y: number, width: number, height: number): BBox {
  return { x: round2(x), y: round2(y), width: round2(width), height: round2(height) };
}

function region(turn: QuarterTurn, spans: TextSpan[]): TurnedRegion {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const span of spans) {
    minX = Math.min(minX, span.x);
    minY = Math.min(minY, span.y);
    maxX = Math.max(maxX, span.x + span.width);
    maxY = Math.max(maxY, span.y + span.height);
  }
  return { turn, spans, ...rounded(minX, minY, maxX - minX, maxY - minY) };
}

/** Connected groups of turned spans, near each other in their own frame. */
function clusters(spans: readonly TextSpan[], turn: QuarterTurn, pageWidth: number, pageHeight: number): TextSpan[][] {
  const local = spans.map((span) => turnBox(span, turn, pageWidth, pageHeight));
  const parent = spans.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  // Sweep in order of the top edge across lines; a pair farther apart than the widest reach never links.
  const maxEm = Math.max(1, ...spans.map((span) => span.fontSize));
  const order = spans.map((_, i) => i).sort((p, q) => local[p].y - local[q].y);
  for (let oi = 0; oi < order.length; oi++) {
    const i = order[oi];
    const a = local[i];
    for (let oj = oi + 1; oj < order.length; oj++) {
      const j = order[oj];
      const b = local[j];
      if (b.y - (a.y + a.height) > maxEm * CLUSTER_REACH_ACROSS_EM) break;
      const em = Math.max(spans[i].fontSize, spans[j].fontSize, 1);
      const gapAlong = Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width);
      const gapAcross = Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height);
      if (gapAlong <= em * CLUSTER_REACH_ALONG_EM && gapAcross <= em * CLUSTER_REACH_ACROSS_EM) {
        parent[find(i)] = find(j);
      }
    }
  }
  const groups = new Map<number, TextSpan[]>();
  for (let i = 0; i < spans.length; i++) {
    const root = find(i);
    const group = groups.get(root);
    if (group) group.push(spans[i]);
    else groups.set(root, [spans[i]]);
  }
  return [...groups.values()];
}

/**
 * Whether a cluster of turned spans is content to read in its own frame:
 * enough text on at least two lines, and either table rows (lines holding
 * cells a gap apart) or several long lines that are not the turned header
 * cells of an upright table.
 */
function isTurnedContent(
  cluster: readonly TextSpan[],
  turn: QuarterTurn,
  upright: readonly TextSpan[],
  pageWidth: number,
  pageHeight: number,
): boolean {
  if (charCount(cluster) < MIN_REGION_CHARS) return false;
  const lines = localLines(cluster, turn, pageWidth, pageHeight);
  if (lines.length < MIN_REGION_LINES) return false;
  const rows = lines.filter(isTableRow).length;
  if (rows >= MIN_ROW_LINES) return true;
  // A prose line: unbroken text, not a row of spread-out cells or tick labels.
  const long = lines.filter(
    (line) => !hasCellGap(line) && charCount(line.map((entry) => entry.span)) >= LONG_LINE_CHARS,
  ).length;
  if (long < MIN_LONG_LINES) return false;
  const headerLike = lines.filter((line) =>
    hasUprightCellNeighbour(
      line.map((entry) => entry.span),
      upright,
    ),
  ).length;
  return headerLike * 2 < lines.length;
}

interface LocalEntry {
  span: TextSpan;
  box: BBox;
}

function localLines(
  spans: readonly TextSpan[],
  turn: QuarterTurn,
  pageWidth: number,
  pageHeight: number,
): LocalEntry[][] {
  const entries = spans
    .map((span) => ({ span, box: turnBox(span, turn, pageWidth, pageHeight) }))
    .sort((a, b) => a.box.y + a.box.height / 2 - (b.box.y + b.box.height / 2));
  const lines: LocalEntry[][] = [];
  for (const entry of entries) {
    const line = lines.at(-1);
    const centre = entry.box.y + entry.box.height / 2;
    const head = line?.[0].box;
    if (line && head && Math.abs(centre - (head.y + head.height / 2)) < Math.max(head.height, 1) * 0.5) {
      line.push(entry);
    } else {
      lines.push([entry]);
    }
  }
  for (const line of lines) line.sort((a, b) => a.box.x - b.box.x);
  return lines;
}

/**
 * A table row: cells a gap apart, at least one of them more than a tick
 * label. A turned axis (`1 2 3 … 8`, `0 10 20 30`) is a line of short
 * tokens at a regular pitch and must not pass for one.
 */
function isTableRow(line: readonly LocalEntry[]): boolean {
  if (!line.some((entry) => entry.span.text.replace(/\s+/g, '').length >= MIN_ROW_CELL_CHARS)) return false;
  return hasCellGap(line);
}

function hasCellGap(line: readonly LocalEntry[]): boolean {
  for (let i = 1; i < line.length; i++) {
    const prev = line[i - 1];
    const gap = line[i].box.x - (prev.box.x + prev.box.width);
    if (gap > Math.max(prev.span.fontSize, 1) * CELL_GAP_EM) return true;
  }
  return false;
}

/** An upright cell-sized span directly above or below the line in the page frame. */
function hasUprightCellNeighbour(line: readonly TextSpan[], upright: readonly TextSpan[]): boolean {
  const box = region(90, [...line]);
  const em = medianFontSize(line);
  return upright.some((span) => {
    if (span.width > em * HEADER_NEIGHBOUR_MAX_WIDTH_EM) return false;
    if (span.x >= box.x + box.width || span.x + span.width <= box.x) return false;
    const gap = Math.max(span.y - (box.y + box.height), box.y - (span.y + span.height));
    return gap <= em * HEADER_NEIGHBOUR_GAP_EM;
  });
}

function isRule(box: BBox): boolean {
  return Math.min(box.width, box.height) <= MAX_RULE_THICKNESS;
}

function overlaps(box: BBox, region: BBox, margin: number): boolean {
  return (
    box.x < region.x + region.width + margin &&
    box.x + box.width > region.x - margin &&
    box.y < region.y + region.height + margin &&
    box.y + box.height > region.y - margin
  );
}

function charCount(spans: readonly TextSpan[]): number {
  let count = 0;
  for (const span of spans) count += span.text.replace(/\s+/g, '').length;
  return count;
}

function medianFontSize(spans: readonly TextSpan[]): number {
  const sizes = spans.map((span) => span.fontSize).sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)] || 1;
}
