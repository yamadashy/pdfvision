import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { DocumentOutlineItem, DocumentOutlineTargetType } from '../types/index.js';

interface PdfOutlineNode {
  title?: unknown;
  dest?: unknown;
  url?: unknown;
  unsafeUrl?: unknown;
  items?: unknown;
}

interface BuildOutlineOptions {
  normalizeText?: (value: string) => string;
}

export async function buildOutline(
  nodes: readonly unknown[] | null | undefined,
  doc: PDFDocumentProxy,
  options: BuildOutlineOptions = {},
): Promise<DocumentOutlineItem[]> {
  if (!nodes || nodes.length === 0) return [];

  const out: DocumentOutlineItem[] = [];
  for (const node of nodes) {
    const item = await buildOutlineItem(node, doc, options);
    if (item) {
      out.push(item);
    } else {
      const outlineNode = node as PdfOutlineNode;
      if (Array.isArray(outlineNode.items)) out.push(...(await buildOutline(outlineNode.items, doc, options)));
    }
  }
  return out;
}

async function buildOutlineItem(
  node: unknown,
  doc: PDFDocumentProxy,
  options: BuildOutlineOptions,
): Promise<DocumentOutlineItem | undefined> {
  const outlineNode = node as PdfOutlineNode;
  if (typeof outlineNode.title !== 'string' || outlineNode.title.length === 0) return undefined;

  const title = options.normalizeText ? options.normalizeText(outlineNode.title) : outlineNode.title;
  const children = Array.isArray(outlineNode.items) ? await buildOutline(outlineNode.items, doc, options) : [];
  const target = outlineTarget(outlineNode);
  const page = target?.type === 'destination' ? await resolveDestinationPage(doc, outlineNode.dest) : undefined;

  return {
    title,
    ...(target && { type: target.type, target: target.target }),
    ...(page !== undefined && { page }),
    ...(children.length > 0 && { items: children }),
  };
}

function outlineTarget(node: PdfOutlineNode): { type: DocumentOutlineTargetType; target: string } | undefined {
  if (typeof node.url === 'string' && node.url.length > 0) {
    return { type: 'url', target: node.url };
  }
  if (typeof node.unsafeUrl === 'string' && node.unsafeUrl.length > 0) {
    return { type: 'url', target: node.unsafeUrl };
  }
  const destination = destinationTarget(node.dest);
  if (destination) return { type: 'destination', target: destination };
  return undefined;
}

function destinationTarget(dest: unknown): string | undefined {
  if (typeof dest === 'string' && dest.length > 0) return dest;
  if (Array.isArray(dest) && dest.length > 0) return JSON.stringify(dest);
  return undefined;
}

async function resolveDestinationPage(doc: PDFDocumentProxy, dest: unknown): Promise<number | undefined> {
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
