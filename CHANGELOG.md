# Changelog

Notable user-facing changes to pdfvision are documented here.

## [Unreleased]

### Changed

- Documented that `--render-scale` without `--render`, `--render-visual-regions`, or `--ocr` exits with an error instead of silently doing nothing. The behavior is not new, but no help line, topic, or site page said so, so the error could only be learned by hitting it.

- Moved the documentation site's hand-written reference content — security egress and cache details, exact library signatures and `onWarning` semantics, schema presence contracts, and MCP parameter caveats — into `docs/cli-topics/*`, so `pdfvision docs <topic>` readers see what only web readers used to. Three site pages carried claims the code does not support and were corrected rather than copied: `pages[].layout.lines` does not exist (lines live under `blocks[].lines`), a symlinked `--attachment-output` path is not refused (only the internal per-document fingerprint directory is checked for that), and the `processFile` example was missing the required `noCache` field.
- Cut the bundled agent skill to a single `SKILL.md` and routed its detail to `pdfvision docs <topic>`. The five `references/*.md` files were a second copy of what the CLI now prints from inside the binary, and they went stale independently — the skill was installed from GitHub while the CLI came from npm, so the two could disagree about the same flag. Routing by topic name does not make a rename backward-compatible — the skill still names a topic, and a renamed one has to be updated there too. What changes is how that failure presents: a reference file orphaned by a skill update kept being read as though it were current, while a stale topic name cannot be served at all — the command exits 1 and says the topic is unknown, naming the closest match when one is close enough and nothing when it is not. A test now catches the stale name before it reaches anyone.

## [0.17.0] - 2026-08-11

### Changed

- Added `pdfvision docs` — the topic list and, with a topic name, its body — and cut `--help` from 20 KB to under 5 KB. The help was the first thing every agent read and the thing every error pointed at, so its size was a tax on first contact; the detail it carried now lives in fourteen topics that cost nothing until asked for. The topics are embedded at build time, so they describe the version actually installed rather than whatever the web has, and they need no network access. An unknown topic names the closest match and exits 1 instead of falling back to the list, which would read as "this topic is empty".
- Gave the trust boundary around PDF content a home the CLI can reach. `pdfvision docs security` states that everything pdfvision prints is authored by the document, what that rules out, and what `--remote`, `--password`, and `--attachment-output` each expose; `--help` now says so directly rather than leaving the topic list to be noticed. It was in the README and the bundled skill and nowhere an installed CLI could produce it, so anyone using pdfvision without the skill never saw it.
- Moved cache clearing to a `clear-cache` subcommand and stated the shape it belongs to at the top of `--help`: options are for reading a PDF, anything else is a subcommand, with `--help` / `--version` as the usual exceptions. `--clear-cache` still clears the cache and now warns; it is removed in v1.0. Terminal flags that quietly meant "do something other than read this PDF" had started accumulating their own precedence rules in the help text, and `mcp` was already on the other side of that line. Because clearing is destructive, `clear-cache` refuses rather than guessing when a file of that name exists in the working directory.
- Reported a crop-ready `region` alongside `bbox` on every `--matches-only` match, in all four formats, grown to the containing table row or visual line the way MCP's search refs already were. The evidence chain the README and `--help` recommend is a CLI flow, and it was still handing back the glyph-hugging box that renders a financial row's label without its values.
- Relayed page-level extraction warnings in `search_pdf`: a page carrying a hit and an `invisible_text`, `text_under_opaque_fill`, or glyph-garbage warning now says so, since a match is a claim about text the page may not actually show.
- Collapsed a blank form's field table to a count and a type breakdown on surfaces that request the pass on the caller's behalf (the MCP server), instead of a full-width row per empty widget. On the IRS W-9 that table was 37% of page 1 while the response budget pushed pages 4-6 out. Filled values, checked boxes, scripted widgets, and hidden/locked ones still get a row each; `--form-fields` on the CLI is unchanged. ([#162](https://github.com/yamadashy/pdfvision/issues/162))

### Fixed

- Replayed a run's warnings on a cache hit. Facts that only ever reached the caller through `onWarning` — a page range that ran past the end of the document, a per-page match cap — were dropped by every call after the first, turning an admittedly-partial answer into an apparently-complete one.
- Included `UserUnit` when fitting an MCP render to the image budget. A `/UserUnit 10` page was rasterised ten times over the limit, and the byte cap runs after the PNG exists, so it could not prevent the allocation. A page too large to fit legibly now says so and names `region` as the recovery.
- Kept both of two embedded files that share a name and a byte length. Attachment identity hashed neither, so the second `report.csv` vanished from the listing; FileAttachment annotations also overwrote each other by filename before that.
- Dropped a source's older refs when a new response files its own, which is what the ref contract already promised. A response producing five refs left `p1m5` resolvable after a later one produced only `p1m1`, so a stale handle rendered a crop from a search the caller had replaced.
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

[Unreleased]: https://github.com/yamadashy/pdfvision/compare/v0.17.0...HEAD
[0.17.0]: https://github.com/yamadashy/pdfvision/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/yamadashy/pdfvision/compare/v0.15.0...v0.16.0
