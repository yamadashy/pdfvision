---
code: annotation_text_missing_from_native
availability: always on (internal annotation pass; no `--annotations` required)
summary: One or more visible FreeText annotation appearances have `contents` that are not represented in `pages[].text`.
---

It can appear even when `--annotations` was not requested for output; public `pages[].annotations` is still emitted only with `--annotations`.

**Next step:** treat native text as incomplete; read `pages[].annotations` (with `--annotations`), use `--search`, or `--render-region` the annotation bbox when exact visible text matters.
