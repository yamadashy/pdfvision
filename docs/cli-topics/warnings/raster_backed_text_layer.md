---
code: raster_backed_text_layer
availability: always on (internal image-box pass; no `--image-boxes` required)
summary: Native text appears to be an OCR/text layer over a full-page raster scan; it may be useful but is error-prone.
---

This includes sparse OCR layers on scanned covers with minor decorative vector marks. Recognition can be wrong, exact native `--search` can miss visible words, and `spans` / `layout.blocks` geometry can drift from the pixels a human sees.

**Next step:** re-run with `--ocr` when wording or search recall matters.
