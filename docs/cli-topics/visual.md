---
name: visual
description: Shapes for --image-boxes, --vector-boxes, and --visual-regions, plus what --render-scale and --render-region do. Use when picking a figure, chart, table, or form region to render and inspect visually.
---

# Visual geometry and rendering

Reference for `-f json`, `-f xml`, and `-f toon` consumers.

## Image boxes (`--image-boxes`)

```ts
interface ImageBox {
  x: number; y: number; width: number; height: number;
}
```

One entry per drawn instance — a tiled hero image yields multiple entries. Image-bearing tiling patterns painted through fill paths surface as the painted path bbox, so masked/pattern images still become crop targets. With `--image-boxes` requested, `imageCount === imageBoxes.length` on every page; without it, `imageCount` still reports the count and `imageBoxes` is absent. Form XObject CTM tracking ensures images drawn inside a form land at the correct page-space position.
## Vector boxes (`--vector-boxes`)

```ts
interface VectorBox {
  x: number; y: number; width: number; height: number;
}
```

One entry per painted vector path where pdf.js reports a path bbox, plus shading fills when pdf.js exposes the active clipping bbox, excluding page-sized white background fills. This is useful for maps, symbol tables, charts, diagrams, gradient panels, table rules, form boxes, and slide shapes: content a human sees, but that is neither native text nor a raster image. Horizontal/vertical strokes are expanded to at least 0.5 raw page-view unit in the degenerate dimension so their boxes can feed `--render-region`. `vectorCount` remains the broad density signal for meaningful vector drawing operations; `vectorBoxes[]` is the opt-in location signal and can be shorter than `vectorCount` when a low-level op has no bbox.
## Visual regions (`--visual-regions`)

```ts
interface VisualRegion {
  id?: string;              // stable page-local id, e.g. "p3-vr0", present in extracted PageResult
  kind: 'raster' | 'vector' | 'table' | 'form' | 'annotation' | 'mixed';
  x: number; y: number; width: number; height: number;
  areaRatio: number;        // region area / page area, rounded to 3dp
  sourceCount: number;      // total source geometry items represented
  sources: VisualRegionSource[]; // representative refs, capped for large vector clusters
  reason: string;           // short explanation for why this is worth inspecting
  associatedText?: VisualRegionAssociatedText[]; // nearby or in-region captions/form labels/panel titles/chart titles/table lead-ins/image labels/headings included in the region box
  image?: string;           // cropped PNG path, present iff --render-visual-regions rendered this region
  renderContentRatio?: number; // content ratio measured from the cropped PNG
  renderedContentBox?: { x: number; y: number; width: number; height: number }; // tight non-background pixel bbox in page coords, present iff --render-visual-regions measured visible crop content
}

interface VisualRegionSource {
  type: 'imageBox' | 'vectorBox' | 'layoutTable' | 'formField' | 'annotation';
  index: number;            // 0-based index into that page-level source collection, internal if not emitted
}

interface VisualRegionAssociatedText {
  text: string;
  relation: 'caption' | 'label';
  x: number; y: number; width: number; height: number;
  blockIndex?: number;      // 0-based index into layout.blocks[] for captions/headings/table lead-ins
  fieldIndex?: number;      // 0-based index into formFields[] for form labels
}
```

`visualRegions[]` is a dispatch layer for human-like PDF vision. It groups existing geometry into padded, page-clamped bboxes for important raster images, compact raster text strips, vector drawing clusters, `layout.tables[]` hints, form-field clusters, and visible annotation markup such as highlights, stamps, ink, and shape annotations. When nearby captions or form labels are detected (`Figure`, `Table`, `Plate`, `図`, `表`, `図表`), `associatedText[]` records the text and the crop bbox expands to include nearby text, so the rendered crop carries the human-visible explanation instead of only the raw picture/widget rectangle; caption-matching lines are preferred over their enclosing layout block so table headers or prose below a caption do not become misleading associated text, and local caption association keeps only the best nearby caption group so adjacent table captions do not get attached to a lower figure crop. Bare or tiny references such as `Fig.4` inside the visual region are ignored as captions unless the same text also carries descriptive caption words at readable size. Raster image crops can also attach short directly-below plain labels (for example slide image captions) while filtering copyright/license notes. Large raster and mixed visual regions can attach short non-heading chart titles inside the top of the region, while large unlabeled regions can also attach a nearby non-repeated heading, or a heading inside the top of the region, as `relation: "label"` so charts, form/table backplanes, and ECG-style panels retain the visible title a human would use to identify them. Nearby lettered panel titles such as `(a) ...` can also attach as labels and expand chart/map/panel crops upward, even when the region already has embedded labels. Table regions can also attach short plain lead-ins such as "The following table..." or "... as follows:" when the visible table itself has no caption. Page-level `Plate` captions can attach as metadata to distant panel crops without expanding every crop to include the caption block, which keeps multi-panel map/figure crops local while preserving the shared caption context; figure captions that explicitly enumerate panels with cues such as `A,B:` and `C,D:` can also group disconnected vector chart fragments into one crop and include the full caption block. Repeated header/footer text is excluded from caption association when multi-page evidence is available. Page-sized raster/vector boxes are treated as background when more specific foreground boxes or dense vector-grid structure exists, including dense thin vector grids over full-page raster backdrops, and broad vector-only backplanes spanning multiple substantial raster panels are suppressed so panel-level crops remain available; this keeps slide wallpapers, full-page design layers, and CAD/drawing backplanes from swallowing the actual diagram/table/plan regions. If a full-page cover or scan is the main visual evidence and only small logos, edge chrome, or low-confidence OCR-fragment table hints compete with it, the full-page raster is still emitted, including rotated scan pages. When full-page render evidence classifies the page as blank, visual regions are suppressed so blank pages and invisible form fields or annotations do not become vision-model dispatch targets. Narrow page-edge chrome is suppressed so marginal ribbons, side URLs, watermarks, small raster logo/text strips aligned with header/footer rules, and header/footer bands do not become vision-model dispatch targets. Dense vector pages get fallback clustered regions from thin but long vector line boxes, so separate table-like grids can produce separate crops even when individual line boxes are too thin for normal clustering. Dense small vector marker fields can also produce dense visual-region crops, split by disconnected marker clusters, which catches scatter/dot-heavy biomedical figures, maps, and marker fields whose panel text or labels are embedded in vector art rather than extractable text without forcing unrelated regions into one page-wide crop. Shallow, page-wide, two-row layout table hints and extreme-column two-row table hints are suppressed as visual-region seeds because they often come from graph ticks, OCR fragments, or unrelated panels rather than a human-readable table crop. Dense form pages split interactive fields into section/row-sized crops, suppress large or contained vector-only form backplanes that would otherwise duplicate form sections, skip hidden/invisible/noView form fields and annotations as visual-region seeds while keeping them in `formFields[]` / `annotations[]` when those extraction passes are requested, skip FreeText annotations without appearance streams as crop seeds while keeping their annotation metadata and search matches, skip unpositioned widget-appearance vector boxes when form-field bboxes provide the real page positions, and keep thin checkbox rows or markup rows when padding makes the crop readable. Agents can feed a region directly into `--render-region <x,y,width,height>` to inspect the figure/chart/table/form/annotation visually without first clustering raw `imageBoxes[]`, hundreds of `vectorBoxes[]`, or annotation bboxes. Region coordinates stay in the same page-view top-left coordinate system as `imageBoxes[]` / `layout.blocks[]`; on rotated pages pdfvision maps the crop through the rotated pdf.js viewport so the output PNG follows the human-visible page orientation. `--render-visual-regions` skips the manual second call and renders each suggested crop directly into `visualRegions[].image`; it also attaches `renderContentRatio` and, when non-background pixels occupy a tighter area than the source-geometry crop, `renderedContentBox` in the same page coordinate system. It implies `--visual-regions` but does not require full-page `--render`. `sourceCount` is the full number of source items represented; `sources[]` is capped to keep vector-heavy pages compact.

On vector-only empty-text pages, a single page-sized vector box is emitted when it is the only nonblank visual evidence, so path-drawn symbol sheets and vector-only diagrams still produce a crop-ready region.
## Rendering: `--render-scale` and `--render-region`

Prerequisites differ: `--render-scale` requires `--render`, `--render-visual-regions`, or `--ocr` (which internally rasterises); `--render-region` requires `--render` or `--ocr`. Either errors rather than silently doing nothing.

- **`--render-scale <n>`**: rasterisation scale multiplier. Default `2` (≈144 DPI). Bounds `(0, 4]`. Smaller values shrink the vision-model payload; larger values capture finer detail.
- **`--render-region <x,y,w,h>`**: render one page sub-rectangle in the same raw unrotated page-view top-left system as `imageBoxes` / `layout.blocks`; the bbox passes unchanged. Pixel dimensions equal raw region × UserUnit × render scale. Rotated pages can swap output pixel width/height because the crop is mapped through the human-visible viewport. It is single-page only and rejects out-of-bounds regions. The tuple is in the cache key and filename, and is echoed in `PageResult.renderRegion`.
- **`--render-visual-regions`**: render every `visualRegions[]` crop and attach `image` / `renderContentRatio` on each region. When the rendered crop contains measurable non-background pixels, `renderedContentBox` gives the tighter rendered-pixel bbox in page coordinates while leaving the source-geometry region unchanged. Region boxes include associated captions/form labels, nearby panel titles, short table lead-ins, short image labels, and nearby headings when detected, so the crop is usually closer to what a human would select before asking a vision model to read it. This uses the same output directory, `--render-scale`, cache image validation, and safe per-PDF subdirectory rules as full-page `--render`, but leaves `pages[].image` absent unless `--render` was also requested.

Typical agent flow: extract with `--layout`, find a suspect block in `layout.blocks[i]` (or get its index out of `warnings[i].blockIndex`), then re-run with `--pages <N> --render --render-region <x,y,w,h>` using `blocks[i]`'s bbox to zoom in.
