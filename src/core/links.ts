import type { PageLink, PageLinkTarget, PageLinkType } from '../types/index.js';

interface PdfLinkAnnotation {
  subtype?: unknown;
  url?: unknown;
  unsafeUrl?: unknown;
  dest?: unknown;
  rect?: unknown;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildLinks(
  annotations: readonly unknown[],
  pageHeight: number,
  viewMinX = 0,
  viewMinY = 0,
): PageLink[] {
  const links: PageLink[] = [];
  for (const annotation of annotations) {
    const ann = annotation as PdfLinkAnnotation;
    if (ann.subtype !== 'Link') continue;
    if (!Array.isArray(ann.rect) || ann.rect.length < 4 || !ann.rect.every((v) => typeof v === 'number')) continue;

    const target = linkTarget(ann);
    if (!target) continue;

    const [x1, y1, x2, y2] = ann.rect as [number, number, number, number];
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    links.push({
      ...target,
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
