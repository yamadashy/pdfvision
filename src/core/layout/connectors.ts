import type { LayoutBlock, LayoutConnection, LayoutLine } from '../../types/index.js';
import { arrowTip, centre, filledTriangle, isBlankFill, type Point, vertices } from '../graphics/shapeKinds.js';
import type { VectorShape, VectorShapeSet } from '../graphics/vectorShapes.js';
import { type BBox, round2 } from './geometry.js';

/**
 * Arrows between boxes of text — a flowchart, a process diagram, a
 * briefing slide's 課題 → 施策 flow. The relation "A leads to B" exists
 * only as strokes, so each sound one is reported as content: a stroked
 * line (one polyline, or segments joined end to end) whose two ends touch
 * two different boxes of text, with an arrowhead at one end saying which
 * way it points, and the short label set beside it (`Yes`, `No`) when one
 * is nearest to it and to no other connector.
 *
 * A box of text is a closed path (rectangle, rounded box, diamond, oval)
 * around one or more text lines, or, where text stands without a frame,
 * the text block itself. An arrow that ends anywhere else — on a chart
 * point, a photo, a dimension's extension line — is not reported.
 */

/** An end touches a box within this distance of its outline. */
const TOUCH_PT = 4;
/** The arrowhead sits on the line's end, give or take. */
const HEAD_REACH_PT = 2;
const HEAD_MAX_LENGTH_PT = 16;
const JOIN_PT = 0.6;
const LEAVE_STEP_PT = 6;
const MIN_CONNECTOR_LENGTH_PT = 6;
const MAX_CONNECTOR_WIDTH_PT = 3;
const MAX_CONNECTOR_VERTICES = 12;
const NODE_MIN_WIDTH_PT = 12;
const NODE_MIN_HEIGHT_PT = 8;
const NODE_MAX_PAGE_SHARE = 0.25;
const NODE_TEXT_MAX_CHARS = 120;
const BARE_NODE_MAX_LINES = 3;
const BARE_NODE_MAX_CHARS = 60;
const LABEL_MAX_CHARS = 16;
const LABEL_MAX_WORDS = 3;
const LABEL_REACH_EM = 1.5;
const LABEL_AMBIGUITY = 1.3;
const MAX_CANDIDATE_LINES = 600;

interface Node {
  box: BBox;
  lines: LayoutLine[];
  text: string;
  /** Held by a drawn outline, not a bare text block. */
  framed: boolean;
}

interface Polyline {
  points: Point[];
  box: BBox;
}

export function detectConnections(
  blocks: readonly LayoutBlock[],
  shapeSet: VectorShapeSet | undefined,
  pageWidth: number,
  pageHeight: number,
): LayoutConnection[] {
  if (!shapeSet || shapeSet.truncated || shapeSet.shapes.length === 0) return [];
  const { shapes } = shapeSet;
  const heads = shapes
    .map((shape) => ({ shape, triangle: filledTriangle(shape) }))
    .filter(
      (item): item is { shape: VectorShape; triangle: Point[] } =>
        item.triangle !== undefined && Math.max(item.shape.width, item.shape.height) <= HEAD_MAX_LENGTH_PT,
    );
  if (heads.length === 0) return [];
  const polylines = joinSegments(shapes.flatMap(openStrokes));
  if (polylines.length === 0 || polylines.length > MAX_CANDIDATE_LINES) return [];
  const lines = blocks.filter((block) => block.writingMode !== 'vertical').flatMap((block) => block.lines);
  const nodes = textNodes(blocks, lines, shapes, pageWidth * pageHeight);
  if (nodes.length < 2) return [];

  const found: Array<{ from: Node; to: Node; line: Polyline; both: boolean }> = [];
  for (const line of polylines) {
    const start = line.points[0];
    const end = line.points[line.points.length - 1];
    const headAtEnd = headAt(end, line.points[line.points.length - 2], heads);
    const headAtStart = headAt(start, line.points[1], heads);
    if (!headAtEnd && !headAtStart) continue;
    const tipEnd = headAtEnd ?? end;
    const tipStart = headAtStart ?? start;
    const a = touchedNode(tipStart, nodes);
    const b = touchedNode(tipEnd, nodes);
    if (!a || !b || a === b) continue;
    // A connector runs between boxes, not across one: a line through a box only passes it by.
    if (crossesNode(line.points, nodes)) continue;
    // Each end meets its box head-on: a step along the line takes it away from the box, not along its edge.
    if (!leaves(line.points, a.box) || !leaves([...line.points].reverse(), b.box)) continue;
    // A tail that starts on another line is a branch of it, not a line from the box beside.
    const tail = headAtEnd ? start : end;
    if (!(headAtEnd && headAtStart) && polylines.some((other) => other !== line && startsOn(tail, other.points)))
      continue;
    // A connector drawn twice (a halo pass, then the line) is one arrow.
    if (found.some((item) => item.from === a && item.to === b && sameBox(item.line.box, line.box))) continue;
    if (headAtEnd) found.push({ from: a, to: b, line, both: headAtStart !== undefined });
    else found.push({ from: b, to: a, line, both: false });
  }
  if (found.length === 0) return [];

  const inNode = new Set(
    [...nodes.filter((node) => node.framed), ...found.flatMap((item) => [item.from, item.to])].flatMap(
      (node) => node.lines,
    ),
  );
  const labels = assignLabels(
    lines.filter((line) => !inNode.has(line) && isLabelText(line.text)),
    found.map((item) => item.line),
  );
  const order = (node: Node) => [node.box.y, node.box.x];
  return found
    .map((item, i) => ({ ...item, label: labels.get(i) }))
    .sort((p, q) => {
      const [py, px] = order(p.from);
      const [qy, qx] = order(q.from);
      return py - qy || px - qx || p.to.box.y - q.to.box.y || p.to.box.x - q.to.box.x;
    })
    .map((item) => ({
      from: item.from.text,
      to: item.to.text,
      ...(item.both && { bidirectional: true }),
      ...(item.label !== undefined && { label: item.label }),
      x: round2(item.line.box.x),
      y: round2(item.line.box.y),
      width: round2(item.line.box.width),
      height: round2(item.line.box.height),
    }));
}

/** The thin stroked open subpaths of a shape: line segments and polylines. */
function openStrokes(shape: VectorShape): Point[][] {
  if (shape.stroke === undefined || shape.lineWidth > MAX_CONNECTOR_WIDTH_PT) return [];
  if (shape.fill !== undefined && !isBlankFill(shape.fill)) return [];
  const out: Point[][] = [];
  for (let i = 0; i < shape.subpaths.length; i++) {
    if (shape.subpaths[i].closed) continue;
    const points = vertices(shape, i);
    if (points.length >= 2 && points.length <= MAX_CONNECTOR_VERTICES) out.push(points);
  }
  return out;
}

/**
 * Segments drawn one by one join where one ends exactly where another
 * starts and nothing else meets there; a junction of three is a branch,
 * which no single arrow describes.
 */
function joinSegments(paths: Point[][]): Polyline[] {
  const key = (p: Point) => `${Math.round(p.x / JOIN_PT)},${Math.round(p.y / JOIN_PT)}`;
  const ends = new Map<string, number>();
  for (const path of paths) {
    for (const p of [path[0], path[path.length - 1]]) ends.set(key(p), (ends.get(key(p)) ?? 0) + 1);
  }
  const used = new Set<number>();
  const out: Polyline[] = [];
  for (let i = 0; i < paths.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    let points = [...paths[i]];
    for (let grew = true; grew && points.length <= MAX_CONNECTOR_VERTICES; ) {
      grew = false;
      for (let j = 0; j < paths.length; j++) {
        if (used.has(j)) continue;
        const other = paths[j];
        const tail = key(points[points.length - 1]);
        const head = key(points[0]);
        if (ends.get(tail) === 2 && key(other[0]) === tail) points = [...points, ...other.slice(1)];
        else if (ends.get(tail) === 2 && key(other[other.length - 1]) === tail)
          points = [...points, ...[...other].reverse().slice(1)];
        else if (ends.get(head) === 2 && key(other[other.length - 1]) === head)
          points = [...other.slice(0, -1), ...points];
        else if (ends.get(head) === 2 && key(other[0]) === head)
          points = [...[...other].reverse().slice(0, -1), ...points];
        else continue;
        used.add(j);
        grew = true;
      }
    }
    if (pathLength(points) < MIN_CONNECTOR_LENGTH_PT) continue;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    out.push({ points, box: { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y } });
  }
  return out;
}

/** The tip of an arrowhead set on this end of a line, pointing along its last segment. */
function headAt(
  end: Point,
  before: Point,
  heads: ReadonlyArray<{ shape: VectorShape; triangle: Point[] }>,
): Point | undefined {
  const length = Math.hypot(end.x - before.x, end.y - before.y);
  if (length <= 0) return undefined;
  const dx = (end.x - before.x) / length;
  const dy = (end.y - before.y) / length;
  for (const { shape, triangle } of heads) {
    if (
      end.x < shape.x - HEAD_REACH_PT ||
      end.x > shape.x + shape.width + HEAD_REACH_PT ||
      end.y < shape.y - HEAD_REACH_PT ||
      end.y > shape.y + shape.height + HEAD_REACH_PT
    ) {
      continue;
    }
    const head = arrowTip(triangle, { x: dx, y: dy });
    if (!head) continue;
    // The tip is ahead of (or at) the line's end, not behind it.
    if ((head.apex.x - end.x) * dx + (head.apex.y - end.y) * dy < -HEAD_REACH_PT) continue;
    return head.apex;
  }
  return undefined;
}

/**
 * Boxes of text: the innermost closed path around some text lines, and
 * any text block no such path holds.
 */
function textNodes(
  blocks: readonly LayoutBlock[],
  lines: readonly LayoutLine[],
  shapes: readonly VectorShape[],
  pageArea: number,
): Node[] {
  const frames = shapes.filter(
    (shape) =>
      shape.subpaths.length === 1 &&
      shape.subpaths[0].closed &&
      shape.width >= NODE_MIN_WIDTH_PT &&
      shape.height >= NODE_MIN_HEIGHT_PT &&
      shape.width * shape.height <= pageArea * NODE_MAX_PAGE_SHARE,
  );
  const nodes: Node[] = [];
  const taken = new Set<LayoutLine>();
  const holding = frames
    .map((frame) => ({ frame, inside: lines.filter((line) => containsPoint(frame, centre(line))) }))
    .filter((item) => item.inside.length > 0)
    .sort((a, b) => a.frame.width * a.frame.height - b.frame.width * b.frame.height);
  for (const { frame, inside } of holding) {
    // A frame round other frames' text (a panel, a swimlane) is not a step.
    if (inside.some((line) => taken.has(line))) continue;
    // Its lines lie wholly inside it: a box round a few words, not a band crossing a paragraph.
    if (!inside.every((line) => containsBox(frame, line, 1))) continue;
    if (nodes.some((node) => sameBox(node.box, frame))) continue;
    const text = joinText(inside);
    if (Array.from(text).length > NODE_TEXT_MAX_CHARS) continue;
    for (const line of inside) taken.add(line);
    nodes.push({ box: frame, lines: inside, text, framed: true });
  }
  for (const block of blocks) {
    if (block.writingMode === 'vertical' || block.lines.some((line) => taken.has(line))) continue;
    // Unframed, only a short label is a step; an arrow into a paragraph points at words inside it.
    if (block.lines.length > BARE_NODE_MAX_LINES) continue;
    const text = joinText(block.lines);
    if (Array.from(text).length > BARE_NODE_MAX_CHARS) continue;
    nodes.push({ box: block, lines: block.lines, text, framed: false });
  }
  return nodes;
}

/** Whether a line starting at points[0] moves away from the box over its first few points. */
function leaves(points: readonly Point[], box: BBox): boolean {
  const start = points[0];
  let travelled = 0;
  let previous = start;
  for (let i = 1; i < points.length; i++) {
    const segment = Math.hypot(points[i].x - previous.x, points[i].y - previous.y);
    const step = Math.min(segment, LEAVE_STEP_PT - travelled);
    const t = segment === 0 ? 0 : step / segment;
    const p = { x: previous.x + (points[i].x - previous.x) * t, y: previous.y + (points[i].y - previous.y) * t };
    travelled += step;
    if (travelled >= LEAVE_STEP_PT - 0.01 || i === points.length - 1) {
      return outsideDistance(p, box) >= outsideDistance(start, box) + Math.min(3, travelled * 0.5);
    }
    previous = points[i];
  }
  return false;
}

function outsideDistance(p: Point, box: BBox): number {
  const dx = Math.max(box.x - p.x, 0, p.x - (box.x + box.width));
  const dy = Math.max(box.y - p.y, 0, p.y - (box.y + box.height));
  return Math.hypot(dx, dy);
}

/** Whether a point lies on a line's run, away from that line's own ends (a T-junction). */
function startsOn(p: Point, points: readonly Point[]): boolean {
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.hypot(p.x - first.x, p.y - first.y) <= 1.5 || Math.hypot(p.x - last.x, p.y - last.y) <= 1.5) return false;
  for (let i = 1; i < points.length; i++) {
    if (pointToSegment(p, points[i - 1], points[i]) <= 1) return true;
  }
  return false;
}

function pointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Whether the line, away from its two ends, runs inside any outlined box. */
function crossesNode(points: readonly Point[], nodes: readonly Node[]): boolean {
  const start = points[0];
  const end = points[points.length - 1];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
    for (let k = 0; k <= steps; k++) {
      const p = { x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps };
      if (Math.hypot(p.x - start.x, p.y - start.y) <= TOUCH_PT * 2) continue;
      if (Math.hypot(p.x - end.x, p.y - end.y) <= TOUCH_PT * 2) continue;
      if (nodes.some((node) => node.framed && insideBy(p, node.box, 1))) return true;
    }
  }
  return false;
}

function insideBy(p: Point, box: BBox, margin: number): boolean {
  return (
    p.x > box.x + margin &&
    p.x < box.x + box.width - margin &&
    p.y > box.y + margin &&
    p.y < box.y + box.height - margin
  );
}

/** The outlined box an end touches, or failing one, a bare text block it touches. */
function touchedNode(point: Point, nodes: readonly Node[]): Node | undefined {
  return (
    nearestTouched(
      point,
      nodes.filter((node) => node.framed),
    ) ??
    nearestTouched(
      point,
      nodes.filter((node) => !node.framed),
    )
  );
}

function nearestTouched(point: Point, nodes: readonly Node[]): Node | undefined {
  let best: { node: Node; distance: number } | undefined;
  for (const node of nodes) {
    const distance = distanceToOutline(point, node.box);
    if (distance > TOUCH_PT) continue;
    if (!best || distance < best.distance) best = { node, distance };
  }
  return best?.node;
}

/** How far a point is from a box's outline, from inside or out. */
function distanceToOutline(p: Point, box: BBox): number {
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const inside = p.x >= box.x && p.x <= right && p.y >= box.y && p.y <= bottom;
  if (inside) return Math.min(p.x - box.x, right - p.x, p.y - box.y, bottom - p.y);
  const dx = Math.max(box.x - p.x, 0, p.x - right);
  const dy = Math.max(box.y - p.y, 0, p.y - bottom);
  return Math.hypot(dx, dy);
}

function isLabelText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || Array.from(trimmed).length > LABEL_MAX_CHARS) return false;
  return trimmed.split(/\s+/u).length <= LABEL_MAX_WORDS;
}

/** Each label goes to the connector it is nearest, when it is clearly nearer that one than any other. */
function assignLabels(labels: readonly LayoutLine[], lines: readonly Polyline[]): Map<number, string> {
  const out = new Map<number, string>();
  const claimed = new Map<number, number>();
  for (const label of labels) {
    const reach = Math.max(8, (label.fontSize || label.height) * LABEL_REACH_EM);
    const distances = lines.map((line) => distanceToPolyline(label, line.points));
    const ranked = distances.map((distance, i) => ({ distance, i })).sort((a, b) => a.distance - b.distance);
    const [best, next] = ranked;
    if (!best || best.distance > reach) continue;
    if (next && next.distance <= Math.max(best.distance * LABEL_AMBIGUITY, best.distance + 2)) continue;
    const previous = claimed.get(best.i);
    if (previous !== undefined) {
      // Two labels on one connector: neither is its own.
      if (previous >= 0) out.delete(best.i);
      claimed.set(best.i, -1);
      continue;
    }
    claimed.set(best.i, best.distance);
    out.set(best.i, label.text.trim());
  }
  return out;
}

function distanceToPolyline(box: BBox, points: readonly Point[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < points.length; i++) best = Math.min(best, boxToSegment(box, points[i - 1], points[i]));
  return best;
}

/** Distance from a box to a segment, sampled along the segment (boxes and connectors are small). */
function boxToSegment(box: BBox, a: Point, b: Point): number {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(length / 2));
  let best = Number.POSITIVE_INFINITY;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const dx = Math.max(box.x - p.x, 0, p.x - (box.x + box.width));
    const dy = Math.max(box.y - p.y, 0, p.y - (box.y + box.height));
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return best;
}

/** A box's lines in reading order; a CJK line wrapped onto the next in the same size joins without a space. */
function joinText(lines: readonly LayoutLine[]): string {
  const sorted = [...lines].sort((a, b) => a.y - b.y || a.x - b.x).filter((line) => line.text.trim().length > 0);
  let text = '';
  for (let i = 0; i < sorted.length; i++) {
    const piece = sorted[i].text.trim();
    if (i === 0) {
      text = piece;
      continue;
    }
    const previous = sorted[i - 1];
    const wrapped = Math.abs(previous.fontSize - sorted[i].fontSize) <= previous.fontSize * 0.05;
    text += wrapped && CJK_END.test(text) && CJK_START.test(piece) ? piece : ` ${piece}`;
  }
  return text;
}

const CJK_END = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}、]$/u;
const CJK_START = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

function pathLength(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++)
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return total;
}

function containsPoint(box: BBox, p: Point): boolean {
  return p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height;
}

function containsBox(outer: BBox, inner: BBox, tolerance: number): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

function sameBox(a: BBox, b: BBox): boolean {
  return (
    Math.abs(a.x - b.x) <= 0.5 &&
    Math.abs(a.y - b.y) <= 0.5 &&
    Math.abs(a.width - b.width) <= 0.5 &&
    Math.abs(a.height - b.height) <= 0.5
  );
}
