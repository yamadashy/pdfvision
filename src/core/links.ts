import type { PageLink, PageLinkTarget, PageLinkType } from '../types/index.js';

interface PdfLinkAnnotation {
  subtype?: unknown;
  url?: unknown;
  unsafeUrl?: unknown;
  dest?: unknown;
  rect?: unknown;
}

interface BuildLinksOptions {
  resolveDestinationPage?: (target: PageLinkTarget) => number | undefined | Promise<number | undefined>;
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

    links.push({
      ...target,
      ...(page !== undefined && { page }),
      x: round2(minX - viewMinX),
      y: round2(pageHeight - (maxY - viewMinY)),
      width: round2(maxX - minX),
      height: round2(maxY - minY),
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

function linkTarget(annotation: PdfLinkAnnotation): { type: PageLinkType; target: PageLinkTarget } | undefined {
  if (typeof annotation.url === 'string' && annotation.url.length > 0) {
    return { type: 'url', target: annotation.url };
  }
  if (typeof annotation.unsafeUrl === 'string' && annotation.unsafeUrl.length > 0) {
    return { type: 'url', target: annotation.unsafeUrl };
  }
  if (typeof annotation.dest === 'string' && annotation.dest.length > 0) {
    return { type: 'destination', target: annotation.dest };
  }
  if (Array.isArray(annotation.dest) && annotation.dest.length > 0) {
    return { type: 'destination', target: annotation.dest };
  }
  return undefined;
}

function linkTargetText(target: PageLinkTarget): string {
  return typeof target === 'string' ? target : JSON.stringify(target);
}
