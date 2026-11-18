---
code: reading_order_divergence
availability: needs `--layout`
summary: Visual reading order differs from `pages[].text`.
---

It fires when:

- a heading that leads `layout.blocks` (the visual reading order) only appears in the back half of the native text stream — magazine-style frame layouts emitted out of order, the page title buried mid-`text`;
- a slide-style visually-first title/header is drawn last and appears at the end of native text;
- a late bottom note or right sidebar appears at the start of native text;
- reconstructed layout lines inside one block are emitted out of order;
- a compact math-like block appears with reordered characters, such as a superscript emitted after the baseline expression;
- `--form-fields` exposes form labels whose native text order differs from the visible row order.

`blockIndex` points at the displaced heading, slide title/header, late block, local block, or form-label block.

**Limits:** form date placeholders such as `MM / DD / YYYY` are suppressed.

**Next step:** prefer `layout.blocks` order over `pages[].text` when sequence matters — that is the remedy the message carries in JSON, XML, and TOON. Markdown (and therefore the MCP tools) already rebuilds the body from layout blocks on these pages, so there the message says so instead: the divergence is real, the text you are holding is already the visual order, and `--render-region` / `render_pdf` is the confirmation step when sequence is critical.

**Exception — the layout order is itself broken:** side-by-side prose blocks alternating line by line (at least four switches, each side resuming within one line of leading), or one block whose prose lines share no horizontal extent because it ran on into the next column. Then the message instead says `the layout-rebuilt order is unreliable here too`, names the blocks, and ends `render the page to read it in sequence`. Side-by-side blocks (a sidebar beside the body, two columns sharing baselines) were read line by line or run together, so neither `layout.blocks` nor the Markdown body is in reading order — on every surface, render the page and read it from the image. Absence of that clause is not proof the rebuilt order is right; it only means neither defect was seen.
