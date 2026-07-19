export type OutputFormat = 'markdown' | 'json' | 'xml' | 'toon';

/**
 * Sub-rectangle of a page to rasterise. Coordinates use the unrotated pdf.js
 * page view box in PDF user-space units (typically points with the default
 * `/UserUnit`) and the top-down origin used by `spans`, `layout.blocks`, and
 * `imageBoxes` — `(0, 0)` is the page's top-left, `y` grows downward.
 * width / height must be positive; bounds and single-page checks live
 * in the processor so this stays a pure shape type.
 */
export interface RenderRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type JsonScalar = string | number | boolean | null;

export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };
