---
code: display_math_layout
availability: always (Markdown, JSON, XML, TOON); reads glyph positions and vector rules, not `--layout`
summary: A display formula (fraction, bracketed matrix) is set in two dimensions that could not be read onto one line; its pieces come out as separate fragments.
---

pdfvision reads two-dimensional math onto one line from its geometry: a fraction (a thin rule with one tight run centred above and one below, and text on the rule's axis beside it) reads as `num/den`, with a part longer than one term in brackets (`(c (1 + z))/H_0`); a big operator with limits as `∑_{k=1}^N`; a matrix between a pair of vector brackets as `[[a, b], [c, d]]`; and an equation number joins its equation (`… , (1)`). This warning names the regions that matched those shapes but could not be read soundly:

- a fraction with a piece between its numerator and denominator that belongs to neither (a script the text pass did not attach, a nested root), or a part set larger than the line;
- a bracket pair around rows that do not split into the same number of cells.

Those regions keep their pieces as separate fragments rather than a guessed formula.

**Limits:** formulas whose layout leaves no vector rule or bracket (a stacked `cases` brace drawn as glyphs, a multi-line aligned derivation) do not fire it; a fraction written with a slash is ordinary text.

**Next step:** render the named region (`--render-region x,y,w,h`) before quoting the formula or a value in it.
