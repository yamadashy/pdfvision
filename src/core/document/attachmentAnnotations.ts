import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';

interface PdfAnnotation {
  subtype?: unknown;
  file?: unknown;
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
      const key = fileAttachmentKey(annotation.file, pageNumber, index);
      attachments[key] = annotation.file;
      index++;
    }
  }

  return Object.keys(attachments).length > 0 ? attachments : null;
}

function fileAttachmentKey(value: unknown, pageNumber: number, index: number): string {
  if (value && typeof value === 'object') {
    const file = value as PdfFileAttachment;
    if (typeof file.filename === 'string' && file.filename.length > 0) return file.filename;
    if (typeof file.rawFilename === 'string' && file.rawFilename.length > 0) return file.rawFilename;
  }
  return `page-${pageNumber}-attachment-${index}`;
}
