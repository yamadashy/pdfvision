# OCR reference

Detail on the `--ocr` flag — when to reach for it, multi-language behaviour, confidence semantics, install / cache requirements, and troubleshooting. Read this when running `--ocr` on non-English text, when the confidence comes back unexpectedly low, or when `tesseract.js` install needs diagnosing.

For the basic flow ("page is image-flattened, run `--ocr -f json`"), the top-level SKILL.md is enough.

## When to run OCR

The trigger is the density Overview, not the page content itself. Look for:

- `coverage: 0%` (or near-zero) with `imageCount > 0` — page body is rasterised
- `text` is empty or garbled (a few stray characters like `r rv`) — PDF font tables are broken
- The whole document looks fine but one page comes back empty — likely a slide / figure / scan

`pdfvision` never auto-triggers OCR. The agent decides per page after reading the density signal. OCR cost is ~0.5–2 s per page (CPU-bound) plus a one-time worker boot of a few seconds; running it on every page of a 100-page paper is rarely worth it.

## Lang codes and ordering

`--ocr-lang` takes the tesseract.js plus-separated form: one or more 3-letter (or `chi_sim` style) codes joined with `+`.

```bash
npx pdfvision doc.pdf --ocr --ocr-lang eng         # English only (default)
npx pdfvision doc.pdf --ocr --ocr-lang eng+jpn     # English + Japanese
npx pdfvision doc.pdf --ocr --ocr-lang chi_sim     # Simplified Chinese
npx pdfvision doc.pdf --ocr --ocr-lang eng+chi_sim+chi_tra
```

**Order matters.** Tesseract treats the first language as the primary recogniser; later languages act as additional candidate dictionaries. `eng+jpn` favours English glyph recognition and falls back to Japanese; `jpn+eng` does the opposite. Empirically:

- For mostly-Japanese slides with English headers / labels: `jpn+eng`
- For English documentation with sparse Japanese terms: `eng+jpn`
- When unsure, run both and compare `confidence` and `text`

pdfvision normalises whitespace in the lang string before keying the cache (` eng + jpn ` and `eng+jpn` share a slot) but **preserves order** — `eng+jpn` and `jpn+eng` are genuinely different recognisers and intentionally land in different cache slots.

The echoed `pages[].ocr.lang` returns the whitespace-normalised, order-preserved form (`'eng+jpn'`, not `' eng + jpn '`).

## Confidence semantics

`pages[].ocr.confidence` is `0..1` (rounded to 3dp). Tesseract reports `0..100` internally; pdfvision divides by 100 to match the existing `textCoverage` convention.

Rough interpretation, treat as heuristic:

- `>= 0.8` — high confidence, OCR text is usable as-is for most agent purposes
- `0.5–0.8` — usable but verify on important entities (numbers, names, code identifiers)
- `< 0.5` — partial recognition. Either wrong `--ocr-lang`, low-resolution scan, or stylised typography. On scan-like pages where native extraction is empty, sparse, glyph-corrupted, or riding on a raster-backed text layer, this also appears as `pages[].warnings[].code === 'ocr_low_confidence'`. Compare with the rendered PNG via `--render` before trusting the text.

High confidence can also expose native-text-layer quality problems. On raster-backed scan pages, `pages[].warnings[].code === 'ocr_native_text_mismatch'` means OCR found high-confidence words whose nearest native tokens are different, so exact native search may miss visible words. `pages[].warnings[].code === 'ocr_native_spacing_loss'` means OCR and native text contain comparable characters, but the native text has lost many word boundaries. Prefer comparing `ocr.text` with the render before using exact wording from `pages[].text`.

A `confidence: 0` with an empty `ocr.text` usually means the rasterise step produced a blank page (see "Troubleshooting" below) rather than OCR genuinely finding nothing. **Check `pages[].quality.visualStatus` first**: when it is `blank`, the render came out blank and OCR had nothing to work with; when it is `sparse`, the page has tiny visible marks and should be inspected with geometry or a crop before reporting "no text".

## Output shape

```ts
interface PageOcr {
  text: string;        // trimmed of trailing whitespace, line breaks preserved
  confidence: number;  // 0..1, page-level mean
  lang: string;        // whitespace-normalised, order-preserved
  words?: OcrWord[];   // OCR word boxes in page coordinates, when tesseract returns layout
}

interface OcrWord {
  text: string;
  confidence: number;  // 0..1, word-level confidence
  x: number; y: number; width: number; height: number;
}
```

`pages[].text` (pdfjs-derived) is **never overwritten** by OCR — both signals coexist on the same page object so the agent can diff and decide. A scanned PDF typically shows empty `text` with populated `ocr.text`; a mixed-content PDF shows native text in `text` and an alternative OCR-derived reading in `ocr.text` (useful sanity check for ambiguous glyphs). `ocr.words[]` is optional because tesseract may occasionally omit layout blocks, but when present it lets `--search` return OCR word-level bboxes. If word-level reconstruction misses a query that exists in full `ocr.text` (for example OCR line-boundary or spacing differences), search falls back to `ocr.text` with a page-level bbox instead of dropping the hit.

In XML output, OCR without word boxes surfaces as `<ocr lang="..." confidence="...">...</ocr>`. When word boxes are present, the OCR element contains `<text>` and `<words><word .../></words>` children. Self-closing `<ocr lang="..." confidence="0"/>` means OCR ran and produced no text — distinct from the tag being absent (OCR wasn't requested).

## Install requirements

`tesseract.js` is declared in `optionalDependencies`. Default `npm install pdfvision` pulls it in (~30 MB worker bundle); `npm install --omit=optional` skips it.

When `--ocr` is requested without `tesseract.js` installed, pdfvision throws:

```text
--ocr requires the optional dependency "tesseract.js" (not installed).
Install it with: npm install tesseract.js
```

Other import-time errors (broken native binding, transitive syntax error) surface the real error message, not the install hint — so the agent can diagnose without false leads.

## Traineddata cache

Tesseract downloads per-language `*.traineddata` files (~10–15 MB each) on first use:

- `eng.traineddata` ≈ 10 MB
- `jpn.traineddata` ≈ 13 MB
- `chi_sim.traineddata` ≈ 16 MB

pdfvision points tesseract.js at `<cache-root>/ocr-data/` (POSIX 0700) so:

- The data lands under pdfvision's own cache hierarchy (consistent perms, single place)
- `npx pdfvision --clear-cache` wipes traineddata alongside extraction caches
- The download happens once per language; subsequent runs are offline

First `--ocr` invocation against a new language takes a few extra seconds for the download. Subsequent invocations of the same language are instant on the boot step (still ~1–2 s for the worker init).

## Troubleshooting

### Benign stderr noise on the first --ocr run

When `--ocr` boots tesseract.js for the first time in a session, you may see stderr lines like:

```text
Error opening data file ./.traineddata
Failed loading language ''
```

These are **harmless pre-load probes** from tesseract.js's internal boot sequence, not fatal errors. The recogniser then honors the `--ocr-lang` you actually passed. Confirm by checking `pages[].ocr.confidence` in the JSON output — if it's `> 0` and `pages[].ocr.text` is populated, OCR succeeded. Do not interpret these stderr lines as a reason to abort.

### "OCR ran but `text` is empty and `confidence: 0`"

Most likely the rasterise step produced a blank page, not an actual OCR failure. Common cause: the PDF uses an image format pdfjs + `@napi-rs/canvas` can't decode (notably JPEG2000 / JPX, common in Internet Archive scans). First check `pages[].quality.visualStatus`: `blank` means OCR had a near-uniform input, while `sparse` means there are tiny visible marks worth inspecting with geometry or a crop. Verify by:

```bash
npx pdfvision doc.pdf -p <page> --render --render-output /tmp/dbg
# Inspect /tmp/dbg/<contentFingerprint>/page-<n>.png — if it's blank, OCR has
# nothing to chew on. (pdfvision namespaces the output by a per-PDF
# fingerprint so two different PDFs sharing a --render-output dir don't
# overwrite each other.)
```

This is a known limitation tracked separately from OCR. Workaround: source a different copy of the PDF, or pre-decode the JPX stream with a wasm decoder before invoking pdfvision.

### "Confidence is moderate but text has obvious garbage"

Most often a `--ocr-lang` mismatch — the page contains a language not listed in the spec, or the order is wrong (Japanese-dominant page run with `eng+jpn` instead of `jpn+eng`). Try the alternative ordering and compare.

Second most common: low resolution. pdfvision renders at 2× by default. For genuinely fine print, render to PNG manually at higher scale and feed through tesseract.js directly via the library API (the CLI doesn't currently expose a scale flag for OCR).

### "OCR is slow — N pages × M seconds is unbearable"

- Restrict the page range: `-p <range>` to OCR only the pages that need it (use the density Overview to pick).
- The single worker is reused across pages within one invocation, so a 10-page OCR run pays the boot cost once and per-page cost N times. Splitting across invocations would re-pay the boot cost on each.
- pdfvision's page-level parallelism does **not** apply to OCR (single worker by design). Spawning multiple workers would multiply memory by ~30 MB / language without a meaningful win.

### "I want OCR to overwrite `text` so my downstream consumer doesn't have to choose"

By design, no. The agent / downstream is the one to decide which signal to use. If a consumer wants a single field, it can pick at consumption time:

```ts
const effectiveText = page.text || page.ocr?.text || '';
```

Keeping both signals available means a sanity check (compare native vs OCR for ambiguity) is always possible.

## Examples

```bash
# Japanese slide deck, eng-dominant titles
npx pdfvision slides.pdf --ocr --ocr-lang jpn+eng -f json

# English paper with embedded Chinese citations
npx pdfvision paper.pdf --ocr --ocr-lang eng+chi_sim -f json

# Scanned book, English only
npx pdfvision scan.pdf -p 1-20 --ocr -f json | \
  jq '.pages[] | {page, conf: .ocr.confidence, head: .ocr.text[0:120]}'
```
