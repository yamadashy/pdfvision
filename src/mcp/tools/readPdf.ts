import { readAttachment } from '../../core/document/attachmentContent.js';
import { formatPageRange, parsePageRange } from '../../core/options/pageRange.js';
import { processDocument } from '../../core/processor.js';
import { unreliableNativeTextPages } from '../../core/quality/pageQuality.js';
import { formatDocumentMap } from '../../output/documentMap.js';
import { formatMarkdownSections } from '../../output/markdown.js';
import type { DocumentResult, ProcessDocumentOptions } from '../../types/index.js';
import { attachmentResult } from '../attachments.js';
import { MAX_OCR_PAGES, UNSCOPED_FULL_READ_PAGE_LIMIT } from '../limits.js';
import { type ToolResult, toolResult } from '../result.js';
import { resolveSource } from '../source.js';
import { truncateBody } from '../truncate.js';

export interface ReadPdfInput {
  source: string;
  pages?: string;
  ocr?: string;
  attachment?: string;
  password?: string;
}

/**
 * Opt-ins the CLI exposes as flags are decided here instead of being
 * parameters. The flags exist because a CLI cannot afford to compute
 * everything on every run; an MCP result's cost is about *emission*, and
 * `omitEmptySections` makes the formatter charge nothing for a pass that
 * found nothing. Handing the model an `include` array would just
 * re-create the flag surface as permanently resident schema and invite
 * `include: [everything]`.
 *
 * `stripRepeated` is on unconditionally: re-reading the same running
 * footer N times is pure context waste, which is what the flag is for.
 */
function detailOptions(base: ProcessDocumentOptions): ProcessDocumentOptions {
  return { ...base, layout: true, formFields: true, links: true, annotations: true };
}

function bodyFor(result: DocumentResult, input: ReadPdfInput): string {
  const { header, pages } = formatMarkdownSections(result, {
    layout: true,
    stripRepeated: true,
    omitEmptySections: true,
    // The defaults name CLI flags, which a shell-less caller cannot run.
    // Attachments have an MCP equivalent; document JavaScript does not,
    // so that bullet reports presence and stops there.
    attachmentHint: 'read_pdf(attachment: "1") to open one',
    javascriptHint: '',
  });
  // The hint deliberately omits `source`: the model already has it, and
  // echoing a long absolute path back on every truncation is pure noise.
  // `ocr` is carried, though — dropping it turns the follow-up into a
  // native-text read that silently answers a different question. The
  // password is only named, never echoed, so the response stays safe to
  // log while still saying the call needs it.
  const ocr = input.ocr !== undefined ? `, ocr: "${input.ocr}"` : '';
  const password = input.password !== undefined ? ' (with the same `password`)' : '';
  return truncateBody(header, pages, {
    continuationHint: (dropped) => `read_pdf(pages: "${formatPageRange(dropped)}"${ocr})${password}`,
  });
}

/**
 * The document map reports what the document is; which call to make next
 * is this server's concern, not the formatter's, so it is appended here.
 */
function withNextSteps(map: string, result: DocumentResult): string {
  const unreliable = unreliableNativeTextPages(result.pages);
  const steps = [
    `- \`read_pdf(pages: "${formatPageRange(result.pages.slice(0, 10).map((page) => page.page))}")\` — read from the start`,
    '- `search_pdf(query: "…")` — locate a term, then read or render only the pages it hits',
  ];
  if (unreliable.length > 0) {
    steps.push(
      `- \`read_pdf(pages: "${formatPageRange(unreliable.slice(0, 5))}", ocr: "eng")\` — ${unreliable.length} page(s) have no usable native text (set the language, e.g. \`"jpn+eng"\`)`,
      `- \`render_pdf(pages: "${unreliable[0]}")\` — look at one of those pages instead`,
    );
  }
  return [
    map,
    '',
    // Why the body is missing is this server's reason, not a property of
    // the document, so it is stated here rather than in the formatter.
    '_No `pages` was given and the full body exceeds the response budget._',
    '',
    '## Next step',
    '',
    ...steps,
  ].join('\n');
}

export async function readPdf(input: ReadPdfInput): Promise<ToolResult> {
  const resolved = await resolveSource(input.source);

  if (input.attachment !== undefined) {
    // An attachment request is about the embedded file, not the pages,
    // so it skips extraction entirely — one document load, no page work.
    const found = await readAttachment(resolved.filePath, input.attachment, {
      sourceData: resolved.sourceData,
      password: input.password,
    });
    if (!found.found) {
      if (found.matchedName !== undefined) {
        throw new Error(
          `Attachment "${found.matchedName}" is listed by this document, but its bytes are referenced rather than embedded, so there is nothing to read.`,
        );
      }
      const list = found.available
        .map((entry, index) => `${index + 1}. ${entry.name} (${entry.size} bytes)`)
        .join('; ');
      throw new Error(
        found.available.length === 0
          ? `No attachment "${input.attachment}": this document has no embedded files.`
          : `No attachment "${input.attachment}". This document has ${found.available.length}: ${list}. Pass a name or a 1-based index.`,
      );
    }
    return attachmentResult(found.attachment);
  }

  const base: ProcessDocumentOptions = {
    sourceData: resolved.sourceData,
    password: input.password,
    ocr: input.ocr !== undefined,
    ocrLang: input.ocr,
  };
  const probeOptions: ProcessDocumentOptions = { ...base, pages: '1', ocr: false, ocrLang: undefined };

  if (input.pages !== undefined) {
    // Probe first so an out-of-range selector and the OCR page budget are
    // both checked against the real page count before any heavy pass.
    const probe = await processDocument(resolved.filePath, probeOptions);
    const selected = parsePageRange(input.pages, probe.totalPages);
    if (input.ocr !== undefined && selected.length > MAX_OCR_PAGES) {
      throw new Error(
        `OCR is limited to ${MAX_OCR_PAGES} pages per call (requested ${selected.length}). Split the range across calls.`,
      );
    }
    const result = await processDocument(resolved.filePath, detailOptions({ ...base, pages: input.pages }));
    return toolResult(bodyFor(result, input));
  }

  const probe = await processDocument(resolved.filePath, probeOptions);
  if (input.ocr !== undefined && probe.totalPages > MAX_OCR_PAGES) {
    throw new Error(
      `OCR is limited to ${MAX_OCR_PAGES} pages per call and this document has ${probe.totalPages}. Pass \`pages\` to pick a range.`,
    );
  }

  if (probe.totalPages <= UNSCOPED_FULL_READ_PAGE_LIMIT) {
    const result = await processDocument(resolved.filePath, detailOptions(base));
    return toolResult(bodyFor(result, input));
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
  return toolResult(withNextSteps(formatDocumentMap(survey), survey));
}
