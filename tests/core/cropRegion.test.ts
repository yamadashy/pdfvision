import { describe, expect, it } from 'vitest';
import { cropRegionForBox } from '../../src/core/search/boxes.js';
import type { PageLayout } from '../../src/types/index.js';

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

/** Shape of the Apple 10-K row that motivated growing the crop to its structure. */
function numericRow(): PageLayout {
  return {
    blocks: [
      {
        text: 'Total net sales (1)',
        x: 70,
        y: 179,
        width: 66,
        height: 9,
        lines: [{ text: 'Total net sales (1)', x: 70, y: 179, width: 66, height: 9, fontSize: 9 }],
      },
    ],
    tables: [
      {
        x: 52,
        y: 100,
        width: 510,
        height: 644,
        rowCount: 1,
        columnCount: 5,
        rows: [
          {
            y: 179,
            height: 9,
            cells: [
              { text: 'Total net sales (1)', x: 70, y: 179, width: 66, height: 9 },
              { text: '94,930', x: 333, y: 179, width: 30, height: 9 },
              { text: '383,285', x: 526, y: 179, width: 35, height: 9 },
            ],
          },
        ],
      },
    ],
  };
}

describe('cropRegionForBox — structural context', () => {
  const hit = { x: 70, y: 179, width: 57, height: 9 };

  it('grows a table hit to its row so the row values land inside the crop', () => {
    const region = cropRegionForBox(hit, { ...page, layout: numericRow() });
    expect(region.x).toBeLessThanOrEqual(70);
    expect(region.x + region.width).toBeGreaterThanOrEqual(561);
  });

  it('leaves the label-only sliver behind — the same hit without layout misses every value', () => {
    const region = cropRegionForBox(hit, page);
    expect(region.x + region.width).toBeLessThan(333);
  });

  it('grows to the containing line when the page has no detected table', () => {
    const layout: PageLayout = {
      blocks: [
        {
          text: "(40) 'biometric categorisation system' means a system",
          x: 31,
          y: 565,
          width: 500,
          height: 20,
          lines: [
            {
              text: "(40) 'biometric categorisation system' means a system",
              x: 31,
              y: 565,
              width: 500,
              height: 10,
              fontSize: 10,
            },
            {
              text: 'for assigning natural persons to categories',
              x: 31,
              y: 575,
              width: 400,
              height: 10,
              fontSize: 10,
            },
          ],
        },
      ],
    };
    const region = cropRegionForBox({ x: 55, y: 565, width: 80, height: 10 }, { ...page, layout });
    expect(region.x + region.width).toBeGreaterThanOrEqual(531);
  });

  it('picks the narrowest containing row so a nested table does not widen the crop to the outer one', () => {
    const layout = numericRow();
    const outer = layout.tables?.[0];
    if (!outer) throw new Error('fixture lost its table');
    outer.rows.push({
      y: 179,
      height: 9,
      cells: [{ text: 'Total net sales (1)', x: 70, y: 179, width: 66, height: 9 }],
    });
    const region = cropRegionForBox(hit, { ...page, layout });
    expect(region.x + region.width).toBeLessThan(333);
  });

  it('falls back to constant padding when no structure covers the hit', () => {
    const layout: PageLayout = {
      blocks: [
        {
          text: 'elsewhere',
          x: 400,
          y: 700,
          width: 100,
          height: 10,
          lines: [{ text: 'elsewhere', x: 400, y: 700, width: 100, height: 10, fontSize: 10 }],
        },
      ],
    };
    expect(cropRegionForBox(hit, { ...page, layout })).toEqual(cropRegionForBox(hit, page));
  });

  it('still clamps a full-width row to the page', () => {
    const layout = numericRow();
    const region = cropRegionForBox(hit, { ...page, layout });
    expect(region.x).toBeGreaterThanOrEqual(0);
    expect(region.x + region.width).toBeLessThanOrEqual(page.width);
  });
});
