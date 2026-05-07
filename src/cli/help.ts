export const HELP_TEXT = `pdfvision - Extract text, metadata, and images from PDF files

Usage:
  pdfvision <file.pdf> [options]

Options:
  -p, --pages <range>     Page range (e.g. "1-5", "3", "1,3,5")
  -f, --format <type>     Output format: markdown (default), json, xml
  -r, --render            Render pages as PNG images
      --render-output <dir>
                          Directory for rendered PNGs (requires --render).
                          Created if missing.
      --no-cache          Skip cache
      --no-normalize      Disable Unicode NFKC normalization (default: on)
      --geometry          Emit per-text-item bbox + font size in pages[].spans.
                          Surfaced in json / xml output; ignored by markdown.
  -v, --version           Show version
  -h, --help              Show this help

Output formats:
  markdown (default)  Agent-friendly. Each page becomes a "## Page N" section
                      with a density Overview table at the top and rendered
                      image links inline. Best for handing PDFs to an LLM in
                      a chat / IDE / notebook context.
  json                Programmatic. Full DocumentResult schema, including
                      width/height, rawText (when normalization changed text),
                      overview (multi-page), and spans[] (when --geometry).
                      Best when another tool will parse the output.
  xml                 LLM-friendly tag-shaped variant of json. Same fields
                      as json, but as <document>/<page>/<text>/<spans> tags
                      that LLMs locate more reliably than nested object keys.

Examples:
  pdfvision document.pdf
  pdfvision document.pdf -p 1-3
  pdfvision document.pdf -r -p 1-5
  pdfvision document.pdf -r --render-output ./images
  pdfvision document.pdf -f json
  pdfvision document.pdf -f xml
  pdfvision document.pdf -f json --geometry`;
