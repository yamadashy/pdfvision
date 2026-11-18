---
code: vector_chart_labels
availability: needs `--layout`; Markdown always has it
summary: A vector chart's labels (values, legend, categories) were kept together in the body, but which value belongs to which bar, line, slice or series is only in the drawing.
---

It requires `--layout` because it inspects layout lines and blocks. It fires when a cluster of vector paths that is a chart holds labels that are mostly short and at least 30% numeric, and no layout table already covers it. A chart is one with bars (at least three text-free marks of one width standing side by side on one baseline with different lengths, or the horizontal equivalent; its labels must include a word), a series line (a stroked polyline running steadily left to right and rising and falling across most of the labels: the message says `vector line chart`), or a pie or donut (filled slices of different colours making one disc: `vector pie chart`). The labels are read as one group (bar by bar over vertical bars, otherwise row by row) next to the caption, but their order does not pair a value with its bar, point, slice, series or category.

Not raised for a chart whose every value label was paired with its series by colour under `layout.charts` (`### Chart values`), with a value for every series in every category; see `pdfvision docs visual`.

**Limits:** diagrams without bars, series lines or slices do not fire it. Gridded or ruled tables (numbers inside text-bearing cells) do not fire.

**Next step:** render the named region before quoting or comparing values.
