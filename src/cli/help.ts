export const HELP_TEXT = `pdfvision - Extract text, images, metadata, and layout from PDF files for AI agents

Usage:
  pdfvision <file.pdf> [options]

Arguments:
  file.pdf                            Path to a PDF file. Required.

Basic Options
  -v, --version                       Show version information and exit
  -h, --help                          Display this help

Page Selection
  -p, --pages <range>                 Pages to extract; comma-separated ranges
                                      (e.g. "1", "1-5", "1,3,5", "2-4,7").
                                      Default: all pages.

Output Format
  -f, --format <type>                 Output format: markdown (default), json, xml.
                                      See "Output formats" below for details.

Page Rendering
  -r, --render                        Render each selected page to a PNG and
                                      include the image path on every page
                                      result. Required for multimodal handoff.
      --render-output <dir>           Directory to write rendered PNGs into,
                                      created if missing. Without this, PNGs
                                      land under the cache dir (or OS tmp when
                                      --no-cache is on). Requires --render.

Text Processing
      --no-normalize                  Disable Unicode NFKC normalization.
                                      By default extracted text and metadata
                                      are NFKC-normalized, so compatibility
                                      codepoints collapse to canonical forms
                                      (\`⽬\` U+2F6C → \`目\`, \`Ａ\` → \`A\`,
                                      \`ｶﾅ\` → \`カナ\`, \`ﬁ\` → \`fi\`). The
                                      pre-normalization string still surfaces
                                      in \`rawText\` when it differs. Use
                                      --no-normalize for forensic / glyph-level
                                      workflows that need pdf.js raw output.

Layout / Geometry
      --geometry                      Emit per-text-item bbox + font size in
                                      \`pages[].spans\`: { text, x, y, width,
                                      height, fontSize, fontName }. Coordinates
                                      use a top-down origin (matches rendered
                                      PNG). Whitespace-only items are filtered.
                                      Surfaced in json / xml output; ignored
                                      by markdown.

Caching
      --no-cache                      Skip the on-disk cache. By default,
                                      results are cached under
                                      <os-tmp>/pdfvision/<sha256-prefix>/
                                      keyed by file content + options.

Output formats
  markdown (default)
    Agent-friendly. Each page becomes a "## Page N" section with a density
    Overview table at the top and rendered image links inline. Best for
    handing PDFs to an LLM in a chat / IDE / notebook context. Does NOT
    include rawText or spans (intentionally — markdown is for reading).

  json
    Programmatic. Full DocumentResult schema, JSON.stringify-ed with 2-space
    indent. Includes overview (multi-page), rawText (when normalization
    changed text), width/height, image (when --render), spans (when
    --geometry). Best when another tool will parse the output.

  xml
    LLM-friendly tag-shaped variant of json. Same fields, but as
    <document>/<page>/<text>/<spans> tags that LLMs locate more reliably
    than nested JSON keys. Useful when feeding output into a vision/chat
    model that doesn't always parse JSON faithfully.

Examples
  # Default — markdown to stdout
  pdfvision document.pdf

  # Specific pages
  pdfvision document.pdf -p 1-3
  pdfvision document.pdf -p 1,3,5

  # JSON output
  pdfvision document.pdf -f json

  # XML output (LLM-friendly tags)
  pdfvision document.pdf -f xml

  # Render pages as PNG (paths included in output)
  pdfvision document.pdf -r -p 1-5

  # Render to a chosen directory
  pdfvision document.pdf -r --render-output ./images

  # Layout / geometry as XML for an LLM
  pdfvision slides.pdf -f xml --geometry

  # Forensic mode: bypass cache, disable normalization
  pdfvision document.pdf --no-cache --no-normalize -f json

Exit codes
  0   Success
  1   Argument error, file not found, or extraction failure
      (error message on stderr)`;
