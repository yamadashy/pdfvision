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

  it('keeps a full-page raster region when it is the only visual evidence', () => {
    const regions = buildVisualRegions({
      pageWidth: 100,
      pageHeight: 100,
      imageBoxes: [{ x: 0, y: 0, width: 100, height: 100 }],
    });

    expect(regions).toEqual([
      {
        kind: 'raster',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        areaRatio: 1,
        sourceCount: 1,
        sources: [{ type: 'imageBox', index: 0 }],
        reason: 'raster image covers 100.0% of the page',
      },
    ]);
  });

  it('suppresses full-page raster regions when the rendered page is blank', () => {
    const regions = buildVisualRegions({
      pageWidth: 100,
      pageHeight: 100,
      imageBoxes: [{ x: 0, y: 0, width: 100, height: 100 }],
      visualStatus: 'blank',
    });

    expect(regions).toEqual([]);
  });

  it('keeps full-page raster regions without render evidence', () => {
    const regions = buildVisualRegions({
      pageWidth: 100,
      pageHeight: 100,
      imageBoxes: [{ x: 0, y: 0, width: 100, height: 100 }],
    });

    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({ kind: 'raster', areaRatio: 1 });
  });

  it('suppresses lone full-page vector backplanes', () => {
    const regions = buildVisualRegions({
      pageWidth: 100,
      pageHeight: 100,
      imageBoxes: [],
      vectorBoxes: [{ x: 0, y: 0, width: 100, height: 100 }],
    });

    expect(regions).toEqual([]);
  });

  it('ignores full-page background boxes when foreground visual boxes are present', () => {
    const regions = buildVisualRegions({
      pageWidth: 100,
      pageHeight: 100,
      imageBoxes: [
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 30, y: 20, width: 40, height: 35 },
      ],
      vectorBoxes: [
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 32, y: 22, width: 36, height: 31 },
      ],
    });

    expect(regions).toEqual([
      {
        kind: 'mixed',
        x: 22,
        y: 12,
        width: 56,
        height: 51,
        areaRatio: 0.286,
        sourceCount: 2,
        sources: [
          { type: 'imageBox', index: 1 },
          { type: 'vectorBox', index: 1 },
        ],
        reason: 'raster image covers 14.0% of the page; 1 nearby vector drawing operations',
      },
    ]);
  });

  it('keeps a full-page cover raster when the only foreground raster is a small logo', () => {
    const regions = buildVisualRegions({
      pageWidth: 612,
      pageHeight: 792,
      imageBoxes: [
        { x: 0, y: -13.55, width: 611.98, height: 920.9 },
        { x: 36, y: 695.9, width: 79.2, height: 79.2 },
      ],
      vectorBoxes: [{ x: 0, y: 679.55, width: 612, height: 112.45 }],
    });

    expect(regions).toEqual([
      {
        kind: 'raster',
        x: 0,
        y: 0,
        width: 612,
        height: 792,
        areaRatio: 1,
        sourceCount: 1,
        sources: [{ type: 'imageBox', index: 0 }],
        reason: 'raster image covers 100.0% of the page',
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

  it('creates a fallback region for dense thin vector grid lines', () => {
    const vectorBoxes = Array.from({ length: 40 }, (_, index) => ({
      x: 20,
      y: 20 + index * 3,
      width: 180,
      height: 0.5,
    }));

    const regions = buildVisualRegions({
      pageWidth: 250,
      pageHeight: 250,
      imageBoxes: [],
      vectorBoxes,
    });

    expect(regions).toEqual([
      {
        kind: 'vector',
        x: 12,
        y: 12,
        width: 196,
        height: 133.5,
        areaRatio: 0.419,
        sourceCount: 40,
        sources: Array.from({ length: 16 }, (_, index) => ({ type: 'vectorBox' as const, index })),
        reason: '40 vector drawing boxes across dense page structure',
      },
    ]);
  });

  it('splits disconnected dense small vector marker fields into separate regions', () => {
    const vectorBoxes = Array.from({ length: 240 }, (_, index) => {
      const panelColumn = Math.floor(index / 60) % 2;
      const panelRow = Math.floor(index / 120);
      const point = index % 60;
      return {
        x: 60 + panelColumn * 220 + (point % 12) * 10,
        y: 60 + panelRow * 220 + Math.floor(point / 12) * 18,
        width: 2,
        height: 2,
      };
    });

    const regions = buildVisualRegions({
      pageWidth: 560,
      pageHeight: 620,
      imageBoxes: [],
      vectorBoxes,
    });

    expect(
      regions.map(({ x, y, width, height, sourceCount, reason }) => ({ x, y, width, height, sourceCount, reason })),
    ).toEqual([
      {
        x: 52,
        y: 52,
        width: 128,
        height: 90,
        sourceCount: 60,
        reason: '60 dense small vector markers across visual region',
      },
      {
        x: 272,
        y: 52,
        width: 128,
        height: 90,
        sourceCount: 60,
        reason: '60 dense small vector markers across visual region',
      },
      {
        x: 52,
        y: 272,
        width: 128,
        height: 90,
        sourceCount: 60,
        reason: '60 dense small vector markers across visual region',
      },
      {
        x: 272,
        y: 272,
        width: 128,
        height: 90,
        sourceCount: 60,
        reason: '60 dense small vector markers across visual region',
      },
    ]);
    expect(regions[0].sources).toHaveLength(16);
  });

  it('splits dense thin vector grids into separate foreground regions', () => {
    const vectorBoxes = [
      ...Array.from({ length: 20 }, (_, index) => ({
        x: 20,
        y: 20 + index * 3,
        width: 180,
        height: 0.5,
      })),
      ...Array.from({ length: 20 }, (_, index) => ({
        x: 20,
        y: 160 + index * 3,
        width: 180,
        height: 0.5,
      })),
    ];

    const regions = buildVisualRegions({
      pageWidth: 250,
      pageHeight: 300,
      imageBoxes: [],
      vectorBoxes,
    });

    expect(regions).toEqual([
      {
        kind: 'vector',
        x: 12,
        y: 12,
        width: 196,
        height: 73.5,
        areaRatio: 0.192,
        sourceCount: 20,
        sources: Array.from({ length: 16 }, (_, index) => ({ type: 'vectorBox' as const, index })),
        reason: '20 vector drawing boxes across dense page structure',
      },
      {
        kind: 'vector',
        x: 12,
        y: 152,
        width: 196,
        height: 73.5,
        areaRatio: 0.192,
        sourceCount: 20,
        sources: Array.from({ length: 16 }, (_, index) => ({ type: 'vectorBox' as const, index: index + 20 })),
        reason: '20 vector drawing boxes across dense page structure',
      },
    ]);
  });

  it('does not let a full-page vector background swallow dense thin vector foregrounds', () => {
    const vectorBoxes = [
      { x: 0, y: 0, width: 250, height: 250 },
      ...Array.from({ length: 40 }, (_, index) => ({
        x: 20,
        y: 20 + index * 3,
        width: 180,
        height: 0.5,
      })),
    ];

    const regions = buildVisualRegions({
      pageWidth: 250,
      pageHeight: 250,
      imageBoxes: [],
      vectorBoxes,
    });

    expect(regions).toEqual([
      {
        kind: 'vector',
        x: 12,
        y: 12,
        width: 196,
        height: 133.5,
        areaRatio: 0.419,
        sourceCount: 40,
        sources: Array.from({ length: 16 }, (_, index) => ({ type: 'vectorBox' as const, index: index + 1 })),
        reason: '40 vector drawing boxes across dense page structure',
      },
    ]);
  });

  it('does not let a full-page raster background swallow dense thin vector foregrounds', () => {
    const vectorBoxes = Array.from({ length: 40 }, (_, index) => ({
      x: 20,
      y: 20 + index * 3,
      width: 180,
      height: 0.5,
    }));

    const regions = buildVisualRegions({
      pageWidth: 250,
      pageHeight: 250,
      imageBoxes: [{ x: 0, y: 0, width: 250, height: 250 }],
      vectorBoxes,
    });

    expect(regions).toEqual([
      {
        kind: 'vector',
        x: 12,
        y: 12,
        width: 196,
        height: 133.5,
        areaRatio: 0.419,
        sourceCount: 40,
        sources: Array.from({ length: 16 }, (_, index) => ({ type: 'vectorBox' as const, index })),
        reason: '40 vector drawing boxes across dense page structure',
      },
    ]);
  });

  it('does not let slide header and footer bands swallow dense vector diagrams', () => {
    const vectorBoxes = [
      { x: 0, y: 0, width: 400, height: 40 },
      { x: 0, y: 260, width: 400, height: 40 },
      ...Array.from({ length: 20 }, (_, index) => ({
        x: 80 + index * 5,
        y: 80,
        width: 24,
        height: 16,
      })),
      ...Array.from({ length: 20 }, (_, index) => ({
        x: 80 + index * 5,
        y: 104,
        width: 24,
        height: 16,
      })),
    ];

    const regions = buildVisualRegions({
      pageWidth: 400,
      pageHeight: 300,
      imageBoxes: [],
      vectorBoxes,
    });

    const denseRegion = regions.find((region) =>
      region.reason.includes('vector drawing boxes across dense page structure'),
    );
    expect(denseRegion).toMatchObject({
      kind: 'vector',
      x: 72,
      y: 72,
      width: 135,
      height: 56,
      sourceCount: 40,
      reason: '40 vector drawing boxes across dense page structure',
    });
  });

  it('suppresses side chrome regions when a foreground visual region exists', () => {
    const regions = buildVisualRegions({
      pageWidth: 600,
      pageHeight: 800,
      imageBoxes: [
        { x: 0, y: 120, width: 36, height: 420 },
        { x: 120, y: 160, width: 220, height: 180 },
      ],
      vectorBoxes: [{ x: 2, y: 122, width: 30, height: 416 }],
    });

    expect(regions).toEqual([
      {
        kind: 'raster',
        x: 112,
        y: 152,
        width: 236,
        height: 196,
        areaRatio: 0.096,
        sourceCount: 1,
        sources: [{ type: 'imageBox', index: 1 }],
        reason: 'raster image covers 8.3% of the page',
      },
    ]);
  });

  it('suppresses side chrome even when it is the only visual evidence', () => {
    const regions = buildVisualRegions({
      pageWidth: 600,
      pageHeight: 800,
      imageBoxes: [{ x: 0, y: 120, width: 36, height: 420 }],
      vectorBoxes: [{ x: 2, y: 122, width: 30, height: 416 }],
    });

    expect(regions).toEqual([]);
  });

  it('suppresses full-page candidates when a crop-sized foreground region exists', () => {
    const regions = buildVisualRegions({
      pageWidth: 600,
      pageHeight: 800,
      imageBoxes: [],
      vectorBoxes: [
        { x: 0, y: 0, width: 600, height: 800 },
        ...Array.from({ length: 6 }, (_, index) => ({
          x: 120 + index * 8,
          y: 160,
          width: 40,
          height: 30,
        })),
      ],
    });

    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({
      kind: 'vector',
      x: 112,
      y: 152,
      width: 96,
      height: 46,
      sourceCount: 6,
    });
  });

  it('suppresses top and bottom chrome regions when a foreground visual region exists', () => {
    const regions = buildVisualRegions({
      pageWidth: 600,
      pageHeight: 800,
      imageBoxes: [{ x: 120, y: 160, width: 220, height: 180 }],
      vectorBoxes: [
        { x: 40, y: -35, width: 560, height: 75 },
        { x: 50, y: 760, width: 500, height: 40 },
      ],
    });

    expect(regions).toEqual([
      {
        kind: 'raster',
        x: 112,
        y: 152,
        width: 236,
        height: 196,
        areaRatio: 0.096,
        sourceCount: 1,
        sources: [{ type: 'imageBox', index: 0 }],
        reason: 'raster image covers 8.3% of the page',
      },
    ]);
  });

  it('does not merge a full-page vector background into a foreground raster crop', () => {
    const regions = buildVisualRegions({
      pageWidth: 600,
      pageHeight: 400,
      imageBoxes: [{ x: 180, y: 120, width: 220, height: 140 }],
      vectorBoxes: [{ x: 0, y: 0, width: 600, height: 400 }],
    });

    expect(regions).toEqual([
      {
        kind: 'raster',
        x: 172,
        y: 112,
        width: 236,
        height: 156,
        areaRatio: 0.153,
        sourceCount: 1,
        sources: [{ type: 'imageBox', index: 0 }],
        reason: 'raster image covers 12.8% of the page',
      },
    ]);
  });

  it('keeps chart crops separate from wide vector text panels and title bands', () => {
    const regions = buildVisualRegions({
      pageWidth: 780,
      pageHeight: 540,
      imageBoxes: [{ x: 11.52, y: 280.56, width: 484.8, height: 161.4 }],
      vectorBoxes: [
        { x: 0, y: 0, width: 780, height: 540 },
        { x: 11.52, y: 237.6, width: 484.8, height: 22.68 },
        { x: 470.45, y: 194.33, width: 301.68, height: 333.86 },
        { x: 601.98, y: 303.87, width: 16.08, height: 69.27 },
        { x: 601.98, y: 303.87, width: 16.08, height: 69.27 },
        { x: 601.98, y: 305.77, width: 69.28, height: 103.8 },
        { x: 581.94, y: 373.14, width: 78.95, height: 69.27 },
        { x: 532.7, y: 303.87, width: 69.28, height: 135.57 },
        { x: 626.27, y: 437.88, width: 0.5, height: 6.6 },
        { x: 590.15, y: 293.88, width: 127.44, height: 0.84 },
        { x: 506.16, y: 237.36, width: 257.16, height: 22.68 },
        { x: 7.98, y: 43.74, width: 764.16, height: 181.44 },
        { x: 569.91, y: 72.21, width: 150.6, height: 1.32 },
        { x: 735.27, y: 72.21, width: 21, height: 1.32 },
        { x: 49.95, y: 91.41, width: 135.84, height: 1.32 },
        { x: 558.27, y: 91.41, width: 185.16, height: 1.32 },
        { x: 49.95, y: 110.61, width: 158.04, height: 1.32 },
        { x: 340.35, y: 191.01, width: 311.52, height: 1.32 },
      ],
      layout: {
        blocks: [
          {
            text: 'Manufacturing DX status and current context',
            x: 22.94,
            y: 10.44,
            width: 524,
            height: 20.04,
            role: 'heading',
            level: 1,
            lines: [
              {
                text: 'Manufacturing DX status and current context',
                x: 22.94,
                y: 10.44,
                width: 524,
                height: 20.04,
                fontSize: 20,
              },
            ],
          },
          {
            text: 'Industry data sharing intent',
            x: 548.88,
            y: 240.34,
            width: 171.93,
            height: 14.04,
            lines: [
              {
                text: 'Industry data sharing intent',
                x: 548.88,
                y: 240.34,
                width: 171.93,
                height: 14.04,
                fontSize: 12,
              },
            ],
          },
          {
            text: 'DX progress by operation area',
            x: 173.78,
            y: 240.55,
            width: 160.35,
            height: 14.04,
            lines: [
              {
                text: 'DX progress by operation area',
                x: 173.78,
                y: 240.55,
                width: 160.35,
                height: 14.04,
                fontSize: 12,
              },
            ],
          },
        ],
      },
    });

    expect(regions).toEqual([
      {
        kind: 'vector',
        x: 462.45,
        y: 186.33,
        width: 317.55,
        height: 349.86,
        areaRatio: 0.264,
        sourceCount: 4,
        sources: [
          { type: 'vectorBox', index: 2 },
          { type: 'vectorBox', index: 5 },
          { type: 'vectorBox', index: 6 },
          { type: 'vectorBox', index: 7 },
        ],
        reason: '4 nearby vector drawing operations',
      },
      {
        kind: 'raster',
        x: 3.52,
        y: 272.56,
        width: 500.8,
        height: 177.4,
        areaRatio: 0.211,
        sourceCount: 1,
        sources: [{ type: 'imageBox', index: 0 }],
        reason: 'raster image covers 18.6% of the page',
      },
    ]);
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

  it('suppresses shallow wide table hints as visual regions', () => {
    const regions = buildVisualRegions({
      pageWidth: 612,
      pageHeight: 792,
      imageBoxes: [],
      layout: {
        blocks: [],
        tables: [
          {
            x: 84.33,
            y: 102.02,
            width: 439.13,
            height: 25.78,
            rowCount: 2,
            columnCount: 6,
            rows: [],
          },
        ],
      },
    });

    expect(regions).toEqual([]);
  });

  it('keeps full-page raster fallback over extreme OCR-fragment table hints', () => {
    const regions = buildVisualRegions({
      pageWidth: 396,
      pageHeight: 600.8,
      imageBoxes: [{ x: 0, y: 0, width: 396, height: 600.8 }],
      layout: {
        blocks: [],
        tables: [
          {
            x: 22.5,
            y: 30.23,
            width: 339.68,
            height: 424.33,
            rowCount: 2,
            columnCount: 231,
            rows: [],
          },
        ],
      },
    });

    expect(regions).toEqual([
      {
        kind: 'raster',
        x: 0,
        y: 0,
        width: 396,
        height: 600.8,
        areaRatio: 1,
        sourceCount: 1,
        sources: [{ type: 'imageBox', index: 0 }],
        reason: 'raster image covers 100.0% of the page',
      },
    ]);
  });

  it('deduplicates raster panels that expand to the same shared caption crop', () => {
    const regions = buildVisualRegions({
      pageWidth: 600,
      pageHeight: 800,
      imageBoxes: [
        { x: 60, y: 570, width: 120, height: 80 },
        { x: 181, y: 570, width: 120, height: 80 },
        { x: 302, y: 570, width: 120, height: 80 },
        { x: 424, y: 570, width: 120, height: 80 },
      ],
      layout: {
        blocks: [
          {
            text: 'Figure 2: Example images with overlaid masks from a dataset.',
            x: 50,
            y: 660,
            width: 495,
            height: 12,
            lines: [
              {
                text: 'Figure 2: Example images with overlaid masks from a dataset.',
                x: 50,
                y: 660,
                width: 495,
                height: 12,
                fontSize: 10,
              },
            ],
          },
        ],
      },
    });

    expect(regions).toEqual([
      {
        kind: 'raster',
        x: 42,
        y: 562,
        width: 511,
        height: 118,
        areaRatio: 0.126,
        sourceCount: 4,
        sources: [
          { type: 'imageBox', index: 0 },
          { type: 'imageBox', index: 1 },
          { type: 'imageBox', index: 2 },
          { type: 'imageBox', index: 3 },
        ],
        reason: 'raster image covers 2.0% of the page',
        associatedText: [
          {
            text: 'Figure 2: Example images with overlaid masks from a dataset.',
            relation: 'caption',
            x: 50,
            y: 660,
            width: 495,
            height: 12,
            blockIndex: 0,
          },
        ],
      },
    ]);
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

  it('splits distant form fields into section-sized regions', () => {
    const regions = buildVisualRegions({
      pageWidth: 300,
      pageHeight: 420,
      imageBoxes: [],
      formFields: [
        { name: 'first', type: 'text', x: 40, y: 60, width: 120, height: 20 },
        { name: 'last', type: 'text', x: 170, y: 60, width: 90, height: 20 },
        { name: 'total', type: 'text', x: 170, y: 220, width: 90, height: 20 },
        { name: 'sign', type: 'signature', x: 40, y: 340, width: 160, height: 20 },
      ],
    });

    expect(regions).toEqual([
      {
        kind: 'form',
        x: 32,
        y: 52,
        width: 236,
        height: 36,
        areaRatio: 0.067,
        sourceCount: 2,
        sources: [
          { type: 'formField', index: 0 },
          { type: 'formField', index: 1 },
        ],
        reason: '2 interactive form fields in one page region',
      },
      {
        kind: 'form',
        x: 162,
        y: 212,
        width: 106,
        height: 36,
        areaRatio: 0.03,
        sourceCount: 1,
        sources: [{ type: 'formField', index: 2 }],
        reason: '1 interactive form fields in one page region',
      },
      {
        kind: 'form',
        x: 32,
        y: 332,
        width: 176,
        height: 36,
        areaRatio: 0.05,
        sourceCount: 1,
        sources: [{ type: 'formField', index: 3 }],
        reason: '1 interactive form fields in one page region',
      },
    ]);
  });

  it('suppresses a large vector form backplane when section form crops exist', () => {
    const regions = buildVisualRegions({
      pageWidth: 300,
      pageHeight: 420,
      imageBoxes: [],
      vectorBoxes: [{ x: 20, y: 40, width: 260, height: 360 }],
      formFields: [
        { name: 'first', type: 'text', x: 40, y: 60, width: 120, height: 20 },
        { name: 'total', type: 'text', x: 170, y: 220, width: 90, height: 20 },
        { name: 'sign', type: 'signature', x: 40, y: 340, width: 160, height: 20 },
      ],
    });

    expect(regions.map((region) => region.kind)).toEqual(['form', 'form', 'form']);
    expect(regions.every((region) => region.width < 220 && region.height < 80)).toBe(true);
  });

  it('suppresses vector-only regions contained inside a form region', () => {
    const regions = buildVisualRegions({
      pageWidth: 300,
      pageHeight: 240,
      imageBoxes: [],
      vectorBoxes: [
        { x: 50, y: 70, width: 30, height: 30 },
        { x: 190, y: 150, width: 30, height: 30 },
      ],
      formFields: [
        {
          name: 'section',
          type: 'text',
          x: 42,
          y: 62,
          width: 90,
          height: 24,
          label: {
            text: 'Document section',
            relation: 'above',
            x: 30,
            y: 50,
            width: 220,
            height: 150,
          },
        },
      ],
    });

    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({
      kind: 'mixed',
      sourceCount: 2,
    });
    expect(regions[0].sources).toEqual(
      expect.arrayContaining([
        { type: 'formField', index: 0 },
        { type: 'vectorBox', index: 0 },
      ]),
    );
  });

  it('keeps a thin checkbox row after crop padding makes it readable', () => {
    const regions = buildVisualRegions({
      pageWidth: 300,
      pageHeight: 200,
      imageBoxes: [],
      formFields: [
        {
          name: 'agree',
          type: 'checkbox',
          x: 240,
          y: 80,
          width: 8,
          height: 8,
          label: {
            text: 'I agree to the certification',
            relation: 'left',
            x: 40,
            y: 79,
            width: 190,
            height: 9,
          },
        },
      ],
    });

    expect(regions).toEqual([
      {
        kind: 'form',
        x: 32,
        y: 71,
        width: 224,
        height: 25,
        areaRatio: 0.093,
        sourceCount: 1,
        sources: [{ type: 'formField', index: 0 }],
        reason: '1 interactive form fields in one page region',
        associatedText: [
          {
            text: 'I agree to the certification',
            relation: 'label',
            x: 40,
            y: 79,
            width: 190,
            height: 9,
            fieldIndex: 0,
          },
        ],
      },
    ]);
  });

  it('splits very dense form pages at major vertical bands', () => {
    const formFields = [
      ...Array.from({ length: 12 }, (_, index) => ({
        name: `top-${index}`,
        type: 'text' as const,
        x: 40 + (index % 4) * 35,
        y: 60 + Math.floor(index / 4) * 12,
        width: 30,
        height: 10,
      })),
      ...Array.from({ length: 12 }, (_, index) => ({
        name: `middle-${index}`,
        type: 'text' as const,
        x: 40 + (index % 4) * 35,
        y: 130 + Math.floor(index / 4) * 12,
        width: 30,
        height: 10,
      })),
      ...Array.from({ length: 12 }, (_, index) => ({
        name: `bottom-${index}`,
        type: 'text' as const,
        x: 40 + (index % 4) * 35,
        y: 230 + Math.floor(index / 4) * 12,
        width: 30,
        height: 10,
      })),
    ];
    const regions = buildVisualRegions({
      pageWidth: 300,
      pageHeight: 360,
      imageBoxes: [],
      formFields,
    });

    expect(regions).toHaveLength(3);
    expect(regions.map((region) => region.sourceCount)).toEqual([12, 12, 12]);
    expect(regions.map((region) => region.y)).toEqual([52, 122, 222]);
  });

  it('attaches nearby caption text and expands the crop box to include it', () => {
    const regions = buildVisualRegions({
      pageWidth: 200,
      pageHeight: 200,
      imageBoxes: [{ x: 40, y: 40, width: 80, height: 50 }],
      layout: {
        blocks: [
          {
            text: 'Figure 1. Example chart',
            x: 45,
            y: 96,
            width: 90,
            height: 14,
            lines: [{ text: 'Figure 1. Example chart', x: 45, y: 96, width: 90, height: 14, fontSize: 10 }],
          },
        ],
      },
    });

    expect(regions).toEqual([
      {
        kind: 'raster',
        x: 32,
        y: 32,
        width: 111,
        height: 86,
        areaRatio: 0.239,
        sourceCount: 1,
        sources: [{ type: 'imageBox', index: 0 }],
        reason: 'raster image covers 10.0% of the page',
        associatedText: [
          {
            text: 'Figure 1. Example chart',
            relation: 'caption',
            x: 45,
            y: 96,
            width: 90,
            height: 14,
            blockIndex: 0,
          },
        ],
      },
    ]);
  });

  it('deduplicates overlapping regions expanded by the same caption', () => {
    const regions = buildVisualRegions({
      pageWidth: 600,
      pageHeight: 800,
      imageBoxes: [
        { x: 300, y: 30, width: 250, height: 250 },
        { x: 350, y: 70, width: 250, height: 250 },
      ],
      layout: {
        blocks: [
          {
            text: 'Figure 1. Compound figure overview',
            x: 30,
            y: 310,
            width: 570,
            height: 20,
            lines: [
              {
                text: 'Figure 1. Compound figure overview',
                x: 30,
                y: 310,
                width: 570,
                height: 20,
                fontSize: 10,
              },
            ],
          },
        ],
      },
    });

    expect(regions).toEqual([
      {
        kind: 'raster',
        x: 22,
        y: 22,
        width: 578,
        height: 316,
        areaRatio: 0.381,
        sourceCount: 2,
        sources: [
          { type: 'imageBox', index: 0 },
          { type: 'imageBox', index: 1 },
        ],
        reason: 'raster image covers 13.0% of the page',
        associatedText: [
          {
            text: 'Figure 1. Compound figure overview',
            relation: 'caption',
            x: 30,
            y: 310,
            width: 570,
            height: 20,
            blockIndex: 0,
          },
        ],
      },
    ]);
  });

  it('attaches nearby heading labels to large unlabeled table regions', () => {
    const regions = buildVisualRegions({
      pageWidth: 300,
      pageHeight: 300,
      imageBoxes: [],
      layout: {
        blocks: [
          {
            text: 'Lists of acceptable documents',
            x: 50,
            y: 50,
            width: 190,
            height: 14,
            role: 'heading',
            level: 1,
            lines: [{ text: 'Lists of acceptable documents', x: 50, y: 50, width: 190, height: 14, fontSize: 14 }],
          },
        ],
        tables: [
          {
            x: 40,
            y: 100,
            width: 220,
            height: 130,
            rowCount: 4,
            columnCount: 3,
            rows: [],
          },
        ],
      },
    });

    expect(regions).toEqual([
      {
        kind: 'table',
        x: 32,
        y: 42,
        width: 236,
        height: 196,
        areaRatio: 0.514,
        sourceCount: 1,
        sources: [{ type: 'layoutTable', index: 0 }],
        reason: 'layout table hint with 4 rows and 3 columns',
        associatedText: [
          {
            text: 'Lists of acceptable documents',
            relation: 'label',
            x: 50,
            y: 50,
            width: 190,
            height: 14,
            blockIndex: 0,
          },
        ],
      },
    ]);
  });

  it('attaches nearby plain table lead-ins to unlabeled table regions', () => {
    const regions = buildVisualRegions({
      pageWidth: 300,
      pageHeight: 300,
      imageBoxes: [],
      layout: {
        blocks: [
          {
            text: 'The following table shows information by reportable segment for 2023, 2022 and 2021:',
            x: 45,
            y: 72,
            width: 210,
            height: 10,
            lines: [
              {
                text: 'The following table shows information by reportable segment for 2023, 2022 and 2021:',
                x: 45,
                y: 72,
                width: 210,
                height: 10,
                fontSize: 10,
              },
            ],
          },
          {
            text: 'Americas:',
            x: 45,
            y: 118,
            width: 60,
            height: 10,
            lines: [{ text: 'Americas:', x: 45, y: 118, width: 60, height: 10, fontSize: 10 }],
          },
        ],
        tables: [
          {
            x: 40,
            y: 100,
            width: 220,
            height: 130,
            rowCount: 6,
            columnCount: 4,
            rows: [],
          },
        ],
      },
    });

    expect(regions).toEqual([
      {
        kind: 'table',
        x: 32,
        y: 64,
        width: 236,
        height: 174,
        areaRatio: 0.456,
        sourceCount: 1,
        sources: [{ type: 'layoutTable', index: 0 }],
        reason: 'layout table hint with 6 rows and 4 columns',
        associatedText: [
          {
            text: 'The following table shows information by reportable segment for 2023, 2022 and 2021:',
            relation: 'label',
            x: 45,
            y: 72,
            width: 210,
            height: 10,
            blockIndex: 0,
          },
        ],
      },
    ]);
  });

  it('attaches short plain labels below raster images', () => {
    const regions = buildVisualRegions({
      pageWidth: 200,
      pageHeight: 200,
      imageBoxes: [{ x: 40, y: 40, width: 80, height: 50 }],
      layout: {
        blocks: [
          {
            text: 'A white teddy bear',
            x: 45,
            y: 94,
            width: 70,
            height: 10,
            lines: [{ text: 'A white teddy bear', x: 45, y: 94, width: 70, height: 10, fontSize: 10 }],
          },
          {
            text: 'sitting in the grass',
            x: 45,
            y: 108,
            width: 76,
            height: 10,
            lines: [{ text: 'sitting in the grass', x: 45, y: 108, width: 76, height: 10, fontSize: 10 }],
          },
        ],
      },
    });

    expect(regions).toEqual([
      {
        kind: 'raster',
        x: 32,
        y: 32,
        width: 97,
        height: 94,
        areaRatio: 0.228,
        sourceCount: 1,
        sources: [{ type: 'imageBox', index: 0 }],
        reason: 'raster image covers 10.0% of the page',
        associatedText: [
          {
            text: 'A white teddy bear',
            relation: 'label',
            x: 45,
            y: 94,
            width: 70,
            height: 10,
            blockIndex: 0,
          },
          {
            text: 'sitting in the grass',
            relation: 'label',
            x: 45,
            y: 108,
            width: 76,
            height: 10,
            blockIndex: 1,
          },
        ],
      },
    ]);
  });

  it('prefers caption lines over the enclosing block text', () => {
    const regions = buildVisualRegions({
      pageWidth: 200,
      pageHeight: 200,
      imageBoxes: [{ x: 40, y: 40, width: 80, height: 50 }],
      layout: {
        blocks: [
          {
            text: 'Table 1. Security controls\nSecurity controls',
            x: 45,
            y: 96,
            width: 100,
            height: 28,
            lines: [
              { text: 'Table 1. Security controls', x: 45, y: 96, width: 100, height: 12, fontSize: 10 },
              { text: 'Security controls', x: 60, y: 112, width: 70, height: 12, fontSize: 10 },
            ],
          },
        ],
      },
    });

    expect(regions[0].associatedText).toEqual([
      {
        text: 'Table 1. Security controls',
        relation: 'caption',
        x: 45,
        y: 96,
        width: 100,
        height: 12,
        blockIndex: 0,
      },
    ]);
  });

  it('attaches only the closest local caption to a visual region', () => {
    const regions = buildVisualRegions({
      pageWidth: 600,
      pageHeight: 500,
      imageBoxes: [{ x: 70, y: 200, width: 460, height: 150 }],
      layout: {
        blocks: [
          {
            text: 'Table 1: (Selective Copying.)',
            x: 72,
            y: 160,
            width: 120,
            height: 10,
            lines: [{ text: 'Table 1: (Selective Copying.)', x: 72, y: 160, width: 120, height: 10, fontSize: 10 }],
          },
          {
            text: 'Table 2: (Induction Heads.)',
            x: 292,
            y: 162,
            width: 160,
            height: 10,
            lines: [{ text: 'Table 2: (Induction Heads.)', x: 292, y: 162, width: 160, height: 10, fontSize: 10 }],
          },
          {
            text: 'Figure 4: (Scaling Laws.) Models scale better.',
            x: 72,
            y: 360,
            width: 455,
            height: 10,
            lines: [
              {
                text: 'Figure 4: (Scaling Laws.) Models scale better.',
                x: 72,
                y: 360,
                width: 455,
                height: 10,
                fontSize: 10,
              },
            ],
          },
        ],
      },
    });

    expect(regions[0].associatedText).toEqual([
      {
        text: 'Figure 4: (Scaling Laws.) Models scale better.',
        relation: 'caption',
        x: 72,
        y: 360,
        width: 455,
        height: 10,
        blockIndex: 2,
      },
    ]);
  });

  it('does not treat inline table references as captions', () => {
    const regions = buildVisualRegions({
      pageWidth: 300,
      pageHeight: 300,
      imageBoxes: [{ x: 60, y: 60, width: 120, height: 70 }],
      layout: {
        blocks: [
          {
            text: '表 1.5 概要',
            x: 70,
            y: 40,
            width: 90,
            height: 12,
            lines: [{ text: '表 1.5 概要', x: 70, y: 40, width: 90, height: 12, fontSize: 10 }],
          },
          {
            text: '表 1.5の対策を以下で説明する。',
            x: 70,
            y: 140,
            width: 140,
            height: 12,
            lines: [{ text: '表 1.5の対策を以下で説明する。', x: 70, y: 140, width: 140, height: 12, fontSize: 10 }],
          },
          {
            text: '図せず変更された設定を直す',
            x: 70,
            y: 156,
            width: 130,
            height: 12,
            lines: [{ text: '図せず変更された設定を直す', x: 70, y: 156, width: 130, height: 12, fontSize: 10 }],
          },
        ],
      },
    });

    expect(regions[0].associatedText).toEqual([
      {
        text: '表 1.5 概要',
        relation: 'caption',
        x: 70,
        y: 40,
        width: 90,
        height: 12,
        blockIndex: 0,
      },
    ]);
  });

  it('does not treat figure copyright notes as figure captions', () => {
    const regions = buildVisualRegions({
      pageWidth: 300,
      pageHeight: 300,
      imageBoxes: [{ x: 60, y: 60, width: 120, height: 70 }],
      layout: {
        blocks: [
          {
            text: 'Figure copyright Example Author, 2024.',
            x: 60,
            y: 140,
            width: 160,
            height: 12,
            lines: [
              {
                text: 'Figure copyright Example Author, 2024.',
                x: 60,
                y: 140,
                width: 160,
                height: 12,
                fontSize: 10,
              },
            ],
          },
        ],
      },
    });

    expect(regions[0].associatedText).toBeUndefined();
  });

  it('attaches Japanese combined figure-table captions', () => {
    const regions = buildVisualRegions({
      pageWidth: 400,
      pageHeight: 300,
      imageBoxes: [{ x: 80, y: 100, width: 180, height: 70 }],
      layout: {
        blocks: [
          {
            text: '図表 1-14 DXの具体的な取組項目',
            x: 95,
            y: 82,
            width: 160,
            height: 12,
            lines: [{ text: '図表 1-14 DXの具体的な取組項目', x: 95, y: 82, width: 160, height: 12, fontSize: 10 }],
          },
        ],
      },
    });

    expect(regions[0].associatedText).toEqual([
      {
        text: '図表 1-14 DXの具体的な取組項目',
        relation: 'caption',
        x: 95,
        y: 82,
        width: 160,
        height: 12,
        blockIndex: 0,
      },
    ]);
  });

  it('attaches global plate captions to distant multi-panel regions without expanding crops', () => {
    const regions = buildVisualRegions({
      pageWidth: 400,
      pageHeight: 400,
      imageBoxes: [
        { x: 40, y: 40, width: 100, height: 80 },
        { x: 220, y: 40, width: 100, height: 80 },
      ],
      layout: {
        blocks: [
          {
            text: 'Plate 2.1. NOAA map panels',
            x: 220,
            y: 300,
            width: 150,
            height: 12,
            lines: [{ text: 'Plate 2.1. NOAA map panels', x: 220, y: 300, width: 150, height: 12, fontSize: 10 }],
          },
        ],
      },
    });

    expect(regions).toHaveLength(2);
    expect(regions.map((region) => region.associatedText?.[0])).toEqual([
      {
        text: 'Plate 2.1. NOAA map panels',
        relation: 'caption',
        x: 220,
        y: 300,
        width: 150,
        height: 12,
        blockIndex: 0,
      },
      {
        text: 'Plate 2.1. NOAA map panels',
        relation: 'caption',
        x: 220,
        y: 300,
        width: 150,
        height: 12,
        blockIndex: 0,
      },
    ]);
    expect(regions[0]).toMatchObject({ x: 32, y: 32, width: 116, height: 96 });
    expect(regions[1]).toMatchObject({ x: 212, y: 32, width: 116, height: 96 });
  });

  it('drops contained same-kind regions after caption expansion', () => {
    const regions = buildVisualRegions({
      pageWidth: 300,
      pageHeight: 300,
      imageBoxes: [],
      vectorBoxes: [
        ...Array.from({ length: 6 }, (_, index) => ({ x: 100 + index * 10, y: 100, width: 30, height: 20 })),
        ...Array.from({ length: 6 }, (_, index) => ({ x: 100 + index * 10, y: 60, width: 30, height: 20 })),
      ],
      layout: {
        blocks: [
          {
            text: 'Figure 1. Example',
            x: 100,
            y: 40,
            width: 100,
            height: 10,
            lines: [{ text: 'Figure 1. Example', x: 100, y: 40, width: 100, height: 10, fontSize: 10 }],
          },
        ],
      },
    });

    expect(regions).toEqual([
      {
        kind: 'vector',
        x: 92,
        y: 32,
        width: 116,
        height: 96,
        areaRatio: 0.124,
        sourceCount: 6,
        sources: Array.from({ length: 6 }, (_, index) => ({ type: 'vectorBox' as const, index })),
        reason: '6 nearby vector drawing operations',
        associatedText: [
          {
            text: 'Figure 1. Example',
            relation: 'caption',
            x: 100,
            y: 40,
            width: 100,
            height: 10,
            blockIndex: 0,
          },
        ],
      },
    ]);
  });

  it('attaches form labels and expands the crop box to include them', () => {
    const regions = buildVisualRegions({
      pageWidth: 200,
      pageHeight: 200,
      imageBoxes: [],
      formFields: [
        {
          name: 'name',
          type: 'text',
          x: 100,
          y: 80,
          width: 80,
          height: 20,
          label: {
            text: 'Legal name',
            relation: 'above',
            x: 40,
            y: 60,
            width: 140,
            height: 12,
          },
        },
      ],
    });

    expect(regions).toEqual([
      {
        kind: 'form',
        x: 32,
        y: 52,
        width: 156,
        height: 56,
        areaRatio: 0.218,
        sourceCount: 1,
        sources: [{ type: 'formField', index: 0 }],
        reason: '1 interactive form fields in one page region',
        associatedText: [
          {
            text: 'Legal name',
            relation: 'label',
            x: 40,
            y: 60,
            width: 140,
            height: 12,
            fieldIndex: 0,
          },
        ],
      },
    ]);
  });

  it('deduplicates repeated form labels in associated visual-region text', () => {
    const sharedLabel = {
      text: 'Shared taxpayer label',
      relation: 'above' as const,
      x: 40,
      y: 60,
      width: 140,
      height: 12,
    };
    const regions = buildVisualRegions({
      pageWidth: 240,
      pageHeight: 200,
      imageBoxes: [],
      formFields: [
        { name: 'first', type: 'text', x: 60, y: 80, width: 60, height: 20, label: sharedLabel },
        { name: 'second', type: 'text', x: 130, y: 80, width: 60, height: 20, label: sharedLabel },
      ],
    });

    expect(regions).toHaveLength(1);
    expect(regions[0].sourceCount).toBe(2);
    expect(regions[0].associatedText).toEqual([
      {
        text: 'Shared taxpayer label',
        relation: 'label',
        x: 40,
        y: 60,
        width: 140,
        height: 12,
        fieldIndex: 0,
      },
    ]);
  });
});
