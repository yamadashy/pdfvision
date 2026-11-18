---
code: invisible_text
availability: always on (operator-list signal)
summary: Text drawn with PDF text rendering mode `Tr 3` is in native extraction, but a human viewer cannot see it.
---

It fires when one or more text-show operations ran while `Tr 3` was active. pdf.js exposes the mode change and decoded glyph Unicode in the page operator list (the one already fetched for image/vector analysis), so the warning includes a short sample when available. The text remains in `pages[].text` but is not painted for a human viewer. This is an error-level trust signal.

**Limits:** suppressed when a full-page raster indicates an OCR text layer, including sparse OCR residue below the normal `raster_backed_text_layer` threshold, because invisible text is expected there and the existing scan warnings already explain that trust boundary. Text drawn in the colour of its background (for example white on white) is reported separately as `text_matches_background`.

**Next step:** treat the sampled text and matching native search hits as unverified until compared with `--render`.
