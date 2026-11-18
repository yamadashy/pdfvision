---
code: dense_vector_graphics
availability: always on (`vectorCount` signal)
summary: The page is dominated by meaningful vector drawing operations whose visible structure is not represented by native text.
---

Common firing cases: form boxes, checkboxes, table rules, chart paths, and diagrams.

**Limits:** text-dominant pages whose many vectors are only small scattered decorations are suppressed when pdfvision's internal vector-box geometry is available.

**Next step:** inspect `--render` (or `--vector-boxes` / `--visual-regions`) when the drawn structure matters.
