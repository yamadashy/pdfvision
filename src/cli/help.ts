export const HELP_TEXT = `pdfvision - Extract text, metadata, and images from PDF files

Usage:
  pdfvision <file.pdf> [options]

Options:
  -p, --pages <range>     Page range (e.g. "1-5", "3", "1,3,5")
  -f, --format <type>     Output format: text (default), json
  -r, --render            Render pages as PNG images
      --render-output <dir>
                          Directory for rendered PNGs (requires --render).
                          Created if missing.
      --no-cache          Skip cache
  -v, --version           Show version
  -h, --help              Show this help

Examples:
  pdfvision document.pdf
  pdfvision document.pdf -p 1-3
  pdfvision document.pdf -r -p 1-5
  pdfvision document.pdf -r --render-output ./images
  pdfvision document.pdf -f json`;
