# Structured output schema

Reference for `-f json`, `-f xml`, and `-f toon` consumers. Read this when an agent or tooling consumes the structured payload programmatically and needs to know every field, its shape, and its coordinate convention.

The shape of `-f json` is the `DocumentResult` interface exported by the `pdfvision` package. `-f xml` carries the same data as `<document>` / `<page>` / nested tags, and `-f toon` carries it as [Token-Oriented Object Notation](https://toonformat.dev). All three are isomorphic to the same `DocumentResult` — pick whichever is easier for the consumer to parse (`toon` is the most token-frugal on span/array-heavy output; see "TOON output shape" below).

## DocumentResult (top level)

```ts
interface DocumentResult {
  file: string;                // path the CLI was invoked with (or cache path for --remote)
  totalPages: number;          // total in the source PDF, not in the selection
  metadata: DocumentMetadata;  // title / author / subject / creator (all string | null)
  overview?: PageOverview[];   // per-page density summary; present iff pages.length > 1
  pages: PageResult[];         // one entry per selected page, in page-number order
}
```

`file` is patched on cache hit to the current invocation's path, so a downstream consumer sees a meaningful path even when the cached entry came from a different invocation that touched the same content hash.

## PageOverview (density summary)

```ts
interface PageOverview {
  page: number;
  charCount: number;
  imageCount: number;             // raster image draws (XObject + inline + mask), per drawn instance
  textCoverage: number;           // 0..1, fraction of page area covered by text glyph bboxes
  nonPrintableRatio: number;      // 0..1, fraction of `text` that is NUL / control / noncharacter
  nonPrintableCount: number;      // raw count — stays discriminable when the 3dp ratio rounds to 0
  renderContentRatio?: number;    // 0..1, fraction of pixels differing from the page's dominant background (present iff --render or --ocr)
  quality: PageQuality;           // derived classification — see below
  warningCount?: number;          // mirror of pages[N].warnings.length, omitted when --layout off or no rule fired
  matchCount?: number;            // mirror of pages[N].matches.length; present-with-0 means "search ran, no hit"
  width: number;                  // PDF user-space points
  height: number;
}
```

`overview[]` is the first thing to inspect for silent-failure detection. The `quality` field gives a one-shot classification; the raw signals below let agents combine signals their own way:
- `imageCount > 0 && textCoverage ≈ 0` → image-flattened page; the text stream is empty.
- `nonPrintableRatio >= 0.05` → ToUnicode CMap missing; the text stream is full of raw glyph indices (NUL + control chars) even though `textCoverage` looks fine. Native text is unusable; fall back to `--render` or `--ocr`. Maps to `quality.nativeTextStatus === 'unusable_glyph_indices'`.
- `renderContentRatio <= 0.001` → rasterised page is effectively blank against its own dominant background (only meaningful when `--render` or `--ocr` was on). Background-aware so dark covers and beige scans don't false-trip it. Catches render-pipeline failures pdfvision can't otherwise surface: pdf.js + @napi-rs/canvas can't decode JPEG2000 image streams (common in Internet Archive scans), and PDFs whose fonts have no resolvable glyphs draw nothing. When OCR runs against this, `confidence: 0` is *not* an OCR miss — the input was a near-uniform image. Maps to `quality.visualStatus === 'blank'`.

## PageResult (per page)

```ts
interface PageResult {
  page: number;
  text: string;                  // NFKC-normalized unless --no-normalize
  rawText?: string;              // pre-normalization text — only present when normalization changed it
  charCount: number;
  imageCount: number;
  textCoverage: number;
  nonPrintableRatio: number;     // NUL / control / noncharacter ratio in `text`
  nonPrintableCount: number;     // raw count alongside the ratio
  renderContentRatio?: number;   // pixel fraction differing from the page's dominant background (present iff --render or --ocr)
  quality: PageQuality;          // derived per-page classification — agent-side dispatch lives on this field
  width: number;
  height: number;
  image?: string;                // absolute PNG path — present iff --render
  renderRegion?: { x, y, width, height }; // echoed back when --render-region was set; lets consumers tell crop vs full
  spans?: TextSpan[];            // present iff --geometry
  layout?: PageLayout;           // present iff --layout
  imageBoxes?: ImageBox[];       // present iff --image-boxes
  ocr?: PageOcr;                 // present iff --ocr
  warnings?: PageWarning[];      // present iff --layout, omitted when no rule fired on the page
  matches?: SearchMatch[];       // present iff --search; empty array means "search ran, no hit on this page"
}

interface PageQuality {
  nativeTextStatus:
    | 'ok'                       // usable native text
    | 'unusable_glyph_indices'   // nonPrintableRatio >= 0.05 — fall back to --ocr / --render
    | 'empty_but_visual_content' // no native text but the page has images / non-blank pixels
    | 'empty';                   // no text, no detected visual content
  visualStatus?:                 // present iff --render or --ocr triggered a raster
    | 'ok'                       // renderContentRatio > 0.001 — renderer drew real content
    | 'blank';                   // renderContentRatio <= 0.001 — effectively blank against the page's own background
}
```

`text` is the pdfjs-derived text stream. `ocr.text` (when `--ocr` is on) is the OCR result alongside, **never overwriting `text`** — consumers diff or pick whichever signal looks better for the page.

`quality` is pure observation, not recommendation: pdfvision tells the agent what it saw, the agent picks what to do next.

## Layout (`--layout`)

```ts
interface PageLayout {
  blocks: LayoutBlock[];     // in approximate reading order (multi-column aware)
}

interface LayoutBlock {
  text: string;              // line texts joined with \n
  x: number; y: number; width: number; height: number;
  lines: LayoutLine[];
  role?: 'heading';          // heuristic heading classification — see `level`
  level?: 1 | 2 | 3;         // present iff role === 'heading': 1=title, 2=section, 3=subsection candidate
  repeated?: boolean;        // chrome (running header / footer / page number / watermark) detected across pages
}

interface LayoutLine {
  text: string;
  x: number; y: number; width: number; height: number;
  fontSize: number;          // most common fontSize across the spans in this line
}
```

Multi-column reading order: `blocks[]` reads top-to-bottom of the left column before the right column. Standalone level-1 / level-2 headings act as column separators; level-3 candidates stay inside their column so subsection breaks don't scramble reading order. Block clustering is still heuristic — table cells may merge into a single block.

### Heading levels (`role === 'heading'`)

`role` is set when a block is classified as a heading; `level` ranks the visual hierarchy:

- `level: 1` — paper / page title (fontSize ≥ 1.40× body median).
- `level: 2` — section heading (≥ 1.25× under the legacy rule, or ≥ 1.15× with structural support: short and either standalone or locally larger than neighbours). Catches the typical LaTeX 12pt-over-10pt section style.
- `level: 3` — subsection candidate (≥ 1.08×, single short line, locally larger than same-column neighbours). Lower confidence; the kind of heading ResNet's `3.1.` and `3.4.` use.

Pick a slice that matches the use case:
- Title-only: `role === 'heading' && level === 1`.
- High precision (sections only): `role === 'heading' && level <= 2`.
- Recall-oriented (include subsections): all `role === 'heading'`.

Headings can co-occur with `repeated: true` (a doc title in a running header is still a heading); when chunking body content, filter `repeated: true` first.

## Image boxes (`--image-boxes`)

```ts
interface ImageBox {
  x: number; y: number; width: number; height: number;
}
```

One entry per drawn instance — a tiled hero image yields multiple entries. `imageCount === imageBoxes.length` is an invariant on every page. Form XObject CTM tracking ensures images drawn inside a form land at the correct page-space position.

## Spans (`--geometry`)

```ts
interface TextSpan {
  text: string;              // normalized by default (disable with --no-normalize)
  x: number; y: number;      // top-left in PDF points
  width: number; height: number;
  fontSize: number;          // max of horizontal / vertical text-matrix scales
  fontName?: string;         // pdf.js internal name e.g. "g_d0_f1"
}
```

Whitespace-only spans are filtered out — pdf.js emits a span per positioned space, which would double the array length without adding information.

## OCR (`--ocr`)

```ts
interface PageOcr {
  text: string;              // OCR-derived text, trimmed
  confidence: number;        // 0..1 (rounded to 3dp). Tesseract reports 0..100 internally; pdfvision normalises.
  lang: string;              // canonicalised lang spec — whitespace-trimmed, order preserved
}
```

`lang` echoes the caller's `--ocr-lang` after whitespace normalization but preserves token order. `eng+jpn` and `jpn+eng` produce different recognisers (tesseract treats the first language as primary) and therefore land in different cache slots and different `lang` echoes.

## Coordinate system

All coordinates (spans, layout blocks, image boxes, `renderRegion`) use a **top-down origin** in PDF user-space points: `(0, 0)` at the top-left of the page, `y` grows downward. This matches the rendered PNG convention, so a consumer can overlay any of the geometry signals onto `image` (when `--render` is on) without flipping.

To map PDF points onto rendered PNG pixels:

```ts
const sx = image.width / page.width;
const sy = image.height / page.height;
const pixelBox = { x: box.x * sx, y: box.y * sy, width: box.width * sx, height: box.height * sy };
```

## Rendering: `--render-scale` and `--render-region`

Both flags only have effect when `--render` (or `--ocr`, which internally rasterises) is on.

- **`--render-scale <n>`**: multiplier in pixels-per-point. Default `2` (≈144 DPI on a letter page). Bounds `(0, 4]`. Smaller values shrink the vision-model payload; larger values capture finer detail (chart labels, small typography).
- **`--render-region <x,y,w,h>`**: render only the given sub-rectangle of one page instead of the full page. PDF points, top-left origin, same coord system as `imageBoxes` / `layout.blocks`. Composes orthogonally with `--render-scale`: a 400×300pt region at scale 3 produces a 1200×900px PNG. V1 is strictly single-page (errors if `--pages` resolves to anything but exactly one page), rejects regions that fall outside the page bounds, and rejects rotated pages (`page.rotate !== 0` — pdfvision's existing geometry is in unrotated MediaBox coordinates and the rotation fix is a multi-file refactor still pending). The xywh tuple is part of the cache key and the on-disk filename (`page-N_x<x>_y<y>_w<w>_h<h>.png`), so multiple regions per page coexist. Echoed back on `PageResult.renderRegion` so consumers can tell a cropped image from a full-page one without inspecting the filename.

Typical agent flow: extract with `--layout`, find a suspect block in `layout.blocks[i]` (or get its index out of `warnings[i].blockIndex`), then re-run with `--pages <N> --render --render-region <x,y,w,h>` using `blocks[i]`'s bbox to zoom in.

## Warnings (`--layout`)

```ts
interface PageWarning {
  code: 'text_overlap' | 'near_bottom_edge' | 'body_near_repeated_chrome' | 'off_page';
  severity: 'warning' | 'error';
  message: string;
  blockIndex?: number;        // 0-based into pages[N].layout.blocks
  otherBlockIndex?: number;   // for pair-wise rules (text_overlap, body_near_repeated_chrome)
}
```

Emitted only when `--layout` is on. Each entry pins to a specific block (or block pair) and describes what looks visually off — overlapping text, off-page bbox, body crowding a detected running header/footer. Same observational posture as `quality`: pdfvision tells the agent what it saw; the agent decides whether to surface, re-OCR, or zoom in via `--render-region <blocks[blockIndex].x>,...`.

## Search (`--search`)

```ts
interface SearchMatch {
  page: number;                // 1-based, mirrors PageResult.page
  query: string;               // verbatim source query
  queryIndex?: number;         // 0-based into the search array; omitted for single-query calls
  bbox: { x, y, width, height }; // union bbox of contributing spans; feed straight into --render-region
  boxes: { x, y, width, height }[]; // per-span bboxes (V1: one entry for single-span matches)
  text: string;                // matched substring in the same form as pages[].text (NFKC when normalize is on)
  source: 'native' | 'ocr';    // native = precise span bbox; ocr = page-level bbox (V1 limit)
  context?: string;            // surrounding line text for human / LLM readability
}
```

Emitted only when `--search` is passed. Each query occurrence becomes one match — three hits of `"foo"` on page 5 yield three entries with `page: 5`.

**One-pipeline find-then-zoom**: a match's `bbox` is in the same coord system as `--render-region`, so the agent loop is:

```bash
pdfvision doc.pdf --search "revenue" --json
# pick a match m from pages[N].matches[*]
pdfvision doc.pdf -p <m.page> --render --render-region <m.bbox.x>,<m.bbox.y>,<m.bbox.width>,<m.bbox.height>
```

**Semantics**:

- **literal substring** by default (regex chars in the query are escaped). Pass `--search-regex` to opt into JavaScript regular expressions.
- **case-insensitive** by default (recall-oriented). Pass `--search-case-sensitive` for exact-case matching.
- **NFKC-aware in literal mode** when `--normalize` is on (default) — `"fi"` finds `"ﬁ"` (U+FB01 ligature) PDFs that external grep would miss, same fold for fullwidth Latin / CJK compatibility forms.
- **Regex queries are NOT normalized** — NFKC can turn compatibility punctuation into regex metacharacters (silent overmatch or syntax break). Regex users get the literal codepoints they typed against the normalized document text and own the asymmetry.
- **Multi-query** via repeating `--search` (or `search: string[]` in library). Each match carries `queryIndex` so the agent can demultiplex which query produced it.
- **OCR text is searched too when `--ocr` is on**. OCR-derived matches come back with `source: 'ocr'` and a page-level `bbox` (V1: per-word OCR bbox from tesseract `data.words[]` not plumbed yet — the source-tag lets consumers disambiguate from precise native matches).

V1 native matching is **single-span only**. A query straddling two pdf.js spans (e.g. `"Hello World"` where `Hello` and `World` are different spans) won't match. Most short queries hit single spans because pdf.js groups by font run; multi-span matching is a follow-up.

`pages[].matches` is **present-with-`[]`** when `--search` ran but the page had no hits — distinct from the field being absent entirely (search wasn't requested). The same posture extends to the overview, which gains a `matchCount` mirror field with the same present-with-`0` semantics.

## XML output shape

`-f xml` mirrors the JSON shape one-for-one:

```xml
<document file="..." totalPages="14">
  <metadata>
    <title>...</title>
    <author>...</author>
  </metadata>
  <overview>
    <page no="1" charCount="..." imageCount="..." textCoverage="..." nonPrintableRatio="..." width="..." height="..."/>
    ...
  </overview>
  <pages>
    <page no="1" charCount="..." imageCount="..." textCoverage="..." nonPrintableRatio="..." width="..." height="..." image="...">
      <spans>
        <span text="..." x="..." y="..." width="..." height="..." fontSize="..." fontName="..."/>
        ...
      </spans>
      <layout>
        <block x="..." y="..." width="..." height="..." role="heading" repeated="true">
          <line x="..." y="..." width="..." height="..." fontSize="...">...</line>
          ...
        </block>
        ...
      </layout>
      <imageBoxes>
        <imageBox x="..." y="..." width="..." height="..."/>
        ...
      </imageBoxes>
      <text>
...page text body...
      </text>
      <rawText>
...pre-normalization text, when normalization changed it...
      </rawText>
      <ocr lang="eng" confidence="0.91">
...OCR text...
      </ocr>
    </page>
    ...
  </pages>
</document>
```

Empty `<layout/>`, `<imageBoxes/>`, and `<ocr/>` (self-closing) mean "the pass ran and found nothing", which is distinct from the tag being absent (the pass wasn't requested).

## TOON output shape

`-f toon` is the same `DocumentResult` re-encoded as [Token-Oriented Object Notation](https://toonformat.dev): YAML-style indentation for nested objects, plus a CSV-like tabular form for **uniform object arrays** that declares the field names once in a `[N]{fields}:` header and then streams one comma-delimited row per element. Optional fields that are unset are omitted (not emitted as `null`), so the field set matches `-f json` exactly.

```
file: /path/doc.pdf
totalPages: 14
metadata:
  title: ...
overview[2]:
  - page: 1
    charCount: 40
    quality:
      nativeTextStatus: ok
    width: 612
    height: 792
  - page: 2
    ...
pages[2]:
  - page: 1
    text: "line one\nline two"
    charCount: 40
    spans[2]{text,x,y,width,height,fontSize,fontName}:
      pdfvision headers fixture,50,27.18,108.38,10,10,g_d0_f1
      Body of page 1,50,194.36,134.54,20,20,g_d0_f1
    layout:
      blocks[2]:
        - text: ...
          lines[1]{text,x,y,width,height,fontSize}:
            ...
```

Decode back to the `DocumentResult` data model with the `@toon-format/toon` package (`decode(toonString)`). Where the win lands: `spans[]` (`--geometry`), `overview[]`, `imageBoxes[]`, and per-block `lines[]` all tabularize, so geometry/span-dense output is ~40–48% fewer tokens than the pretty-printed JSON. Free text bodies and the non-uniform `layout.blocks[]` (optional `role` / `level` / `repeated` per block) do **not** tabularize — for layout-dominant output `-f xml` is usually more compact than `toon`.

## Library API (Node.js consumers)

If the consumer is itself a Node.js process, prefer the library API over invoking the CLI:

```ts
import { processDocument } from 'pdfvision';

const result = await processDocument('./doc.pdf', {
  pages: '1-3',
  layout: true,
  imageBoxes: true,
  ocr: true,
  ocrLang: 'eng+jpn',
});

// `result` is a typed DocumentResult — no JSON.parse, no string formatting.
for (const page of result.pages) {
  if (page.ocr) console.log(page.ocr.text);
}
```

`processFile()` returns the formatted string output (`markdown` / `json` / `xml` / `toon`). `processDocument()` returns the structured object directly.

Exported types: `DocumentResult`, `DocumentMetadata`, `PageOverview`, `PageResult`, `PageQuality`, `PageWarning`, `SearchMatch`, `LayoutBlock`, `LayoutLine`, `PageLayout`, `ImageBox`, `RenderRegion`, `TextSpan`, `PageOcr`, `OutputFormat`, `ProcessDocumentOptions`, `ProcessOptions`.
