---
code: large_raster_low_text_overlap
availability: internal image pass; stronger with `--image-boxes` plus `--layout` or `--geometry`
summary: A large raster image dominates a page whose native text is empty or sparse, or overlaps little native text, so labels, chart text, map text, or screenshot text inside it will not appear in native text.
---

It appears on empty/sparse-text visual pages when the internal image pass sees a large raster. With `--image-boxes` plus `--layout` or `--geometry` it gets stronger overlap evidence: it compares native text bboxes against raster regions and includes `imageBoxIndex` for pinpoint follow-up. It is not emitted on empty-native-text pages where `raster_image_no_native_text` already fired.

**Next step:** the message ends with it — `--render-region` for the image's region (clipped to the page), or `--ocr`. Treat the warning as "labels, chart text, map text, or screenshot text inside this image may need `--render` / `--render-region` / OCR."
