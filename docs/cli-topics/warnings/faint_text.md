---
code: faint_text
availability: always on (operator-list signal; no flag required)
summary: Native text is drawn faint — at a fraction of full contrast against what is behind it — so a reader sees it greyed out while the text carries it like any other line.
---

It fires on native glyphs (fill rendering modes `Tr 0`/`Tr 4`) whose fill colour, after compositing with the nonstroking alpha, stays within 56/255 per RGB channel of the paint behind them but is not within 8/255 (that is `text_matches_background`). Black at 15% opacity on white lands at 38, light grey `#ccc` on white at 51; `#bbb` (68), `#999` (102), ordinary grey captions and coloured text on a tinted panel of similar strength do not fire. The commonest causes are a slide deck built up over overlay pages, where items not yet revealed are drawn at low opacity (Beamer's `\setbeamercovered{transparent}`), a watermark such as `DRAFT`, and deliberately dimmed text. The warning lists up to three passages of at least 3 non-whitespace characters as `"text" (bbox x,y,w,h)` in raw page units, plus a count and, when there are more, the bbox enclosing all of them.

On overlay pages it tells which items a viewer of that page does not yet see: consecutive pages that repeat one slide's content step by step each list the items still faint on that step.

**Limits:** the background must be provably known, exactly as for `text_matches_background` (an opaque, unclipped device-colour rectangle containing the glyph, or the bare page), and the same exclusions apply — images under the glyph, later glyphs painted over it, soft masks, non-normal blending, optional content, stroke-only and invisible rendering modes. Overlays that hide unrevealed items completely (`\setbeamercovered{invisible}`) leave no text to flag; overlays that dim them by colour over a gradient or image background are not seen. Suppressed on raster-backed OCR text layers. The warning does not change `quality`.

**Next step:** do not present a listed passage as content the page shows at full strength — on an overlay step it is not yet revealed; render a listed bbox when its visibility matters to the answer.
