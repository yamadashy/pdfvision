---
code: text_matches_background
availability: always on (operator-list signal; no flag required)
summary: Native text is filled in the colour of what is painted behind it, so a reader sees blank space where `pages[].text` has words.
---

It fires on native glyphs (fill rendering modes `Tr 0`/`Tr 4`) whose fill colour, after compositing with the nonstroking alpha, is within 8/255 per RGB channel of the paint behind them — white text on a white page, blue text on a box of the same blue, or text at alpha 0. Glyphs are placed as for `text_under_opaque_fill`. The warning lists up to three passages of at least 3 non-whitespace characters as `"text" (bbox x,y,w,h)` in raw page units, plus a count and, when there are more, the bbox enclosing all of them.

Severity is `warning`, not `error`: the extraction is faithful to the file — the text is really in it — and the commonest real cause is invisible production metadata (printer slugs, job IDs, the GPO "VerDate … Jkt …" slug on every Federal Register page) rather than concealment, though a clause hidden by recolouring it, a redaction done by changing the text colour, or keyword stuffing look the same.

**Limits:** it fires only when the background is provably known. The colour behind a glyph is known only when the most recent paint overlapping the glyph's body is an opaque, unclipped, axis-aligned rectangle of a device colour that contains it, or when nothing was painted there (viewers render the page white). Any other paint under the glyph — complex or rounded paths, pattern or gradient fills, shadings, translucent, clipped, transparency-group, or optional-content fills, strokes — makes the background unknown and the glyph is not reported; so does any raster image overlapping the glyph, a later visible glyph painted on top of it (halo or knockout copies), a glyph off the page, text under a soft mask or a non-normal blend mode, stroke-only and invisible rendering modes (`Tr 3` is `invisible_text`), and pattern-filled text. So light text over photos, gradients, rounded or other complex shapes, and pale but visible text (watermarks) stay silent; absence of the warning is not proof that every glyph is visible. Paint history fails closed above 4,096 recorded paints or 2,000,000 background checks. Suppressed on raster-backed OCR text layers. The warning does not change `quality`.

**Next step:** either way the passages are not what a reader sees, so do not present them as visible content; render a listed bbox when the passage matters to the answer.
