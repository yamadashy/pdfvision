import { describe, expect, it } from 'vitest';
import { buildVisualRegions } from '../../src/core/visualRegions.js';

describe('buildVisualRegions', () => {
  it('emits padded crop-ready regions for significant raster images', () => {
    const regions = buildVisualRegions({
      pageWidth: 100,
      pageHeight: 100,
      imageBoxes: [{ x: 10, y: 12, width: 40, height: 30 }],
    });

    expect(regions).toEqual([
      {
        kind: 'raster',
        x: 2,
        y: 4,
        width: 56,
        height: 46,
        areaRatio: 0.258,
        sourceCount: 1,
        sources: [{ type: 'imageBox', index: 0 }],
        reason: 'raster image covers 12.0% of the page',
      },
    ]);
  });

  it('clusters nearby vector boxes and caps representative source refs', () => {
    const vectorBoxes = Array.from({ length: 20 }, (_, index) => ({
      x: 10 + index * 8,
      y: 50,
      width: 20,
      height: 20,
    }));

    const regions = buildVisualRegions({
      pageWidth: 220,
      pageHeight: 160,
      imageBoxes: [],
      vectorBoxes,
    });

    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({
      kind: 'vector',
      x: 2,
      y: 42,
      width: 188,
      height: 36,
      sourceCount: 20,
      reason: '20 nearby vector drawing operations',
    });
    expect(regions[0].sources).toHaveLength(16);
    expect(regions[0].sources[0]).toEqual({ type: 'vectorBox', index: 0 });
    expect(regions[0].sources.at(-1)).toEqual({ type: 'vectorBox', index: 15 });
  });

  it('deduplicates overlapping table and vector candidates into a mixed region', () => {
    const regions = buildVisualRegions({
      pageWidth: 300,
      pageHeight: 300,
      imageBoxes: [],
      vectorBoxes: Array.from({ length: 8 }, (_, index) => ({
        x: 52 + index * 8,
        y: 102,
        width: 30,
        height: 24,
      })),
      layout: {
        blocks: [],
        tables: [
          {
            x: 50,
            y: 100,
            width: 120,
            height: 70,
            rowCount: 4,
            columnCount: 3,
            rows: [],
          },
        ],
      },
    });

    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({
      kind: 'mixed',
      x: 42,
      y: 92,
      width: 136,
      height: 86,
      sourceCount: 9,
    });
    expect(regions[0].sources).toContainEqual({ type: 'layoutTable', index: 0 });
    expect(regions[0].reason).toContain('layout table hint with 4 rows and 3 columns');
  });

  it('groups form fields into a single form region', () => {
    const regions = buildVisualRegions({
      pageWidth: 300,
      pageHeight: 300,
      imageBoxes: [],
      formFields: [
        { name: 'first', type: 'text', x: 40, y: 60, width: 120, height: 24 },
        { name: 'agree', type: 'checkbox', x: 40, y: 100, width: 24, height: 24 },
      ],
    });

    expect(regions).toEqual([
      {
        kind: 'form',
        x: 32,
        y: 52,
        width: 136,
        height: 80,
        areaRatio: 0.121,
        sourceCount: 2,
        sources: [
          { type: 'formField', index: 0 },
          { type: 'formField', index: 1 },
        ],
        reason: '2 interactive form fields in one page region',
      },
    ]);
  });
});
