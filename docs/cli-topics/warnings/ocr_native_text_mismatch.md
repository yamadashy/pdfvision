---
code: ocr_native_text_mismatch
availability: needs `--ocr`
summary: High-confidence OCR strongly disagrees with native text that otherwise looks `ok`.
---

It fires when OCR confidence is high and short OCR text of comparable length strongly disagrees with otherwise-ok native text. Common cases: a custom font renders a word correctly while native text extracts as printable glyph substitutions, or a raster-backed scan has high-confidence OCR words whose nearest native tokens are wrong.

**Next step:** compare against `--render`; for raster-backed pages, prefer OCR-backed search hits over native search misses. See `pdfvision docs ocr`.
