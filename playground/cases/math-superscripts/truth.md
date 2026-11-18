# Superscripts and subscripts

- **Stresses:** exponents, a superscript square, a negative exponent, a subscript, and a footnote marker drawn as raised/lowered small text
- **Families:** math
- **Status:** known-gap

A heading, a three-line paragraph, a small table and a footnote. Every raised or
lowered run has to stay distinguishable from the text around it — `10^19` must
not read as the number `1019`, nor the footnote marker as part of a word.
Any unambiguous notation is fine (`10^19`, `10<sup>19</sup>`, `10¹⁹`).

> The big model was trained for 2.3 · 10^19 FLOPs, about seven times the base model.[^1]
>
> Gradients are clipped when |∇f|^2 exceeds 10^4, and each sample is weighted by e^(-f).
>
> Residual dropout uses P_drop = 0.1 for the base model and 0.3 for the big one.

| Model | Train steps | FLOPs | P_drop |
| --- | ---: | ---: | ---: |
| base | 1.0 · 10^5 | 3.3 · 10^18 | 0.1 |
| big | 3.0 · 10^5 | 2.3 · 10^19 | 0.3 |

Footnote: `[^1]: Measured on eight P100 GPUs.`

Every raised and lowered run is marked (#241): `2.3 · 10^19`, `|∇f|^2`, `10^4`, `e^{-f}`,
`model.^1`, `P_{drop} = 0.1`, and the footnote reads `^1 Measured on eight P100 GPUs.`; the layout
table carries `P_{drop}` and `2.3 · 10^19` in its cells.

**Known gap (no issue yet):** in the page body the table is flattened column by column
(no `tabular_numeric_layout` warning, the table is small) and the footnote at the foot
of the page is emitted inside that run, between `big` and `Train steps`.
