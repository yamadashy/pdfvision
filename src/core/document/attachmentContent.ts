import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { DocumentAttachment } from '../../types/index.js';
import { buildPdfJsDocumentOptions } from '../processor/pdfJsSetup.js';
import { normalizeText } from '../processor/textUtils.js';
import { collectFileAttachmentAnnotations } from './attachmentAnnotations.js';
import { buildAttachmentsWithContent, catalogAttachmentsToRecord, mergeAttachmentRecords } from './attachments.js';

/**
 * Reading one embedded file out of a PDF.
 *
 * This is its own entry point rather than an option on `processDocument`
 * because the bytes must not travel inside `DocumentResult` — the JSON
 * formatter stringifies that whole object, and a `Uint8Array` in it would
 * come out as `{"0":80,"1":75,…}`. It also means a caller that wants an
 * attachment pays for one document load and no page extraction at all.
 */

export interface AttachmentContent {
  name: string;
  description?: string;
  size: number;
  content: Uint8Array;
}

export interface ReadAttachmentOptions {
  sourceData?: Uint8Array;
  password?: string;
  /** Matches `processDocument`: NFKC on by default, off with `--no-normalize`. */
  normalize?: boolean;
}

export type ReadAttachmentResult =
  | { found: true; attachment: AttachmentContent }
  /** `matchedName` set: the selector *did* name a listed attachment, but
   *  the document only references its bytes without embedding them. */
  | { found: false; available: { name: string; size: number }[]; matchedName?: string };

/**
 * Resolve `selector` against the same list, in the same order, that
 * `--attachments` and the document map show: an exact name (case
 * insensitive) or a 1-based index. Anything else reports what *is*
 * there, so a caller that guessed wrong can correct itself in one step
 * instead of being told only that it failed.
 *
 * A match without bytes is its own outcome, not a miss — a FileAttachment
 * annotation may reference a file the PDF never embeds, and "no attachment
 * by that name" followed by a list containing that very name would
 * contradict itself.
 */
export function resolveAttachment(
  attachments: readonly (DocumentAttachment & { content?: Buffer })[],
  selector: string,
): ReadAttachmentResult {
  const trimmed = selector.trim();
  const byIndex = /^\d+$/.test(trimmed) ? attachments[Number(trimmed) - 1] : undefined;
  const match =
    byIndex ??
    attachments.find((entry) => entry.name.toLocaleLowerCase('en-US') === trimmed.toLocaleLowerCase('en-US'));

  if (match?.content === undefined) {
    return {
      found: false,
      available: attachments.map((entry) => ({ name: entry.name, size: entry.size })),
      ...(match !== undefined && { matchedName: match.name }),
    };
  }
  return {
    found: true,
    attachment: {
      name: match.name,
      ...(match.description !== undefined && { description: match.description }),
      size: match.content.byteLength,
      content: match.content,
    },
  };
}

export async function readAttachment(
  filePath: string,
  selector: string,
  options: ReadAttachmentOptions = {},
): Promise<ReadAttachmentResult> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = getDocument(
    buildPdfJsDocumentOptions({ pdfData: options.sourceData, filePath, password: options.password }),
  );
  let doc: PDFDocumentProxy;
  try {
    doc = await loadingTask.promise;
  } catch (error) {
    try {
      await loadingTask.destroy();
    } catch {
      // Preserve the original parse failure; cleanup is best-effort.
    }
    throw error;
  }

  try {
    const normalize = options.normalize !== false ? normalizeText : undefined;
    const records = mergeAttachmentRecords(
      await catalogAttachmentsToRecord(await doc.getAttachments(), (id) => doc.getAttachmentContent(id)),
      await collectFileAttachmentAnnotations(doc),
    );
    return resolveAttachment(buildAttachmentsWithContent(records, { normalizeText: normalize }), selector);
  } finally {
    await loadingTask.destroy();
  }
}
