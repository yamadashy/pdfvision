// The text below is the contract between pdfvision and any AI agent that
// invokes the CLI. The design goal is that an agent reading `pdfvision --help`
// once should be able to use every flag correctly — including the non-obvious
// interactions (--render-output requires --render, --geometry only surfaces
// in json/xml, --no-normalize hides rawText, etc.) — without having to fall
// back to the README, the source, or a follow-up search. When you change a
// flag's behaviour or a format's contents, update the matching paragraph
// here in the same commit, and prefer concrete examples over abstract
// descriptions wherever the trade-off comes up.
export const HELP_TEXT = `pdfvision - Extract text, images, metadata, and layout from PDF files for AI agents

Usage:
  pdfvision <file.pdf> [options]

Arguments:
  file.pdf                            Path to a PDF file. Required.

Basic Options
  -v, --version                       Show version information and exit
  -h, --help                          Display this help

Page Selection
  -p, --pages <range>                 Pages to extract; comma-separated ranges (e.g. "1", "1-5", "1,3,5", "2-4,7"). Default: all pages.

Output Format
  -f, --format <type>                 Output format: markdown (default), json, xml. See "Output formats" below for the schema and parsing notes.

Page Rendering
  -r, --render                        Render each selected page to a PNG (one file per page) and include the absolute path on every page result.
                                      Required for multimodal handoff. PNGs are named \`page-<N>.png\` (1-based) and overwrite any existing file.
      --render-output <dir>           Directory to write rendered PNGs into, created recursively if missing. Without this, PNGs land under the
                                      cache dir (or OS tmp when --no-cache is on). Requires --render.

Text Processing
      --no-normalize                  Disable Unicode NFKC normalization. Default behaviour: extracted text and metadata are NFKC-normalized
                                      (\`⽬\` U+2F6C → \`目\`, \`Ａ\` → \`A\`, \`ｶﾅ\` → \`カナ\`, \`ﬁ\` → \`fi\`); when normalization changed the string,
                                      the pre-normalization form is exposed as \`rawText\` (json/xml only). With --no-normalize, \`text\` contains
                                      pdf.js's raw output and \`rawText\` is omitted entirely. Use this for forensic / glyph-level workflows.

Layout / Geometry
      --geometry                      Emit per-text-item bbox + font size in \`pages[].spans\`: { text, x, y, width, height, fontSize, fontName }.
                                      Coordinates use a top-down origin (matches the rendered PNG). Whitespace-only items are filtered out.
                                      Only emitted with -f json or -f xml; with -f markdown the flag has no effect on output.

Caching
      --no-cache                      Skip the on-disk cache. Default: results cached under <os-tmp>/pdfvision/<sha256-prefix>/, keyed by file
                                      content + every option that affects the output (pages, render, render-output, normalize, geometry).

Output formats

  markdown (default)
    Agent-friendly. Best for handing PDFs to an LLM in a chat / IDE / notebook. Fixed structure (stable for grep / chunking):
        # <file>
        - **Pages:** N
        - **Title|Author|Subject|Creator:** ...        (only the metadata fields that exist)
        ## Overview                                    (multi-page only)
        | Page | Chars | Images | Coverage | Size (pt) |
        ...
        ---
        ## Page N
        _chars: X · images: Y · coverage: Z% · size: WxH pt_
        <page text>
        ![Page N](<absolute/path/to/page-N.png>)       (only with --render)
    Does NOT include rawText or spans (markdown is for reading; use json/xml for those signals).

  json
    Programmatic. JSON.stringify-ed with 2-space indent. Schema (TypeScript notation, ? = optional):
        DocumentResult {
          file: string; totalPages: number;
          metadata: { title|author|subject|creator: string | null };
          overview?: [{ page, charCount, imageCount, textCoverage, width, height }];   // multi-page only
          pages: [{
            page; text; rawText?;                      // rawText only when normalization changed text
            charCount; imageCount; textCoverage;       // density signals (textCoverage is 0–1)
            width; height;                             // PDF user-space points
            image?;                                    // absolute PNG path, only with --render
            spans?: [{ text, x, y, width, height, fontSize, fontName? }];   // only with --geometry
          }];
        }

  xml
    LLM-friendly tag-shaped variant of json — same fields, same conditions, in tag form. \`&\`, \`<\`, \`>\` are entity-escaped in text content;
    attribute values additionally escape \`"\` and newlines (\`&#10;\`). Minimal example:
        <document file="..." totalPages="3">
          <metadata><title>...</title></metadata>
          <overview><page no="1" charCount="54" imageCount="0" textCoverage="0.025" width="612" height="792"/></overview>
          <pages>
            <page no="1" charCount="54" imageCount="0" textCoverage="0.025" width="612" height="792" image="/abs/path/page-1.png">
              <spans><span text="Hello" x="100" y="68" width="156" height="24" fontSize="24" fontName="g_d0_f1"/></spans>
              <text>
              ...page text...
              </text>
              <rawText>...pre-normalization text...</rawText>
            </page>
          </pages>
        </document>

Examples
  pdfvision document.pdf                                                           # Default — markdown to stdout
  pdfvision document.pdf -p 1-3                                                    # Specific pages
  pdfvision document.pdf -p 1,3,5 -f json                                          # Discrete pages, JSON output
  pdfvision document.pdf -f xml                                                    # XML output (LLM-friendly tags)
  pdfvision document.pdf -r -p 1-5                                                 # Render pages as PNG (paths included)
  pdfvision document.pdf -r --render-output ./images                               # Render to a chosen directory
  pdfvision report.pdf -p 3-5 -r --render-output ./images --geometry -f json       # PNGs + layout spans for pages 3-5
  pdfvision slides.pdf -f xml --geometry                                           # Layout / geometry as XML for an LLM
  pdfvision document.pdf --no-cache --no-normalize -f json                         # Forensic: bypass cache, raw codepoints

Exit codes
  0   Success
  1   Argument error, file not found, or extraction failure (error message on stderr)`;
