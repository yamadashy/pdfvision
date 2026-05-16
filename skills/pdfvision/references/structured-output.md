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
  imageCount: number;          // raster image draws (XObject + inline + mask), per drawn instance
  textCoverage: number;        // 0..1, fraction of page area covered by text glyph bboxes
  nonPrintableRatio: number;   // 0..1, fraction of `text` that is NUL / control / noncharacter
  width: number;               // PDF user-space points
  height: number;
}
```

`overview[]` is the first thing to inspect for silent-failure detection. Two signatures matter:
- `imageCount > 0 && textCoverage ≈ 0` → image-flattened page; the text stream is empty.
- `nonPrintableRatio >= 0.05` → ToUnicode CMap missing; the text stream is full of raw glyph indices (NUL + control chars) even though `textCoverage` looks fine. Native text is unusable; fall back to `--render` or `--ocr`.

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
  width: number;
  height: number;
  image?: string;                // absolute PNG path — present iff --render
  spans?: TextSpan[];            // present iff --geometry
  layout?: PageLayout;           // present iff --layout
  imageBoxes?: ImageBox[];       // present iff --image-boxes
  ocr?: PageOcr;                 // present iff --ocr
}
```

`text` is the pdfjs-derived text stream. `ocr.text` (when `--ocr` is on) is the OCR result alongside, **never overwriting `text`** — consumers diff or pick whichever signal looks better for the page.

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

All coordinates (spans, layout blocks, image boxes) use a **top-down origin** in PDF user-space points: `(0, 0)` at the top-left of the page, `y` grows downward. This matches the rendered PNG convention, so a consumer can overlay any of the geometry signals onto `image` (when `--render` is on) without flipping.

To map PDF points onto rendered PNG pixels:

```ts
const sx = image.width / page.width;
const sy = image.height / page.height;
const pixelBox = { x: box.x * sx, y: box.y * sy, width: box.width * sx, height: box.height * sy };
```

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

Exported types: `DocumentResult`, `DocumentMetadata`, `PageOverview`, `PageResult`, `LayoutBlock`, `LayoutLine`, `PageLayout`, `ImageBox`, `TextSpan`, `PageOcr`, `OutputFormat`, `ProcessDocumentOptions`, `ProcessOptions`.
