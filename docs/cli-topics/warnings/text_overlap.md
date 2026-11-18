---
code: text_overlap
availability: needs `--layout`
summary: Non-repeated layout blocks overlap in a way that may scramble reading order.
---

`blockIndex` and `otherBlockIndex` name the pair.

**Limits:** shallow adjacent-line bbox slack from inline math, multi-line math annotations, superscripts, subscripts, punctuation-only inline fragments, dotted map/decorative texture blocks, and callout-marker continuation lines is suppressed.

**Next step:** prefer `layout.blocks` order; render the region when sequence matters.
