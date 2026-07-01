import type { RenderRegion } from '../types/index.js';
import { exitWithError } from './errors.js';
import type { ParsedCliValues } from './types.js';

export interface CliRenderOptions {
  render: boolean;
  renderOutput?: string;
  renderScale?: number;
  renderRegion?: RenderRegion;
  renderVisualRegions: boolean;
}

export function resolveRenderOptions(values: ParsedCliValues): CliRenderOptions {
  const renderOutput = values['render-output'] as string | undefined;
  const render = (values.render as boolean | undefined) ?? false;
  const renderVisualRegions = (values['render-visual-regions'] as boolean | undefined) ?? false;
  if (renderOutput && !render && !renderVisualRegions) {
    // --render-output only does something if page or visual-region crops are actually rendered.
    // Failing fast is friendlier than silently writing nothing to the dir.
    exitWithError('--render-output requires --render or --render-visual-regions');
  }

  return {
    render,
    renderOutput,
    renderScale: resolveRenderScale(values, render, renderVisualRegions),
    renderRegion: resolveRenderRegion(values, render),
    renderVisualRegions,
  };
}

function resolveRenderScale(
  values: ParsedCliValues,
  render: boolean,
  renderVisualRegions: boolean,
): number | undefined {
  // --render-scale parses as a number with explicit error messaging so
  // the user sees the actual bounds (0, 4] instead of a generic NaN
  // failure inside the processor. Allows --ocr-only scale changes too,
  // although OCR itself enforces a minimum scale for recognition quality.
  const renderScaleRaw = values['render-scale'] as string | undefined;
  if (renderScaleRaw === undefined) return undefined;

  if (!render && !renderVisualRegions && !(values.ocr as boolean | undefined)) {
    // No rasterisation will actually happen; the flag silently does
    // nothing. Failing loudly mirrors the --render-output relationship.
    exitWithError('--render-scale requires --render, --render-visual-regions, or --ocr');
  }
  const parsed = Number(renderScaleRaw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 4) {
    exitWithError(`Invalid --render-scale "${renderScaleRaw}": expected a number in (0, 4]`);
  }
  return parsed;
}

function resolveRenderRegion(values: ParsedCliValues, render: boolean): RenderRegion | undefined {
  // --render-region parses "x,y,width,height" as PDF points (top-left
  // origin, y grows downward — same coord system as imageBoxes /
  // layout.blocks). CLI surfaces shape errors (wrong field count,
  // non-numeric); positive-width/height and single-page constraints
  // get enforced in the processor against the resolved page list, so
  // we don't need to know totalPages here.
  const renderRegionRaw = values['render-region'] as string | undefined;
  if (renderRegionRaw === undefined) return undefined;

  if (!render && !(values.ocr as boolean | undefined)) {
    exitWithError('--render-region requires --render or --ocr');
  }
  const parts = renderRegionRaw.split(',').map((p) => p.trim());
  if (parts.length !== 4) {
    exitWithError(
      `Invalid --render-region "${renderRegionRaw}": expected "x,y,width,height" (4 comma-separated numbers)`,
    );
  }
  // Reject empty parts BEFORE Number() — `Number('')` is 0, so
  // `"10,,30,40"` would silently coerce to `y=0` and execute as
  // valid input instead of surfacing the typo.
  if (parts.some((p) => p === '')) {
    exitWithError(`Invalid --render-region "${renderRegionRaw}": empty value between commas`);
  }
  const [x, y, width, height] = parts.map(Number);
  if (![x, y, width, height].every((n) => Number.isFinite(n))) {
    exitWithError(`Invalid --render-region "${renderRegionRaw}": all four values must be finite numbers`);
  }
  return { x, y, width, height };
}
