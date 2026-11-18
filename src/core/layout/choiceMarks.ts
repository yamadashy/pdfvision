import type { LayoutMarkedText, TextSpan } from '../../types/index.js';
import {
  centre,
  crossing,
  diagonalStrokes,
  isBlankFill,
  isFilledDot,
  isRingOutline,
  isSquareOutline,
  isTickStroke,
} from '../graphics/shapeKinds.js';
import type { VectorShape, VectorShapeSet } from '../graphics/vectorShapes.js';
import { round2 } from './geometry.js';

/**
 * Answers drawn on a form: a tick or cross stroked over a □, a dot filled
 * inside a ○. A completed questionnaire exported from a tablet app or
 * printed from a web form has no form fields — every option label is
 * text and the choice exists only as a mark — so the marked options are
 * reported as content, each with the option's label and, where one stands
 * at the row's left, the question it answers. The empty boxes beside them
 * are reported too: "not chosen" is part of the answer.
 *
 * A control is a small stroked square or circle with nothing written
 * inside it. Its option label is the text right after it on its row, or,
 * in a grid of controls with no text between them (a rating scale), the
 * heading centred over its column. Nothing is reported unless at least
 * one control on the page holds a mark: a blank form, a legend of
 * outlined swatches, or a checklist template carries no answers.
 */

const CONTROL_MIN_PT = 4.5;
const CONTROL_MAX_PT = 16;
/** A label starts within this many ems of its control's right edge. */
const LABEL_START_EM = 1.6;
/** Words of one label are set this close; a wider gap ends it. */
const LABEL_GAP_EM = 1.1;
const LABEL_MAX_CHARS = 60;
/** A grid's column heading stands at most this many control heights above the column. */
const HEADING_REACH = 4;
const MAX_CONTROLS = 400;

type Kind = 'box' | 'circle';
type Mark = 'tick' | 'cross' | 'fill';

interface Control {
  shape: VectorShape;
  kind: Kind;
  mark?: Mark;
  label?: string;
  group?: string;
}

export function choiceMarks(spans: readonly TextSpan[], shapeSet: VectorShapeSet | undefined): LayoutMarkedText[] {
  if (!shapeSet || shapeSet.shapes.length === 0) return [];
  const { shapes } = shapeSet;
  const controls: Control[] = [];
  for (const shape of shapes) {
    const kind = isSquareOutline(shape, CONTROL_MIN_PT, CONTROL_MAX_PT)
      ? 'box'
      : isRingOutline(shape, CONTROL_MIN_PT, CONTROL_MAX_PT)
        ? 'circle'
        : undefined;
    if (!kind) continue;
    if (spans.some((span) => containsPoint(shape, centre(span)))) continue;
    controls.push({ shape, kind });
    if (controls.length > MAX_CONTROLS) return [];
  }
  if (controls.length === 0) return [];
  // A control drawn twice (a fill pass and a stroke pass) is one control.
  const unique = controls.filter(
    (control, i) => !controls.slice(0, i).some((other) => sameBox(other.shape, control.shape)),
  );
  for (const control of unique) control.mark = markInside(control, shapes);
  if (!unique.some((control) => control.mark !== undefined)) return [];

  for (const control of unique) control.label = rightLabel(control, unique, spans);
  const unlabelled = unique.filter((control) => control.label === undefined);
  const headings = unlabelled.map((control) => columnHeading(control, unlabelled, spans));
  unlabelled.forEach((control, i) => {
    control.label = headings[i];
  });
  const rows = rowsOf(unique);
  for (const row of rows) {
    const group = rowLabel(row, spans);
    if (group !== undefined) for (const control of row) control.group = group;
  }

  const out: LayoutMarkedText[] = [];
  for (const row of rows) {
    // A row of controls with no labels at all is a drawing, not a question.
    for (const control of row) {
      if (control.label === undefined) continue;
      // A lone fill inside a lone box is as likely a legend swatch as an answer.
      if (control.mark === 'fill' && !hasMates(control, unique)) continue;
      out.push({
        mark: markName(control),
        text: control.label,
        ...(control.group !== undefined && { group: control.group }),
        x: round2(control.shape.x),
        y: round2(control.shape.y),
        width: round2(control.shape.width),
        height: round2(control.shape.height),
      });
    }
  }
  return out.some((item) => item.mark === 'checked' || item.mark === 'selected') ? out : [];
}

function markName(control: Control): LayoutMarkedText['mark'] {
  if (control.kind === 'box') return control.mark ? 'checked' : 'unchecked';
  return control.mark ? 'selected' : 'unselected';
}

/**
 * What is drawn inside the control: a tick or a cross whose centre falls
 * in it and whose size matches it, or a fill (a dot in a ring, a square in
 * a box) set well inside it and centred.
 */
function markInside(control: Control, shapes: readonly VectorShape[]): Mark | undefined {
  const box = control.shape;
  const size = Math.max(box.width, box.height);
  const c = centre(box);
  const strokes: Array<ReturnType<typeof diagonalStrokes>[number]> = [];
  for (const shape of shapes) {
    if (shape === box || !containsPoint(box, centre(shape))) continue;
    const extent = Math.max(shape.width, shape.height);
    if (isTickStroke(shape) && extent >= size * 0.5 && extent <= size * 2.2) return 'tick';
    const diagonals = diagonalStrokes(shape);
    if (diagonals.length > 0 && diagonals.length <= 2) strokes.push(...diagonals);
    if (isInnerFill(shape, box, c, size)) return 'fill';
  }
  for (const shape of shapes) {
    // A cross's strokes may each be their own path, centred off the box.
    if (shape === box || containsPoint(box, centre(shape))) continue;
    if (!overlaps(shape, box)) continue;
    const diagonals = diagonalStrokes(shape);
    if (diagonals.length === 1) strokes.push(...diagonals);
  }
  for (let i = 0; i < strokes.length; i++) {
    for (let j = i + 1; j < strokes.length; j++) {
      const a = strokes[i];
      const b = strokes[j];
      if (Math.sign((a[1].y - a[0].y) * (a[1].x - a[0].x)) === Math.sign((b[1].y - b[0].y) * (b[1].x - b[0].x))) {
        continue;
      }
      const at = crossing(a, b);
      if (!at || Math.abs(at.x - c.x) > size * 0.3 || Math.abs(at.y - c.y) > size * 0.3) continue;
      const reach = (s: typeof a) => Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y);
      if (reach(a) >= size * 0.6 && reach(b) >= size * 0.6 && reach(a) <= size * 2.5 && reach(b) <= size * 2.5) {
        return 'cross';
      }
    }
  }
  return undefined;
}

function isInnerFill(shape: VectorShape, box: VectorShape, c: { x: number; y: number }, size: number): boolean {
  if (shape.fill === undefined || isBlankFill(shape.fill)) return false;
  if (sameBox(shape, box)) return false;
  if (shape.x < box.x - 0.5 || shape.y < box.y - 0.5) return false;
  if (shape.x + shape.width > box.x + box.width + 0.5 || shape.y + shape.height > box.y + box.height + 0.5)
    return false;
  const area = shape.width * shape.height;
  const boxArea = box.width * box.height;
  if (area < boxArea * 0.15 || area > boxArea * 0.9) return false;
  const inner = centre(shape);
  if (Math.abs(inner.x - c.x) > size * 0.15 || Math.abs(inner.y - c.y) > size * 0.15) return false;
  return isFilledDot(shape) || shape.curves === 0;
}

/** The text that follows the control on its row, up to the next control or a wide gap. */
function rightLabel(control: Control, controls: readonly Control[], spans: readonly TextSpan[]): string | undefined {
  const box = control.shape;
  const c = centre(box);
  const right = box.x + box.width;
  const onRow = spans
    .filter((span) => Math.abs(span.y + span.height / 2 - c.y) <= Math.max(box.height * 0.6, span.height * 0.45))
    .filter((span) => span.x + span.width > right && span.text.trim().length > 0)
    .sort((a, b) => a.x - b.x);
  const first = onRow[0];
  if (!first) return undefined;
  const em = first.fontSize || first.height;
  if (first.x < right - em * 0.3 || first.x > right + em * LABEL_START_EM) return undefined;
  const stop = Math.min(
    ...controls
      .filter((other) => other !== control && other.shape.x >= right && rowMates(other.shape, box))
      .map((other) => other.shape.x),
  );
  let text = '';
  let end = first.x;
  for (const span of onRow) {
    if (span.x >= stop) break;
    if (span.x > end + em * LABEL_GAP_EM) break;
    // Text in another size is another field (a `内容：` prompt after the options).
    if (Math.abs((span.fontSize || span.height) - em) > em * 0.1) break;
    let piece = span.text;
    if (span.x + span.width > stop) {
      const chars = Array.from(piece);
      piece = chars.slice(0, Math.floor((chars.length * (stop - span.x)) / span.width)).join('');
    }
    text += text && needsSpace(text, piece, span.x - end, em) ? ` ${piece}` : piece;
    end = Math.max(end, span.x + span.width);
  }
  const label = text.replace(/\s+/gu, ' ').trim();
  return label.length > 0 && Array.from(label).length <= LABEL_MAX_CHARS ? label : undefined;
}

/**
 * A rating grid's column heading: the text centred over a column of
 * controls (two or more on one centre line), just above its topmost one,
 * with no other text between.
 */
function columnHeading(
  control: Control,
  unlabelled: readonly Control[],
  spans: readonly TextSpan[],
): string | undefined {
  const c = centre(control.shape);
  const column = unlabelled.filter(
    (other) => other.kind === control.kind && Math.abs(centre(other.shape).x - c.x) <= 1.5,
  );
  if (column.length < 2) return undefined;
  const top = Math.min(...column.map((other) => other.shape.y));
  const reach = control.shape.height * HEADING_REACH + 12;
  const above = spans
    .filter((span) => span.y + span.height <= top + 0.5 && span.y + span.height >= top - reach)
    .filter((span) => span.x <= c.x && span.x + span.width >= c.x && span.text.trim().length > 0)
    .sort((a, b) => b.y - a.y);
  const heading = above[0];
  if (!heading) return undefined;
  const headingCentre = heading.x + heading.width / 2;
  if (Math.abs(headingCentre - c.x) > Math.max(control.shape.width, heading.fontSize)) return undefined;
  const text = heading.text.replace(/\s+/gu, ' ').trim();
  return text.length > 0 && Array.from(text).length <= LABEL_MAX_CHARS ? text : undefined;
}

/** The text at the row's left, before its first control: the question the row answers. */
function rowLabel(row: readonly Control[], spans: readonly TextSpan[]): string | undefined {
  const first = row[0].shape;
  const c = centre(first);
  const before = spans
    .filter((span) => Math.abs(span.y + span.height / 2 - c.y) <= Math.max(first.height * 0.6, span.height * 0.45))
    .filter((span) => span.x + span.width <= first.x + 0.5 && span.text.trim().length > 0)
    .sort((a, b) => a.x - b.x);
  if (before.length === 0) return undefined;
  const em = before[0].fontSize || before[0].height;
  let text = '';
  let end = before[0].x;
  for (const span of before) {
    text += text && needsSpace(text, span.text, span.x - end, em) ? ` ${span.text}` : span.text;
    end = span.x + span.width;
  }
  const label = text.replace(/\s+/gu, ' ').trim();
  return label.length > 0 && Array.from(label).length <= LABEL_MAX_CHARS * 2 ? label : undefined;
}

function rowsOf(controls: readonly Control[]): Control[][] {
  const sorted = [...controls].sort((a, b) => centre(a.shape).y - centre(b.shape).y || a.shape.x - b.shape.x);
  const rows: Control[][] = [];
  for (const control of sorted) {
    const row = rows.find((candidate) => rowMates(candidate[0].shape, control.shape));
    if (row) row.push(control);
    else rows.push([control]);
  }
  for (const row of rows) row.sort((a, b) => a.shape.x - b.shape.x);
  return rows;
}

function rowMates(a: VectorShape, b: VectorShape): boolean {
  return Math.abs(centre(a).y - centre(b).y) <= Math.max(2, Math.min(a.height, b.height) / 2);
}

function hasMates(control: Control, controls: readonly Control[]): boolean {
  return controls.some(
    (other) =>
      other !== control &&
      other.kind === control.kind &&
      (rowMates(other.shape, control.shape) || Math.abs(centre(other.shape).x - centre(control.shape).x) <= 1.5),
  );
}

function needsSpace(before: string, after: string, gap: number, em: number): boolean {
  if (/\s$/u.test(before) || /^\s/u.test(after)) return false;
  const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}　-ヿ＀-￯]/u;
  // CJK sets no word spaces, so only a blank em box (an ideographic space inside a label) reads as one.
  if (cjk.test(before.slice(-1)) || cjk.test(after.slice(0, 1))) return gap > em * 0.5;
  return gap > em * 0.15;
}

function containsPoint(box: { x: number; y: number; width: number; height: number }, p: { x: number; y: number }) {
  return p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height;
}

function overlaps(a: VectorShape, b: VectorShape): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function sameBox(a: VectorShape, b: VectorShape): boolean {
  return (
    Math.abs(a.x - b.x) <= 0.5 &&
    Math.abs(a.y - b.y) <= 0.5 &&
    Math.abs(a.width - b.width) <= 0.5 &&
    Math.abs(a.height - b.height) <= 0.5
  );
}
