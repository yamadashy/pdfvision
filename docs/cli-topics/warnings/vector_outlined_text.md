---
code: vector_outlined_text
availability: always on; uses the internal path shapes of vector drawings
summary: A drawing holds words or values drawn as letter-shaped outlines with no text behind them; they are missing from the text.
---

It fires on a page that has native text elsewhere when vector fills shaped like letters (small closed outlines with curves, letter-sized, set close on one baseline, upright or turned a quarter turn) form at least four rows of three glyphs or more in one area, at least twelve glyphs in all, and no text item lies over them. A package drawing's dimensions, a chart whose tick labels were converted to outlines, a board diagram's printed labels and a form's pre-printed headings look like this. The message names the largest region (and up to two more) to `--render-region`.

**Limits:** a logo or wordmark of up to three rows does not fire it; nor do long rows of one repeated shape (a pin header, a dot grid), dots, stars or other polygon icons; stroke fonts (CAD text drawn as stroked lines) are not recognised; a page with no text at all gets `vector_graphics_no_native_text` instead. On a page whose paths exceed the shape budget, only the first paths are examined.

**Next step:** render the region and read the labels from the image before answering from the drawing.
