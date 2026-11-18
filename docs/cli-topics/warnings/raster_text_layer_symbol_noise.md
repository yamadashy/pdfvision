---
code: raster_text_layer_symbol_noise
availability: on raster-backed text layers (internal image-box pass; no `--image-boxes` required)
summary: A raster-backed native text layer is dominated by printable punctuation/symbol noise.
---

Common on old scan OCR title pages full of `^`, `_`, and stray marks, where `quality.nativeTextStatus` can still be `ok` even though the native text is visibly unreliable.

**Next step:** treat native text as especially suspect even if `quality.nativeTextStatus` is still `ok`.
