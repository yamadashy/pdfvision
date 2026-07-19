import { describe, expect, it } from 'vitest';
import { textMatrixFontSize, textRunGeometryFromTransform } from '../../src/core/text/geometry.js';

describe('textRunGeometryFromTransform', () => {
  it('preserves the legacy bbox for horizontal text', () => {
    const geometry = textRunGeometryFromTransform({
      transform: [24, 0, 0, 24, 43.2, 748.062],
      width: 47.64,
      height: 24,
      pageHeight: 792,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(geometry).toEqual({
      x: 43.2,
      y: 19.94,
      width: 47.64,
      height: 24,
      fontSize: 24,
    });
  });

  it('makes coordinates zero-based relative to a non-zero page.view origin', () => {
    // Visible page view box: [20, 30, 220, 230]. The text item's aggregate
    // PDF-space box is [25, 210, 45, 220], so its page-view-relative top-left
    // box is x=5, y=10, width=20, height=10.
    const geometry = textRunGeometryFromTransform({
      transform: [10, 0, 0, 10, 25, 210],
      width: 20,
      height: 10,
      pageHeight: 200,
      viewMinX: 20,
      viewMinY: 30,
    });

    expect(geometry).toEqual({
      x: 5,
      y: 10,
      width: 20,
      height: 10,
      fontSize: 10,
    });
  });

  it('uses the lower x edge when the page view is horizontally reversed', () => {
    const geometry = textRunGeometryFromTransform({
      transform: [12, 0, 0, 12, 580, 700],
      width: 24,
      height: 12,
      pageHeight: 792,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(geometry.x).toBe(580);
    expect(geometry.x + geometry.width).toBeLessThanOrEqual(612);
  });

  it('uses the full text matrix for vertical text bboxes', () => {
    const geometry = textRunGeometryFromTransform({
      transform: [0, 7, -6.9999, 0, 41.598, 748.001],
      width: 16.338,
      height: 6.9999,
      pageHeight: 792,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(geometry).toEqual({
      x: 34.6,
      y: 27.66,
      width: 7,
      height: 16.34,
      fontSize: 7,
    });
  });

  it('returns the rounded aggregate axis-aligned envelope for an oblique transform', () => {
    const geometry = textRunGeometryFromTransform({
      transform: [8, 6, -3, 4, 100, 200],
      width: 50,
      height: 10,
      pageHeight: 300,
      viewMinX: 0,
      viewMinY: 0,
    });

    // Baseline unit vector = (0.8, 0.6), normal = (-0.6, 0.8).
    // The four aggregate run corners span x=94..140 and y=200..238
    // in bottom-left PDF space, hence top-down y=62..100.
    expect(geometry).toEqual({
      x: 94,
      y: 62,
      width: 46,
      height: 38,
      fontSize: 10,
    });
  });

  it('falls back to matrix scale when pdf.js reports zero item height', () => {
    expect(textMatrixFontSize([0, 7, -7, 0, 41.598, 748.001])).toBe(7);
    const geometry = textRunGeometryFromTransform({
      transform: [0, 7, -7, 0, 41.598, 748.001],
      width: 16.338,
      height: 0,
      pageHeight: 792,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(geometry).toMatchObject({
      width: 7,
      height: 16.34,
      fontSize: 7,
    });
  });

  it('keeps vertical run font size from the text matrix when item height is full run advance', () => {
    expect(textMatrixFontSize([10, 0, 0, 10, 117.42, 409.61], 240)).toBe(10);
    const geometry = textRunGeometryFromTransform({
      transform: [10, 0, 0, 10, 117.42, 409.61],
      width: 10,
      height: 240,
      pageHeight: 792,
      viewMinX: 0,
      viewMinY: 0,
    });

    expect(geometry).toMatchObject({
      width: 10,
      height: 240,
      fontSize: 10,
    });
  });

  it('treats pdf.js top-to-bottom text height as vertical advance', () => {
    const geometry = textRunGeometryFromTransform({
      transform: [9.212, 0, 0, 9.212, 233.86, 299.05],
      width: 9.212,
      height: 46.06,
      pageHeight: 321.02,
      viewMinX: 0,
      viewMinY: 0,
      dir: 'ttb',
    });

    expect(geometry).toEqual({
      x: 233.86,
      y: 21.97,
      width: 9.21,
      height: 46.06,
      fontSize: 9.21,
    });
  });

  it('falls back to reported item height when the text matrix has no scale', () => {
    expect(textMatrixFontSize([0, 0, 0, 0, 100, 100], 12)).toBe(12);
  });
});
