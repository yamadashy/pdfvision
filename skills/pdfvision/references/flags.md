# Flag selection reference

SKILL.md carries the one-line-per-flag table for picking a flag fast. This file holds the hard-won per-flag caveats — the edge cases that decide whether a flag is the right one for an unusual document. Read it only when choosing between overlapping structural flags (`--layout` vs `--visual-regions` vs `--image-boxes` vs `--form-fields`, etc.) for a document that does not behave like the common case.

The default extraction is enough for most native-text PDFs (papers, exports from Word / Pages / Markdown tooling). It automatically surfaces non-zero form-field, link, annotation, top-level outline, attachment, and document JavaScript presence counts; use the corresponding opt-in flag when a count shows furniture that the task needs. Output field shapes for each flag live in `references/structured-output.md`; OCR specifics in `references/ocr.md`; warning-code interpretation in `references/warnings.md`.

## `--layout` — reconstruct reading order, headings, table rows

Reach for it on multi-column papers, including dense journal layouts with narrow repeated gutters or drop caps. Japanese vertical-writing slides/docs surface display and body-sized CJK stacks as `writingMode: "vertical"`, keep tatechuyoko ASCII digit groups inline in their vertical column, and expose display-spaced CJK title rows such as `科 学`. Short corroborated page-edge vertical chrome is marked `repeated` without dropping sentence-like margin text. Use it on slides where the agent must process blocks in order.

For table-heavy financial/government PDFs, `layout.tables[]` row-major hints preserve numeric row/cell relationships better than raw blocks — including compact two-column year/value tables, dense recurring numeric gutters or narrow same-row numeric gutters that would otherwise merge several values into one line, trailing currency markers in financial statement rows, long financial row labels before recurring year columns, and leading header/sparse rows above wide recurring numeric tables with score/percentile cells.

## `--image-boxes` — where raster images sit

Bbox overlay on rendered PNG, figure detection, masked/pattern image fills.

## `--vector-boxes` — where vector marks sit

Maps, symbol tables, diagrams, chart paths, clipped shading/gradient panels, form boxes, table rules, slide shapes, and PDFs where visible structure is vector-drawn rather than raster images.

## `--visual-regions` — crop-ready visual regions

Figure/chart/diagram/table/form/annotation pages where an agent should use suggested `--render-region` bboxes, instead of manually clustering raw image/vector/layout/form/annotation coordinates. Captures nearby captions/form labels when found (`Figure`, `Table`, `Plate`, `図`, `表`, `図表`), nearby panel titles such as `(a) ...`, short directly-below image labels, short in-region chart titles, nearby or in-region headings for large unlabeled regions, and short table lead-ins such as "The following table..." or "... as follows:".

Caption attachment rules:

- Page-level `Plate` captions can attach as metadata to distant panel crops without expanding every crop to include the caption block.
- Multi-panel figure captions with `A,B:` / `C,D:` cues can group disconnected vector chart fragments into one crop with the full caption block.
- Bare or tiny in-region references like `Fig.4` are **not** attached as captions unless they have descriptive caption text at readable size.
- Repeated header/footer text is **not** attached as a caption when multi-page evidence is available.

Suppression rules:

- Page-sized background boxes are suppressed when more specific foreground geometry or dense vector-grid structure exists.
- Broad vector backplanes that span multiple substantial raster panels are suppressed so individual panels remain crop targets.
- Corroborated narrow page-edge chrome is suppressed so marginal ribbons, side URLs, small raster logo/text strips inside header/footer rule bands, and header/footer bands do not become vision targets; full-page covers/scans still emit renderable regions when only small logos or edge chrome compete with them.
- If full-page render evidence (including a rendered full-page visual-region crop) says the page is blank, visual regions are suppressed.

Density and form rules:

- Dense vector grids can produce fallback regions for table-like structures.
- Dense small vector marker fields are clustered into separate dense visual-region crops when disconnected.
- Dense forms produce section/row-sized crops instead of one page-sized crop.
- Hidden/invisible/noView form fields and annotations are not used as visual crop seeds.
- FreeText annotations without appearance streams stay available through annotations/search but are not used as crop seeds.
- Unpositioned widget-appearance vector boxes are skipped when form-field bboxes provide the real page positions.

## `--render-visual-regions` — render the suggested crops

Same cases as `--visual-regions`, when the next step is a vision-model pass and the agent wants `visualRegions[].image` crops with associated captions/form labels, nearby panel titles, short table lead-ins, short image labels, short in-region chart titles, nearby headings, and `renderedContentBox` hints for sparse/transparent crops — without rendering every full page.

## `--form-fields` — form controls and blank fields

Government forms, applications, tax forms, questionnaires, and any PDF where checkboxes, radio buttons, signatures, text boxes, choice widgets, buttons, or their nearby visible labels are part of the meaning.

- Widget annotation flags such as `hidden`, `print`, or `noView` are exposed so agents can detect print-only or screen-hidden fields.
- Checkbox/radio export values, widget JavaScript actions, and non-JavaScript ResetForm button behavior are exposed when present, so agents can see submitted values, button click scripts, reset-all buttons, and selective reset buttons.
- Choice widgets keep submitted/exported selections in `value`, include selected viewer labels in `displayValue` when those differ, and include exported/display option values when the PDF exposes them, plus combo/list and multi-select flags.
- Push buttons include viewer-visible `caption` text when pdfvision can recover it from widget appearance characteristics, and `--search` can return those captions as form-field matches.

Label association (the fiddly part):

- Stacked above/below label lines are merged when they form one visible prompt; checkbox/radio labels stay on their own option row when adjacent options are stacked.
- Right-edge checkbox/radio prompts can keep wrapped instruction text that finishes on the widget row while dropping dotted leader filler, line-number gutters, and following caution/instruction paragraphs with their own row prefix.
- Left-side checkbox/radio prompts can merge directly preceding continuation lines, so labels like "check this box..." keep their setup text.
- Narrow inline text fields can keep left-side instruction labels such as tax-classification prompts with dotted leader filler trimmed; tall multiline text fields can keep short left-side labels across wider form gutters.
- Right-edge amount boxes with dotted leaders can expand compact markers like "1 $" or "4(a) $" back to the visible multi-line prompt.
- Fine-grained spans are considered so adjacent same-row prompts such as "Middle Initial" and "Other Last Names Used" do not collapse onto both fields; semantically named fields avoid unrelated nearby text when no credible label is found.

## `--links` — clickable navigation

Papers and manuals with citation links, table-of-contents jumps, cross-references, and external URLs whose clickable regions matter to a human PDF reader. Internal links include the resolved physical target page and visible link text when available, including narrow inline links over tokens inside a wider text line.

## `--annotations` — comments and markup

Reviewed PDFs, annotated drafts, PDFs with sticky notes, highlights, underlines, strikeouts, stamps, file-attachment icons, shape markup, ink, or other non-link annotation markup. Annotation flags such as `hidden`, `print`, or `noView` are exposed so agents can tell when markup may be print-only or not visible in a normal screen render. File-attachment annotations expose filename, description, and byte size metadata without embedding bytes in context. Shape annotations expose icon/name, border, line endpoint, polygon/polyline vertex, and ink path metadata when pdf.js provides it.

## `--structure` — tagged-PDF accessibility structure

Accessible PDFs, government forms/reports, manuals, and any PDF where figure alt text, role hierarchy, language hints, structure bboxes, or tagged tables may explain content that native text and rendered pixels alone do not label. Tagged `Table` structures are also reconstructed as row-major `structureTables[]` grids and GFM tables. Structure bboxes use the same unrotated page-view top-left coordinates as spans/layout/image boxes. Stray control bytes in structure strings are removed.

## Document-level feature probes

For the initial `-p 1 --page-labels --outline --viewer --layers` probe, `-p 1` limits page extraction/output, not whole-document loading, parsing, or runtime; document-level fields still return. Page JavaScript stays selected-page scoped, so rerun `--viewer` with the relevant range when it matters. Use `--structure` separately for page-level tagged trees.

## `--page-labels` — viewer page labels

Long reports, specs, books, and papers where the PDF viewer shows roman front matter, section prefixes, or restarted page numbering that differs from physical page numbers.

## `--attachments` (+ `--attachment-output <dir>`) — embedded file attachments

PDFs whose viewer attachment pane or page file-attachment icons expose supplemental files; emits names, descriptions, byte sizes, and optional saved paths without dumping attachment bytes into context.

## `--outline` — document sidebar navigation

Long reports, manuals, specifications, and papers where a human PDF reader would use bookmarks / outline entries to jump between sections, external URLs, or named viewer actions such as NextPage.

## `--viewer` — initial viewer state

PDFs whose opening mode, page layout, viewer preferences, OpenAction, document/page JavaScript actions, permissions, or tagged-PDF MarkInfo affects how a human reader sees or navigates the document. A flagless run already reports non-zero document JavaScript presence through `javascriptActionCount`; use `--viewer` to expose document action names and script source, plus page-level actions.

## `--layers` — viewer layer panels

Maps, CAD/design PDFs, multilingual/variant documents, or any file where a human PDF reader can toggle optional content groups that may hide visible labels, overlays, or design alternatives.

## `--password <value>` / `--password-stdin` — encrypted PDFs

Password-protected PDFs when the user explicitly provides the document password. The password is only used for pdf.js decryption and is never emitted in output. Prefer `--password-stdin` when shell history or process argv exposure matters; `--password` can be supplied as an explicit fallback when stdin is empty. Do not guess or store passwords.

## `--geometry` — per-text-item bbox + fontSize

Heading detection by font-size, custom layout heuristics. Each span represents one retained positioned pdf.js text item, which may contain one character, a word, or a longer string; its bbox is the rounded aggregate axis-aligned envelope, not individual glyph outlines. Note: `--geometry` has no effect with markdown output; use `-f json` / `-f xml` / `-f toon` to see the spans. See `references/structured-output.md` for filtering details.

## `--ocr` + `--ocr-lang` — text from pixels

Reach for it on `coverage: 0%` in the Overview, or `nonPrintableRatio >= 0.05` (native text includes glyph-index garbage). For non-English text, language order matters — primary language goes first (`jpn+eng` for Japanese-dominant, `eng+jpn` for English-dominant). Full lang combinations, confidence semantics, install/cache, and troubleshooting live in `references/ocr.md`.

## `--render` + `--render-output <dir>` — hand the page to a vision model

Multimodal flows, typically after the density Overview already flagged the page as low-text.

## `--render-scale <n>` (default 2, bounds `(0, 4]`) — shrink / enlarge the PNG

1×: half-size render payload, fine for most agentic-vision dispatch; OCR still rasterises at least scale 2 for recognition quality. 3×+: capture chart / fine-print detail.

## `--render-region <x,y,w,h>` — zoom into a sub-rectangle of one page

Use when the agent already saw a suspect block via `--layout` / `warnings[]` and only wants visual confirmation of that bbox, not the whole page. Coordinates use raw unrotated page-view units with a top-left origin; single-page only. Physical points = raw value × `pages[].userUnit` (or 1 when omitted), while pixels = raw region × UserUnit × render scale. The bbox passes unchanged. On rotated pages, pdfvision maps it through the rotated viewport, so the cropped PNG's visible width/height may be swapped.

## `--search <query>` — find occurrences with bbox

Repeatable; modifiers `--search-regex` / `--search-case-sensitive`. Answers the agent's "where does this term appear?" question and returns `pages[N].matches[*]` with span/word/widget/link/annotation-level bbox so the bbox feeds straight into `--render-region` for a follow-up visual zoom — one-pipeline find-then-zoom, no second pass. At most 10,000 matches are emitted per page, query, and source. The first additional valid match produces a warning (stderr in the CLI, `onWarning` in the library API); it and later matches for that combination are dropped. Pair with `--matches-only` (v0.13.0+) for a focused report containing the file, total page/match counts, and a flat emitted-match list. It omits the full pages/body payload, but its size still grows with emitted matches and context. Markdown also renders a per-page `Search matches` table when search ran; use JSON/XML/TOON when a downstream tool needs to consume coordinates directly.

Match semantics:

- Literal substring by default, case-insensitive, NFKC-aware and C0-cleaned (so `"fi"` matches the U+FB01 ligature, and literal search matches `pages[].text` cleanup), and CJK-aware enough that `科学` can match display-spaced `科 学`.
- Detected Japanese vertical body columns are searched top-to-bottom and right-to-left, including phrases that cross inline tatechuyoko digit fragments; `pages[].text` also joins those columns when the source stream already matches the detected top-to-bottom order, falling back per run when it does not.
- Compact table-header rows can match phrase queries across adjacent column labels while keeping broad prose columns separated.
- Also searches visible text/choice form field values (`source: 'formField'`; comb text widgets narrow to matching cells when available), clickable link targets (`source: 'link'`), visible FreeText annotation contents (`source: 'annotation'`), and OCR text when `--ocr` is on (`source: 'ocr'`, using OCR word boxes when present and supplementing from full `ocr.text` when word reconstruction misses one or more occurrences); duplicate OCR hits already covered by non-OCR matches are suppressed.

Full search schema and normalization rules are in `references/structured-output.md`.

## `--no-cache` — skip the on-disk cache

Forced re-extraction. Default behaviour is cache-on.

## Furigana / ruby handling (automatic, no flag)

On Japanese and Chinese annotated-reading pages, furigana/ruby is attached inline as `base《ruby》` when pdfvision can associate the smaller kana or pinyin-shaped run with an unambiguous CJK base range. This covers adjacent half-size ruby columns in vertical body text, smaller kana above horizontal CJK base text, and pinyin-shaped Latin readings above horizontal CJK base text. Ambiguous or unassociated ruby stays excluded so the body flow remains readable rather than guessed, and search uses both ruby-inclusive and ruby-stripped text so base-word queries still match through `《...》` annotations. Short medium-size note-reference marks in the right gutter of a vertical body column are also excluded from reconstructed body text/layout so they do not split the column. Context-supported short body-sized vertical runs with ellipsis leaders are joined with the surrounding vertical body flow. Inline tatechuyoko digit groups such as `10` are kept inside the surrounding vertical column when the source stream order agrees with the top-to-bottom geometry. `--geometry` still exposes the retained source text-item spans for inspection.
