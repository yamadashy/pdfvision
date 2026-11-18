---
code: page_edge_text_truncated
availability: always on (internal span geometry)
summary: A long extracted text run reaches or slightly crosses the page boundary along its writing axis, so native text may be incomplete.
---

It fires on a run of at least 8 code points and 6em that reaches or crosses the page boundary by at most 1.25em along its primary writing axis, matching the last-kept-glyph signature when pdf.js drops later glyphs outside the page box. `blockIndex` is included when layout is available, and a same-block `off_page` finding is suppressed in favor of this content-loss warning.

**Limits:** natural punctuation endings (punctuation advance at a flush edge) are suppressed.

**Next step:** inspect `--render` or `--render-region` to see what the page actually shows.
