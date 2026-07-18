# Changelog

Notable user-facing changes to pdfvision are documented here.

## [Unreleased]

### Added

- Added an always-on `xfa_form` warning and `xfa` structured-output field for XFA documents, plus an `attachmentCount` presence signal for embedded files. Attachment extraction already existed; XFA content itself is not extracted. ([#101](https://github.com/yamadashy/pdfvision/pull/101))
- Added the `page_edge_text_truncated` error warning for text runs matching pdf.js's page-boundary truncation signature. The warning detects possible loss but does not recover omitted text. ([#105](https://github.com/yamadashy/pdfvision/pull/105))
- Added tagged-table reconstruction under `--structure`, with GFM table output in Markdown and inferred row/column header metadata in JSON, XML, and TOON. ([#106](https://github.com/yamadashy/pdfvision/pull/106))
- Added an always-computed `javascriptActionCount` presence signal, surfaced when non-zero, while keeping document-level action details behind `--viewer`. ([#107](https://github.com/yamadashy/pdfvision/pull/107))
- Added the `invisible_text` error warning for native text drawn with PDF text rendering mode `Tr 3`, with suppression for expected raster/OCR text layers. ([#108](https://github.com/yamadashy/pdfvision/pull/108))
- Added the conservative `text_under_opaque_fill` error warning for native text covered by later opaque dark rectangular fills. It requires positive paint-order and geometry evidence rather than claiming to detect every redaction failure. ([#109](https://github.com/yamadashy/pdfvision/pull/109))

### Changed

- Reduced Markdown outline size by omitting non-actionable internal destination identifiers, and corrected the large-output hint to recommend `--outline -p 1`. Structured JSON and XML outline targets remain unchanged. ([#99](https://github.com/yamadashy/pdfvision/pull/99))

### Fixed

- Preserved short title and author columns in right-to-left reading order on established vertical Japanese pages. ([#100](https://github.com/yamadashy/pdfvision/pull/100))
- Preserved explicit word spaces and corrected common paired-bracket direction when reconstructing right-to-left text. ([#102](https://github.com/yamadashy/pdfvision/pull/102))
- Reported `checked: true` only for the selected radio widget instead of every widget in its group. ([#104](https://github.com/yamadashy/pdfvision/pull/104))

[Unreleased]: https://github.com/yamadashy/pdfvision/compare/v0.15.0...HEAD
