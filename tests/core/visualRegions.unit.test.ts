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

  it('keeps side chrome when it is the only visual evidence', () => {
    const regions = buildVisualRegions({
      pageWidth: 600,
      pageHeight: 800,
      imageBoxes: [{ x: 0, y: 120, width: 36, height: 420 }],
      vectorBoxes: [{ x: 2, y: 122, width: 30, height: 416 }],
    });

    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({
      kind: 'mixed',
      x: 0,
      y: 112,
      width: 44,
      height: 436,
      sourceCount: 2,
    });
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
