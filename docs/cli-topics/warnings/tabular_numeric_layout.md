---
code: tabular_numeric_layout
availability: needs `--layout`
summary: Many short numeric lines form multiple aligned columns with shared row positions, so row/column relationships can be flattened in plain native text.
---

It requires `--layout` because it inspects layout lines and blocks. Common cases: financial statements and dense numeric tables whose row/column relationships are visually obvious. Irregular financial tables can still surface when labelled rows have recurring numeric columns.

**Limits:** chart-axis tick labels and irregular chart data-label rows are suppressed.
