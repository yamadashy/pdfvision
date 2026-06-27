import type { VectorBox } from '../../types/index.js';
import { isLikelyUnpositionedFormWidgetVector } from './predicates.js';
import type { BoxLike, BuildVisualRegionsInput } from './types.js';

const MIN_RULED_GRID_LINE_LENGTH_PT = 18;
const CONTAINED_GRID_MIN_HORIZONTAL_LINES = 2;
const CONTAINED_GRID_MIN_VERTICAL_LINES = 2;
const CONTAINED_GRID_EDGE_TOLERANCE_PT = 1;
const THIN_LINE_MAX_THICKNESS_PT = 2;

export const RULED_GRID_FRAME_REASON = 'ruled vector table/frame boundary';

export function containsRuledVectorGrid(
  box: VectorBox,
  boxIndex: number,
  vectorBoxes: readonly VectorBox[],
  input: BuildVisualRegionsInput,
): boolean {
  let horizontalLines = 0;
  let verticalLines = 0;
  for (const [index, inner] of vectorBoxes.entries()) {
    if (index === boxIndex) continue;
    if (isLikelyUnpositionedFormWidgetVector(inner, input)) continue;
    if (!isInsideBox(inner, box)) continue;
    if (inner.width >= MIN_RULED_GRID_LINE_LENGTH_PT && inner.height <= THIN_LINE_MAX_THICKNESS_PT) {
      horizontalLines++;
    } else if (inner.height >= MIN_RULED_GRID_LINE_LENGTH_PT && inner.width <= THIN_LINE_MAX_THICKNESS_PT) {
      verticalLines++;
    }
    if (horizontalLines >= CONTAINED_GRID_MIN_HORIZONTAL_LINES && verticalLines >= CONTAINED_GRID_MIN_VERTICAL_LINES) {
      return true;
    }
  }
  return false;
}

function isInsideBox(inner: BoxLike, outer: BoxLike): boolean {
  return (
    inner.x >= outer.x - CONTAINED_GRID_EDGE_TOLERANCE_PT &&
    inner.y >= outer.y - CONTAINED_GRID_EDGE_TOLERANCE_PT &&
    inner.x + inner.width <= outer.x + outer.width + CONTAINED_GRID_EDGE_TOLERANCE_PT &&
    inner.y + inner.height <= outer.y + outer.height + CONTAINED_GRID_EDGE_TOLERANCE_PT
  );
}
