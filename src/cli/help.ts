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

Options
  -p, --pages <range>     Pages to extract: "1", "1-5", "1,3,5", "2-4,7". Default: all pages.
  -f, --format <type>     Output format: markdown (default), json, xml.
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
      --no-cache          Skip the on-disk cache.
  -v, --version           Show version
  -h, --help              Show this help

Output formats
  markdown (default)  Per-page sections, density Overview table, image links inline. For LLM context.
  json                Full DocumentResult schema. For programmatic parsing.
  xml                 Tag-shaped variant of json. For LLMs that parse tags more reliably than JSON.

Examples
  pdfvision document.pdf                                                       # markdown to stdout
  pdfvision document.pdf -p 1-3 -f json                                        # specific pages, JSON
  pdfvision document.pdf -r --render-output ./images                           # render PNGs to ./images
  pdfvision report.pdf -p 3-5 -r --render-output ./images --geometry -f json   # PNGs + spans for 3-5
  pdfvision slides.pdf -f xml --geometry                                       # layout / geometry as XML

Exit codes
  0  Success
  1  Argument error, file not found, or extraction failure (error message on stderr)`;
