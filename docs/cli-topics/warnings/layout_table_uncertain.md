---
code: layout_table_uncertain
availability: needs `--layout`; Markdown computes layout internally, so it also appears there without the flag
summary: A `layout.tables[]` hint did not resolve into one consistent grid, so some of its cells may sit in the wrong row or column, or be missing.
---

`tableIndex` names the table, and the message lists which of these reasons fired plus the table bbox as a ready `--render-region`. It fires for one `layout.tables[]` entry when its geometry is self-contradictory:

1. A horizontal text line containing a digit has its centre strictly inside the table bbox and at or below the top of the first body row (a row with a value next to another cell), yet no single cell holds at least half its area — a dropped row or value. When its centre is above the first body row's top only a bare value counts, because unclaimed text there is header context; vertical (stacked CJK) lines are never counted.
2. One row has two value cells (numbers or dash placeholders) assigned to the same `column`.
3. Two neighbouring columns are each filled by at least two body rows but never by the same row — one visual column split in two, or two stacked tables with different grids read as one, so a value's column depends on which row it is in.
4. A row's label wraps over lines above the line that carries its values, the row above has values and ends its label in a full-width line in the same column, and those lines sit no clearly closer to their own values than to the row above — nothing in the spacing says whether they finish the label above or start this one (they are kept with this row, as statements set them).
5. A row has values but no label, and label text in the label column overlaps it vertically from the line above or below — a two-line label set around its values' line, read as a label-only row, a value-only row, and a label joined to the next row. A row set apart from its neighbours (a standard error under its coefficient) is not overlapped and does not count.

**Limits:** a table with empty cells, merged values, or grouped headers is not flagged by itself, and unclaimed text-only lines (notes, captions, wrapped prose) are not counted.

**Next step:** render the table's region and read the values from the image before trusting the table.
