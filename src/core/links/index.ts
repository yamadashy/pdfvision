import type { PageLink, PageLinkAttachment, PageLinkTarget, PageLinkType } from '../../types/index.js';
import { type LabelLine, linkText } from './text.js';

interface PdfLinkAnnotation {
  subtype?: unknown;
  url?: unknown;
  unsafeUrl?: unknown;
  dest?: unknown;
  newWindow?: unknown;
  attachment?: unknown;
  attachmentDest?: unknown;
  rect?: unknown;
}

interface PdfLinkAttachment {
  filename?: unknown;
  description?: unknown;
  content?: unknown;
}

interface BuildLinksOptions {
  resolveDestinationPage?: (target: PageLinkTarget) => number | undefined | Promise<number | undefined>;
  labelLines?: readonly LabelLine[];
}

type Rect = [number, number, number, number];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function validatePageGeometry(pageHeight: number, viewMinX: number, viewMinY: number): void {
  if (!Number.isFinite(pageHeight) || pageHeight <= 0) {
    throw new TypeError('buildLinks: pageHeight must be a positive finite number');
  }
  if (!Number.isFinite(viewMinX) || !Number.isFinite(viewMinY)) {
    throw new TypeError('buildLinks: viewMinX and viewMinY must be finite numbers');
  }
}

export async function buildLinks(
  annotations: readonly unknown[],
  pageHeight: number,
  viewMinX = 0,
  viewMinY = 0,
  options: BuildLinksOptions = {},
): Promise<PageLink[]> {
  validatePageGeometry(pageHeight, viewMinX, viewMinY);

  const links: PageLink[] = [];
  const resolvedPageCache = new Map<string, number | undefined>();
  for (const annotation of annotations) {
    const ann = annotation as PdfLinkAnnotation;
    if (ann.subtype !== 'Link') continue;
    const rect = linkRect(ann.rect);
    if (!rect) continue;

    const target = linkTarget(ann);
    if (!target) continue;

    const [x1, y1, x2, y2] = rect;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    let page: number | undefined;
    if (target.type === 'destination' && options.resolveDestinationPage) {
      const cacheKey = linkTargetText(target.target);
      if (!resolvedPageCache.has(cacheKey)) {
        resolvedPageCache.set(cacheKey, await options.resolveDestinationPage(target.target));
      }
      page = resolvedPageCache.get(cacheKey);
    }

    const box = {
      x: round2(minX - viewMinX),
      y: round2(pageHeight - (maxY - viewMinY)),
      width: round2(maxX - minX),
      height: round2(maxY - minY),
    };
    const text = linkText(box, options.labelLines ?? []);
    links.push({
      ...target,
      ...(page !== undefined && { page }),
      ...(text !== undefined && { text }),
      ...box,
    });
  }
  return links.sort(
    (a, b) => a.y - b.y || a.x - b.x || linkTargetText(a.target).localeCompare(linkTargetText(b.target)),
  );
}

function linkRect(value: unknown): Rect | undefined {
  if (!Array.isArray(value) || value.length < 4) return undefined;
  const values = value.slice(0, 4);
  if (!values.every((item) => typeof item === 'number' && Number.isFinite(item))) return undefined;
  return values as Rect;
}

function linkTarget(annotation: PdfLinkAnnotation):
  | {
      type: PageLinkType;
      target: PageLinkTarget;
      unsafe?: boolean;
      newWindow?: boolean;
      attachment?: PageLinkAttachment;
    }
  | undefined {
  if (typeof annotation.url === 'string' && annotation.url.length > 0) {
    return {
      type: 'url',
      target: annotation.url,
      ...newWindowValue(annotation),
    };
  }
  if (typeof annotation.unsafeUrl === 'string' && annotation.unsafeUrl.length > 0) {
    return {
      type: 'url',
      target: annotation.unsafeUrl,
      unsafe: true,
      ...newWindowValue(annotation),
    };
  }
  if (typeof annotation.dest === 'string' && annotation.dest.length > 0) {
    return { type: 'destination', target: annotation.dest };
  }
  if (Array.isArray(annotation.dest) && annotation.dest.length > 0) {
    return { type: 'destination', target: annotation.dest };
  }
  const attachment = attachmentValue(annotation);
  if (attachment) {
    return {
      type: 'attachment',
      target: attachment.name,
      attachment,
      ...newWindowValue(annotation),
    };
  }
  return undefined;
}

function newWindowValue(annotation: PdfLinkAnnotation): Pick<PageLink, 'newWindow'> {
  return typeof annotation.newWindow === 'boolean' ? { newWindow: annotation.newWindow } : {};
}

function attachmentValue(annotation: PdfLinkAnnotation): PageLinkAttachment | undefined {
  if (!annotation.attachment || typeof annotation.attachment !== 'object') return undefined;
  const raw = annotation.attachment as PdfLinkAttachment;
  if (typeof raw.filename !== 'string' || raw.filename.length === 0) return undefined;

  const attachment: PageLinkAttachment = { name: raw.filename };
  if (typeof raw.description === 'string' && raw.description.length > 0) {
    attachment.description = raw.description;
  }
  const size = attachmentSize(raw.content);
  if (size !== undefined) attachment.size = size;
  const destination = attachmentDestination(annotation.attachmentDest);
  if (destination !== undefined) attachment.destination = destination;
  return attachment;
}

function attachmentSize(content: unknown): number | undefined {
  if (!content || typeof content !== 'object') return undefined;
  if ('byteLength' in content && typeof content.byteLength === 'number' && Number.isFinite(content.byteLength)) {
    return content.byteLength;
  }
  if ('length' in content && typeof content.length === 'number' && Number.isFinite(content.length)) {
    return content.length;
  }
  return undefined;
}

function attachmentDestination(value: unknown): PageLinkTarget | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (Array.isArray(value) && value.length > 0) return value;
  return undefined;
}

function linkTargetText(target: PageLinkTarget): string {
  return typeof target === 'string' ? target : JSON.stringify(target);
}
