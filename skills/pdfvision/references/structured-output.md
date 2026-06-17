# Structured output schema

Reference for `-f json`, `-f xml`, and `-f toon` consumers. Read this when an agent or tooling consumes the structured payload programmatically and needs to know every field, its shape, and its coordinate convention.

The shape of `-f json` is the `DocumentResult` interface exported by the `pdfvision` package. `-f xml` carries the same data as `<document>` / `<page>` / nested tags, and `-f toon` carries it as [Token-Oriented Object Notation](https://toonformat.dev). All three are isomorphic to the same `DocumentResult` — pick whichever is easier for the consumer to parse (`toon` is the most token-frugal on span/array-heavy output; see "TOON output shape" below).

Encrypted PDFs require `--password <value>`, `--password-stdin`, or `processDocument(..., { password })` when pdf.js asks for a document password. The password is used only for decryption and is never emitted in JSON/XML/TOON/Markdown. Prefer `--password-stdin` for CLI workflows where argv or shell history exposure matters; `--password` can be supplied as an explicit fallback when stdin is empty.

## DocumentResult (top level)

```ts
interface DocumentResult {
  file: string;                // path/URL the CLI was invoked with
  totalPages: number;          // total in the source PDF, not in the selection
  metadata: DocumentMetadata;  // title / author / subject / creator (all string | null)
  pageLabels?: string[];       // full 0-indexed viewer page-label array; present iff --page-labels
  attachments?: DocumentAttachment[]; // embedded file metadata; present iff --attachments
  outline?: DocumentOutlineItem[]; // document bookmarks; present iff --outline
  viewer?: DocumentViewerState; // viewer settings; present iff --viewer
  layers?: DocumentLayers;       // optional content groups; present iff --layers
  overview?: PageOverview[];   // per-page density summary; present iff pages.length > 1
  pages: PageResult[];         // one entry per selected page, in page-number order
}
```

`file` is patched on cache hit to the current invocation's path or `--remote` URL, so a downstream consumer sees a meaningful input label even when the cached entry came from a different invocation that touched the same content hash.

## PageOverview (density summary)

```ts
interface PageOverview {
  page: number;
  pageLabel?: string;             // viewer-visible page label; present iff --page-labels and labels exist
  charCount: number;
  imageCount: number;             // raster image draws (XObject + inline + mask + image-bearing patterns), per drawn instance
  vectorCount: number;            // vector drawing ops (paths / shadings), e.g. form boxes, chart rules, slide shapes
  textCoverage: number;           // 0..1, fraction of page area covered by text glyph bboxes
  nonPrintableRatio: number;      // 0..1, fraction of `text` that is NUL / control / noncharacter
  nonPrintableCount: number;      // raw count — stays discriminable when the 3dp ratio rounds to 0
  renderContentRatio?: number;    // 0..1, fraction of pixels differing from the page's dominant background (present iff --render or --ocr)
  quality: PageQuality;           // derived classification — see below
  warningCount?: number;          // mirror of pages[N].warnings.length, omitted when no rule fired
  matchCount?: number;            // mirror of pages[N].matches.length; present-with-0 means "search ran, no hit"
  vectorBoxCount?: number;        // mirror of pages[N].vectorBoxes.length; present iff --vector-boxes
  visualRegionCount?: number;     // mirror of pages[N].visualRegions.length; present iff --visual-regions
  formFieldCount?: number;        // mirror of pages[N].formFields.length; present iff --form-fields
  linkCount?: number;             // mirror of pages[N].links.length; present iff --links
  annotationCount?: number;       // mirror of pages[N].annotations.length; present iff --annotations
  structureNodeCount?: number;    // count of tagged-PDF structure nodes; present iff --structure
  width: number;                  // PDF user-space points
  height: number;
}
```

`overview[]` is the first thing to inspect for silent-failure detection. The `quality` field gives a one-shot classification; the raw signals below let agents combine signals their own way:
- `imageCount > 0 && textCoverage ≈ 0` → image-flattened page; the text stream is empty.
- `imageCount > 0 || vectorCount > 0` plus very low `textCoverage` and a tiny `charCount` → the visible page is mostly outside native text (often just a page number over a slide/image). Maps to `quality.nativeTextStatus === 'sparse_text_with_visual_content'`.
- Very low `charCount` plus dense vector structure can also map to `sparse_text_with_visual_content` even when `textCoverage` is not low, because one large watermark glyph run can cover much of the page while the visible form/table/chart content lives in vectors.
- Any native text plus `quality.visualStatus === 'blank'` → native text is not visible on the rasterised page. Common cases: hidden OCR residue, invisible/broken-font text, or render/text-layer mismatches. Maps to `quality.nativeTextStatus === 'sparse_text_on_blank_visual'`.
- `vectorCount > 0 && textCoverage is low` → visible non-raster structure exists even when `imageCount` is zero; forms, charts, diagrams, and slide shapes may require `--render`.
- `0.05 <= nonPrintableRatio < 0.3` → one or more fonts lack a usable ToUnicode CMap; native text contains readable fragments mixed with raw glyph indices. Native text is incomplete even if some words look usable. Maps to `quality.nativeTextStatus === 'mixed_glyph_indices'`.
- `nonPrintableRatio >= 0.3` → ToUnicode CMap missing for most of the page; the text stream is mostly raw glyph indices (NUL + control chars) even though `textCoverage` looks fine. Native text is unusable; fall back to `--render` or `--ocr`. Maps to `quality.nativeTextStatus === 'unusable_glyph_indices'`.
- Private Use Area glyph-code strings are intentionally excluded from `nonPrintableRatio`; icon fonts can use PUA legitimately. When the page text is PUA-dominant, `pages[].warnings[].code === 'glyph_garbage_text'` fires even if `quality.nativeTextStatus === 'ok'` and `nonPrintableRatio === 0`. When repeated PUA glyphs appear inside otherwise readable text, `localized_glyph_noise` fires so formulas or custom-symbol runs can be checked against the render.
- `quality.visualStatus === 'sparse'` → rasterised page is not blank, but visible marks are sparse. This covers `0.001 < renderContentRatio <= 0.005`, tiny corroborated image/vector/annotation traces below the blank threshold, and text-only or annotation-only pages with nonzero visible ink below the blank threshold; inspect geometry or render a crop before calling it a render failure.
- `quality.visualStatus === 'blank'` → rasterised page is effectively blank against its own dominant background (only meaningful when `--render` or `--ocr` was on). Background-aware so dark covers and beige scans don't false-trip it. Catches render-pipeline failures pdfvision can't otherwise surface: pdf.js + @napi-rs/canvas can't decode JPEG2000 image streams (common in Internet Archive scans), and PDFs whose fonts have no resolvable glyphs draw nothing. When OCR runs against this, `confidence: 0` is *not* an OCR miss — the input was a near-uniform image.

## PageResult (per page)

```ts
interface PageResult {
  page: number;
  pageLabel?: string;           // viewer-visible label such as i, ii, A-1, 1; present iff --page-labels and labels exist
  text: string;                  // NFKC-normalized unless --no-normalize
  rawText?: string;              // pre-normalization text — only present when normalization changed it
  charCount: number;
  imageCount: number;
  vectorCount: number;
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
  vectorBoxes?: VectorBox[];     // present iff --vector-boxes
  visualRegions?: VisualRegion[]; // present iff --visual-regions
  formFields?: FormField[];      // present iff --form-fields
  links?: PageLink[];            // present iff --links
  annotations?: PageAnnotation[]; // present iff --annotations
  structure?: PageStructureNode | null; // present iff --structure; null means no page structure tree
  jsActions?: Record<string, string[]>; // page-level JavaScript actions, present iff --viewer and the page defines them
  ocr?: PageOcr;                 // present iff --ocr
  warnings?: PageWarning[];      // omitted when no rule fired on the page
  matches?: SearchMatch[];       // present iff --search; empty array means "search ran, no hit on this page"
}

interface PageQuality {
  nativeTextStatus:
    | 'ok'                       // usable native text that is not sparse relative to non-text visuals
    | 'mixed_glyph_indices'      // 0.05 <= nonPrintableRatio < 0.3 — readable fragments mixed with glyph garbage
    | 'unusable_glyph_indices'   // nonPrintableRatio >= 0.3 — fall back to --ocr / --render
    | 'sparse_text_on_blank_visual' // native text exists but the rendered page is effectively blank
    | 'sparse_text_with_visual_content' // native text exists but is too sparse for a visual page
    | 'empty_but_visual_content' // no native text but the page has images / vectors / non-blank pixels / visible annotations not contradicted by a blank render
    | 'empty';                   // no text, no detected visual content
  visualStatus?:                 // present iff --render or --ocr triggered a raster
    | 'ok'                       // renderContentRatio > 0.005 — renderer drew clearly populated content
    | 'sparse'                   // sparse marks: 0.001 < ratio <= 0.005, or corroborated tiny visual traces
    | 'blank';                   // effectively blank against the page's own background
}
```

`text` is the pdfjs-derived text stream. Exact duplicate text draws with the same text, font, width/height, and text matrix are collapsed before joining so optional-content and overprint duplicates do not read as repeated words. `ocr.text` (when `--ocr` is on) is the OCR result alongside, **never overwriting `text`** — consumers diff or pick whichever signal looks better for the page.

`quality` is pure observation, not recommendation: pdfvision tells the agent what it saw, the agent picks what to do next.

## Layout (`--layout`)

```ts
interface PageLayout {
  blocks: LayoutBlock[];     // in approximate reading order (multi-column aware)
  tables?: LayoutTable[];    // row-major hints for aligned numeric tables
}

interface LayoutBlock {
  text: string;              // line texts joined with \n
  x: number; y: number; width: number; height: number;
  lines: LayoutLine[];
  writingMode?: 'vertical';  // present for detected CJK top-to-bottom glyph stacks
  role?: 'heading';          // heuristic heading classification — see `level`
  level?: 1 | 2 | 3;         // present iff role === 'heading': 1=title, 2=section, 3=subsection candidate
  repeated?: boolean;        // chrome (running header / footer / page number / watermark) detected across pages
}

interface LayoutLine {
  text: string;
  x: number; y: number; width: number; height: number;
  fontSize: number;          // most common fontSize across the spans in this line
  writingMode?: 'vertical';  // present for top-to-bottom CJK glyph stacks
}

interface LayoutTable {
  x: number; y: number; width: number; height: number;
  rowCount: number;
  columnCount: number;       // maximum cells in any row
  rows: LayoutTableRow[];
}

interface LayoutTableRow {
  y: number; height: number;
  cells: LayoutTableCell[];  // sorted left-to-right
}

interface LayoutTableCell {
  text: string;
  x: number; y: number; width: number; height: number;
}
```

Multi-column reading order: `blocks[]` reads top-to-bottom of the left column before the right column. The layout pass treats recurring narrow gutters and recurring right-side panel starts as column/table breaks, including landscape pages where a numeric side panel means the main body columns cover only part of the physical page width. It preserves tight Latin and Arabic word spaces when pdf.js emits words as separate spans, keeps short display-spaced CJK title rows on one line (for example `科 学`), keeps indented singleton lines attached to the nearest surviving column instead of turning them into page-wide separators, avoids letting tall drop caps absorb following paragraph lines, keeps narrow standalone numeric page labels separate from surrounding prose, and moves small bottom permission/footer notes after the main two-column body. It also detects compact CJK glyph stacks and tall CJK spans that are visually vertical, joins them top-to-bottom as separate blocks, orders adjacent vertical columns right-to-left, and marks those blocks/lines with `writingMode: "vertical"` so consumers do not mistake them for horizontal rows. Standalone level-1 / level-2 headings act as column separators; level-3 candidates stay inside their column so subsection breaks don't scramble reading order. Block clustering is still heuristic — table cells may merge into a single block.

Repeated chrome detection runs after block clustering. When only one line inside a multi-line edge block is repeated page chrome, such as a slide footer glued to nearby body text, pdfvision splits that line into its own `repeated: true` block and leaves the adjacent body lines non-repeated. Short form control labels such as `Yes.`, `No.`, and `STOP` are not treated as page chrome even when they recur at the page edge in decision-tree instructions.

`tables[]` is a conservative row-major hint for aligned numeric tables. It appears when multiple rows have several cells and at least two numeric cells, a common shape in financial statements and government statistical tables; compact two-column year/value tables are included when enough regular rows make the table shape clear. Treat it as a visual-structure aid, not a complete table parser: merged headers, continuation labels, and footnotes can still require `--render` / `--render-region`, but `rows[].cells[]` preserves the row/cell order that `blocks[]` often loses when a table is split into label and numeric columns. Dense recurring numeric gutters are split before table construction so adjacent values do not collapse into one cell when the visual grid is regular, including compact side tables with comma-formatted values or ratio cells such as `13.0x`. Wide tables with three or more recurring numeric columns can also keep short leading header rows and sparse first rows directly above the first fully populated row, including scientific notation cells such as `1.0 · 10^20` and score/percentile cells such as `298 / 400 (~90th)`, so the table bbox starts at the human-visible table top. Decorative dotted rule text from publisher table borders is ignored while grouping rows, so a tall dotted border does not absorb all cells into one row. Nearby label-only continuation rows are folded into the following row label unless they look like section headers. Irregular row spacing is still accepted when labelled rows have recurring numeric columns, so financial tables with multi-line labels, subtotal gaps, and long prose-like labels before recurring year columns remain visible instead of being trimmed as adjacent prose. Detached currency symbols are folded into the following numeric cell when their row position makes the relationship clear.

## Form Fields (`--form-fields`)

```ts
interface FormField {
  name: string;              // PDF field name
  type: 'text' | 'checkbox' | 'radio' | 'choice' | 'signature' | 'button' | 'unknown';
  x: number; y: number; width: number; height: number;
  value?: string;            // current value when present
  checked?: boolean;         // checkbox/radio state when applicable
  readOnly?: boolean;
  required?: boolean;
  multiline?: boolean;
  displayValue?: string;      // viewer-visible selected choice label when different from value
  caption?: string;           // viewer-visible push-button caption when available
  exportValue?: string;       // checkbox/radio submitted value when pdf.js exposes it
  options?: FormFieldChoiceOption[]; // choice-field options when pdf.js exposes them
  combo?: boolean;            // true for combo boxes, false for list boxes
  multiSelect?: boolean;      // true when multiple choices can be selected
  flags?: PageAnnotationFlag[]; // decoded widget annotation flags: hidden, print, noView, locked, ...
  actions?: Record<string, string[]>; // widget-level JavaScript actions such as button scripts
  resetForm?: FormFieldResetFormAction; // non-JavaScript ResetForm button behavior
  label?: FormFieldLabel;    // nearby visible label, when the layout heuristic finds one
}

interface FormFieldChoiceOption {
  exportValue: string;        // submitted/exported form value
  displayValue: string;       // viewer-visible option label
}

interface FormFieldResetFormAction {
  fields: string[];            // field names listed by the ResetForm action
  include: boolean;            // true: reset only listed fields; false: reset all except listed fields
}

interface FormFieldLabel {
  text: string;
  relation: 'left' | 'right' | 'above' | 'below';
  x: number; y: number; width: number; height: number;
}
```

`formFields[]` surfaces interactive PDF widget annotations: blank text inputs, checkboxes, radio buttons, choice fields, buttons, and signatures. It is especially useful for government and tax forms where native text extraction can read the labels but not the fillable boxes a human sees. Checkbox and radio widgets include `exportValue` when pdf.js exposes the submitted value. Choice widgets keep `value` as the submitted/exported selection and include `displayValue` when the viewer-visible selected label differs; `options[]` lists all exported and viewer-visible values, plus `combo` / `multiSelect` behavior flags when pdf.js exposes them. Push buttons include `caption` when pdfvision can recover the viewer-visible `/MK /CA` caption from the widget appearance characteristics; Markdown shows that caption in the Value column, and `--search` can return visible button captions as `source: "formField"` matches. Markdown shows the choice `displayValue` in the Value column and the submitted `value` in Export when they differ. `flags[]` decodes the underlying widget annotation flags, so agents can tell when a form value is hidden, print-only, no-view, locked, or otherwise controlled by viewer state even if the normal screen render is blank. `actions` preserves widget-level JavaScript actions such as button click scripts when pdf.js exposes them, while `resetForm` preserves non-JavaScript ResetForm button behavior so agents can tell whether a button resets all fields, only listed fields, or all except listed fields. Markdown shortens very long JavaScript action summaries for readability; JSON, XML, and TOON keep the full structured values. `label` is a conservative nearest-line hint reconstructed from visible layout text; checkbox/radio widgets prefer same-line labels to the right/left, while text inputs prefer labels immediately above or to the left. Adjacent stacked above/below lines are merged when they form one visible prompt, so narrow fields can carry multi-line labels like "Employer identification number (EIN)" instead of only the closest line. Left-side checkbox/radio labels can also merge directly preceding continuation lines, so prompts such as "check this box..." keep the setup text that appears on the line above. Narrow inline text fields also prefer same-line left instruction labels, which keeps short tax-classification/code boxes attached to the prompt that precedes them instead of a nearby label for the next field, and tall multiline text fields can keep short left-side labels across wider form gutters. Right-edge amount boxes with dotted leaders can expand compact markers like "1 $" or "4(a) $" back to the visible prompt, including short multi-line prompts above the marker row. Fine-grained text spans are also considered so adjacent same-row prompts do not collapse onto both fields when reconstructed layout lines are wider than the human-visible field cell. Coordinates use the same top-left PDF-point system as `spans`, `layout.blocks`, and `imageBoxes`, so a field or label bbox can feed directly into `--render-region`.

## Links (`--links`)

```ts
interface PageLink {
  type: 'url' | 'destination';
  target: string | unknown[];  // external URL or internal/named PDF destination
  page?: number;               // 1-based physical target page when destination can be resolved
  text?: string;                // visible text inside the link rectangle when reconstructed
  x: number; y: number; width: number; height: number;
}
```

`links[]` surfaces clickable PDF link annotations: external URLs, citation jumps, table-of-contents destinations, and cross-reference targets. Internal destinations include `page` when pdfvision can resolve the target to a 1-based physical page number. `text` is the visible native text inside the link rectangle when it can be reconstructed, capped to a short label when a broad link rectangle spans a long table-of-contents region, and clipped from the surrounding line when the PDF places a narrow link over one inline token. Coordinates use the same top-left PDF-point system as `spans`, `layout.blocks`, and `imageBoxes`, so a link bbox can feed directly into `--render-region`.

## Annotations (`--annotations`)

```ts
interface PageAnnotation {
  subtype: string;              // Text, Highlight, Underline, StrikeOut, FreeText, Stamp, FileAttachment, Ink, ...
  name?: string;                 // annotation/icon name such as Note, Comment, PushPin, Paperclip
  contents?: string;            // comment / markup contents
  title?: string;               // author/title label
  color?: [number, number, number];
  modified?: string;            // PDF date string
  hasAppearance?: boolean;
  flags?: PageAnnotationFlag[];  // decoded PDF annotation flags: hidden, print, noView, locked, ...
  fileAttachment?: {
    name: string;
    description?: string;
    size: number;               // byte length; bytes are never embedded in JSON/XML/TOON
  };
  x: number; y: number; width: number; height: number;
  border?: {
    width?: number;
    style?: string;             // solid, dashed, beveled, inset, underline, or raw pdf.js value
    dashArray?: number[];
  };
  line?: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    endings?: [string, string]; // PDF line ending names, e.g. None/OpenArrow
  };
  vertices?: { x: number; y: number }[];   // Polygon / PolyLine vertices
  inkPaths?: { x: number; y: number }[][]; // Ink annotation paths
  quadBoxes?: { x: number; y: number; width: number; height: number }[];
}

type PageAnnotationFlag =
  | 'invisible'
  | 'hidden'
  | 'print'
  | 'noZoom'
  | 'noRotate'
  | 'noView'
  | 'readOnly'
  | 'locked'
  | 'toggleNoView'
  | 'lockedContents';
```

`annotations[]` surfaces non-link, non-widget PDF annotations: sticky notes, comments, highlights, underlines, strikeouts, stamps, free text, file-attachment icons, shape markup, ink, and other markup. `name` preserves the PDF annotation/icon name when pdf.js exposes it, such as `Note`, `Comment`, `PushPin`, or `Paperclip`. `flags[]` decodes the PDF annotation flags so agents can distinguish normal screen-visible markup from hidden, print-only, no-view, locked, or otherwise viewer-controlled annotations; for example `["hidden","print"]` means the annotation can exist in the PDF even when the normal screen render is blank. File-attachment annotations include filename / description / byte-size metadata when pdf.js exposes it, but never embed the file bytes in context. Shape annotations include `border`, `line`, `vertices`, or `inkPaths` when pdf.js exposes them, so agents can recover visible endpoints, polygon/polyline geometry, and freehand ink paths instead of only the enclosing bbox. `Link`, `Widget`, and `Popup` annotations are intentionally excluded because links and form widgets have dedicated outputs and popups usually duplicate their parent annotation. Coordinates use the same top-left PDF-point system as `spans`, `layout.blocks`, and `imageBoxes`; `quadBoxes[]` gives precise markup regions when the PDF provides QuadPoints.

## Structure (`--structure`)

```ts
interface PageStructureNode {
  role: string;                 // tagged-PDF role, role-map-resolved by pdf.js when possible
  alt?: string;                 // alternate text, often figure/formula descriptions
  mathML?: string;              // MathML for Formula nodes when pdf.js exposes it
  lang?: string;                // language hint for this structure node
  bbox?: number[];              // [x, y, width, height] in top-left PDF points
  children: PageStructureItem[];
}

type PageStructureItem = PageStructureNode | PageStructureContent;

interface PageStructureContent {
  type: string;                 // usually "content", "object", or "annotation"
  id: string;                   // pdf.js id that maps to marked content, an object, or an annotation
}
```

`pages[].structure` surfaces the tagged-PDF structure tree a human reader may reach through a PDF viewer's accessibility layer. This is especially useful for accessible government PDFs, manuals, reports, and forms where figure `alt` text describes a visual region better than native text extraction. IRS instructions, for example, can expose a cover figure's full human-written description through `alt` even though the native text stream only lists fragments. Structure `bbox` values use `[x, y, width, height]` in the same top-left PDF-point coordinate system as `spans`, `layout.blocks`, and `imageBoxes`. Stray control bytes in structure strings are removed before output so malformed `alt` / `lang` values do not leak NUL bytes into JSON, XML, Markdown, or TOON. `structure: null` means the pass ran and pdf.js found no page structure tree; absent `structure` means `--structure` was not requested. `overview[].structureNodeCount` mirrors the number of structure nodes so multi-page consumers can find tagged pages before walking every tree.

## Page labels (`--page-labels`)

`pageLabels[]` is the full viewer page-label array for the source PDF, indexed from physical page 1 at array index 0. `pages[].pageLabel` and `overview[].pageLabel` mirror the selected page's entry when the PDF defines labels. Use this when a PDF viewer shows front matter as `i`, `ii`, ... and restarts body numbering at `1`, or when sections use prefixes such as `A-1`. The CLI page selector still uses physical page numbers; `pageLabel` tells the agent what a human sees in the viewer chrome.

## Attachments (`--attachments`)

```ts
interface DocumentAttachment {
  name: string;          // decoded filename shown by the PDF viewer
  rawName?: string;      // raw PDF filename when it differs from name
  description?: string;  // file-spec description when present
  size: number;          // embedded file byte length
  path?: string;          // saved path, present when --attachment-output was provided
}
```

`attachments[]` surfaces document-level embedded file attachments that a human PDF viewer exposes in its attachment pane. The attachment bytes are intentionally not included in JSON/XML/Markdown/TOON output; use the metadata as a signal that the PDF contains supplemental files without flooding agent context with arbitrary binary content. Pass `--attachment-output <dir>` with `--attachments` when the agent needs actual files on disk; pdfvision writes them under a per-PDF fingerprint subdirectory and fills `attachments[].path`.

## Outline (`--outline`)

```ts
interface DocumentOutlineItem {
  title: string;
  type?: 'destination' | 'url' | 'action';
  target?: string;              // named/internal destination, explicit-destination JSON, URL, or action name
  page?: number;                // 1-based, resolved when pdf.js can map the destination
  items?: DocumentOutlineItem[];
}
```

`outline[]` surfaces the document outline / bookmarks shown in a human PDF viewer sidebar. It preserves nesting, external URLs, named viewer actions such as `NextPage`, and resolves named or explicit PDF destinations to 1-based page numbers when possible. Empty `outline: []` means the pass ran and the PDF has no outline; absent `outline` means `--outline` was not requested.

## Viewer state (`--viewer`)

```ts
interface DocumentViewerState {
  pageLayout?: string;          // initial layout such as TwoColumnLeft
  pageMode?: string;            // initial mode such as UseOutlines or UseThumbs
  viewerPreferences?: Record<string, JsonValue>;
  openAction?: {
    type: 'destination' | 'action';
    target?: string;            // destination JSON/name when type is destination
    page?: number;              // 1-based, resolved when possible
    action?: string;            // PDF action name for non-destination actions
  };
  jsActions?: Record<string, string[]>; // document-level JavaScript action scripts
  permissions?: {
    flags: number[];            // raw PDF permission flags
    allowed: string[];          // decoded names; empty means permissions were present but none matched
  };
  markInfo?: {
    marked: boolean;            // tagged-PDF / structure presence signal
    userProperties: boolean;
    suspects: boolean;
  };
}
```

`viewer` surfaces document-level state a human PDF viewer uses before reading page text: sidebar/page mode, page layout, preferences such as `DisplayDocTitle`, catalog `OpenAction`, document JavaScript actions such as auto-print scripts, permission flags, and tagged-PDF `MarkInfo`. The same `--viewer` pass also emits page-level JavaScript actions such as `PageOpen` / `PageClose` on `pages[].jsActions` when a page defines them. Markdown shortens very long JavaScript action summaries for readability; JSON, XML, and TOON keep the full structured values. Use it on specs, manuals, papers, forms, and long reports where opening position, bookmark/sidebar mode, JavaScript-triggered viewer behavior, copy/print permissions, or tagged-PDF structure affects navigation or accessibility. Empty `viewer: {}` means the pass ran and no viewer-level settings were present; absent `viewer` means `--viewer` was not requested.

## Layers (`--layers`)

```ts
interface DocumentLayers {
  name?: string;                 // optional-content configuration name
  creator?: string;              // optional-content configuration creator
  order?: DocumentLayerOrderItem[]; // viewer layer-panel order, including nested groups
  groups: DocumentLayerGroup[];
}

type DocumentLayerOrderItem = string | { name?: string; order: DocumentLayerOrderItem[] };

interface DocumentLayerGroup {
  id: string;                    // PDF optional-content group id, e.g. "4R"
  name?: string;                 // layer name shown by PDF viewers
  visible: boolean;              // display-intent visibility after the default config is applied
  intent?: string[];             // OCG intent names such as View or Design
  usage?: {
    viewState?: 'ON' | 'OFF';
    printState?: 'ON' | 'OFF';
  };
  rbGroups?: string[][];         // mutually exclusive radio-button layer groups
}
```

`layers` surfaces PDF optional content groups, the layer panel a human PDF viewer can expose for maps, CAD/design files, multilingual variants, and overlay-heavy documents. Use it when visible content may depend on a toggled layer or when a map/design page looks incomplete from text, vectors, and images alone. `groups[].visible` reflects pdf.js display-intent visibility after the document's default optional-content configuration is applied. pdf.js text extraction can include optional-content marked text from groups that are hidden in the default viewer state; when `pages[].warnings[].code === "optional_content_text_may_include_hidden_layers"`, compare `pages[].text` against `--render` and inspect `--layers` before treating the text as exactly human-visible. Empty `layers: { groups: [] }` means the pass ran and the PDF has no optional content groups; absent `layers` means `--layers` was not requested.

### Heading levels (`role === 'heading'`)

`role` is set when a block is classified as a heading; `level` ranks the visual hierarchy:

- `level: 1` — paper / page title (fontSize ≥ 1.40× body median, or top-of-page document title in the ≥ 1.25× band).
- `level: 2` — section heading (≥ 1.25× under the legacy rule, or ≥ 1.15× with structural support: short and either standalone or locally larger than neighbours). Catches the typical LaTeX 12pt-over-10pt section style.
- `level: 3` — subsection candidate (≥ 1.08×, single short line, locally larger than same-column neighbours). Lower confidence; the kind of heading ResNet's `3.1.` and `3.4.` use.

Pick a slice that matches the use case:
- Title-only: `role === 'heading' && level === 1`.
- High precision (sections only): `role === 'heading' && level <= 2`.
- Recall-oriented (include subsections): all `role === 'heading'`.

Repeated chrome wins over heading classification. When a heading-shaped running header/footer is marked `repeated: true`, pdfvision drops `role`, `level`, and `roleConfidence` so repeated page chrome does not appear in heading lists. When chunking body content, still filter `repeated: true` first.

## Image boxes (`--image-boxes`)

```ts
interface ImageBox {
  x: number; y: number; width: number; height: number;
}
```

One entry per drawn instance — a tiled hero image yields multiple entries. Image-bearing tiling patterns painted through fill paths surface as the painted path bbox, so masked/pattern images still become crop targets. `imageCount === imageBoxes.length` is an invariant on every page. Form XObject CTM tracking ensures images drawn inside a form land at the correct page-space position.

## Vector boxes (`--vector-boxes`)

```ts
interface VectorBox {
  x: number; y: number; width: number; height: number;
}
```

One entry per painted vector path where pdf.js reports a path bbox, plus shading fills when pdf.js exposes the active clipping bbox, excluding page-sized white background fills. This is useful for maps, symbol tables, charts, diagrams, gradient panels, table rules, form boxes, and slide shapes: content a human sees, but that is neither native text nor a raster image. Horizontal/vertical strokes are expanded to at least 0.5pt in the degenerate dimension so their boxes can feed `--render-region`. `vectorCount` remains the broad density signal for meaningful vector drawing operations; `vectorBoxes[]` is the opt-in location signal and can be shorter than `vectorCount` when a low-level op has no bbox.

## Visual regions (`--visual-regions`)

```ts
interface VisualRegion {
  id?: string;              // stable page-local id, e.g. "p3-vr0", present in extracted PageResult
  kind: 'raster' | 'vector' | 'table' | 'form' | 'annotation' | 'mixed';
  x: number; y: number; width: number; height: number;
  areaRatio: number;        // region area / page area, rounded to 3dp
  sourceCount: number;      // total source geometry items represented
  sources: VisualRegionSource[]; // representative refs, capped for large vector clusters
  reason: string;           // short explanation for why this is worth inspecting
  associatedText?: VisualRegionAssociatedText[]; // nearby or in-region captions/form labels/chart titles/table lead-ins/image labels/headings included in the region box
  image?: string;           // cropped PNG path, present iff --render-visual-regions rendered this region
  renderContentRatio?: number; // content ratio measured from the cropped PNG
}

interface VisualRegionSource {
  type: 'imageBox' | 'vectorBox' | 'layoutTable' | 'formField' | 'annotation';
  index: number;            // 0-based index into that page-level source collection, internal if not emitted
}

interface VisualRegionAssociatedText {
  text: string;
  relation: 'caption' | 'label';
  x: number; y: number; width: number; height: number;
  blockIndex?: number;      // 0-based index into layout.blocks[] for captions/headings/table lead-ins
  fieldIndex?: number;      // 0-based index into formFields[] for form labels
}
```

`visualRegions[]` is a dispatch layer for human-like PDF vision. It groups existing geometry into padded, page-clamped bboxes for important raster images, compact raster text strips, vector drawing clusters, `layout.tables[]` hints, form-field clusters, and visible annotation markup such as highlights, stamps, ink, and shape annotations. When nearby captions or form labels are detected (`Figure`, `Table`, `Plate`, `図`, `表`, `図表`), `associatedText[]` records the text and the crop bbox expands to include nearby text, so the rendered crop carries the human-visible explanation instead of only the raw picture/widget rectangle; caption-matching lines are preferred over their enclosing layout block so table headers or prose below a caption do not become misleading associated text, and local caption association keeps only the best nearby caption group so adjacent table captions do not get attached to a lower figure crop. Bare or tiny references such as `Fig.4` inside the visual region are ignored as captions unless the same text also carries descriptive caption words at readable size. Raster image crops can also attach short directly-below plain labels (for example slide image captions) while filtering copyright/license notes. Large raster and mixed visual regions can attach short non-heading chart titles inside the top of the region, while large unlabeled regions can also attach a nearby non-repeated heading, or a heading inside the top of the region, as `relation: "label"` so charts, form/table backplanes, and ECG-style panels retain the visible title a human would use to identify them. Table regions can also attach short plain lead-ins such as "The following table..." or "... as follows:" when the visible table itself has no caption. Page-level `Plate` captions can attach as metadata to distant panel crops without expanding every crop to include the caption block, which keeps multi-panel map/figure crops local while preserving the shared caption context. Repeated header/footer text is excluded from caption association when multi-page evidence is available. Page-sized raster/vector boxes are treated as background when more specific foreground boxes or dense vector-grid structure exists, including dense thin vector grids over full-page raster backdrops, and broad vector-only backplanes spanning multiple substantial raster panels are suppressed so panel-level crops remain available; this keeps slide wallpapers, full-page design layers, and CAD/drawing backplanes from swallowing the actual diagram/table/plan regions. If a full-page cover or scan is the main visual evidence and only small logos, edge chrome, or low-confidence OCR-fragment table hints compete with it, the full-page raster is still emitted, including rotated scan pages. When full-page render evidence classifies the page as blank, visual regions are suppressed so blank pages and invisible form fields or annotations do not become vision-model dispatch targets. Narrow page-edge chrome is suppressed so marginal ribbons, side URLs, watermarks, and header/footer bands do not become vision-model dispatch targets. Dense vector pages get fallback clustered regions from thin but long vector line boxes, so separate table-like grids can produce separate crops even when individual line boxes are too thin for normal clustering. Dense small vector marker fields can also produce dense visual-region crops, split by disconnected marker clusters, which catches scatter/dot-heavy biomedical figures, maps, and marker fields whose panel text or labels are embedded in vector art rather than extractable text without forcing unrelated regions into one page-wide crop. Shallow, page-wide, two-row layout table hints and extreme-column two-row table hints are suppressed as visual-region seeds because they often come from graph ticks, OCR fragments, or unrelated panels rather than a human-readable table crop. Dense form pages split interactive fields into section/row-sized crops, suppress large or contained vector-only form backplanes that would otherwise duplicate form sections, skip hidden/invisible/noView form fields and annotations as visual-region seeds while keeping them in `formFields[]` / `annotations[]` when those extraction passes are requested, and keep thin checkbox rows or markup rows when padding makes the crop readable. Agents can feed a region directly into `--render-region <x,y,width,height>` to inspect the figure/chart/table/form/annotation visually without first clustering raw `imageBoxes[]`, hundreds of `vectorBoxes[]`, or annotation bboxes. Region coordinates stay in the same MediaBox top-left coordinate system as `imageBoxes[]` / `layout.blocks[]`; on rotated pages pdfvision maps the crop through the rotated pdf.js viewport so the output PNG follows the human-visible page orientation. `--render-visual-regions` skips the manual second call and renders each suggested crop directly into `visualRegions[].image`; it implies `--visual-regions` but does not require full-page `--render`. `sourceCount` is the full number of source items represented; `sources[]` is capped to keep vector-heavy pages compact.

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
  words?: OcrWord[];         // OCR word boxes in page coordinates, when tesseract returns layout
}

interface OcrWord {
  text: string;
  confidence: number;        // 0..1 (rounded to 3dp)
  x: number; y: number; width: number; height: number;
}
```

`lang` echoes the caller's `--ocr-lang` after whitespace normalization but preserves token order. `eng+jpn` and `jpn+eng` produce different recognisers (tesseract treats the first language as primary) and therefore land in different cache slots and different `lang` echoes. `words[]` is optional because older cache entries or unusual tesseract output can lack block/line/word layout; when present, search can return OCR word-level bboxes. If word-level reconstruction misses one or more query occurrences that exist in full `ocr.text` (for example OCR line-boundary or spacing differences), search supplements from `ocr.text` with a page-level bbox.

## Coordinate system

All coordinates (spans, layout blocks, image boxes, vector boxes, visual regions, form fields, `renderRegion`) use a **top-down origin** in PDF user-space points: `(0, 0)` at the top-left of the page, `y` grows downward. This matches the rendered PNG convention, so a consumer can overlay any of the geometry signals onto `image` (when `--render` is on) without flipping.

To map PDF points onto rendered PNG pixels:

```ts
const sx = image.width / page.width;
const sy = image.height / page.height;
const pixelBox = { x: box.x * sx, y: box.y * sy, width: box.width * sx, height: box.height * sy };
```

## Rendering: `--render-scale` and `--render-region`

Both flags only have effect when `--render` (or `--ocr`, which internally rasterises) is on.

- **`--render-scale <n>`**: multiplier in pixels-per-point. Default `2` (≈144 DPI on a letter page). Bounds `(0, 4]`. Smaller values shrink the vision-model payload; larger values capture finer detail (chart labels, small typography).
- **`--render-region <x,y,w,h>`**: render only the given sub-rectangle of one page instead of the full page. PDF points, top-left origin, same coord system as `imageBoxes` / `layout.blocks`. Composes orthogonally with `--render-scale`: a 400×300pt non-rotated region at scale 3 produces a 1200×900px PNG; rotated pages can swap the output pixel width/height because the crop is mapped through the human-visible rotated viewport. V1 is strictly single-page (errors if `--pages` resolves to anything but exactly one page) and rejects regions that fall outside the MediaBox bounds. The xywh tuple is part of the cache key and the on-disk filename (`page-N_x<x>_y<y>_w<w>_h<h>.png`), so multiple regions per page coexist. Echoed back on `PageResult.renderRegion` so consumers can tell a cropped image from a full-page one without inspecting the filename.
- **`--render-visual-regions`**: render every `visualRegions[]` crop and attach `image` / `renderContentRatio` on each region. Region boxes include associated captions/form labels, short table lead-ins, short image labels, and nearby headings when detected, so the crop is usually closer to what a human would select before asking a vision model to read it. This uses the same output directory, `--render-scale`, cache image validation, and safe per-PDF subdirectory rules as full-page `--render`, but leaves `pages[].image` absent unless `--render` was also requested.

Typical agent flow: extract with `--layout`, find a suspect block in `layout.blocks[i]` (or get its index out of `warnings[i].blockIndex`), then re-run with `--pages <N> --render --render-region <x,y,w,h>` using `blocks[i]`'s bbox to zoom in.

## Warnings

```ts
interface PageWarning {
  code:
    | 'text_overlap'
    | 'near_bottom_edge'
    | 'body_near_repeated_chrome'
    | 'off_page'
    | 'glyph_garbage_text'
    | 'localized_glyph_noise'
    | 'font_mapping_warning'
    | 'dense_vector_graphics'
    | 'tabular_numeric_layout'
    | 'raster_backed_text_layer'
    | 'raster_text_layer_symbol_noise'
    | 'ocr_low_confidence'
    | 'ocr_native_text_mismatch'
    | 'large_raster_low_text_overlap'
    | 'annotation_text_missing_from_native'
    | 'reading_order_divergence';
  severity: 'warning' | 'error';
  message: string;
  blockIndex?: number;        // 0-based into pages[N].layout.blocks
  otherBlockIndex?: number;   // for pair-wise rules (text_overlap, body_near_repeated_chrome)
  imageBoxIndex?: number;     // 0-based into pages[N].imageBoxes for image-region rules
}
```

`pages[].warnings[]` is omitted when no rule fired. Geometry warnings require `--layout` because they pin to layout blocks, and are suppressed on heavily glyph-corrupted pages where native bboxes are not trustworthy. Image-region warnings can use pdfvision's internal image-box pass even when `--image-boxes` was not requested; `imageBoxIndex` is emitted only when public `pages[].imageBoxes` exists. `large_raster_low_text_overlap` gets stronger overlap evidence when `--image-boxes` is combined with `--layout` or `--geometry`, because it can compare image boxes against native text bboxes. `tabular_numeric_layout` requires `--layout` because it inspects aligned layout lines. `annotation_text_missing_from_native` requires `--annotations` because it compares public FreeText annotation contents against `pages[].text`. `glyph_garbage_text`, `localized_glyph_noise`, `font_mapping_warning`, `dense_vector_graphics`, and `optional_content_text_may_include_hidden_layers` use always-on page/document signals and can appear without layout. `raster_backed_text_layer` and `raster_text_layer_symbol_noise` use the internal image-box pass and can appear even when `--image-boxes` was not requested. `ocr_low_confidence` and `ocr_native_text_mismatch` require `--ocr`.

The current rule catalog:

- `text_overlap` — non-repeated layout blocks overlap in a way that may scramble reading order. Shallow adjacent-line bbox slack from inline math, multi-line math annotations, superscripts, subscripts, punctuation-only inline fragments, and callout-marker continuation lines is suppressed.
- `near_bottom_edge` — body text ends unusually close to the page bottom.
- `body_near_repeated_chrome` — body text overlaps or nearly touches detected repeated header/footer chrome.
- `off_page` — a layout block bbox extends beyond the page.
- `glyph_garbage_text` — `quality.nativeTextStatus` is `mixed_glyph_indices` or `unusable_glyph_indices`, or native text is dominated by Private Use Area glyph-code strings; native text is partly or mostly raw glyph-index garbage and should be checked against render/OCR before use.
- `localized_glyph_noise` — multiple non-printable code points appear below the mixed-glyph threshold, Unicode replacement characters (`U+FFFD`) appear in otherwise usable native text, private-use glyph codes dominate a short run or repeat throughout otherwise readable text, isolated Latin-extended mojibake appears inside CJK text, adjacent Latin-1 supplement printable mojibake dominates a short text run, or printable font-map noise puts uppercase `LJ` inside an otherwise lowercase word such as `veriLJcation`; often broken formulas, comparison symbols, unit marks, bullets, dotted leaders, non-Latin custom fonts, icon-font symbols, or ligature/font-map substitutions.
- `font_mapping_warning` — pdf.js reported missing or suspicious font character-map data while native text otherwise looked usable; visible text may render correctly but extract as printable glyph substitutions, so compare against the render when exact text matters.
- `dense_vector_graphics` — the page contains many vector drawing operations; often form boxes, table rules, chart paths, checkboxes, or diagrams whose visible structure is not represented by native text.
- `tabular_numeric_layout` — many short numeric lines form multiple aligned columns with shared row positions; often financial statements or dense numeric tables whose row/column relationships are visually obvious but can be flattened in plain native text. Chart-axis tick labels and irregular chart data-label rows are suppressed.
- `raster_backed_text_layer` — native text appears to be an OCR/text layer over a full-page raster image, including sparse OCR layers on scanned covers; text may be useful but error-prone, and bbox/layout geometry can drift from the pixels a human sees.
- `raster_text_layer_symbol_noise` — a raster-backed native text layer is dominated by printable punctuation/symbol noise; common on old scan OCR title pages where `quality.nativeTextStatus` can still be `ok` even though the native text is visibly unreliable.
- `ocr_low_confidence` — `--ocr` ran with confidence below 0.5 while native extraction was empty, sparse, glyph-corrupted, or attached to a raster-backed text layer; OCR text is present but should be treated as tentative until checked against the render, language choice, or a focused crop.
- `ocr_native_text_mismatch` — `--ocr` ran with high confidence and short OCR text of comparable length strongly disagrees with otherwise-ok native text; often a custom font that renders a word correctly while extracting as printable glyph substitutions.
- `large_raster_low_text_overlap` — a large raster image dominates a page whose native text is empty or sparse, or bbox-enabled extraction found little overlapping native text, so labels, chart text, map text, or screenshot text inside it will not appear in native text.
- `annotation_text_missing_from_native` — one or more visible FreeText annotation appearances have `contents` that are not represented in `pages[].text`; read `pages[].annotations` or use `--search` / `--render-region` before treating native text as complete. Requires `--annotations`.
- `optional_content_text_may_include_hidden_layers` — the page text stream contains optional-content marked text while the PDF has at least one default-hidden layer; `pages[].text` may include layer content that the initial viewer render does not show, so inspect `--layers` and compare against `--render`.
- `reading_order_divergence` — visual reading order differs from `pages[].text`. This fires when a heading that leads `layout.blocks` only appears in the back half of the native text stream, when a late bottom note or right sidebar appears at the start of native text, when a compact math-like block appears with reordered characters such as a superscript emitted after the baseline expression, or when `--form-fields` exposes form labels whose native text order differs from the visible row order; form date placeholders such as `MM / DD / YYYY` are suppressed. Prefer `layout.blocks` order over `pages[].text` when sequence matters — the Markdown formatter already rebuilds the body from layout blocks on these pages. Requires `--layout`; `blockIndex` points at the displaced heading, late block, local block, or form-label block.

Same observational posture as `quality`: pdfvision tells the agent what it saw; the agent decides whether to surface, re-OCR, or zoom in via `--render-region`.

## Search (`--search`)

```ts
interface SearchMatch {
  page: number;                // 1-based, mirrors PageResult.page
  query: string;               // verbatim source query
  queryIndex?: number;         // 0-based into the search array; omitted for single-query calls
  bbox: { x, y, width, height }; // union bbox of contributing spans/words/widget/annotation
  boxes: { x, y, width, height }[]; // per-span/word/widget/annotation bboxes
  text: string;                // matched substring in the same form as pages[].text (NFKC when normalize is on)
  source: 'native' | 'formField' | 'annotation' | 'ocr'; // native/span, formField/widget, annotation, or OCR
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
- **CJK display-spacing aware in literal mode** — adjacent CJK characters in the query can match visual title spacing in the PDF text stream, so `科学` can find `科 学` while still keeping wide column gutters as search-line breaks.
- **Regex queries are NOT normalized** — NFKC can turn compatibility punctuation into regex metacharacters (silent overmatch or syntax break). Regex users get the literal codepoints they typed against the normalized document text and own the asymmetry.
- **Multi-query** via repeating `--search` (or `search: string[]` in library). Each match carries `queryIndex` so the agent can demultiplex which query produced it.
- **Native text is searched at reconstructed visual-line level**. A query can cross pdf.js span / font-run boundaries on the same line (e.g. `"Hello World"` split into `Hello` + `World`) and returns a union `bbox` plus per-span `boxes[]`, but narrow column gutters are treated as line breaks so matches do not stitch the end of one column to the start of another. Multi-line phrase stitching is intentionally not modelled yet because the resulting region is usually too broad for visual zoom.
- **Partial native-span matches are sliced inside the span bbox**: horizontal spans are sliced along x, while tall vertical/rotated spans are sliced along y so `--render-region` can zoom to the matched word instead of the whole line.
- **Text/choice form field values are searched too**. Form-field matches come back with `source: 'formField'` and use the widget bbox, even when `--form-fields` was not requested for output. Choice fields search the selected option's visible display value when it differs from the exported value. Internal values that are not visible text, such as unchecked checkbox `Off` or hidden/noView widget values, are not searched.
- **Visible FreeText annotation contents are searched too**. Annotation matches come back with `source: 'annotation'` and use the annotation bbox, even when `--annotations` was not requested for output. Sticky-note popup contents and other normally closed annotation comments are not searched.
- **OCR text is searched too when `--ocr` is on**. OCR-derived matches come back with `source: 'ocr'`; when `ocr.words[]` is present, `bbox`/`boxes[]` use OCR word geometry in the same page-point coordinate system as native spans. If word-level reconstruction misses one or more occurrences, pdfvision supplements from full `ocr.text` with a page-level bbox so no-space scripts and OCR line-boundary differences still remain searchable. If native text, a form-field value, or visible annotation text already produced the same query/text hit on that page, the duplicate OCR hit is suppressed so the precise non-OCR bbox wins; OCR-only extra hits are still emitted.

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
    <page no="1" charCount="..." imageCount="..." vectorCount="..." textCoverage="..." nonPrintableRatio="..." nonPrintableCount="..." nativeTextStatus="..." visualStatus="..." width="..." height="..."/>
    ...
  </overview>
  <pages>
    <page no="1" charCount="..." imageCount="..." vectorCount="..." textCoverage="..." nonPrintableRatio="..." nonPrintableCount="..." nativeTextStatus="..." visualStatus="..." width="..." height="..." image="...">
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
      <vectorBoxes>
        <vectorBox x="..." y="..." width="..." height="..."/>
        ...
      </vectorBoxes>
      <text>
...page text body...
      </text>
      <rawText>
...pre-normalization text, when normalization changed it...
      </rawText>
      <ocr lang="eng" confidence="0.91">
        <text>
...OCR text...
        </text>
        <words>
          <word text="..." confidence="..." x="..." y="..." width="..." height="..."/>
          ...
        </words>
      </ocr>
    </page>
    ...
  </pages>
</document>
```

Empty `<pageLabels/>`, `<attachments/>`, `<outline/>`, `<viewer/>`, `<layers/>`, `<layout/>`, `<imageBoxes/>`, `<vectorBoxes/>`, `<visualRegions/>`, `<formFields/>`, `<links/>`, `<annotations/>`, `<structure/>`, and `<ocr/>` (self-closing) mean "the pass ran and found nothing", which is distinct from the tag being absent (the pass wasn't requested).

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

Decode back to the `DocumentResult` data model with the `@toon-format/toon` package (`decode(toonString)`). Where the win lands: `spans[]` (`--geometry`), `overview[]`, `imageBoxes[]`, `vectorBoxes[]`, per-block `lines[]`, and `layout.tables[].rows[].cells[]` all tabularize, so geometry/span-dense output is ~40–48% fewer tokens than the pretty-printed JSON. Free text bodies and the non-uniform `layout.blocks[]` (optional `role` / `level` / `repeated` per block) do **not** tabularize — for layout-dominant output `-f xml` is usually more compact than `toon`.

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

Exported types: `DocumentResult`, `DocumentMetadata`, `DocumentAttachment`, `DocumentLayerGroup`, `DocumentLayerOrderItem`, `DocumentLayers`, `DocumentLayerUsage`, `DocumentOutlineItem`, `DocumentOutlineTargetType`, `DocumentViewerState`, `DocumentOpenAction`, `DocumentPermissions`, `DocumentPermission`, `DocumentMarkInfo`, `JsonScalar`, `JsonValue`, `PageOverview`, `PageResult`, `PageQuality`, `PageWarning`, `SearchMatch`, `LayoutBlock`, `LayoutLine`, `LayoutTable`, `LayoutTableRow`, `LayoutTableCell`, `PageLayout`, `ImageBox`, `VectorBox`, `PageLink`, `PageLinkTarget`, `PageLinkType`, `FormField`, `FormFieldChoiceOption`, `FormFieldLabel`, `FormFieldLabelRelation`, `FormFieldType`, `PageAnnotation`, `PageAnnotationBorder`, `PageAnnotationBox`, `PageAnnotationFileAttachment`, `PageAnnotationFlag`, `PageAnnotationLine`, `PageAnnotationPoint`, `PageStructureContent`, `PageStructureItem`, `PageStructureNode`, `VisualRegion`, `VisualRegionAssociatedText`, `VisualRegionAssociatedTextRelation`, `VisualRegionKind`, `VisualRegionSource`, `VisualRegionSourceType`, `RenderRegion`, `TextSpan`, `PageOcr`, `OcrWord`, `OutputFormat`, `ProcessDocumentOptions`, `ProcessOptions`.
