---
code: duplicate_text_layer
availability: always on (internal spans; no `--layout` or `--geometry` required)
summary: Native text contains a hidden near-duplicate layer of visible content at a consistent scaled/shifted position, so `pages[].text` is inflated.
---

Layout blocks may merge duplicate runs. It may co-occur with `off_page` or `text_overlap`, which remain separate layout-geometry symptoms of the inflated native layer.

**Next step:** prefer the render or OCR when exact visible text matters.
