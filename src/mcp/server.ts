import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { getVersion } from '../cli/version.js';
import { type ToolResult, toolError } from './result.js';
import { readPdf } from './tools/readPdf.js';
import { renderPdf } from './tools/renderPdf.js';
import { searchPdf } from './tools/searchPdf.js';

/**
 * Three tools, deliberately.
 *
 * Tool schemas are permanently resident in the host's context, and the
 * hosts this server exists for — the ones without a shell — cannot fall
 * back to the CLI. So the ~35 CLI flags do not appear here: anything
 * pdfvision can decide from the document itself is decided by the
 * server, and the rest is cut. What is left is the loop that matters —
 * survey, locate, look.
 *
 * Claude Code and other shell-capable agents stay better served by the
 * CLI plus the bundled skill, which loads on demand instead of sitting
 * in context for a whole session.
 */

const SOURCE = z
  .string()
  .describe('Local path to a PDF, or an http(s) URL. Reuse the same value across calls for one document.');
const PASSWORD = z.string().optional().describe('Password for an encrypted PDF. Never echoed in output.');
const PAGES = 'Page selector: "3", "1-5", or "1,3,8".';

/** Read-only, and reaches the network when `source` is a URL. */
const ANNOTATIONS = { readOnlyHint: true, openWorldHint: true } as const;

const readSchema = z.object({
  source: SOURCE,
  pages: z.string().optional().describe(`${PAGES} Omit for the document map, or the whole body when it fits.`),
  ocr: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Tesseract language code(s) to OCR the selected pages with, primary language first — "eng", "jpn+eng". Omit to use the PDF\'s own text layer. Slow, and limited to 5 pages per call; reach for it when quality reports empty or garbled native text.',
    ),
  password: PASSWORD,
});

const searchSchema = z.object({
  source: SOURCE,
  query: z.string().describe('Text to find. Literal substring unless `regex` is set.'),
  pages: z.string().optional().describe(`${PAGES} Omit to search every page.`),
  regex: z.boolean().optional().describe('Treat `query` as a JavaScript regular expression.'),
  password: PASSWORD,
});

const renderSchema = z.object({
  source: SOURCE,
  pages: z.string().optional().describe(`${PAGES} At most 4 pages per call. Required unless \`ref\` is given.`),
  ref: z
    .string()
    .optional()
    .describe('A ref such as "p47m1" or "p5r2" from an earlier response, resolved to its page and region.'),
  region: z
    .array(z.number())
    .length(4)
    .optional()
    .describe(
      'Explicit [x, y, width, height] crop in raw unrotated page-view units (top-left origin, y grows down) — the coordinate space every response prints. Single page only.',
    ),
  password: PASSWORD,
});

async function run(handler: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await handler();
  } catch (error) {
    return toolError(error instanceof Error ? error.message : String(error));
  }
}

export function createServer(): McpServer {
  const server = new McpServer({ name: 'pdfvision', version: getVersion() }, { capabilities: { tools: {} } });

  server.registerTool(
    'read_pdf',
    {
      title: 'Read PDF text',
      description:
        'Read a PDF as Markdown. Start here. Without `pages` on a long document you get a document map — page count, outline, per-page text quality, warning codes by page range — not the body, so an unscoped first call is always safe; short documents come back whole. With `pages` you get those pages in visual reading order, repeated headers/footers dropped, plus form-field, link, and annotation tables for the pages that have them. Extraction problems surface inline: glyph garbage, invisible text, text hidden under an opaque fill, OCR layers over scans, reading-order divergence, XFA forms.',
      inputSchema: readSchema,
      annotations: ANNOTATIONS,
    },
    async (input) => run(() => readPdf(input)),
  );

  server.registerTool(
    'search_pdf',
    {
      title: 'Search a PDF',
      description:
        'Find where text occurs without pulling page bodies into context — the way to work a long document. Returns a flat hit list: page, origin (page text, form-field value, link target, annotation), context, region, and a short `ref` for render_pdf. Names the searched pages whose native text is missing or corrupted, so zero hits is never mistaken for absence. Case-insensitive.',
      inputSchema: searchSchema,
      annotations: ANNOTATIONS,
    },
    async (input) => run(() => searchPdf(input)),
  );

  server.registerTool(
    'render_pdf',
    {
      title: 'Render PDF pages as images',
      description:
        "Rasterise pages to PNG — the escape hatch for what the text layer cannot represent: scans, figures, charts, stamps, signatures, complex tables, any page whose quality looks wrong. Pass `pages`, or a `ref` from an earlier response to zoom straight to that spot, or `pages` with an explicit `region`. Full-page renders come back with the page's detected visual regions and their refs, so a figure with no matching text is still reachable. Images are auto-sized for vision models; if a render is too small to read, render a smaller region rather than a bigger image.",
      inputSchema: renderSchema,
      annotations: ANNOTATIONS,
    },
    async (input) => run(() => renderPdf(input)),
  );

  return server;
}
