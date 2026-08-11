import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';

interface PdfAnnotation {
  subtype?: unknown;
  file?: unknown;
  fileId?: unknown;
}

interface PdfFileAttachment {
  filename?: unknown;
  rawFilename?: unknown;
}

export async function collectFileAttachmentAnnotations(doc: PDFDocumentProxy): Promise<Record<string, unknown> | null> {
  const attachments: Record<string, unknown> = {};
  let index = 1;

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const annotations = await page.getAnnotations({ intent: 'display' });
    for (const rawAnnotation of annotations) {
      const annotation = rawAnnotation as PdfAnnotation;
      if (annotation.subtype !== 'FileAttachment' || !annotation.file) continue;
      const key = uniqueKey(fileAttachmentKey(annotation.file, pageNumber, index), attachments);
      const content =
        typeof annotation.fileId === 'string' ? await doc.getAttachmentContent(annotation.fileId) : undefined;
      attachments[key] =
        content === undefined || typeof annotation.file !== 'object'
          ? annotation.file
          : { ...annotation.file, content };
      index++;
    }
  }

  return Object.keys(attachments).length > 0 ? attachments : null;
}

/**
 * Two FileAttachment annotations may legitimately carry the same
 * filename — the same form attached twice, or one per page of a bundle.
 * Keying the record on the filename alone dropped the second one before
 * anything downstream could report it, so the record key gains a suffix
 * while the attachment keeps its own `filename` for display.
 */
function uniqueKey(key: string, record: Record<string, unknown>): string {
  if (!Object.hasOwn(record, key)) return key;
  let suffix = 2;
  while (Object.hasOwn(record, `${key}-${suffix}`)) suffix++;
  return `${key}-${suffix}`;
}

function fileAttachmentKey(value: unknown, pageNumber: number, index: number): string {
  if (value && typeof value === 'object') {
    const file = value as PdfFileAttachment;
    if (typeof file.filename === 'string' && file.filename.length > 0) return file.filename;
    if (typeof file.rawFilename === 'string' && file.rawFilename.length > 0) return file.rawFilename;
  }
  return `page-${pageNumber}-attachment-${index}`;
}
