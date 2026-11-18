---
code: vector_chart_labels
availability: needs `--layout`; Markdown always has it
summary: A vector chart's labels (values, legend, categories) were kept together in the body, but which value belongs to which bar or series is only in the drawing.
---

It requires `--layout` because it inspects layout lines and blocks. It fires when a cluster of vector paths with bars (at least three text-free marks of one width standing side by side on one baseline with different lengths, or the horizontal equivalent) holds labels that are mostly short and at least 30% numeric, including a word, and no layout table already covers it. The labels are read as one group (bar by bar over vertical bars, otherwise row by row) next to the caption, but their order does not pair a value with its bar, series or category.

**Limits:** line charts and diagrams without bars do not fire it. Gridded or ruled tables (numbers inside text-bearing cells) do not fire.

**Next step:** render the named region before quoting or comparing values.
