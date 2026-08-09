# Changelog

Notable user-facing changes to pdfvision are documented here.

## [Unreleased]

### Changed

- Collapsed a blank form's field table to a count and a type breakdown on surfaces that request the pass on the caller's behalf (the MCP server), instead of a full-width row per empty widget. On the IRS W-9 that table was 37% of page 1 while the response budget pushed pages 4-6 out. Filled values, checked boxes, scripted widgets, and hidden/locked ones still get a row each; `--form-fields` on the CLI is unchanged. ([#162](https://github.com/yamadashy/pdfvision/issues/162))

### Fixed

- Grew a search hit's `render_pdf(ref: …)` crop to the table row or visual line it sits in, instead of padding the glyph bbox by a constant. On a financial table the old crop rendered the row label and none of its values, and a short CJK query produced an unreadable sliver. Hits the page's layout does not cover — OCR-sourced matches, pages with no reconstructed lines — keep the constant padding as the fallback. ([#159](https://github.com/yamadashy/pdfvision/issues/159))
- Mapped encrypted-PDF failures on the MCP surface to a message naming the `password` parameter, instead of relaying pdf.js's raw `No password given`. A missing password and a wrong one now read as different failures, since the recovery differs. ([#160](https://github.com/yamadashy/pdfvision/issues/160))
- Stopped telling Markdown and MCP readers to "prefer layout.blocks order" on a `reading_order_divergence` warning, when that body is already the layout-rebuilt reading order and MCP has no way to request `layout.blocks` at all. The divergence is still reported; only the remedy clause changes, and JSON, XML, and TOON keep the original wording their consumers can act on. ([#161](https://github.com/yamadashy/pdfvision/issues/161))
- Corrected the `--render-region` line in `--help`'s Common flows block, which omitted `-r` and therefore failed with `--render-region requires --render or --ocr` when typed as printed. That block exists to steer agents to the evidence chain, so a command that errors is worse than no example. ([#168](https://github.com/yamadashy/pdfvision/pull/168))
- Kept an unchecked checkbox or radio widget's row when it carries a script, a ResetForm action, `required`, `readOnly`, or a hidden / invisible / noView / locked flag. The blank-form collapse returned early on any unchecked button, so those signals were folded into the count — contradicting the documented promise that hidden and locked widgets keep a row. `invisible` now counts alongside them. ([#169](https://github.com/yamadashy/pdfvision/pull/169))

## [0.16.0] - 2026-08-09

### Added

- Added an MCP server behind `pdfvision mcp`, serving `read_pdf` / `search_pdf` / `render_pdf` over stdio for hosts without a shell (Claude Desktop, Cursor, Cline, Zed, n8n). An unscoped `read_pdf` on a long document returns a document map with next steps, search hits carry short refs that `render_pdf` accepts in place of coordinates, responses are budgeted with named follow-up calls, and remote URLs are refused when they resolve to private, loopback, link-local, CGNAT, or NAT64 addresses. ([#139](https://github.com/yamadashy/pdfvision/pull/139))
- Added `read_pdf(attachment: "name-or-index")` so an MCP caller can open an embedded file — in Factur-X/ZUGFeRD e-invoices the attachment is the authoritative data. Text attachments come back inline, images as image blocks, and opaque binaries are refused with a pointer to the CLI. ([#151](https://github.com/yamadashy/pdfvision/pull/151), follow-ups [#153](https://github.com/yamadashy/pdfvision/pull/153))
- Added `--map`: a document map (metadata, outline, per-page quality and warning codes collapsed into ranges) without page bodies — the cheap first move on an unknown document. ([#149](https://github.com/yamadashy/pdfvision/pull/149))
- Added an always-on `xfa_form` warning and `xfa` structured-output field for XFA documents, plus an `attachmentCount` presence signal for embedded files. Attachment extraction already existed; XFA content itself is not extracted. ([#101](https://github.com/yamadashy/pdfvision/pull/101))
- Added the `page_edge_text_truncated` error warning for text runs matching pdf.js's page-boundary truncation signature. The warning detects possible loss but does not recover omitted text. ([#105](https://github.com/yamadashy/pdfvision/pull/105))
- Added tagged-table reconstruction under `--structure`, with GFM table output in Markdown and inferred row/column header metadata in JSON, XML, and TOON. ([#106](https://github.com/yamadashy/pdfvision/pull/106))
- Added an always-computed `javascriptActionCount` presence signal, surfaced when non-zero, while keeping document-level action details behind `--viewer`. ([#107](https://github.com/yamadashy/pdfvision/pull/107))
- Added the `invisible_text` error warning for native text drawn with PDF text rendering mode `Tr 3`, with suppression for expected raster/OCR text layers. ([#108](https://github.com/yamadashy/pdfvision/pull/108))
- Added the conservative `text_under_opaque_fill` error warning for native text covered by later opaque dark rectangular fills. It requires positive paint-order and geometry evidence rather than claiming to detect every redaction failure. ([#109](https://github.com/yamadashy/pdfvision/pull/109))

### Changed

- Bounded regex-mode search at ~1s of regex time per page, enforced with a V8-level interrupt, so a catastrophic-backtracking pattern can no longer stall extraction: the affected page's results are dropped with a warning, an interrupted search result is never cached, and `search_pdf` relays the warning in its MCP response. ([#154](https://github.com/yamadashy/pdfvision/pull/154))
- Opened `--help` with a Common flows block naming the flagless read, the `--search … --matches-only` → `--render-region` evidence chain, and the OCR re-read, after bare-agent regression runs showed agents never scrolled to `--search`. ([#156](https://github.com/yamadashy/pdfvision/pull/156))
- TOON output follows the @toon-format/toon v4 wire format, including nested tabular headers. ([#136](https://github.com/yamadashy/pdfvision/pull/136))
- Upgraded pdfjs-dist to 6.2.108 (security release), accepting the Map-shaped viewer dictionaries it introduces. ([#143](https://github.com/yamadashy/pdfvision/pull/143))
- Reduced Markdown outline size by omitting non-actionable internal destination identifiers, and corrected the large-output hint to recommend `--outline -p 1`. Structured JSON and XML outline targets remain unchanged. ([#99](https://github.com/yamadashy/pdfvision/pull/99))

### Fixed

- Kept the `--remote` timeout active until the response body is fully consumed, so a server that sends headers and then stalls the body is aborted at the deadline instead of hanging. ([#116](https://github.com/yamadashy/pdfvision/pull/116))
- Emitted the per-page search match-cap warning only when a valid match actually exceeds the 10,000 budget, instead of firing on an exact-capacity result. ([#118](https://github.com/yamadashy/pdfvision/pull/118))
- Defined the structured-output contract precisely: decoded TOON is the exact parsed-JSON equivalent of the JSON output, lone UTF-16 surrogates are rejected before UTF-8 replacement can hide them, and XML represents forbidden controls with reversible markers. ([#120](https://github.com/yamadashy/pdfvision/pull/120))
- Exposed non-default PDF `/UserUnit` values and documented the physical-point and render-pixel conversion formulas, while keeping all public bboxes in raw pdf.js page-view coordinates. ([#123](https://github.com/yamadashy/pdfvision/pull/123))
- Hardened cache-root handling: cache use and `--clear-cache` require an owned marker and trusted ancestor chain, unrecognized directories are never destructively adopted, and remote cache hits are read from verified file descriptors. ([#124](https://github.com/yamadashy/pdfvision/pull/124))
- Defined the CLI exit contract for missing input: no positional input exits 2 with explicit precedence over cache, stdin, and semantic validation, and a sole empty positional argument is treated as missing input. ([#125](https://github.com/yamadashy/pdfvision/pull/125), [#126](https://github.com/yamadashy/pdfvision/pull/126))
- Preserved short title and author columns in right-to-left reading order on established vertical Japanese pages. ([#100](https://github.com/yamadashy/pdfvision/pull/100))
- Preserved explicit word spaces and corrected common paired-bracket direction when reconstructing right-to-left text. ([#102](https://github.com/yamadashy/pdfvision/pull/102))
- Reported `checked: true` only for the selected radio widget instead of every widget in its group. ([#104](https://github.com/yamadashy/pdfvision/pull/104))

[Unreleased]: https://github.com/yamadashy/pdfvision/compare/v0.16.0...HEAD
[0.16.0]: https://github.com/yamadashy/pdfvision/compare/v0.15.0...v0.16.0
