import { describe, expect, it } from 'vitest';
import { detectPageWarnings } from '../../../src/core/warnings/index.js';
import { warningInputsInPhysicalPoints } from '../../../src/core/warnings/physicalGeometry.js';
import type { LayoutBlock, PageResult, TextSpan } from '../../../src/types/index.js';

function page(overrides: Partial<PageResult> = {}): PageResult {
  return {
    page: 1,
    text: '',
    charCount: 0,
    imageCount: 0,
    vectorCount: 0,
    textCoverage: 0,
    nonPrintableRatio: 0,
    nonPrintableCount: 0,
    width: 612,
    height: 792,
    quality: { nativeTextStatus: 'ok' },
    ...overrides,
  };
}

function block(x: number, y: number, width: number, height: number): LayoutBlock {
  return { text: 'closing body text', x, y, width, height, lines: [] };
}

function span(x: number, y: number, width: number, height: number, fontSize: number): TextSpan {
  return { text: 'unterminated native text', x, y, width, height, fontSize };
}

describe('warning UserUnit normalization', () => {
  it('scales every absolute geometry collection consumed by warning detectors without mutating output', () => {
    const source = page({
      userUnit: 2,
      width: 306,
      height: 396,
      spans: [span(10, 20, 30, 5, 5)],
      layout: {
        blocks: [
          {
            ...block(25, 350, 250, 40),
            lines: [{ text: 'line', x: 25, y: 350, width: 100, height: 5, fontSize: 5 }],
          },
        ],
      },
      imageBoxes: [{ x: 1, y: 2, width: 3, height: 4 }],
      vectorBoxes: [{ x: 5, y: 6, width: 7, height: 8 }],
      formFields: [
        {
          name: 'field',
          type: 'text',
          x: 9,
          y: 10,
          width: 11,
          height: 12,
          label: { text: 'Field label', relation: 'left', x: 1, y: 2, width: 3, height: 4 },
        },
      ],
    });
    const context = {
      spans: [span(2, 3, 4, 5, 6)],
      imageBoxes: [{ x: 3, y: 4, width: 5, height: 6 }],
      vectorBoxes: [{ x: 4, y: 5, width: 6, height: 7 }],
      opaqueFillText: {
        textRuns: ['secret'],
        fills: [{ x: 5, y: 6, width: 7, height: 8, precedingTextRunCount: 1 }],
      },
    };

    const physical = warningInputsInPhysicalPoints(source, context);
    expect(physical.page).toMatchObject({ width: 612, height: 792 });
    expect(physical.page.spans?.[0]).toMatchObject({ x: 20, y: 40, width: 60, height: 10, fontSize: 10 });
    expect(physical.page.layout?.blocks[0]).toMatchObject({ x: 50, y: 700, width: 500, height: 80 });
    expect(physical.page.layout?.blocks[0].lines[0]).toMatchObject({
      x: 50,
      y: 700,
      width: 200,
      height: 10,
      fontSize: 10,
    });
    expect(physical.page.imageBoxes?.[0]).toEqual({ x: 2, y: 4, width: 6, height: 8 });
    expect(physical.page.vectorBoxes?.[0]).toEqual({ x: 10, y: 12, width: 14, height: 16 });
    expect(physical.page.formFields?.[0]).toMatchObject({
      x: 18,
      y: 20,
      width: 22,
      height: 24,
      label: { x: 2, y: 4, width: 6, height: 8 },
    });
    expect(physical.context.spans?.[0]).toMatchObject({ x: 4, y: 6, width: 8, height: 10, fontSize: 12 });
    expect(physical.context.imageBoxes?.[0]).toEqual({ x: 6, y: 8, width: 10, height: 12 });
    expect(physical.context.vectorBoxes?.[0]).toEqual({ x: 8, y: 10, width: 12, height: 14 });
    expect(physical.context.opaqueFillText?.fills[0]).toEqual({
      x: 10,
      y: 12,
      width: 14,
      height: 16,
      precedingTextRunCount: 1,
    });
    expect(source.width).toBe(306);
    expect(source.spans?.[0].x).toBe(10);
  });

  it('keeps direct layout warning thresholds and point messages physically equivalent', () => {
    const defaultUnit = detectPageWarnings(page({ layout: { blocks: [block(50, 700, 500, 80)] } }));
    const doubleUnit = detectPageWarnings(
      page({
        userUnit: 2,
        width: 306,
        height: 396,
        layout: { blocks: [block(25, 350, 250, 40)] },
      }),
    );

    expect(doubleUnit).toEqual(defaultUnit);
    expect(doubleUnit).toContainEqual(
      expect.objectContaining({
        code: 'near_bottom_edge',
        blockIndex: 0,
        message: expect.stringContaining('12.0pt above the page bottom'),
      }),
    );
  });

  it('scales context-only spans and opaque-fill evidence before every detector', () => {
    const defaultSpan = span(545, 100, 70, 10, 10);
    const scaledSpan = span(272.5, 50, 35, 5, 5);
    const defaultContext = {
      spans: [defaultSpan],
      opaqueFillText: {
        textRuns: [defaultSpan.text],
        fills: [{ x: 545, y: 100, width: 70, height: 10, precedingTextRunCount: 1 }],
      },
    };
    const scaledContext = {
      spans: [scaledSpan],
      opaqueFillText: {
        textRuns: [scaledSpan.text],
        fills: [{ x: 272.5, y: 50, width: 35, height: 5, precedingTextRunCount: 1 }],
      },
    };

    const defaultUnit = detectPageWarnings(page({ text: defaultSpan.text }), defaultContext);
    const doubleUnit = detectPageWarnings(
      page({ text: scaledSpan.text, width: 306, height: 396, userUnit: 2 }),
      scaledContext,
    );

    expect(doubleUnit).toEqual(defaultUnit);
    expect(doubleUnit.map((warning) => warning.code)).toEqual(['page_edge_text_truncated', 'text_under_opaque_fill']);
  });
});
