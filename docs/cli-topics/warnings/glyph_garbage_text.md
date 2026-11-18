---
code: glyph_garbage_text
availability: always on (text-quality signal)
summary: Native text is partly or mostly raw glyph-index garbage.
---

It fires when `quality.nativeTextStatus` is `mixed_glyph_indices` or `unusable_glyph_indices`, or when native text is dominated by Private Use Area glyph-code strings even though `nonPrintableRatio` is 0.

**Next step:** treat native `text`, `spans`, search hits, and layout text as incomplete or unreliable, and check them against the render or OCR before use: inspect `--render` and consider `--ocr`.
