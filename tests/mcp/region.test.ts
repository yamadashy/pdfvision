import { describe, expect, it } from 'vitest';
import { formatRegion, padRegion } from '../../src/mcp/region.js';

const page = { width: 612, height: 792 };

describe('padRegion', () => {
  it('pads a word-sized hit wider than it is tall so neighbouring words stay readable', () => {
    const padded = padRegion({ x: 200, y: 300, width: 60, height: 12 }, page);
    expect(padded).toEqual({ x: 140, y: 288, width: 180, height: 36 });
  });

  it('pads a large region proportionally', () => {
    expect(padRegion({ x: 200, y: 200, width: 200, height: 100 }, page)).toEqual({
      x: 80,
      y: 170,
      width: 440,
      height: 160,
    });
  });

  it('clamps to the top-left page edge', () => {
    const padded = padRegion({ x: 2, y: 1, width: 20, height: 10 }, page);
    expect(padded.x).toBe(0);
    expect(padded.y).toBe(0);
  });

  it('clamps to the bottom-right page edge', () => {
    const padded = padRegion({ x: 590, y: 770, width: 20, height: 20 }, page);
    expect(padded.x + padded.width).toBeLessThanOrEqual(page.width);
    expect(padded.y + padded.height).toBeLessThanOrEqual(page.height);
  });

  it('never returns a region outside the page for a full-width hit', () => {
    const padded = padRegion({ x: 0, y: 0, width: page.width, height: page.height }, page);
    expect(padded).toEqual({ x: 0, y: 0, width: page.width, height: page.height });
  });
});

describe('formatRegion', () => {
  it('rounds to one decimal place', () => {
    expect(formatRegion({ x: 1.234, y: 2.567, width: 3, height: 4.05 })).toBe('1.2,2.6,3,4.1');
  });
});
