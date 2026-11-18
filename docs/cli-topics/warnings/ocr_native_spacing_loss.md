---
code: ocr_native_spacing_loss
availability: needs `--ocr`
summary: On a raster-backed text layer, high-confidence OCR restores word boundaries that native text has lost.
---

It fires when OCR ran on a raster-backed text layer with high confidence, OCR and native text contain comparable characters, but native text has lost many word boundaries (`Ourwebsite` / `valuableresourcefor`) while OCR restores normal spacing — often scan OCR layers that extract as glued words.

**Next step:** compare `ocr.text` with the render when exact wording matters. See `pdfvision docs ocr`.
