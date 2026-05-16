import { describe, expect, it } from 'vitest';
import { computeContentRatio } from '../../src/core/renderer.js';

/**
 * Build a flat RGBA buffer of `pixelCount` pixels at the given color.
 * Tests use this to construct deterministic raster shapes without
 * actually rendering a page through pdf.js.
 */
function fillRgba(pixelCount: number, r: number, g: number, b: number, a: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  }
  return buf;
}

describe('computeContentRatio', () => {
  it('returns 0 for an all-white raster — the JPX / CMap-blank signature', () => {
    // Pure white opaque pixels: every R,G,B is at 255 and alpha is at
    // 255 → every pixel counts as "near-white" → no content.
    expect(computeContentRatio(fillRgba(100, 255, 255, 255, 255))).toBe(0);
  });

  it('returns 0 for a fully transparent raster', () => {
    // alpha 0 — pixels are invisible regardless of RGB, so none count
    // as content. Some pdf.js renders leave the canvas transparent on
    // pages that draw nothing.
    expect(computeContentRatio(fillRgba(100, 0, 0, 0, 0))).toBe(0);
  });

  it('returns 0 for a uniformly dark page — the Internet-Archive dark-cover signature', () => {
    // Every pixel at black (luminance ~0): the dominant background IS
    // that black, so nothing differs from background → 0% content.
    // Previously this returned 1 because the heuristic was anchored at
    // white; an Internet-Archive scan of a dark book cover therefore
    // claimed `renderContentRatio = 1` despite carrying no ink. The
    // semantic now is "different-from-page-background", not
    // "different-from-white".
    expect(computeContentRatio(fillRgba(100, 0, 0, 0, 255))).toBe(0);
  });

  it('returns 0 for a uniformly off-white / beige page (paper scan background)', () => {
    // Old-paper scans render to a mid-cream luminance (~230). Without
    // background-relative classification this would count as content;
    // with histogram-relative classification it correctly reads as
    // blank because that cream IS the background.
    expect(computeContentRatio(fillRgba(100, 230, 220, 200, 255))).toBe(0);
  });

  it('keeps near-white pixels above the threshold (251+) classified as background', () => {
    // Faint AA pixels at 252,252,252 should NOT count as content —
    // otherwise legitimately blank pages with anti-aliased edges or
    // off-white backgrounds would read as "renderer produced content".
    expect(computeContentRatio(fillRgba(100, 252, 252, 252, 255))).toBe(0);
  });

  it('measures the fraction of content pixels across a mixed raster', () => {
    // 30 black pixels + 70 white pixels = 30% content. White is the
    // dominant bucket so background is white; the 30 black pixels are
    // far enough from white to count as content.
    const buf = new Uint8ClampedArray(100 * 4);
    for (let i = 0; i < 30 * 4; i += 4) {
      buf[i] = 0;
      buf[i + 1] = 0;
      buf[i + 2] = 0;
      buf[i + 3] = 255;
    }
    for (let i = 30 * 4; i < buf.length; i += 4) {
      buf[i] = 255;
      buf[i + 1] = 255;
      buf[i + 2] = 255;
      buf[i + 3] = 255;
    }
    expect(computeContentRatio(buf)).toBe(0.3);
  });

  it('measures content against a dark background — bright marks on a dark page', () => {
    // 95 dark-grey pixels (dominant background) + 5 white "marks".
    // Old heuristic anchored at white would count the 95 dark pixels
    // as content (= 0.95) and miss the 5 actual marks; the new
    // histogram-relative heuristic correctly returns 0.05 because
    // the dark grey IS the background and the 5 whites are the
    // outliers.
    const buf = new Uint8ClampedArray(100 * 4);
    for (let i = 0; i < 95 * 4; i += 4) {
      buf[i] = 40;
      buf[i + 1] = 40;
      buf[i + 2] = 40;
      buf[i + 3] = 255;
    }
    for (let i = 95 * 4; i < buf.length; i += 4) {
      buf[i] = 255;
      buf[i + 1] = 255;
      buf[i + 2] = 255;
      buf[i + 3] = 255;
    }
    expect(computeContentRatio(buf)).toBe(0.05);
  });

  it('rounds to 6 decimal places so the "near-blank" band stays discriminable', () => {
    // 1 black pixel + 999_999 white → 0.000001. Coarser rounding (3dp)
    // would collapse this to 0 and lose the difference between truly
    // blank and "one stray mark", which matters when the agent is
    // deciding whether render genuinely failed.
    const buf = new Uint8ClampedArray(1_000_000 * 4);
    for (let i = 0; i < buf.length; i += 4) {
      buf[i] = 255;
      buf[i + 1] = 255;
      buf[i + 2] = 255;
      buf[i + 3] = 255;
    }
    buf[0] = 0;
    buf[1] = 0;
    buf[2] = 0;
    expect(computeContentRatio(buf)).toBe(0.000001);
  });

  it('returns 0 for an empty buffer without dividing by zero', () => {
    expect(computeContentRatio(new Uint8ClampedArray(0))).toBe(0);
  });
});
