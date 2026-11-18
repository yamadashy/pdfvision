---
code: optional_content_text_may_include_hidden_layers
availability: always on
summary: The page text stream contains optional-content marked text while the PDF has at least one layer hidden by default, so `pages[].text` may include content the initial viewer render does not show.
---

pdf.js text extraction can include text from layers a human does not initially see.

**Next step:** inspect `--layers` and compare against `--render` before trusting `pages[].text` as the visible text.
