# Structured output schema

Reference for `-f json` and `-f xml` consumers. Read this when an agent or tooling consumes the structured payload programmatically and needs to know every field, its shape, and its coordinate convention.

The shape of `-f json` is the `DocumentResult` interface exported by the `pdfvision` package. `-f xml` carries the same data as `<document>` / `<page>` / nested tags. The two are isomorphic — pick whichever is easier for the consumer to parse.

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

`processFile()` returns the formatted string output (`markdown` / `json` / `xml`). `processDocument()` returns the structured object directly.

Exported types: `DocumentResult`, `DocumentMetadata`, `PageOverview`, `PageResult`, `PageQuality`, `PageWarning`, `LayoutBlock`, `LayoutLine`, `PageLayout`, `ImageBox`, `TextSpan`, `PageOcr`, `OutputFormat`, `ProcessDocumentOptions`, `ProcessOptions`.
