---
name: search
description: The SearchMatch shape and every --search semantic: literal vs regex, normalization, which sources are searched, and the find-then-zoom loop. Use when running --search or interpreting its matches.
---

# Search output

Reference for `-f json`, `-f xml`, and `-f toon` consumers.

## Search (`--search`)

```ts
interface SearchMatch {
  page: number;                // 1-based, mirrors PageResult.page
  query: string;               // verbatim source query
  queryIndex?: number;         // 0-based into the search array; omitted for single-query calls
  bbox: { x, y, width, height }; // union bbox of contributing spans/words/widgets/links/annotations
  boxes: { x, y, width, height }[]; // per-span/word/widget/link/annotation bboxes
  text: string;                // matched substring in the same form as pages[].text
  source: 'native' | 'formField' | 'link' | 'annotation' | 'ocr'; // native/span, formField/widget, link target, annotation, or OCR
  context?: string;            // the hit's line, reconstructed the way pages[].text renders it
}
```

Emitted only when `--search` is passed. Each emitted query occurrence becomes one match — three emitted hits of `"foo"` on page 5 yield three entries with `page: 5`. At most 10,000 matches are emitted per page, query, and source. The first additional valid match produces a warning (stderr in the CLI, `onWarning` in the library API); it and later matches for that combination are dropped.

**One-pipeline find-then-zoom**: every box pdfvision emits is already in `--render-region`'s coordinate system, so no conversion is needed. Prefer `--matches-only`, whose entries add a crop-ready `region` grown to the table row or visual line containing the hit; `bbox` crops to the matched glyphs alone, which on a financial table renders the row label and none of its values. `region` exists only in the `--matches-only` report — on the full report, pad `bbox` before rendering it: pdfvision's own layout-free fallback is `max(60, 0.6 × bbox.width)` on each side horizontally and `max(12, 0.3 × bbox.height)` vertically, in raw page-view units, clamped to the page box (`--render-region` rejects out-of-bounds rectangles rather than clipping them). That padding is an approximation: `region` also grows the crop to the containing table row or line before padding, which the formula alone cannot reproduce — one more reason to prefer `--matches-only`. The agent loop is:

```bash
pdfvision doc.pdf --search "revenue" --matches-only --json
# pick a match m from matches[*]
pdfvision doc.pdf -p <m.page> --render --render-region <m.region.x>,<m.region.y>,<m.region.width>,<m.region.height>
```

`--matches-only` keeps the flat report compact but preserves non-default physical scaling as optional `pageUserUnits: [{ page, userUnit }]` metadata in JSON/TOON, equivalent `<pageUserUnits>` entries in XML, and a `Page UserUnits` summary in Markdown. The field is omitted when every selected page uses UserUnit 1. Each match carries both `bbox` (raw page-view box hugging the matched glyphs) and `region` (the crop-ready box grown to the containing table row, or the visual line when the page has no detected table). XML exposes the pair as `x`/`y`/`width`/`height` plus `regionX`/`regionY`/`regionWidth`/`regionHeight` on `<match>`. Both are raw page-view values that pass unchanged to `--render-region`. Pass `region`: passing `bbox` there crops to the matched glyphs alone, which on a financial table renders the row label and none of its values.

**Semantics**:

- **literal substring** by default (regex chars in the query are escaped). Pass `--search-regex` to opt into JavaScript regular expressions.
- **case-insensitive** by default (recall-oriented). Pass `--search-case-sensitive` for exact-case matching.
- **NFKC-aware and C0-cleaned in literal mode** when `--normalize` is on (default) — `"fi"` finds `"ﬁ"` (U+FB01 ligature) PDFs that external grep would miss, with the same fold for fullwidth Latin / CJK compatibility forms and the same non-visible C0-control cleanup as `pages[].text`.
- **CJK display-spacing aware in literal mode** — adjacent CJK characters in the query can match visual title spacing in the PDF text stream, so `科学` can find `科 学` while still keeping wide column gutters as search-line breaks.
- **Compact table-header rows can be searched as phrases** — adjacent short column labels such as `"Advance Estimate Second Estimate Third Estimate"` stay searchable as one row, while broad prose columns remain separated.
- **Regex queries are NOT normalized** — NFKC can turn compatibility punctuation into regex metacharacters (silent overmatch or syntax break). Regex users get the literal codepoints they typed against the normalized document text and own the asymmetry.
- **Multi-query** via repeating `--search` (or `search: string[]` in library). Each match carries `queryIndex` so the agent can demultiplex which query produced it.
- **Native text is searched at reconstructed visual-line level**. A query can cross pdf.js span / font-run boundaries on the same line (e.g. `"Hello World"` split into `Hello` + `World`) and returns a union `bbox` plus per-span `boxes[]`, but narrow horizontal column gutters are treated as line breaks so matches do not stitch the end of one horizontal column to the start of another. Detected CJK vertical body columns are searched in top-to-bottom, right-to-left reading order; half-size furigana/ruby columns excluded from `pages[].text` and layout are also excluded from native search lines. `pages[].text` joins the same columns only when the source stream already follows that order. Multi-line phrase stitching is intentionally not modelled yet because the resulting region is usually too broad for visual zoom.
- **A native hit's `context` quotes the reconstructed line**, the same text `pages[].text` and `pages[].layout` show for that line, so a preview taken from a match and the body of the page cannot disagree. It matters most for right-to-left scripts, where reconstruction restores the inter-word spaces pdf.js emits as separate items and un-mirrors bracket glyphs; the raw match haystack does neither. Where no reconstructed line covers the hit — an OCR-derived match, a hit stitched across a line break — `context` falls back to the raw match line, and OCR matches keep their ±60-character window.
- **Partial native-span matches are sliced inside the span bbox**: horizontal spans are sliced along x, while tall vertical/rotated spans are sliced along y so `--render-region` can zoom to the matched word instead of the whole line.
- **Form field values are searched too**. Form-field matches come back with `source: 'formField'` and use the widget bbox, even when `--form-fields` was not requested for output; comb text widgets narrow matches to the matching cells when pdf.js exposes `maxLen`/comb appearance metadata. Choice fields search the selected option's visible display value when it differs from the exported value. Checkbox and radio widgets search their export value — the per-widget on-state name that Markdown shows in the Export column, and often the only place an option's wording appears — whether or not that option is the selected one; their `value` is not searched, because it is the group's state repeated on every widget and Markdown prints it as `checked`/`unchecked` instead. Internal values that are not visible text, such as the `Off` state name or hidden/noView widget values, are not searched.
- **Link targets are searched too**. Link matches come back with `source: 'link'` and use the clickable link bbox, even when `--links` was not requested for output. This lets URL / destination / attachment-target searches succeed even when the visible link text is glyph-garbled. A link hit is dropped as a double report only when the anchor restates the target — every word of the visible link text already occurs in the target, as with a URL printed as itself — and a native hit of the same string overlaps the link box. A prose anchor that merely shares a word with its target (`Download the full dataset here` → `…/datasets/q3-2026-full.csv`) keeps both hits, because the sentence and the target are different evidence.
- **Visible FreeText annotation contents are searched too**. Annotation matches come back with `source: 'annotation'` and use the annotation bbox, even when `--annotations` was not requested for output. Sticky-note popup contents and other normally closed annotation comments are not searched.
- **OCR text is searched too when `--ocr` is on**. OCR-derived matches come back with `source: 'ocr'`; when `ocr.words[]` is present, `bbox`/`boxes[]` use OCR word geometry in the same raw page-view coordinate system as native spans. If word-level reconstruction misses one or more occurrences, pdfvision supplements from full `ocr.text` with a page-level bbox so no-space scripts and OCR line-boundary differences still remain searchable. If native text, a rendered form-field value (text, choice, or button caption), or visible annotation text already produced the same query/text hit on that page, the duplicate OCR hit is suppressed so the precise non-OCR bbox wins; OCR-only extra hits are still emitted. Link targets and checkbox/radio export values do not suppress anything: neither is drawn on the page, so OCR reading the same string somewhere on it has found a different occurrence, not the same one twice.

In regex mode two time budgets can turn a page's hits into an empty list: the ~1s per-page budget (that page's results are dropped) and the ~12s budget on regex time per request (pages still unsearched when it runs out stay unsearched — the warning names exactly which, since pages are searched concurrently and the unsearched ones are not necessarily a tail — while matches already found are kept). Both warn, both keep the result out of the cache, and both mean a `[]` on that page reports "not searched", not "not present" — which is why the warning, not the match count, is what settles a regex zero.

`pages[].matches` is **present-with-`[]`** when `--search` ran but the page had no hits — distinct from the field being absent entirely (search wasn't requested). The same posture extends to the overview, which gains a `matchCount` mirror field with the same present-with-`0` semantics.
