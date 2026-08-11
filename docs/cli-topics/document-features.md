---
name: document-features
description: Document-level output shapes: --structure tagged trees and tables, --page-labels, --attachments, --outline, --viewer state, and --layers. Use when navigation, accessibility tags, embedded files, or optional content matter.
---

# Document-level features

Reference for `-f json`, `-f xml`, and `-f toon` consumers.

## Structure (`--structure`)

```ts
interface PageStructureNode {
  role: string;                 // tagged-PDF role, role-map-resolved by pdf.js when possible
  alt?: string;                 // alternate text, often figure/formula descriptions
  mathML?: string;              // MathML for Formula nodes when pdf.js exposes it
  lang?: string;                // language hint for this structure node
  bbox?: number[];              // [x, y, width, height] in page-view top-left user space
  children: PageStructureItem[];
}

type PageStructureItem = PageStructureNode | PageStructureContent;

interface PageStructureContent {
  type: string;                 // usually "content", "object", or "annotation"
  id: string;                   // pdf.js id that maps to marked content, an object, or an annotation
}

interface PageStructureTable {
  rows: { cells: PageStructureTableCell[] }[];
}

interface PageStructureTableCell {
  text: string;
  header?: 'column' | 'row';
}
```

`pages[].structure` surfaces the tagged-PDF structure tree a human reader may reach through a PDF viewer's accessibility layer. This is especially useful for accessible government PDFs, manuals, reports, and forms where figure `alt` text describes a visual region better than native text extraction. IRS instructions, for example, can expose a cover figure's full human-written description through `alt` even though the native text stream only lists fragments. Structure `bbox` values use `[x, y, width, height]` in the same unrotated page-view top-left system as `spans`, `layout.blocks`, and `imageBoxes`. Stray control bytes in structure strings are removed before output so malformed `alt` / `lang` values do not leak NUL bytes into JSON, XML, Markdown, or TOON. `structure: null` means the pass ran and pdf.js found no page structure tree; absent `structure` means `--structure` was not requested. `overview[].structureNodeCount` mirrors the number of structure nodes so multi-page consumers can find tagged pages before walking every tree.

`pages[].structureTables` reconstructs `Table` roles by correlating structure content ids with marked-content ids from the already-loaded text stream. It supports `THead` / `TBody` / `TFoot` wrappers and direct `TR` children. A `TH` in `TBody` is a row header; other wrapped `TH` cells are column headers. For bare rows, `TH` cells are row headers unless the first row is entirely `TH`, in which case that row is classified as column headers. Empty tagged cells remain empty strings. Paragraphs inside a cell join with `<br>`, while nested tables are flattened into the parent cell text. pdf.js does not expose table spans or explicit `/Scope`, so `RowSpan` / `ColSpan` cannot be represented and header direction is heuristic. Tables split across pages are not merged. The field is absent when no tagged `Table` exists; it is independent of geometry-derived `layout.tables[]`, so requesting both `--layout` and `--structure` can show the same visible table twice.
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

`attachments[]` surfaces embedded file attachments that a human PDF viewer exposes in its attachment pane or as page file-attachment icons. The attachment bytes are intentionally not included in JSON/XML/Markdown/TOON output; use the metadata as a signal that the PDF contains supplemental files without flooding agent context with arbitrary binary content. Pass `--attachment-output <dir>` with `--attachments` when the agent needs actual files on disk; pdfvision writes them under a per-PDF fingerprint subdirectory and fills `attachments[].path`.
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

`viewer` surfaces document-level state a human PDF viewer uses before reading page text: sidebar/page mode, page layout, preferences such as `DisplayDocTitle`, catalog `OpenAction`, document JavaScript actions such as auto-print scripts, permission flags, and tagged-PDF `MarkInfo`. Document JavaScript presence is always available through `javascriptActionCount`; `--viewer` expands it into action names and script source under `viewer.jsActions`. The same `--viewer` pass also emits page-level JavaScript actions such as `PageOpen` / `PageClose` on `pages[].jsActions` when a page defines them. Markdown shortens very long JavaScript action summaries for readability; JSON, XML, and TOON keep the full structured values. Use it on specs, manuals, papers, forms, and long reports where opening position, bookmark/sidebar mode, JavaScript-triggered viewer behavior, copy/print permissions, or tagged-PDF structure affects navigation or accessibility. Empty `viewer: {}` means the pass ran and no viewer-level settings were present; absent `viewer` means `--viewer` was not requested.
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
