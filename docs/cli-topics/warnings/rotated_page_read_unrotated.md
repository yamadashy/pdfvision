---
code: rotated_page_read_unrotated
availability: always on; rotated pages only
summary: A page stored with `/Rotate` 90, 180, or 270 whose text is upright only in the stored orientation is read, reported, and rendered unrotated.
---

It fires when most of the page's native characters have an upright left-to-right baseline as stored but not after the rotation, so a viewer would show the text sideways or upside down. pdfvision reads, reports, and renders that page unrotated instead of in the displayed frame every other page uses: bboxes, `width` / `height`, `--render-region`, and the `--render` PNG all follow the stored page, while `rotation` still reports the page dictionary value.

**Limits:** a rotated page with no native text, or whose text is upright after rotation, never fires it and is read in the displayed frame.

**Next step:** text set the other way on the same page (upright only as displayed) reads sideways in the stored frame, and its lines may come apart. When it is at least 5% of the characters, the message gives its share: render the page and read that text from the image. Otherwise nothing to recover; the warning explains why this page's size and render are not turned by its `rotation`.
