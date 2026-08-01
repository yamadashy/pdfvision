import { parsePageRange } from '../../core/options/pageRange.js';
import { processDocument } from '../../core/processor.js';
import { formatMarkdown } from '../../output/markdown.js';
import type { DocumentResult, ProcessDocumentOptions } from '../../types/index.js';
import { compactBody } from '../compact.js';
import { MAX_OCR_PAGES, UNSCOPED_FULL_READ_PAGE_LIMIT } from '../limits.js';
import { type ToolResult, toolResult } from '../result.js';
import { resolveSource } from '../source.js';
import { renderSummary } from '../summary.js';
import { truncateBody } from '../truncate.js';

export interface ReadPdfInput {
  source: string;
  pages?: string;
  ocr?: string;
  password?: string;
}

/**
 * Opt-ins the CLI exposes as flags are decided here instead of being
 * parameters. The flags exist because a CLI cannot afford to compute
 * everything on every run; an MCP result's cost is about *emission*, and
 * the Markdown formatter already omits form-field / link / annotation
 * sections when a page has none. Handing the model an `include` array
 * would just re-create the flag surface as permanently resident schema
 * and invite `include: [everything]`.
 *
 * `stripRepeated` is on unconditionally: re-reading the same running
 * footer N times is pure context waste, which is exactly what the flag
 * was built to avoid.
 */
function detailOptions(base: ProcessDocumentOptions): ProcessDocumentOptions {
  return { ...base, layout: true, formFields: true, links: true, annotations: true };
}

function bodyFor(result: DocumentResult): string {
  const markdown = compactBody(formatMarkdown(result, { layout: true, stripRepeated: true }));
  // The hint deliberately omits `source`: the model already has it, and
  // echoing a long absolute path back on every truncation is pure noise.
  return truncateBody(markdown, { continuationHint: (from, to) => `read_pdf(pages: "${from}-${to}")` });
}

export async function readPdf(input: ReadPdfInput): Promise<ToolResult> {
  const resolved = await resolveSource(input.source);
  const base: ProcessDocumentOptions = {
    sourceData: resolved.sourceData,
    password: input.password,
    ocr: input.ocr !== undefined,
    ocrLang: input.ocr,
  };

  if (input.pages !== undefined) {
    // Probe first so an out-of-range selector and the OCR page budget are
    // both checked against the real page count before any heavy pass.
    const probe = await processDocument(resolved.filePath, { ...base, pages: '1', ocr: false, ocrLang: undefined });
    const selected = parsePageRange(input.pages, probe.totalPages);
    if (input.ocr !== undefined && selected.length > MAX_OCR_PAGES) {
      throw new Error(
        `OCR is limited to ${MAX_OCR_PAGES} pages per call (requested ${selected.length}). Split the range across calls.`,
      );
    }
    const result = await processDocument(resolved.filePath, detailOptions({ ...base, pages: input.pages }));
    return toolResult(bodyFor(result));
  }

  const probe = await processDocument(resolved.filePath, { ...base, pages: '1', ocr: false, ocrLang: undefined });
  if (input.ocr !== undefined && probe.totalPages > MAX_OCR_PAGES) {
    throw new Error(
      `OCR is limited to ${MAX_OCR_PAGES} pages per call and this document has ${probe.totalPages}. Pass \`pages\` to pick a range.`,
    );
  }

  if (probe.totalPages <= UNSCOPED_FULL_READ_PAGE_LIMIT) {
    const result = await processDocument(resolved.filePath, detailOptions(base));
    return toolResult(bodyFor(result));
  }

  // Summary mode runs the cheap pass on purpose: layout, form, link, and
  // annotation passes over hundreds of pages are what push an unscoped
  // first call past an MCP host's timeout, and none of them survive
  // aggregation into the map anyway. The outline does, when there is one.
  const survey = await processDocument(resolved.filePath, {
    ...base,
    ocr: false,
    ocrLang: undefined,
    outline: (probe.outlineCount ?? 0) > 0,
  });
  return toolResult(renderSummary(survey));
}
