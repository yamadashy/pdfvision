import { describe, expect, it } from 'vitest';
import { cropRegionForBox } from '../../src/core/search/boxes.js';

const page = { width: 612, height: 792 };

describe('cropRegionForBox', () => {
  it('pads a word-sized hit wider than it is tall so neighbouring words stay readable', () => {
    expect(cropRegionForBox({ x: 200, y: 300, width: 60, height: 12 }, page)).toEqual({
      x: 140,
      y: 288,
      width: 180,
      height: 36,
    });
  });

  it('pads a large region proportionally', () => {
    expect(cropRegionForBox({ x: 200, y: 200, width: 200, height: 100 }, page)).toEqual({
      x: 80,
      y: 170,
      width: 440,
      height: 160,
    });
  });

  it('clamps to the top-left page edge', () => {
    const region = cropRegionForBox({ x: 2, y: 1, width: 20, height: 10 }, page);
    expect(region.x).toBe(0);
    expect(region.y).toBe(0);
  });

  it('clamps to the bottom-right page edge', () => {
    const region = cropRegionForBox({ x: 590, y: 770, width: 20, height: 20 }, page);
    expect(region.x + region.width).toBeLessThanOrEqual(page.width);
    expect(region.y + region.height).toBeLessThanOrEqual(page.height);
  });

  it('never grows a full-page box past the page', () => {
    const region = cropRegionForBox({ x: 0, y: 0, width: page.width, height: page.height }, page);
    expect(region.x + region.width).toBeLessThanOrEqual(page.width);
    expect(region.y + region.height).toBeLessThanOrEqual(page.height);
  });

  it('rounds to the same 2dp form visual regions use', () => {
    const region = cropRegionForBox({ x: 10.005, y: 10.005, width: 33.333, height: 11.111 }, page);
    for (const value of Object.values(region)) {
      expect(String(value)).toMatch(/^\d+(\.\d{1,2})?$/);
    }
  });
});
