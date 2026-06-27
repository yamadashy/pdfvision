import { describe, expect, it } from 'vitest';
import { buildVisualRegions } from '../../src/core/visualRegions/index.js';

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

  it('suppresses form regions when the rendered page is blank', () => {
    const regions = buildVisualRegions({
      pageWidth: 612,
      pageHeight: 792,
      imageBoxes: [],
      formFields: [
        { name: 'Text1', type: 'text', x: 24, y: 48, width: 264, height: 25, readOnly: false, required: false },
        { name: 'Text2', type: 'text', x: 312, y: 48, width: 266, height: 25, readOnly: false, required: false },
      ],
      visualStatus: 'blank',
    });

    expect(regions).toEqual([]);
  });

  it('emits annotation markup regions even when the visible mark is thin', () => {
    const regions = buildVisualRegions({
      pageWidth: 612,
      pageHeight: 792,
      imageBoxes: [],
      annotations: [
        {
          subtype: 'Highlight',
          hasAppearance: false,
          flags: ['print'],
          x: 56.52,
          y: 88.94,
          width: 133.98,
          height: 12,
          quadBoxes: [{ x: 56.52, y: 88.94, width: 133.98, height: 12 }],
        },
      ],
    });

    expect(regions).toEqual([
      {
        kind: 'annotation',
        x: 48.52,
        y: 80.94,
        width: 149.98,
        height: 28,
        areaRatio: 0.009,
        sourceCount: 1,
        sources: [{ type: 'annotation', index: 0 }],
        reason: 'Highlight annotation markup',
      },
    ]);
  });

  it('does not dispatch FreeText annotations without appearance streams as visual regions', () => {
    const regions = buildVisualRegions({
      pageWidth: 612,
      pageHeight: 792,
      imageBoxes: [],
      annotations: [
        {
          subtype: 'FreeText',
          contents: 'Annotation contents without a renderable appearance',
          hasAppearance: false,
          flags: ['print'],
          x: 140,
          y: 231.87,
          width: 224.4,
          height: 166.01,
        },
      ],
    });

    expect(regions).toEqual([]);
  });

  it('does not dispatch hidden annotations as visual regions', () => {
    const regions = buildVisualRegions({
      pageWidth: 612,
      pageHeight: 792,
      imageBoxes: [],
      annotations: [
        { subtype: 'Stamp', flags: ['hidden', 'print'], x: 70, y: 90, width: 100, height: 30 },
        { subtype: 'Ink', flags: ['noView'], x: 100, y: 150, width: 80, height: 40 },
      ],
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

  it('emits compact raster text-strip regions below the normal image area threshold', () => {
    // PDF.js bug1795263-shaped case: visible title/header text can be
    // painted as narrow raster fragments, too small for normal raster
    // area thresholds but still important for human reading.
    const regions = buildVisualRegions({
      pageWidth: 595,
      pageHeight: 842,
      imageBoxes: [
        { x: 230.86, y: 50.42, width: 140, height: 24.21 },
        { x: 370.86, y: 50.42, width: 11.99, height: 24.21 },
        { x: 42.55, y: 118.87, width: 146.11, height: 14.38 },
        { x: 188.67, y: 118.87, width: 3.96, height: 14.38 },
        { x: 192.62, y: 118.87, width: 3.36, height: 14.38 },
        { x: 195.98, y: 118.87, width: 114.11, height: 14.38 },
        { x: 310.09, y: 118.87, width: 3.96, height: 14.38 },
        { x: 314.04, y: 118.87, width: 3.36, height: 14.38 },
        { x: 317.4, y: 118.87, width: 21.93, height: 14.38 },
      ],
    });

    expect(regions).toEqual([
      {
        kind: 'raster',
        x: 222.86,
        y: 42.42,
        width: 167.99,
        height: 40.21,
        areaRatio: 0.013,
        sourceCount: 2,
        sources: [
          { type: 'imageBox', index: 0 },
          { type: 'imageBox', index: 1 },
        ],
        reason: '2 small raster text fragments in one horizontal band',
      },
      {
        kind: 'raster',
        x: 34.55,
        y: 110.87,
        width: 312.78,
        height: 30.38,
        areaRatio: 0.019,
        sourceCount: 7,
        sources: [
          { type: 'imageBox', index: 2 },
          { type: 'imageBox', index: 3 },
          { type: 'imageBox', index: 4 },
          { type: 'imageBox', index: 5 },
          { type: 'imageBox', index: 6 },
          { type: 'imageBox', index: 7 },
          { type: 'imageBox', index: 8 },
        ],
        reason: '7 small raster text fragments in one horizontal band',
      },
    ]);
  });

  it('suppresses compact raster text strips inside vector header chrome bands', () => {
    const regions = buildVisualRegions({
      pageWidth: 612,
      pageHeight: 792,
      imageBoxes: [{ x: 36, y: 27, width: 138, height: 28 }],
      vectorBoxes: [{ x: 36, y: 54, width: 540, height: 0.5 }],
    });

    expect(regions).toEqual([]);
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

  it('keeps a full-page vector region when it is the only nonblank visual evidence', () => {
    const regions = buildVisualRegions({
      pageWidth: 100,
      pageHeight: 100,
      imageBoxes: [],
      vectorBoxes: [{ x: 0, y: 0, width: 100, height: 100 }],
      visualStatus: 'ok',
      nativeTextStatus: 'empty_but_visual_content',
    });

    expect(regions).toEqual([
      {
        kind: 'vector',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        areaRatio: 1,
        sourceCount: 1,
        sources: [{ type: 'vectorBox', index: 0 }],
        reason: '1 nearby vector drawing operations',
      },
    ]);
  });

  it('keeps wide table frame vectors when they contain ruled grid lines', () => {
    const regions = buildVisualRegions({
      pageWidth: 612,
      pageHeight: 792,
      imageBoxes: [],
      vectorBoxes: [
        { x: 36, y: 576, width: 540, height: 150 },
        { x: 36, y: 624, width: 162, height: 0.5 },
        { x: 36, y: 726, width: 162, height: 0.5 },
        { x: 36, y: 624, width: 0.5, height: 102 },
        { x: 198, y: 624, width: 0.5, height: 102 },
        { x: 216, y: 624, width: 360, height: 102 },
        { x: 402, y: 624, width: 0.5, height: 102 },
      ],
      layout: {
        blocks: [
          {
            text: 'Acceptable Receipts',
            x: 252.2,
            y: 577.08,
            width: 107.59,
            height: 11,
            role: 'heading',
            level: 2,
            lines: [],
          },
        ],
      },
    });

    expect(regions[0]).toMatchObject({
      kind: 'vector',
      x: 28,
      y: 568,
      width: 556,
      height: 166,
    });
    expect(regions[0].sources).toContainEqual({ type: 'vectorBox', index: 0 });
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

  it('uses thin vector connectors to join sparse diagram boxes', () => {
    const regions = buildVisualRegions({
      pageWidth: 595.22,
      pageHeight: 842,
      imageBoxes: [],
      vectorBoxes: [
        { x: 127.46, y: 498.81, width: 72.69, height: 30.39 },
        { x: 127.4, y: 498.81, width: 72.74, height: 30.39 },
        { x: 245.3, y: 498.81, width: 83.89, height: 30.39 },
        { x: 245.3, y: 498.81, width: 83.89, height: 30.39 },
        { x: 378.25, y: 495.13, width: 72.74, height: 30.39 },
        { x: 378.25, y: 495.08, width: 72.69, height: 30.45 },
        { x: 120.87, y: 533.87, width: 336.48, height: 17.73 },
        { x: 202.89, y: 508.43, width: 42.41, height: 5.48 },
        { x: 332.57, y: 508.43, width: 42.35, height: 5.48 },
      ],
    });

    expect(regions).toEqual([
      {
        kind: 'vector',
        x: 119.4,
        y: 487.08,
        width: 339.59,
        height: 50.12,
        areaRatio: 0.034,
        sourceCount: 8,
        sources: [0, 1, 2, 3, 4, 5, 7, 8].map((index) => ({ type: 'vectorBox' as const, index })),
        reason: '8 nearby vector drawing operations',
      },
    ]);
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

  it('emits form regions for ruled administrative form grids without table captions', () => {
    const vectorBoxes = [
      { x: 203.79, y: 563.21, width: 53.76, height: 0.5 },
      { x: 207.63, y: 588.04, width: 46.08, height: 0.5 },
      { x: 37.79, y: 54.41, width: 0.68, height: 474.47 },
      { x: 59.93, y: 55.09, width: 0.68, height: 473.8 },
      { x: 287.13, y: 55.09, width: 0.68, height: 473.8 },
      { x: 369.35, y: 55.09, width: 0.68, height: 473.8 },
      { x: 423.11, y: 55.09, width: 0.68, height: 473.8 },
      { x: 573.29, y: 55.09, width: 0.68, height: 473.8 },
      { x: 396.21, y: 100.26, width: 0.68, height: 428.63 },
      { x: 38.46, y: 54.41, width: 535.51, height: 0.68 },
      { x: 370.03, y: 73.85, width: 53.76, height: 0.68 },
      { x: 38.46, y: 99.58, width: 535.51, height: 0.68 },
      { x: 38.46, y: 138.22, width: 535.51, height: 0.68 },
      { x: 38.46, y: 217.93, width: 535.51, height: 0.68 },
      { x: 38.46, y: 256.54, width: 535.51, height: 0.68 },
      { x: 38.46, y: 335.14, width: 535.51, height: 0.68 },
      { x: 38.46, y: 373.74, width: 535.51, height: 0.7 },
      { x: 38.46, y: 412.37, width: 535.51, height: 0.68 },
      { x: 38.46, y: 450.98, width: 535.51, height: 0.68 },
      { x: 38.46, y: 489.6, width: 535.51, height: 0.68 },
      { x: 38.46, y: 528.21, width: 535.51, height: 0.68 },
      { x: 287.36, y: 566.39, width: 286.39, height: 0.68 },
      { x: 287.36, y: 591.23, width: 286.39, height: 0.68 },
    ];

    const regions = buildVisualRegions({
      pageWidth: 612,
      pageHeight: 792,
      imageBoxes: [],
      vectorBoxes,
    });

    expect(regions).toEqual([
      {
        kind: 'form',
        x: 30.46,
        y: 47.09,
        width: 551.51,
        height: 489.8,
        areaRatio: 0.557,
        sourceCount: 14,
        sources: [
          { type: 'vectorBox', index: 4 },
          { type: 'vectorBox', index: 5 },
          { type: 'vectorBox', index: 6 },
          { type: 'vectorBox', index: 8 },
          { type: 'vectorBox', index: 11 },
          { type: 'vectorBox', index: 12 },
          { type: 'vectorBox', index: 13 },
          { type: 'vectorBox', index: 14 },
          { type: 'vectorBox', index: 15 },
          { type: 'vectorBox', index: 16 },
          { type: 'vectorBox', index: 17 },
          { type: 'vectorBox', index: 18 },
          { type: 'vectorBox', index: 19 },
          { type: 'vectorBox', index: 20 },
        ],
        reason: '14 ruled form vector lines',
      },
    ]);
  });

  it('emits form regions for dotted administrative write-in lines', () => {
    const vectorBoxes = Array.from({ length: 369 }, (_, index) => ({
      x: 157.1 + (index % 123) * 2.88,
      y: 334.85 + Math.floor(index / 123) * 27,
      width: index % 123 === 122 ? 1.46 : 1.44,
      height: 0.6,
    }));

    const regions = buildVisualRegions({
      pageWidth: 595.32,
      pageHeight: 841.92,
      imageBoxes: [],
      vectorBoxes,
    });

    expect(regions).toEqual([
      {
        kind: 'form',
        x: 149.1,
        y: 326.85,
        width: 368.82,
        height: 70.6,
        areaRatio: 0.052,
        sourceCount: 369,
        sources: Array.from({ length: 16 }, (_, index) => ({ type: 'vectorBox' as const, index })),
        reason: '369 dotted form line segments across 3 write-in lines',
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

  it('emits one broad crop for sparse transit-map marker fields', () => {
    const vectorBoxes = Array.from({ length: 600 }, (_, index) => ({
      x: 100 + (index % 30) * 36,
      y: 110 + Math.floor(index / 30) * 34,
      width: 6,
      height: 6,
    }));

    const regions = buildVisualRegions({
      pageWidth: 1200,
      pageHeight: 900,
      imageBoxes: [],
      vectorBoxes,
    });

    expect(regions).toEqual([
      {
        kind: 'vector',
        x: 92,
        y: 102,
        width: 1066,
        height: 668,
        areaRatio: 0.659,
        sourceCount: 600,
        sources: Array.from({ length: 16 }, (_, index) => ({ type: 'vectorBox' as const, index })),
        reason: '600 dense small vector markers spread across broad map/diagram field',
      },
    ]);
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

  it('keeps separate raster panels instead of a broad vector backplane crop', () => {
    const regions = buildVisualRegions({
      pageWidth: 900,
      pageHeight: 900,
      imageBoxes: [
        { x: 40, y: 40, width: 300, height: 300 },
        { x: 450, y: 40, width: 300, height: 300 },
        { x: 40, y: 450, width: 300, height: 300 },
        { x: 450, y: 450, width: 300, height: 300 },
      ],
      vectorBoxes: Array.from({ length: 40 }, (_, index) => ({
        x: 20,
        y: 20 + index * 20,
        width: 760,
        height: 0.5,
      })),
    });

    expect(regions).toEqual([
      {
        kind: 'raster',
        x: 32,
        y: 32,
        width: 316,
        height: 316,
        areaRatio: 0.123,
        sourceCount: 1,
        sources: [{ type: 'imageBox', index: 0 }],
        reason: 'raster image covers 11.1% of the page',
      },
      {
        kind: 'raster',
        x: 442,
        y: 32,
        width: 316,
        height: 316,
        areaRatio: 0.123,
        sourceCount: 1,
        sources: [{ type: 'imageBox', index: 1 }],
        reason: 'raster image covers 11.1% of the page',
      },
      {
        kind: 'raster',
        x: 32,
        y: 442,
        width: 316,
        height: 316,
        areaRatio: 0.123,
        sourceCount: 1,
        sources: [{ type: 'imageBox', index: 2 }],
        reason: 'raster image covers 11.1% of the page',
      },
      {
        kind: 'raster',
        x: 442,
        y: 442,
        width: 316,
        height: 316,
        areaRatio: 0.123,
        sourceCount: 1,
        sources: [{ type: 'imageBox', index: 3 }],
        reason: 'raster image covers 11.1% of the page',
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

  it('suppresses medium-height section ribbons at the page edge', () => {
    const regions = buildVisualRegions({
      pageWidth: 612,
      pageHeight: 792,
      imageBoxes: [],
      vectorBoxes: [{ x: 0, y: 318.15, width: 30.23, height: 154.9 }],
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

  it('suppresses vector footer clusters that sit inside repeated chrome', () => {
    const footerBlock = (text: string, x: number, width: number) => ({
      text,
      x,
      y: 378.56,
      width,
      height: 20,
      lines: [{ text, x, y: 378.56, width, height: 20, fontSize: 18 }],
      repeated: true,
    });

    const regions = buildVisualRegions({
      pageWidth: 720,
      pageHeight: 405,
      imageBoxes: [],
      vectorBoxes: [
        { x: 47.29, y: 9.6, width: 470.23, height: 312.53 },
        { x: 395.38, y: 372.61, width: 129.83, height: 42.64 },
        { x: 575.38, y: 372.61, width: 275.69, height: 42.64 },
      ],
      layout: {
        blocks: [
          { text: 'f', x: 365.27, y: 145.82, width: 13.3, height: 48, lines: [] },
          footerBlock('Lecture 5 -6', 402.13, 100.66),
          footerBlock('April 13, 2021', 582.13, 123.32),
        ],
      },
    });

    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({
      kind: 'vector',
      x: 39.29,
      y: 1.6,
      width: 486.23,
      height: 328.53,
      sourceCount: 1,
    });
  });

  it('suppresses vector footer clusters inside horizontal edge chrome', () => {
    const regions = buildVisualRegions({
      pageWidth: 720,
      pageHeight: 405,
      imageBoxes: [],
      vectorBoxes: [
        { x: 47.29, y: 9.6, width: 470.23, height: 312.53 },
        { x: 0, y: 376.1, width: 720, height: 29.67 },
        { x: 395.38, y: 372.61, width: 129.83, height: 42.64 },
        { x: 575.38, y: 372.61, width: 275.69, height: 42.64 },
      ],
    });

    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({
      kind: 'vector',
      x: 39.29,
      y: 1.6,
      width: 486.23,
      height: 328.53,
      sourceCount: 1,
    });
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

  it('does not merge an inset page frame into foreground figure and table crops', () => {
    const regions = buildVisualRegions({
      pageWidth: 600,
      pageHeight: 800,
      imageBoxes: [{ x: 120, y: 340, width: 360, height: 200 }],
      vectorBoxes: [
        { x: 80, y: 640, width: 180, height: 100 },
        { x: 260, y: 640, width: 260, height: 100 },
        { x: 55, y: 55, width: 490, height: 700 },
      ],
    });

    expect(regions).toEqual([
      {
        kind: 'raster',
        x: 112,
        y: 332,
        width: 376,
        height: 216,
        areaRatio: 0.169,
        sourceCount: 1,
        sources: [{ type: 'imageBox', index: 0 }],
        reason: 'raster image covers 15.0% of the page',
      },
      {
        kind: 'vector',
        x: 72,
        y: 632,
        width: 456,
        height: 116,
        areaRatio: 0.11,
        sourceCount: 2,
        sources: [
          { type: 'vectorBox', index: 0 },
          { type: 'vectorBox', index: 1 },
        ],
        reason: '2 nearby vector drawing operations',
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
        associatedText: [
          {
            text: 'Industry data sharing intent',
            relation: 'label',
            x: 548.88,
            y: 240.34,
            width: 171.93,
            height: 14.04,
            blockIndex: 1,
          },
        ],
      },
      {
        kind: 'raster',
        x: 3.52,
        y: 232.55,
        width: 500.8,
        height: 217.41,
        areaRatio: 0.258,
        sourceCount: 1,
        sources: [{ type: 'imageBox', index: 0 }],
        reason: 'raster image covers 18.6% of the page',
        associatedText: [
          {
            text: 'DX progress by operation area',
            relation: 'label',
            x: 173.78,
            y: 240.55,
            width: 160.35,
            height: 14.04,
            blockIndex: 2,
          },
        ],
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

  it('keeps wide bottom table candidates when other foreground visuals are present', () => {
    const regions = buildVisualRegions({
      pageWidth: 300,
      pageHeight: 300,
      imageBoxes: [],
      vectorBoxes: [{ x: 50, y: 100, width: 80, height: 40 }],
      layout: {
        blocks: [],
        tables: [
          {
            x: 20,
            y: 270,
            width: 260,
            height: 24,
            rowCount: 5,
            columnCount: 10,
            rows: [],
          },
        ],
      },
    });

    expect(regions).toEqual([
      {
        kind: 'vector',
        x: 42,
        y: 92,
        width: 96,
        height: 56,
        areaRatio: 0.06,
        sourceCount: 1,
        sources: [{ type: 'vectorBox', index: 0 }],
        reason: '1 nearby vector drawing operations',
      },
      {
        kind: 'table',
        x: 12,
        y: 262,
        width: 276,
        height: 38,
        areaRatio: 0.117,
        sourceCount: 1,
        sources: [{ type: 'layoutTable', index: 0 }],
        reason: 'layout table hint with 5 rows and 10 columns',
      },
    ]);
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

  it('emits ruled vector tables when a table caption anchors the region', () => {
    const regions = buildVisualRegions({
      pageWidth: 612,
      pageHeight: 792,
      imageBoxes: [],
      vectorBoxes: [
        { x: 145, y: 94, width: 322, height: 0.5 },
        { x: 145, y: 105, width: 322, height: 0.5 },
        { x: 145, y: 148, width: 322, height: 0.5 },
        { x: 145, y: 159, width: 322, height: 0.5 },
        { x: 145, y: 203, width: 322, height: 0.5 },
        { x: 145, y: 236, width: 322, height: 0.5 },
        { x: 296, y: 94, width: 0.5, height: 142 },
        { x: 408, y: 94, width: 0.5, height: 142 },
      ],
      layout: {
        blocks: [
          {
            text: 'Table 4: The Transformer generalizes well to English constituency parsing',
            x: 108,
            y: 68,
            width: 396,
            height: 20,
            lines: [
              {
                text: 'Table 4: The Transformer generalizes well to English constituency parsing',
                x: 108,
                y: 68,
                width: 396,
                height: 20,
                fontSize: 10,
              },
            ],
          },
        ],
      },
    });

    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({
      kind: 'table',
      sourceCount: 8,
      reason: '8 ruled table vector lines near table caption',
    });
    expect(regions[0].associatedText?.[0]).toMatchObject({
      relation: 'caption',
      text: 'Table 4: The Transformer generalizes well to English constituency parsing',
    });
  });

  it('does not emit ruled vector tables without a nearby table caption', () => {
    const regions = buildVisualRegions({
      pageWidth: 612,
      pageHeight: 792,
      imageBoxes: [],
      vectorBoxes: [
        { x: 145, y: 94, width: 322, height: 0.5 },
        { x: 145, y: 105, width: 322, height: 0.5 },
        { x: 145, y: 148, width: 322, height: 0.5 },
        { x: 145, y: 159, width: 322, height: 0.5 },
        { x: 145, y: 203, width: 322, height: 0.5 },
        { x: 145, y: 236, width: 322, height: 0.5 },
        { x: 296, y: 94, width: 0.5, height: 142 },
        { x: 408, y: 94, width: 0.5, height: 142 },
      ],
      layout: {
        blocks: [],
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

  it('suppresses unpositioned widget appearance vectors when form fields carry page positions', () => {
    const formFields = [
      { name: 'Text2', type: 'text' as const, x: 311.91, y: 82.73, width: 150, height: 22 },
      { name: 'Text4', type: 'text' as const, x: 132.53, y: 83.15, width: 150, height: 22 },
      { name: 'Text3', type: 'text' as const, x: 149.41, y: 174.74, width: 150, height: 22 },
      { name: 'Text6', type: 'text' as const, x: 325.84, y: 175.16, width: 150, height: 22 },
      { name: 'Text5', type: 'text' as const, x: 258.31, y: 288.7, width: 150, height: 22 },
      { name: 'Text1', type: 'text' as const, x: 73.02, y: 289.12, width: 150, height: 22 },
    ];
    const regions = buildVisualRegions({
      pageWidth: 612,
      pageHeight: 792,
      imageBoxes: [],
      vectorBoxes: Array.from({ length: formFields.length }, () => ({
        x: 0.5,
        y: 770.5,
        width: 149,
        height: 21,
      })),
      formFields,
    });

    expect(regions.every((region) => region.kind === 'form')).toBe(true);
    expect(regions).toHaveLength(formFields.length);
    expect(regions.map((region) => region.sources[0])).toEqual([
      { type: 'formField', index: 1 },
      { type: 'formField', index: 0 },
      { type: 'formField', index: 2 },
      { type: 'formField', index: 3 },
      { type: 'formField', index: 5 },
      { type: 'formField', index: 4 },
    ]);
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

  it('splits medium-sized tall form clusters at major vertical bands', () => {
    const formFields = [60, 96, 132, 168].flatMap((y, band) => [
      { name: `top-${band}`, type: 'text' as const, x: 40, y, width: 80, height: 12 },
      { name: `bottom-${band}`, type: 'text' as const, x: 40, y: y + 8, width: 80, height: 12 },
    ]);

    const regions = buildVisualRegions({
      pageWidth: 300,
      pageHeight: 300,
      imageBoxes: [],
      formFields,
    });

    expect(regions).toEqual([
      {
        kind: 'form',
        x: 32,
        y: 52,
        width: 96,
        height: 36,
        areaRatio: 0.038,
        sourceCount: 2,
        sources: [
          { type: 'formField', index: 0 },
          { type: 'formField', index: 1 },
        ],
        reason: '2 interactive form fields in one page region',
      },
      {
        kind: 'form',
        x: 32,
        y: 88,
        width: 96,
        height: 36,
        areaRatio: 0.038,
        sourceCount: 2,
        sources: [
          { type: 'formField', index: 2 },
          { type: 'formField', index: 3 },
        ],
        reason: '2 interactive form fields in one page region',
      },
      {
        kind: 'form',
        x: 32,
        y: 124,
        width: 96,
        height: 36,
        areaRatio: 0.038,
        sourceCount: 2,
        sources: [
          { type: 'formField', index: 4 },
          { type: 'formField', index: 5 },
        ],
        reason: '2 interactive form fields in one page region',
      },
      {
        kind: 'form',
        x: 32,
        y: 160,
        width: 96,
        height: 36,
        areaRatio: 0.038,
        sourceCount: 2,
        sources: [
          { type: 'formField', index: 6 },
          { type: 'formField', index: 7 },
        ],
        reason: '2 interactive form fields in one page region',
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

  it('deduplicates same-caption vector overlays contained inside a raster figure crop', () => {
    const regions = buildVisualRegions({
      pageWidth: 600,
      pageHeight: 800,
      imageBoxes: [
        { x: 40, y: 40, width: 120, height: 90 },
        { x: 420, y: 40, width: 120, height: 90 },
      ],
      vectorBoxes: [{ x: 180, y: 80, width: 220, height: 50 }],
      layout: {
        blocks: [
          {
            text: 'Figure 4: Model overview.',
            x: 40,
            y: 160,
            width: 500,
            height: 20,
            lines: [{ text: 'Figure 4: Model overview.', x: 40, y: 160, width: 500, height: 20, fontSize: 10 }],
          },
        ],
      },
    });

    expect(regions).toEqual([
      {
        kind: 'mixed',
        x: 32,
        y: 32,
        width: 516,
        height: 156,
        areaRatio: 0.168,
        sourceCount: 3,
        sources: [
          { type: 'imageBox', index: 0 },
          { type: 'imageBox', index: 1 },
          { type: 'vectorBox', index: 0 },
        ],
        reason: 'raster image covers 2.3% of the page; 1 nearby vector drawing operations',
        associatedText: [
          {
            text: 'Figure 4: Model overview.',
            relation: 'caption',
            x: 40,
            y: 160,
            width: 500,
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

  it('prefers chart headings inside a large visual region over nearby page headers', () => {
    const regions = buildVisualRegions({
      pageWidth: 600,
      pageHeight: 800,
      imageBoxes: [],
      layout: {
        blocks: [
          {
            text: 'Page: 16/16',
            x: 500,
            y: 72,
            width: 52,
            height: 9,
            role: 'heading',
            level: 2,
            lines: [{ text: 'Page: 16/16', x: 500, y: 72, width: 52, height: 9, fontSize: 9 }],
          },
          {
            text: 'Heart rate',
            x: 270,
            y: 112,
            width: 60,
            height: 10,
            role: 'heading',
            level: 1,
            lines: [{ text: 'Heart rate', x: 270, y: 112, width: 60, height: 10, fontSize: 10 }],
          },
        ],
        tables: [
          {
            x: 80,
            y: 100,
            width: 440,
            height: 210,
            rowCount: 12,
            columnCount: 8,
            rows: [],
          },
        ],
      },
    });

    expect(regions).toEqual([
      {
        kind: 'table',
        x: 72,
        y: 92,
        width: 456,
        height: 226,
        areaRatio: 0.215,
        sourceCount: 1,
        sources: [{ type: 'layoutTable', index: 0 }],
        reason: 'layout table hint with 12 rows and 8 columns',
        associatedText: [
          {
            text: 'Heart rate',
            relation: 'label',
            x: 270,
            y: 112,
            width: 60,
            height: 10,
            blockIndex: 1,
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

  it('attaches short plain labels above raster images', () => {
    const regions = buildVisualRegions({
      pageWidth: 600,
      pageHeight: 400,
      imageBoxes: [{ x: 40, y: 120, width: 420, height: 160 }],
      layout: {
        blocks: [
          {
            text: 'DX adoption by manufacturing function',
            x: 174,
            y: 96,
            width: 180,
            height: 14,
            lines: [
              { text: 'DX adoption by manufacturing function', x: 174, y: 96, width: 180, height: 14, fontSize: 12 },
            ],
          },
        ],
      },
    });

    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({
      kind: 'raster',
      associatedText: [
        {
          text: 'DX adoption by manufacturing function',
          relation: 'label',
          blockIndex: 0,
        },
      ],
    });
  });

  it('attaches short in-region chart titles to mixed visual regions', () => {
    const regions = buildVisualRegions({
      pageWidth: 600,
      pageHeight: 800,
      imageBoxes: [{ x: 80, y: 220, width: 390, height: 200 }],
      vectorBoxes: [
        { x: 70, y: 210, width: 410, height: 230 },
        { x: 90, y: 360, width: 360, height: 1 },
      ],
      layout: {
        blocks: [
          {
            text: 'Mental health and distress relationship',
            x: 204,
            y: 224,
            width: 192,
            height: 12,
            lines: [
              {
                text: 'Mental health and distress relationship',
                x: 204,
                y: 224,
                width: 192,
                height: 12,
                fontSize: 10,
              },
            ],
          },
          {
            text: '2024',
            x: 95,
            y: 246,
            width: 26,
            height: 10,
            lines: [{ text: '2024', x: 95, y: 246, width: 26, height: 10, fontSize: 9 }],
          },
        ],
      },
    });

    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({
      kind: 'mixed',
      associatedText: [
        {
          text: 'Mental health and distress relationship',
          relation: 'label',
          x: 204,
          y: 224,
          width: 192,
          height: 12,
          blockIndex: 0,
        },
      ],
    });
  });

  it('attaches short in-region chart titles to vector visual regions', () => {
    const regions = buildVisualRegions({
      pageWidth: 600,
      pageHeight: 400,
      imageBoxes: [],
      vectorBoxes: [
        { x: 310, y: 100, width: 220, height: 240 },
        { x: 330, y: 280, width: 170, height: 1 },
      ],
      layout: {
        blocks: [
          {
            text: 'Participation intent for industrial data sharing',
            x: 350,
            y: 122,
            width: 180,
            height: 14,
            lines: [
              {
                text: 'Participation intent for industrial data sharing',
                x: 350,
                y: 122,
                width: 180,
                height: 14,
                fontSize: 12,
              },
            ],
          },
          {
            text: 'Not sure, 45.3%',
            x: 365,
            y: 230,
            width: 90,
            height: 12,
            lines: [{ text: 'Not sure, 45.3%', x: 365, y: 230, width: 90, height: 12, fontSize: 10 }],
          },
        ],
      },
    });

    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({
      kind: 'vector',
      associatedText: [
        {
          text: 'Participation intent for industrial data sharing',
          relation: 'label',
          blockIndex: 0,
        },
      ],
    });
  });

  it('attaches nearby panel titles above visual regions that already have in-region labels', () => {
    const regions = buildVisualRegions({
      pageWidth: 612,
      pageHeight: 792,
      imageBoxes: [],
      vectorBoxes: [{ x: 208, y: 139, width: 280, height: 160 }],
      layout: {
        blocks: [
          {
            text: '(b) Synthesis of assessment of observed change in heavy precipitation and confidence in human contribution',
            x: 200,
            y: 108,
            width: 304,
            height: 19,
            lines: [
              {
                text: '(b) Synthesis of assessment of observed change in heavy precipitation and confidence in human contribution',
                x: 200,
                y: 108,
                width: 304,
                height: 19,
                fontSize: 9,
              },
            ],
          },
          {
            text: 'North America NWN NEN GIC Europe',
            x: 208,
            y: 139,
            width: 124,
            height: 14,
            lines: [
              {
                text: 'North America NWN NEN GIC Europe',
                x: 208,
                y: 139,
                width: 124,
                height: 14,
                fontSize: 7,
              },
            ],
          },
        ],
      },
    });

    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({
      kind: 'vector',
      x: 192,
      y: 100,
      width: 320,
      height: 207,
      associatedText: [
        {
          text: '(b) Synthesis of assessment of observed change in heavy precipitation and confidence in human contribution',
          relation: 'label',
          blockIndex: 0,
        },
        {
          text: 'North America NWN NEN GIC Europe',
          relation: 'label',
          blockIndex: 1,
        },
      ],
    });
  });

  it('does not attach Japanese prose inside callout boxes as labels', () => {
    const regions = buildVisualRegions({
      pageWidth: 600,
      pageHeight: 800,
      imageBoxes: [{ x: 60, y: 50, width: 460, height: 210 }],
      vectorBoxes: [
        { x: 60, y: 50, width: 460, height: 210 },
        { x: 70, y: 60, width: 440, height: 190 },
      ],
      layout: {
        blocks: [
          {
            text: '治療期間中に重篤な有害事象は認められなかった。今後は有効性を検証する。',
            x: 90,
            y: 78,
            width: 200,
            height: 44,
            lines: [
              {
                text: '治療期間中に重篤な有害事象は認められなかった。今後は有効性を検証する。',
                x: 90,
                y: 78,
                width: 200,
                height: 44,
                fontSize: 10,
              },
            ],
          },
          {
            text: '2 職職場場ででのの取取組組みみ 7 第第依存症の問題を抱えた方の回復と成長の支1144 次次労労働働災災害害防防止止計計画画でではは労労働働者者のの健健康康確確保保対対策策のの推推進進',
            x: 90,
            y: 140,
            width: 400,
            height: 24,
            lines: [
              {
                text: '2 職職場場ででのの取取組組みみ 7 第第依存症の問題を抱えた方の回復と成長の支1144 次次労労働働災災害害防防止止計計画画でではは労労働働者者のの健健康康確確保保対対策策のの推推進進',
                x: 90,
                y: 140,
                width: 400,
                height: 24,
                fontSize: 10,
              },
            ],
          },
        ],
      },
    });

    expect(regions[0].associatedText).toBeUndefined();
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

  it('merges caption continuation lines while ignoring dot leaders', () => {
    const regions = buildVisualRegions({
      pageWidth: 600,
      pageHeight: 760,
      imageBoxes: [],
      vectorBoxes: Array.from({ length: 8 }, (_, index) => ({
        x: 330 + index * 18,
        y: 590,
        width: 24,
        height: 20,
      })),
      layout: {
        blocks: [
          {
            text: 'Table 2. Multivariate regression on citation count for 85\npublications\n. . . . . . . .',
            x: 318.1,
            y: 551.16,
            width: 233.88,
            height: 25.41,
            lines: [
              {
                text: 'Table 2. Multivariate regression on citation count for 85',
                x: 321.11,
                y: 551.16,
                width: 223.59,
                height: 8.97,
                fontSize: 8,
              },
              { text: 'publications', x: 321.11, y: 561, width: 44, height: 8.97, fontSize: 8 },
              { text: '. . . . . . . .', x: 321.11, y: 571, width: 120, height: 8.97, fontSize: 8 },
            ],
          },
        ],
      },
    });

    expect(regions[0].associatedText).toEqual([
      {
        text: 'Table 2. Multivariate regression on citation count for 85 publications',
        relation: 'caption',
        x: 321.11,
        y: 551.16,
        width: 223.59,
        height: 18.81,
        blockIndex: 0,
      },
    ]);
  });

  it('merges abbreviated figure caption continuation lines before DOI metadata', () => {
    const regions = buildVisualRegions({
      pageWidth: 612,
      pageHeight: 792,
      imageBoxes: [{ x: 82, y: 62, width: 426, height: 336 }],
      layout: {
        blocks: [
          {
            text: [
              'Fig. 2. Lifecycle and Key Dimensions of an AI System. Modified from OECD (2022) OECD',
              'Framework for the Classification of AI systems -- OECD Digital Economy Papers. The two inner',
              'circles show AI systems key dimensions and the outer circle shows AI lifecycle stages.',
              'doi:10.6028/NIST.AI.100-1',
            ].join('\n'),
            x: 90,
            y: 379.78,
            width: 429.35,
            height: 51.56,
            lines: [
              {
                text: 'Fig. 2. Lifecycle and Key Dimensions of an AI System. Modified from OECD (2022) OECD',
                x: 90,
                y: 379.78,
                width: 407.47,
                height: 10.91,
                fontSize: 10.91,
              },
              {
                text: 'Framework for the Classification of AI systems -- OECD Digital Economy Papers. The two inner',
                x: 90,
                y: 393.33,
                width: 429.35,
                height: 10.91,
                fontSize: 10.91,
              },
              {
                text: 'circles show AI systems key dimensions and the outer circle shows AI lifecycle stages.',
                x: 90,
                y: 406.87,
                width: 418.28,
                height: 10.91,
                fontSize: 10.91,
              },
              { text: 'doi:10.6028/NIST.AI.100-1', x: 90, y: 420.42, width: 160, height: 10.91, fontSize: 10.91 },
            ],
          },
        ],
      },
    });

    expect(regions[0].associatedText).toEqual([
      {
        text: [
          'Fig. 2. Lifecycle and Key Dimensions of an AI System. Modified from OECD (2022) OECD',
          'Framework for the Classification of AI systems -- OECD Digital Economy Papers. The two inner',
          'circles show AI systems key dimensions and the outer circle shows AI lifecycle stages.',
        ].join(' '),
        relation: 'caption',
        x: 90,
        y: 379.78,
        width: 429.35,
        height: 38,
        blockIndex: 0,
      },
    ]);
  });

  it('merges abbreviated figure captions without a dot after Fig', () => {
    const regions = buildVisualRegions({
      pageWidth: 612,
      pageHeight: 792,
      imageBoxes: [{ x: 120, y: 160, width: 360, height: 210 }],
      layout: {
        blocks: [
          {
            text: [
              'Fig 2. Two particle desynchronization dynamics. Relative position dynamics (upper panel) and relative phase',
              'dynamics (lower panel) for a two particle system with high diversity.',
              'https://doi.org/10.1371/journal.pone.0188753.g002',
            ].join('\n'),
            x: 155.74,
            y: 385.9,
            width: 406.46,
            height: 42,
            lines: [
              {
                text: 'Fig 2. Two particle desynchronization dynamics. Relative position dynamics (upper panel) and relative phase',
                x: 155.74,
                y: 385.9,
                width: 387.56,
                height: 8,
                fontSize: 8,
              },
              {
                text: 'dynamics (lower panel) for a two particle system with high diversity.',
                x: 155.74,
                y: 395.43,
                width: 260,
                height: 8,
                fontSize: 8,
              },
              {
                text: 'https://doi.org/10.1371/journal.pone.0188753.g002',
                x: 155.74,
                y: 420.43,
                width: 152.77,
                height: 8,
                fontSize: 8,
              },
            ],
          },
        ],
      },
    });

    expect(regions[0].associatedText).toEqual([
      {
        text: 'Fig 2. Two particle desynchronization dynamics. Relative position dynamics (upper panel) and relative phase dynamics (lower panel) for a two particle system with high diversity.',
        relation: 'caption',
        x: 155.74,
        y: 385.9,
        width: 387.56,
        height: 17.53,
        blockIndex: 0,
      },
    ]);
  });

  it('merges full figure caption continuation lines within a bounded block', () => {
    const captionLines = [
      'Figure 2. State machine describing the major activities of Trace-',
      'Monkey and the conditions that cause transitions to a new activ-',
      'ity. In the dark box, TM executes JS as compiled traces. In the',
      'light gray boxes, TM executes JS in the standard interpreter. White',
      'boxes are overhead. Thus, to maximize performance, we need to',
      'maximize time spent in the darkest box and minimize time spent in',
      'the white boxes. The best case is a loop where the types at the loop',
      'edge are the same as the types on entry--then TM can stay in native',
      'code until the loop is done.',
    ];
    const expectedCaptionText = [
      'Figure 2. State machine describing the major activities of Trace-Monkey and the conditions that cause transitions to a new activ-ity.',
      'In the dark box, TM executes JS as compiled traces. In the light gray boxes, TM executes JS in the standard interpreter. White',
      'boxes are overhead. Thus, to maximize performance, we need to maximize time spent in the darkest box and minimize time spent in',
      'the white boxes. The best case is a loop where the types at the loop edge are the same as the types on entry--then TM can stay in native',
      'code until the loop is done.',
    ].join(' ');
    const regions = buildVisualRegions({
      pageWidth: 612,
      pageHeight: 792,
      imageBoxes: [],
      vectorBoxes: [{ x: 317, y: 90, width: 180, height: 145 }],
      layout: {
        blocks: [
          {
            text: captionLines.join('\n'),
            x: 318,
            y: 247,
            width: 190,
            height: 92,
            lines: captionLines.map((text, index) => ({
              text,
              x: 318,
              y: 247 + index * 10,
              width: index === 8 ? 120 : 188,
              height: 8.97,
              fontSize: 8.97,
            })),
          },
        ],
      },
    });

    expect(regions[0].associatedText).toEqual([
      {
        text: expectedCaptionText,
        relation: 'caption',
        x: 318,
        y: 247,
        width: 188,
        height: 88.97,
        blockIndex: 0,
      },
    ]);
  });

  it('prefers table captions over nearby figure captions for table regions', () => {
    const regions = buildVisualRegions({
      pageWidth: 420,
      pageHeight: 360,
      imageBoxes: [],
      layout: {
        blocks: [
          {
            text: 'Figure 5. A deeper residual function for ImageNet.',
            x: 52,
            y: 82,
            width: 220,
            height: 10,
            lines: [
              {
                text: 'Figure 5. A deeper residual function for ImageNet.',
                x: 52,
                y: 82,
                width: 220,
                height: 10,
                fontSize: 9,
              },
            ],
          },
          {
            text: 'Table 3. Error rates on ImageNet validation.',
            x: 52,
            y: 96,
            width: 210,
            height: 10,
            lines: [
              {
                text: 'Table 3. Error rates on ImageNet validation.',
                x: 52,
                y: 96,
                width: 210,
                height: 10,
                fontSize: 9,
              },
            ],
          },
        ],
        tables: [
          {
            x: 50,
            y: 112,
            width: 260,
            height: 90,
            rowCount: 6,
            columnCount: 5,
            rows: [],
          },
        ],
      },
    });

    expect(regions[0].associatedText).toEqual([
      {
        text: 'Table 3. Error rates on ImageNet validation.',
        relation: 'caption',
        x: 52,
        y: 96,
        width: 210,
        height: 10,
        blockIndex: 1,
      },
    ]);
  });

  it('uses table headings instead of first data rows as labels', () => {
    const regions = buildVisualRegions({
      pageWidth: 612,
      pageHeight: 792,
      imageBoxes: [],
      layout: {
        blocks: [
          {
            text: 'CONSOLIDATED STATEMENTS OF CASH FLOWS\n(In millions)',
            x: 210.94,
            y: 78.3,
            width: 190.34,
            height: 18.23,
            role: 'heading',
            level: 1,
            lines: [
              {
                text: 'CONSOLIDATED STATEMENTS OF CASH FLOWS',
                x: 210.94,
                y: 78.3,
                width: 190.34,
                height: 8.97,
                fontSize: 9,
              },
              {
                text: '(In millions)',
                x: 270,
                y: 87.56,
                width: 70,
                height: 8.97,
                fontSize: 9,
              },
            ],
          },
          {
            text: 'Cash, cash equivalents and restricted cash, beginning balances',
            x: 19.12,
            y: 133.43,
            width: 215.97,
            height: 7.65,
            lines: [
              {
                text: 'Cash, cash equivalents and restricted cash, beginning balances',
                x: 19.12,
                y: 133.43,
                width: 215.97,
                height: 7.65,
                fontSize: 8,
              },
            ],
          },
        ],
        tables: [
          {
            x: 18.22,
            y: 115.43,
            width: 575.77,
            height: 460,
            rowCount: 30,
            columnCount: 6,
            rows: [],
          },
        ],
      },
    });

    expect(regions[0].associatedText).toEqual([
      {
        text: 'CONSOLIDATED STATEMENTS OF CASH FLOWS (In millions)',
        relation: 'label',
        x: 210.94,
        y: 78.3,
        width: 190.34,
        height: 18.23,
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

  it('does not treat Japanese prose glued to figure numbers as captions', () => {
    const regions = buildVisualRegions({
      pageWidth: 400,
      pageHeight: 400,
      imageBoxes: [{ x: 80, y: 120, width: 220, height: 110 }],
      layout: {
        blocks: [
          {
            text: '図表 1-1-6ている。母子世帯の悩みの内訳',
            x: 90,
            y: 92,
            width: 220,
            height: 12,
            lines: [
              {
                text: '図表 1-1-6ている。母子世帯の悩みの内訳',
                x: 90,
                y: 92,
                width: 220,
                height: 12,
                fontSize: 10,
              },
            ],
          },
          {
            text: '表24-(1)-1悩みの内容について',
            x: 90,
            y: 106,
            width: 150,
            height: 12,
            lines: [
              {
                text: '表24-(1)-1悩みの内容について',
                x: 90,
                y: 106,
                width: 150,
                height: 12,
                fontSize: 10,
              },
            ],
          },
          {
            text: '表24-(1)-1 母子世帯の母が抱える子どもについての悩みの内訳',
            x: 90,
            y: 236,
            width: 250,
            height: 12,
            lines: [
              {
                text: '表24-(1)-1 母子世帯の母が抱える子どもについての悩みの内訳',
                x: 90,
                y: 236,
                width: 250,
                height: 12,
                fontSize: 10,
              },
            ],
          },
        ],
      },
    });

    expect(regions[0].associatedText).toEqual([
      {
        text: '表24-(1)-1 母子世帯の母が抱える子どもについての悩みの内訳',
        relation: 'caption',
        x: 90,
        y: 236,
        width: 250,
        height: 12,
        blockIndex: 2,
      },
    ]);
  });

  it('does not merge Japanese table header cells into a table caption', () => {
    const regions = buildVisualRegions({
      pageWidth: 600,
      pageHeight: 760,
      imageBoxes: [],
      vectorBoxes: Array.from({ length: 8 }, (_, index) => ({
        x: 80 + index * 45,
        y: 260,
        width: 36,
        height: 24,
      })),
      layout: {
        blocks: [
          {
            text: '表24-(1)-1 母子世帯の母が抱える子どもについての悩みの内訳\n進学 栄養 身のまわり',
            x: 80,
            y: 224,
            width: 360,
            height: 24,
            lines: [
              {
                text: '表24-(1)-1 母子世帯の母が抱える子どもについての悩みの内訳',
                x: 80,
                y: 224,
                width: 320,
                height: 10,
                fontSize: 9,
              },
              { text: '進学 栄養 身のまわり', x: 82, y: 236, width: 110, height: 10, fontSize: 9 },
            ],
          },
        ],
      },
    });

    expect(regions[0].associatedText).toEqual([
      {
        text: '表24-(1)-1 母子世帯の母が抱える子どもについての悩みの内訳',
        relation: 'caption',
        x: 80,
        y: 224,
        width: 320,
        height: 10,
        blockIndex: 0,
      },
    ]);
  });

  it('trims same-baseline Japanese table headers from table captions', () => {
    const regions = buildVisualRegions({
      pageWidth: 600,
      pageHeight: 760,
      imageBoxes: [],
      vectorBoxes: Array.from({ length: 8 }, (_, index) => ({
        x: 80 + index * 45,
        y: 260,
        width: 36,
        height: 24,
      })),
      layout: {
        blocks: [
          {
            text: '表24-(1)-1 母子世帯の母が抱える子どもについての悩みの内訳(最もあてはまるもの)進学\n栄養 身のまわり',
            x: 80,
            y: 224,
            width: 356.66,
            height: 10,
            lines: [
              {
                text: '表24-(1)-1 母子世帯の母が抱える子どもについての悩みの内訳(最もあてはまるもの)進学',
                x: 80,
                y: 224,
                width: 356.66,
                height: 8.42,
                fontSize: 8.28,
              },
              {
                text: '栄養 身のまわり',
                x: 340,
                y: 224.1,
                width: 59.61,
                height: 8.28,
                fontSize: 8.28,
              },
            ],
          },
        ],
      },
    });

    expect(regions[0].associatedText).toEqual([
      {
        text: '表24-(1)-1 母子世帯の母が抱える子どもについての悩みの内訳(最もあてはまるもの)',
        relation: 'caption',
        x: 80,
        y: 224,
        width: 356.66,
        height: 8.42,
        blockIndex: 0,
      },
    ]);
  });

  it('ignores bare or tiny figure references inside a visual region while keeping the real caption', () => {
    const regions = buildVisualRegions({
      pageWidth: 600,
      pageHeight: 500,
      imageBoxes: [],
      vectorBoxes: [{ x: 100, y: 100, width: 300, height: 200 }],
      layout: {
        blocks: [
          {
            text: 'Fig.4',
            x: 120,
            y: 150,
            width: 22,
            height: 8,
            lines: [{ text: 'Fig.4', x: 120, y: 150, width: 22, height: 8, fontSize: 8 }],
          },
          {
            text: 'Figure 1: Nested thumbnail caption',
            x: 120,
            y: 180,
            width: 110,
            height: 3,
            lines: [{ text: 'Figure 1: Nested thumbnail caption', x: 120, y: 180, width: 110, height: 3, fontSize: 3 }],
          },
          {
            text: 'Figure 1: The overview of the pipeline to collect the images with text.',
            x: 150,
            y: 280,
            width: 300,
            height: 12,
            lines: [
              {
                text: 'Figure 1: The overview of the pipeline to collect the images with text.',
                x: 150,
                y: 280,
                width: 300,
                height: 12,
                fontSize: 10,
              },
            ],
          },
        ],
      },
    });

    expect(regions[0].associatedText).toEqual([
      {
        text: 'Figure 1: The overview of the pipeline to collect the images with text.',
        relation: 'caption',
        x: 150,
        y: 280,
        width: 300,
        height: 12,
        blockIndex: 2,
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

  it('skips hidden form fields when building visual regions', () => {
    const regions = buildVisualRegions({
      pageWidth: 360,
      pageHeight: 140,
      imageBoxes: [],
      formFields: [
        { name: 'hiddenText', type: 'text', x: 54, y: 28, width: 150, height: 22, flags: ['hidden'] },
        { name: 'showButton', type: 'button', x: 251, y: 30, width: 72, height: 20, flags: ['print'] },
        { name: 'noViewText', type: 'text', x: 54, y: 77, width: 150, height: 22, flags: ['noView'] },
      ],
    });

    expect(regions).toEqual([
      {
        kind: 'form',
        x: 243,
        y: 22,
        width: 88,
        height: 36,
        areaRatio: 0.063,
        sourceCount: 1,
        sources: [{ type: 'formField', index: 1 }],
        reason: '1 interactive form fields in one page region',
      },
    ]);
  });

  it('suppresses page-sized vector backplanes around a single form field', () => {
    const regions = buildVisualRegions({
      pageWidth: 612,
      pageHeight: 792,
      imageBoxes: [],
      vectorBoxes: [{ x: 6.56, y: 22.81, width: 591.75, height: 729.75 }],
      formFields: [{ name: 'Text2', type: 'text', x: 21.71, y: 59.28, width: 150, height: 22, flags: ['print'] }],
    });

    expect(regions).toEqual([
      {
        kind: 'form',
        x: 13.71,
        y: 51.28,
        width: 166,
        height: 38,
        areaRatio: 0.013,
        sourceCount: 1,
        sources: [{ type: 'formField', index: 0 }],
        reason: '1 interactive form fields in one page region',
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
