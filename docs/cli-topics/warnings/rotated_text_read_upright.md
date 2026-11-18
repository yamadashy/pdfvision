---
code: rotated_text_read_upright
availability: with layout (always in Markdown and MCP; JSON/XML/TOON need --layout)
summary: Most of the page's text is drawn turned a quarter or half turn with no `/Rotate` to match, and was read in its own upright frame.
---

It fires when layout blocks marked `rotation` hold at least half of the page's characters: a landscape sheet or a `sidewaystable` set onto a portrait page, or a page printed upside down, with no `/Rotate` to match. pdfvision read that text the way it reads a `/Rotate` page: lines, row order, and layout tables are rebuilt in the turned frame, so the reading is right. The message gives the share, the turn, and the region's bbox.

`rotation` follows the `/Rotate` convention: the clockwise turn of the page that shows the text upright. `90` is text running up the page, `270` down, `180` upside down. Bboxes stay in the page frame, so a turned block is tall and narrow, and a turned table's rows each span the table's extent along the page. Their cells' boxes say where each row runs.

A smaller turned region (a sideways table or text box on an otherwise upright page) is read the same way and gets the same `rotation` on its blocks and tables, plus a note in Markdown where it starts, but no page warning. Short turned text (an axis title, a margin stamp beside the body, turned tick labels or table headers) is left as it was: a region needs three rows of cells set a gap apart, one of them longer than a tick label, or two long unbroken lines.

**Limits:** only quarter and half turns (within 3°) are read in their own frame. Text set at other angles stays one line per text object, which is right for a straight label. Without layout (`--format json` without `--layout`), `text` keeps content-stream order and this warning does not fire.

**Next step:** read the text as given. `--render` and `--render-region` show it turned, so turn a crop `rotation`° clockwise before reading it.
