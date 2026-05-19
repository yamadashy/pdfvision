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
  -f, --format <type>     Output format: markdown (default), json, xml.
      --markdown          Shortcut for --format markdown.
      --json              Shortcut for --format json.
      --xml               Shortcut for --format xml.
                          (Specifying more than one format, or mixing a shortcut with a different
                          --format, is an error — pdfvision does not last-wins-resolve them.)
  -r, --render            Render each selected page to a PNG and include the path on every page result.
      --render-output <dir>
                          Directory to write rendered PNGs into, created if missing. Requires --render.
                          Without this, PNGs land under the cache (or OS tmp with --no-cache).
      --no-normalize      Disable Unicode NFKC normalization. Default ON; pre-normalization text is
                          surfaced in \`rawText\` (json/xml) when normalization changed the string.
      --geometry          Emit per-text-item bbox + font size in \`pages[].spans\`.
                          Only takes effect with -f json or -f xml.
      --layout            Reconstruct \`pages[].layout\` (lines + blocks in approximate
                          reading order) from the same span data. Only -f json / -f xml.
      --image-boxes       Emit \`pages[].imageBoxes\` — bounding box of every raster image
                          draw on the page. Only -f json / -f xml.
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
      --remote <url>      Download an http(s) URL to the on-disk cache and run extraction
                          on it. Same URL → same cache slot; combine with --no-cache (or
                          --clear-cache) to refresh.
      --no-cache          Skip the on-disk cache (re-download / re-extract every run).
      --clear-cache       Remove every cached extraction, rendered PNG, and downloaded
                          remote PDF, then exit. No file argument required.
  -v, --version           Show version
  -h, --help              Show this help

Output formats
  markdown (default)  Per-page sections, density Overview table, image links inline. For LLM context.
  json                Full DocumentResult schema. For programmatic parsing.
  xml                 Tag-shaped variant of json. For LLMs that parse tags more reliably than JSON.

Examples
  pdfvision document.pdf                                                       # markdown to stdout
  pdfvision document.pdf --json                                                # JSON shortcut
  pdfvision document.pdf -p 1-3 --json                                         # specific pages, JSON
  pdfvision document.pdf -r --render-output ./images                           # render PNGs to ./images
  pdfvision report.pdf -p 3-5 -r --render-output ./images --geometry --json    # PNGs + spans for 3-5
  pdfvision slides.pdf --xml --geometry                                        # layout / geometry as XML
  pdfvision report.pdf --layout --strip-repeated                               # markdown w/o repeated chrome
  pdfvision scan.pdf --ocr --json                                              # OCR a scanned PDF
  pdfvision scan-ja.pdf --ocr --ocr-lang eng+jpn --json                        # multi-lang OCR
  pdfvision --remote https://example.com/paper.pdf --json                      # fetch + extract JSON
  pdfvision --clear-cache                                                      # wipe the on-disk cache

Exit codes
  0  Success
  1  Argument error, file not found, network error, or extraction failure (error message on stderr)`;
