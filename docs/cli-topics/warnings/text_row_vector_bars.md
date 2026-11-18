---
code: text_row_vector_bars
availability: needs `--layout`; uses the internal fill colours of vector paths
summary: Coloured bars stacked in text rows (a Gantt schedule or a bar chart) show values the text does not have.
---

It fires on at least four same-height coloured bars stacked in text rows, with no text inside them and varying in start and length (a Gantt schedule) or in length from one start (a bar chart): the text has the row labels, not the dates, durations, values or status the bars show. The message names a region (the rows, plus the scale or legend just above and below) to `--render-region`.

**Limits:** filled, non-white bars only: stroked form boxes, rules and underlines thinner than 3 pt, bars holding text (shaded rows, labelled boxes), bars of mixed heights or scattered down the page (flowchart arrows), and bars past all text (margin decoration) do not count; not emitted when `dense_vector_graphics` fired. Side lines, arrows between text boxes and vertical column charts are not covered.

**Next step:** render the region the message names and read what the bars show from the image.
