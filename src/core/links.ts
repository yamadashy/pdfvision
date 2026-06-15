import type { PageLink, PageLinkTarget, PageLinkType } from '../types/index.js';

interface PdfLinkAnnotation {
  subtype?: unknown;
  url?: unknown;
  unsafeUrl?: unknown;
  dest?: unknown;
  rect?: unknown;
}

interface LabelLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BoxLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BuildLinksOptions {
  resolveDestinationPage?: (target: PageLinkTarget) => number | undefined | Promise<number | undefined>;
  labelLines?: readonly LabelLine[];
}

type Rect = [number, number, number, number];
const LINK_TEXT_MAX_CHARS = 240;

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

function linkText(link: BoxLike, lines: readonly LabelLine[]): string | undefined {
  const parts = lines
    .filter((line) => line.text.trim().length > 0)
    .filter((line) => isLineInsideLink(line, link) || overlapRatio(line, link) >= 0.35)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((line) => line.text.trim());
  const text = normalizeLinkText(parts);
  if (text.length > 0) return truncateLinkText(text);

  const clippedText = normalizeLinkText(
    lines
      .map((line) => clippedLineText(line, link))
      .filter((part): part is LabelLine => part !== undefined)
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((part) => part.text),
  );
  return clippedText.length > 0 ? truncateLinkText(clippedText) : undefined;
}

function truncateLinkText(text: string): string {
  const chars = Array.from(text);
  if (chars.length <= LINK_TEXT_MAX_CHARS) return text;
  return `${chars.slice(0, LINK_TEXT_MAX_CHARS - 3).join('')}...`;
}

function normalizeLinkText(parts: readonly string[]): string {
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function isLineInsideLink(line: LabelLine, link: BoxLike): boolean {
  const centerX = line.x + line.width / 2;
  const centerY = line.y + line.height / 2;
  return (
    centerX >= link.x - 2 &&
    centerX <= link.x + link.width + 2 &&
    centerY >= link.y - 2 &&
    centerY <= link.y + link.height + 2
  );
}

function overlapRatio(a: LabelLine, b: BoxLike): number {
  const area = Math.max(0.001, a.width * a.height);
  return intersectionArea(a, b) / area;
}

function clippedLineText(line: LabelLine, link: BoxLike): (LabelLine & { text: string }) | undefined {
  const text = line.text.trim();
  if (text.length === 0 || line.width <= 0 || line.height <= 0) return undefined;
  const verticalOverlap = intersectionHeight(line, link) / Math.max(0.001, Math.min(line.height, link.height));
  if (verticalOverlap < 0.45) return undefined;
  const horizontalOverlap = intersectionWidth(line, link) / Math.max(0.001, Math.min(line.width, link.width));
  if (horizontalOverlap < 0.45) return undefined;

  const clipped = clippedTextByHorizontalPosition(line.text, link, line);
  if (!clipped) return undefined;
  return { ...line, text: clipped };
}

function clippedTextByHorizontalPosition(text: string, link: BoxLike, line: BoxLike): string | undefined {
  const chars = Array.from(text);
  if (chars.length === 0) return undefined;

  const startRatio = clamp((link.x - line.x) / line.width, 0, 1);
  const endRatio = clamp((link.x + link.width - line.x) / line.width, 0, 1);
  let start = Math.min(chars.length - 1, Math.max(0, Math.floor(startRatio * chars.length)));
  let end = Math.min(chars.length, Math.max(start + 1, Math.ceil(endRatio * chars.length)));

  start = expandTokenStart(chars, start);
  end = expandTokenEnd(chars, end);

  let clipped = chars.slice(start, end).join('').trim();
  if (clipped.length > 0) return clipped;

  const center = Math.min(chars.length - 1, Math.max(0, Math.floor(((startRatio + endRatio) / 2) * chars.length)));
  start = expandTokenStart(chars, center);
  end = expandTokenEnd(chars, center + 1);
  clipped = chars.slice(start, end).join('').trim();
  return clipped.length > 0 ? clipped : undefined;
}

function expandTokenStart(chars: readonly string[], start: number): number {
  let out = start;
  while (out > 0 && out < chars.length && !isWhitespace(chars[out]) && !isWhitespace(chars[out - 1])) out--;
  return out;
}

function expandTokenEnd(chars: readonly string[], end: number): number {
  let out = end;
  while (out < chars.length && out > 0 && !isWhitespace(chars[out - 1]) && !isWhitespace(chars[out])) out++;
  return out;
}

function isWhitespace(value: string): boolean {
  return /\s/u.test(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function intersectionWidth(a: BoxLike, b: BoxLike): number {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
}

function intersectionHeight(a: BoxLike, b: BoxLike): number {
  return Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

function intersectionArea(a: BoxLike, b: BoxLike): number {
  const dx = intersectionWidth(a, b);
  const dy = intersectionHeight(a, b);
  return dx > 0 && dy > 0 ? dx * dy : 0;
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
