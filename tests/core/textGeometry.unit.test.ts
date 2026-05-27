import { describe, expect, it } from 'vitest';
import { textMatrixFontSize, textRunGeometryFromTransform } from '../../src/core/textGeometry.js';

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
});
