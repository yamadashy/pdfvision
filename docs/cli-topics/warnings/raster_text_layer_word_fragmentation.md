---
code: raster_text_layer_word_fragmentation
availability: on raster-backed text layers (internal image-box pass; no `--image-boxes` required)
summary: A raster-backed native text layer has split many Latin words into isolated letter fragments, so `report` extracts as `r e p o r t`.
---

A common old-OCR failure.

**Next step:** treat exact wording and native search misses as suspect; compare a render or rerun with `--ocr`.
