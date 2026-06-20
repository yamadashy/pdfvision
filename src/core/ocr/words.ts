import type { OcrWord } from '../../types/index.js';
import type { RenderRegion, ViewportCrop } from '../renderer.js';

export const DEFAULT_OCR_RENDER_SCALE = 2;

export interface OcrWordTransform {
  scale: number;
  region?: RenderRegion;
  crop?: ViewportCrop;
  pageView?: readonly number[];
  viewport?: PageViewportLike;
}

interface PageViewportLike {
  convertToPdfPoint(x: number, y: number): number[];
}

interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RawOcrBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface RawOcrWord {
  text?: unknown;
  confidence?: unknown;
  bbox?: RawOcrBbox;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function normaliseConfidence(value: unknown): number {
  const raw = typeof value === 'number' ? value : 0;
  return round3(Math.max(0, Math.min(1, raw / 100)));
}

function isUsableRawBbox(bbox: RawOcrBbox | undefined): bbox is RawOcrBbox {
  return (
    bbox !== undefined &&
    Number.isFinite(bbox.x0) &&
    Number.isFinite(bbox.y0) &&
    Number.isFinite(bbox.x1) &&
    Number.isFinite(bbox.y1) &&
    bbox.x1 > bbox.x0 &&
    bbox.y1 > bbox.y0
  );
}

function isUsablePageView(value: readonly number[] | undefined): value is readonly [number, number, number, number] {
  return Array.isArray(value) && value.length >= 4 && value.slice(0, 4).every((item) => Number.isFinite(item));
}

function isUsablePdfPoint(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

function arrayProperty(value: unknown, key: string): unknown[] {
  if (typeof value !== 'object' || value === null) return [];
  const property = (value as Record<string, unknown>)[key];
  return Array.isArray(property) ? property : [];
}

function collectRawWords(page: { blocks?: unknown }): RawOcrWord[] {
  const out: RawOcrWord[] = [];
  const blocks = arrayProperty(page, 'blocks');
  for (const block of blocks) {
    const paragraphs = arrayProperty(block, 'paragraphs');
    for (const paragraph of paragraphs) {
      const lines = arrayProperty(paragraph, 'lines');
      for (const line of lines) {
        const words = arrayProperty(line, 'words');
        for (const word of words) out.push(word as RawOcrWord);
      }
    }
  }
  return out;
}

function ocrBboxToPageBox(bbox: RawOcrBbox, transform: OcrWordTransform): PageBox | undefined {
  const scale = transform.scale > 0 ? transform.scale : DEFAULT_OCR_RENDER_SCALE;
  const pageView = isUsablePageView(transform.pageView) ? transform.pageView : undefined;
  const viewport = transform.viewport;
  if (!viewport || !pageView) {
    const offsetX = transform.region?.x ?? 0;
    const offsetY = transform.region?.y ?? 0;
    return {
      x: round2(offsetX + bbox.x0 / scale),
      y: round2(offsetY + bbox.y0 / scale),
      width: round2((bbox.x1 - bbox.x0) / scale),
      height: round2((bbox.y1 - bbox.y0) / scale),
    };
  }

  const cropX = transform.crop?.x ?? 0;
  const cropY = transform.crop?.y ?? 0;
  const viewMinX = Math.min(pageView[0], pageView[2]);
  const viewMaxY = Math.max(pageView[1], pageView[3]);
  const corners = [
    [bbox.x0, bbox.y0],
    [bbox.x1, bbox.y0],
    [bbox.x0, bbox.y1],
    [bbox.x1, bbox.y1],
  ];
  const points = corners.map(([x, y]) => {
    const pdfPoint = viewport.convertToPdfPoint(cropX + x, cropY + y);
    if (!isUsablePdfPoint(pdfPoint)) return undefined;
    const [pdfX, pdfY] = pdfPoint;
    return {
      x: pdfX - viewMinX,
      y: viewMaxY - pdfY,
    };
  });
  if (points.some((point) => point === undefined)) return undefined;
  const usablePoints = points as { x: number; y: number }[];
  const minX = Math.min(...usablePoints.map((point) => point.x));
  const maxX = Math.max(...usablePoints.map((point) => point.x));
  const minY = Math.min(...usablePoints.map((point) => point.y));
  const maxY = Math.max(...usablePoints.map((point) => point.y));
  return {
    x: round2(minX),
    y: round2(minY),
    width: round2(maxX - minX),
    height: round2(maxY - minY),
  };
}

export function transformOcrWords(page: { blocks?: unknown }, transform: OcrWordTransform): OcrWord[] {
  const words: OcrWord[] = [];
  for (const raw of collectRawWords(page)) {
    const text = typeof raw.text === 'string' ? raw.text.trim() : '';
    if (text.length === 0 || !isUsableRawBbox(raw.bbox)) continue;
    const box = ocrBboxToPageBox(raw.bbox, transform);
    if (!box) continue;
    words.push({
      text,
      confidence: normaliseConfidence(raw.confidence),
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    });
  }
  return words;
}
