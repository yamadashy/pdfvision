import { describe, expect, it } from 'vitest';
import {
  isRasterBackedTextLayer,
  RASTER_BACKED_TEXT_LAYER_MAX_VECTOR_OPS,
} from '../../src/core/quality/rasterBackedTextLayer.js';
import type { ImageBox } from '../../src/types/index.js';

const pageWidth = 612;
const pageHeight = 792;
const fullPageImage: ImageBox = { x: 0, y: 0, width: pageWidth, height: pageHeight };

function detect(overrides: Partial<Parameters<typeof isRasterBackedTextLayer>[0]> = {}): boolean {
  return isRasterBackedTextLayer({
    imageCount: 1,
    vectorCount: 0,
    textCoverage: 0.2,
    imageBoxes: [fullPageImage],
    pageWidth,
    pageHeight,
    ...overrides,
  });
}

describe('isRasterBackedTextLayer', () => {
  it('detects dense text backed by a full-page raster image', () => {
    expect(detect()).toBe(true);
  });

  it('allows minor vector marks on scanned pages', () => {
    expect(detect({ vectorCount: RASTER_BACKED_TEXT_LAYER_MAX_VECTOR_OPS })).toBe(true);
  });

  it('rejects pages with substantial vector content', () => {
    expect(detect({ vectorCount: RASTER_BACKED_TEXT_LAYER_MAX_VECTOR_OPS + 1 })).toBe(false);
  });

  it('requires enough full-page raster coverage', () => {
    expect(detect({ imageBoxes: [{ x: 0, y: 0, width: pageWidth * 0.5, height: pageHeight }] })).toBe(false);
  });

  it('requires enough text coverage to look like an OCR layer', () => {
    expect(detect({ textCoverage: 0.09 })).toBe(false);
  });

  it('detects sparse OCR text backed by a full-page raster image', () => {
    expect(detect({ textCoverage: 0.045, charCount: 188 })).toBe(true);
  });

  it('ignores tiny text noise on full-page raster images', () => {
    expect(detect({ textCoverage: 0.019, charCount: 188 })).toBe(false);
    expect(detect({ textCoverage: 0.045, charCount: 12 })).toBe(false);
  });
});
