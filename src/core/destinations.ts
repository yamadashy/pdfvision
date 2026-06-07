import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';

export function destinationTarget(dest: unknown): string | undefined {
  if (typeof dest === 'string' && dest.length > 0) return dest;
  if (Array.isArray(dest) && dest.length > 0) return JSON.stringify(dest);
  return undefined;
}

export async function resolveDestinationPage(doc: PDFDocumentProxy, dest: unknown): Promise<number | undefined> {
  const explicit = await explicitDestination(doc, dest);
  if (!Array.isArray(explicit) || explicit.length === 0) return undefined;

  const pageRefOrIndex = explicit[0];
  if (typeof pageRefOrIndex === 'number' && Number.isInteger(pageRefOrIndex) && pageRefOrIndex >= 0) {
    return pageRefOrIndex + 1;
  }
  if (pageRefOrIndex && typeof pageRefOrIndex === 'object') {
    try {
      return (await doc.getPageIndex(pageRefOrIndex as Parameters<PDFDocumentProxy['getPageIndex']>[0])) + 1;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

async function explicitDestination(doc: PDFDocumentProxy, dest: unknown): Promise<unknown[] | undefined> {
  if (typeof dest === 'string' && dest.length > 0) {
    try {
      const resolved = await doc.getDestination(dest);
      return Array.isArray(resolved) ? resolved : undefined;
    } catch {
      return undefined;
    }
  }
  return Array.isArray(dest) ? dest : undefined;
}
