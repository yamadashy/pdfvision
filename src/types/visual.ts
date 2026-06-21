/**
 * Bounding box of one rendered raster image instance on the page.
 * Coordinates use the same top-down origin as `TextSpan`.
 *
 * pdf.js's `paintImage*Repeat` / `paintImage*Group` operators collapse
 * multiple draws of the same XObject into a single op carrying a
 * `positions` array (or per-instance transforms). `buildImageBoxes` in
 * `core/imageBoxes.ts` walks those ops and emits one entry per drawn
 * instance, so a tiled hero surfaces as N per-instance bboxes. Image-
 * bearing tiling patterns painted through fill paths surface as the
 * painted path bbox so masked/pattern images still become crop targets.
 * `imageCount === imageBoxes.length` holds for every page. Form XObject
 * (`paintFormXObjectBegin/End`) CTM-stack tracking ensures images drawn
 * inside a Form XObject map to the correct page-space position.
 */
export interface ImageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VectorBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type VisualRegionKind = 'raster' | 'vector' | 'table' | 'form' | 'annotation' | 'mixed';

export type VisualRegionSourceType = 'imageBox' | 'vectorBox' | 'layoutTable' | 'formField' | 'annotation';

export type VisualRegionAssociatedTextRelation = 'caption' | 'label';

export interface VisualRegionSource {
  /** Source geometry collection this region was derived from. */
  type: VisualRegionSourceType;
  /** 0-based index into the source collection on the same page; the collection may be internal if not emitted. */
  index: number;
}

export interface VisualRegionAssociatedText {
  text: string;
  relation: VisualRegionAssociatedTextRelation;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0-based index into `layout.blocks` when the text came from page layout. */
  blockIndex?: number;
  /** 0-based index into `formFields` when the label came from a form field. */
  fieldIndex?: number;
}

export interface RenderedContentBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Human-meaningful visual region that can be passed directly to
 * `--render-region x,y,width,height` for a high-detail crop. Regions are
 * derived from existing page geometry (raster image boxes, vector path
 * clusters, layout table hints, form widgets, and visible annotation
 * markup), padded and clamped to page bounds.
 */
export interface VisualRegion {
  /** Stable page-local identifier such as `p3-vr0`, present in extracted page results. */
  id?: string;
  kind: VisualRegionKind;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Region area divided by page area, rounded to 3 decimals. */
  areaRatio: number;
  /** Total number of source geometry items represented by this region. */
  sourceCount: number;
  /** Representative source refs; large vector clusters are intentionally capped. */
  sources: VisualRegionSource[];
  /** Short human-readable reason for why the region is worth inspecting. */
  reason: string;
  /** Nearby or in-region text that identifies this visual region, such as a caption, form label, chart title, or table lead-in. */
  associatedText?: VisualRegionAssociatedText[];
  /** Cropped PNG path for this region when `renderVisualRegions` was requested. */
  image?: string;
  /** Content ratio measured from the cropped region PNG when rendered. */
  renderContentRatio?: number;
  /**
   * Tight bbox of non-background pixels measured from the rendered crop,
   * in page coordinates. Present only when `renderVisualRegions` was
   * requested and the crop contains measurable content. The region's
   * own `x/y/width/height` remains the source-geometry crop; this box
   * is a rendered-pixel hint for sparse or transparent raster content.
   */
  renderedContentBox?: RenderedContentBox;
}
