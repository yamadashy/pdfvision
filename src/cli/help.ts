// pdfvision is a read-only extraction tool — running it on a PDF has no
// side effects beyond writing PNGs (when --render is used) and the cache.
// So the help below leans on "just try it" rather than spelling out every
// schema. The bar to clear is: an agent can pick the right flags from this
// list, and recover from non-obvious flag interactions (e.g. --render-output
// requires --render, --geometry has no effect without -f json/xml). Detailed
// shape / schema info lives in the README and source — running with -f json
// once is the fastest way for an agent to see what comes back.
export const HELP_TEXT = `pdfvision - Extract text, images, metadata, and layout from PDF files for AI agents

Usage:
  pdfvision <file.pdf> [options]
  pdfvision --remote <url> [options]
  pdfvision --clear-cache

Options
  -p, --pages <range>     Pages to extract: "1", "1-5", "1,3,5", "2-4,7". Default: all pages.
  -f, --format <type>     Output format: markdown (default), json, xml, toon.
      --markdown          Shortcut for --format markdown.
      --json              Shortcut for --format json.
      --xml               Shortcut for --format xml.
      --toon              Shortcut for --format toon.
                          (Specifying more than one format, or mixing a shortcut with a different
                          --format, is an error — pdfvision does not last-wins-resolve them.)
  -r, --render            Render each selected page to a PNG and include the path on every page result.
      --render-output <dir>
                          Directory to write rendered PNGs into, created if missing. Requires --render.
                          Without this, PNGs land under the cache (or OS tmp with --no-cache).
      --render-scale <n>  Rasterisation multiplier for --render / --ocr. Default 2 (≈144 DPI on a
                          letter page). Smaller values shrink the PNG (and vision-model payload);
                          larger values capture more detail. Accepts decimals; bounds (0, 4].
      --render-region <x,y,width,height>
                          Render only the given sub-rectangle (PDF points, top-left origin, y
                          grows downward — same coordinate system as imageBoxes / layout.blocks).
                          Composes with --render-scale: a 400×300pt region at scale 3 yields a
                          1200×900px PNG. Single-page only: --pages must resolve to exactly one
                          page (errors otherwise). Region must fit within the page bounds.
                          Typical use: --layout to find a suspect block, then re-run with that
                          block's bbox here to zoom in.
      --no-normalize      Disable Unicode NFKC normalization. Default ON; pre-normalization text is
                          surfaced in \`rawText\` (json/xml) when normalization changed the string.
                          Markdown output shows only the normalized form — pass --no-normalize if
                          original codepoint fidelity (e.g. fullwidth punctuation \`（\`, ligatures
                          \`ﬁ\`) matters for downstream diff / forensics.
      --geometry          Emit per-text-item bbox + font size in \`pages[].spans\`.
                          Only takes effect with -f json / -f xml / -f toon.
      --layout            Reconstruct \`pages[].layout\` (lines, blocks, vertical CJK stacks,
                          and numeric-table hints
                          in approximate reading order) from the same span data. Structured layout fields
                          appear in -f json / -f xml / -f toon; Markdown uses recovered vertical text
                          blocks, and rebuilds the page body in layout order when the native text
                          stream diverges from the visual reading order.
                          Also enables layout warnings: overlapping text, off-page bboxes,
                          body crowded against repeated chrome, flattened numeric tables,
                          or native-vs-visual reading-order divergence in \`pages[].warnings\`.
      --image-boxes       Emit \`pages[].imageBoxes\` — bounding box of every raster image
                          draw on the page. Enables large-raster warnings with --layout or
                          --geometry. Only -f json / -f xml / -f toon.
                          Full-page scan/OCR-layer and dense-vector warnings can appear
                          even without this flag.
      --vector-boxes      Emit \`pages[].vectorBoxes\` — bounding boxes of painted vector
                          paths such as map symbols, chart paths, table rules, form
                          boxes, and slide shapes. Only -f json / -f xml / -f toon.
      --visual-regions    Emit \`pages[].visualRegions\` — padded, crop-ready bboxes
                          for important figures, charts, diagrams, tables, forms, and
                          raster/vector clusters. Feed x,y,width,height directly into
                          --render-region for a visual zoom.
      --render-visual-regions
                          Render each visual region crop to PNG and attach
                          \`visualRegions[].image\` / \`renderContentRatio\`.
                          Implies --visual-regions and does not require --render.
      --form-fields       Emit \`pages[].formFields\` — interactive PDF widget fields
                          such as text boxes, checkboxes, radio buttons, choices, and
                          signatures with values, bboxes, and nearby visible labels.
                          Useful for government forms.
                          Markdown also renders a form-field table.
      --links             Emit \`pages[].links\` — clickable PDF link annotations such as
                          external URLs, citation jumps, and table-of-contents destinations
                          with bboxes. Markdown also renders a links table.
      --annotations       Emit \`pages[].annotations\` — non-link PDF annotations such as
                          comments, sticky notes, highlights, underlines, strikeouts, stamps,
                          and other markup with bboxes and comment text.
      --structure         Emit tagged-PDF structure trees in \`pages[].structure\`,
                          including role hierarchy, figure alt text, language hints,
                          bboxes, and marked-content ids when the PDF provides them.
      --page-labels       Emit viewer page labels in \`pageLabels\` and \`pages[].pageLabel\`;
                          useful when front matter uses roman numerals or page numbering
                          restarts apart from the physical page number.
      --attachments       Emit document-level embedded file attachment metadata in
                          \`attachments\` without embedding attachment bytes in output.
      --attachment-output <dir>
                          Directory to write embedded attachment files into. Requires
                          --attachments; files land under a per-PDF fingerprint subdir.
      --outline           Emit top-level \`outline\` document bookmarks, preserving hierarchy
                          and resolving destination pages when possible. Markdown also renders
                          an outline section.
      --viewer            Emit top-level \`viewer\` settings: initial page mode/layout,
                          viewer preferences, open action, permissions, and MarkInfo.
      --layers            Emit top-level \`layers\` from PDF optional content groups:
                          layer names, visibility, usage states, radio groups, and
                          viewer panel order for maps, CAD/design PDFs, and variants.
      --strip-repeated    Drop running headers / footers / page numbers (blocks the layout
                          pass tagged as \`repeated\`) from the rendered Markdown body so
                          LLM readers don't have to wade through the same footer N times.
                          Markdown only; JSON / XML already expose \`repeated: true\` per
                          block. Requires --layout.
      --ocr               Run OCR on each selected page and attach \`pages[].ocr\`
                          (text + confidence + lang). Slow; opt-in. Requires the
                          optional \`tesseract.js\` dependency. \`pages[].text\` is
                          preserved alongside so callers can compare native vs OCR.
      --ocr-lang <lang>   Tesseract language code(s), plus-separated for multi-lang
                          (e.g. \`eng+jpn\`). Default: eng. Only used with --ocr.
      --search <query>    Find every occurrence of <query> on each page and emit
                          \`pages[].matches[]\` with the bbox of each hit. Pipe a
                          match's bbox into a follow-up --render-region for visual
                          zoom. Repeatable: \`--search A --search B\` searches both
                          (each match carries the source query). Literal substring
                          by default; case-insensitive; NFKC-aware (matches
                          compatibility codepoints like \`ﬁ\` (U+FB01 ligature) for
                          \`fi\`). Also searches OCR text when --ocr is on
                          (marked source:'ocr'); duplicate OCR hits already
                          covered by native matches are suppressed.
      --search-regex      Treat each --search query as a JavaScript regular expression
                          (default: literal substring).
      --search-case-sensitive
                          Match case exactly (default: insensitive).
      --remote <url>      Download an http(s) PDF, validate the PDF header, and run extraction
                          on it. Same URL → same cache slot unless --no-cache streams the
                          bytes directly without writing the remote-PDF cache.
      --no-cache          Skip the on-disk cache (re-download / re-extract every run).
      --clear-cache       Remove every cached extraction, rendered PNG, and downloaded
                          remote PDF, then exit. No file argument required.
  -v, --version           Show version
  -h, --help              Show this help

Output formats
  markdown (default)  Per-page sections, density Overview table, image links inline. For LLM context.
  json                Full DocumentResult schema. For programmatic parsing.
  xml                 Tag-shaped variant of json. For LLMs that parse tags more reliably than JSON.
  toon                Token-Oriented Object Notation: lossless, tabular encoding of the json schema
                      that cuts tokens (~40% on geometry/layout-heavy output). For tight LLM budgets.

Examples
  pdfvision document.pdf                                                       # markdown to stdout
  pdfvision document.pdf --json                                                # JSON shortcut
  pdfvision document.pdf -p 1-3 --json                                         # specific pages, JSON
  pdfvision document.pdf -r --render-output ./images                           # render PNGs to ./images
  pdfvision slides.pdf -r --render-scale 1                                     # 1× raster (smaller PNGs)
  pdfvision report.pdf -p 3 -r --render-region 100,200,300,150                 # zoom into a 300×150pt box on page 3
  pdfvision report.pdf --search "revenue" --json                               # find every "revenue" with bbox; pipe to --render-region
  pdfvision paper.pdf --search "GPT" --search "transformer" --json             # multi-query (each match keeps its source query)
  pdfvision report.pdf -p 3-5 -r --render-output ./images --geometry --json    # PNGs + spans for 3-5
  pdfvision slides.pdf --xml --geometry                                        # layout / geometry as XML
  pdfvision report.pdf --toon --geometry                                       # token-efficient spans (TOON)
  pdfvision report.pdf --layout --strip-repeated                               # markdown w/o repeated chrome
  pdfvision scan.pdf --ocr --json                                              # OCR a scanned PDF
  pdfvision scan-ja.pdf --ocr --ocr-lang eng+jpn --json                        # multi-lang OCR
  pdfvision --remote https://example.com/paper.pdf --json                      # fetch + extract JSON
  pdfvision --clear-cache                                                      # wipe the on-disk cache

Exit codes
  0  Success
  1  Argument error, file not found, network error, or extraction failure (error message on stderr)`;
