import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  collectOpaqueFillTextEvidence,
  type OpaqueFillTextEvidence,
  type OpaqueFillTextOps,
} from '../../../src/core/graphics/opaqueFillText.js';
import { processDocument } from '../../../src/core/processor.js';
import { detectPageWarnings } from '../../../src/core/warnings/index.js';
import { formatJson } from '../../../src/output/json.js';
import { formatMarkdown } from '../../../src/output/markdown.js';
import { formatToon } from '../../../src/output/toon.js';
import { formatXml } from '../../../src/output/xml.js';
import type { PageAnnotation, TextSpan } from '../../../src/types/index.js';
import { page } from './helpers.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SAMPLE_REDACTION_BYPASS_PDF = resolve(__dirname, '../../fixtures/sample-redaction-bypass.pdf');

const OP = {
  save: 1,
  restore: 2,
  transform: 3,
  formBegin: 4,
  formEnd: 5,
  setGState: 6,
  setFillRGBColor: 7,
  constructPath: 8,
  showText: 9,
  fill: 10,
  stroke: 11,
  beginAnnotation: 12,
  endAnnotation: 13,
  setFillTransparent: 14,
  eoFill: 15,
  beginGroup: 16,
  endGroup: 17,
  clip: 18,
  eoClip: 19,
  endPath: 20,
  beginMarkedContent: 21,
  beginMarkedContentProps: 22,
  endMarkedContent: 23,
} as const;

const ops: OpaqueFillTextOps = {
  save: OP.save,
  restore: OP.restore,
  transform: OP.transform,
  formBegin: OP.formBegin,
  formEnd: OP.formEnd,
  beginGroup: OP.beginGroup,
  endGroup: OP.endGroup,
  beginAnnotation: OP.beginAnnotation,
  endAnnotation: OP.endAnnotation,
  beginMarkedContent: OP.beginMarkedContent,
  beginMarkedContentProps: OP.beginMarkedContentProps,
  endMarkedContent: OP.endMarkedContent,
  setGState: OP.setGState,
  setFillTransparent: OP.setFillTransparent,
  constructPath: OP.constructPath,
  clipOps: new Set([OP.clip, OP.eoClip]),
  fillColorOps: new Set([OP.setFillRGBColor]),
  pathFillOps: new Set([OP.fill, OP.eoFill]),
  textShowOps: new Set([OP.showText]),
};

function glyphs(text: string): Array<{ unicode: string }> {
  return [...text].map((unicode) => ({ unicode }));
}

function path(paintOp: number, bbox: unknown): unknown[] {
  if (!Array.isArray(bbox) || bbox.length < 4) return [paintOp, [], bbox];
  const [x1, y1, x2, y2] = bbox;
  return [paintOp, [[0, x1, y1, 1, x2, y1, 1, x2, y2, 1, x1, y2, 4]], bbox];
}

function span(text: string, x = 10, y = 20, width = 100, height = 10): TextSpan {
  return { text, x, y, width, height, fontSize: 10 };
}

function evidence(textRuns: string[], fills: OpaqueFillTextEvidence['fills']): OpaqueFillTextEvidence {
  return { textRuns, fills };
}

function redact(extras: Partial<PageAnnotation> = {}): PageAnnotation {
  return { subtype: 'Redact', hasAppearance: true, x: 10, y: 20, width: 100, height: 10, ...extras };
}

describe('collectOpaqueFillTextEvidence', () => {
  it('collects a later dark opaque fill with text paint order', () => {
    const result = collectOpaqueFillTextEvidence(
      [OP.showText, OP.setFillRGBColor, OP.constructPath],
      [[glyphs('Employee SSN')], ['#000000'], path(OP.fill, [10, 170, 110, 180])],
      ops,
      200,
      0,
      0,
    );

    expect(result).toEqual({
      textRuns: ['Employee SSN'],
      fills: [{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 1 }],
    });
  });

  it('accepts three-digit dark colors and alpha exactly at the threshold', () => {
    const result = collectOpaqueFillTextEvidence(
      [OP.showText, OP.setFillRGBColor, OP.setGState, OP.constructPath],
      [[glyphs('Employee SSN')], ['#000'], [[['ca', 0.9]]], path(OP.fill, [10, 170, 110, 180])],
      ops,
      200,
      0,
      0,
    );

    expect(result?.fills).toHaveLength(1);
  });

  it('ignores an even-odd frame whose aggregate bbox surrounds readable text', () => {
    const outer = [0, 0, 0, 1, 120, 0, 1, 120, 40, 1, 0, 40, 4];
    const inner = [0, 10, 10, 1, 110, 10, 1, 110, 30, 1, 10, 30, 4];
    const result = collectOpaqueFillTextEvidence(
      [OP.showText, OP.constructPath],
      [[glyphs('Readable through hole')], [OP.eoFill, [[...outer, ...inner]], [0, 0, 120, 40]]],
      ops,
      200,
      0,
      0,
    );

    expect(result).toBeUndefined();
  });

  it('ignores a retraced path that visits fewer than all four bbox corners', () => {
    const result = collectOpaqueFillTextEvidence(
      [OP.showText, OP.constructPath],
      [
        [glyphs('Readable beside path')],
        [OP.fill, [[0, 10, 170, 1, 110, 170, 1, 10, 170, 1, 10, 180, 4]], [10, 170, 110, 180]],
      ],
      ops,
      200,
      0,
      0,
    );

    expect(result).toBeUndefined();
  });

  it('returns undefined when a fill is painted before text', () => {
    const result = collectOpaqueFillTextEvidence(
      [OP.constructPath, OP.showText],
      [path(OP.fill, [10, 170, 110, 180]), [glyphs('Visible later')]],
      ops,
      200,
      0,
      0,
    );

    expect(result).toBeUndefined();
  });

  it('retains text runs painted after the final candidate fill', () => {
    const result = collectOpaqueFillTextEvidence(
      [OP.showText, OP.showText, OP.constructPath, OP.showText],
      [
        [glyphs('Earlier text one')],
        [glyphs('Earlier text two')],
        path(OP.fill, [10, 170, 110, 180]),
        [glyphs('Visible later')],
      ],
      ops,
      200,
      0,
      0,
    );

    expect(result).toEqual({
      textRuns: ['Earlier text one', 'Earlier text two', 'Visible later'],
      fills: [{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 2 }],
    });
  });

  it('suppresses fills under an explicit clip and restores the unclipped state after restore', () => {
    const result = collectOpaqueFillTextEvidence(
      [OP.showText, OP.save, OP.clip, OP.constructPath, OP.constructPath, OP.restore, OP.constructPath],
      [
        [glyphs('Covered text')],
        [],
        [],
        path(OP.endPath, [150, 150, 160, 160]),
        path(OP.fill, [10, 170, 110, 180]),
        [],
        path(OP.fill, [10, 170, 110, 180]),
      ],
      ops,
      200,
      0,
      0,
    );

    expect(result?.fills).toEqual([{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 1 }]);
  });

  it('inherits clips through Form XObjects and restores a clip created inside a Form', () => {
    const result = collectOpaqueFillTextEvidence(
      [
        OP.showText,
        OP.save,
        OP.clip,
        OP.constructPath,
        OP.formBegin,
        OP.constructPath,
        OP.formEnd,
        OP.restore,
        OP.formBegin,
        OP.clip,
        OP.constructPath,
        OP.constructPath,
        OP.formEnd,
        OP.constructPath,
      ],
      [
        [glyphs('Covered text')],
        [],
        [],
        path(OP.endPath, [150, 150, 160, 160]),
        [[1, 0, 0, 1, 0, 0]],
        path(OP.fill, [10, 170, 110, 180]),
        [],
        [],
        [[1, 0, 0, 1, 0, 0]],
        [],
        path(OP.endPath, [150, 150, 160, 160]),
        path(OP.fill, [10, 150, 110, 160]),
        [],
        path(OP.fill, [10, 170, 110, 180]),
      ],
      ops,
      200,
      0,
      0,
    );

    expect(result?.fills).toEqual([{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 1 }]);
  });

  it('suppresses fills under a Form XObject bbox clip and restores the outer state', () => {
    const result = collectOpaqueFillTextEvidence(
      [OP.showText, OP.formBegin, OP.constructPath, OP.formEnd, OP.constructPath],
      [
        [glyphs('Covered text')],
        [
          [1, 0, 0, 1, 0, 0],
          [0, 0, 200, 200],
        ],
        path(OP.fill, [10, 170, 110, 180]),
        [],
        path(OP.fill, [10, 170, 110, 180]),
      ],
      ops,
      200,
      0,
      0,
    );

    expect(result?.fills).toEqual([{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 1 }]);
  });

  it.each([
    ['stroke-only path', [OP.showText, OP.constructPath], [[glyphs('Text')], path(OP.stroke, [10, 170, 110, 180])]],
    [
      'light fill',
      [OP.showText, OP.setFillRGBColor, OP.constructPath],
      [[glyphs('Text')], ['#eeeeee'], path(OP.fill, [10, 170, 110, 180])],
    ],
    [
      'unparseable fill color',
      [OP.showText, OP.setFillRGBColor, OP.constructPath],
      [[glyphs('Text')], ['rgb(0, 0, 0)'], path(OP.fill, [10, 170, 110, 180])],
    ],
    [
      'translucent fill',
      [OP.showText, OP.setGState, OP.constructPath],
      [[glyphs('Text')], [[['ca', 0.89]]], path(OP.fill, [10, 170, 110, 180])],
    ],
    ['missing bbox', [OP.showText, OP.constructPath], [[glyphs('Text')], path(OP.fill, undefined)]],
    ['degenerate bbox', [OP.showText, OP.constructPath], [[glyphs('Text')], path(OP.fill, [10, 170, 10, 180])]],
    ['invalid bbox', [OP.showText, OP.constructPath], [[glyphs('Text')], path(OP.fill, [10, 170, Number.NaN, 180])]],
  ])('ignores %s', (_name, fnArray, argsArray) => {
    expect(
      collectOpaqueFillTextEvidence(fnArray as number[], argsArray as unknown[][], ops, 200, 0, 0),
    ).toBeUndefined();
  });

  it('restores fill color and alpha across save/restore', () => {
    const result = collectOpaqueFillTextEvidence(
      [OP.showText, OP.save, OP.setFillRGBColor, OP.setGState, OP.restore, OP.constructPath],
      [[glyphs('Covered text')], [], ['#ffffff'], [[['ca', 0.2]]], [], path(OP.fill, [10, 170, 110, 180])],
      ops,
      200,
      0,
      0,
    );

    expect(result?.fills).toHaveLength(1);
  });

  it('rejects transparent fills and restores the outer fill state across save/restore', () => {
    const result = collectOpaqueFillTextEvidence(
      [OP.showText, OP.save, OP.setFillTransparent, OP.constructPath, OP.restore, OP.constructPath],
      [[glyphs('Covered text')], [], [], path(OP.fill, [10, 150, 110, 160]), [], path(OP.fill, [10, 170, 110, 180])],
      ops,
      200,
      0,
      0,
    );

    expect(result?.fills).toEqual([{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 1 }]);
  });

  it('ignores annotation-local text, fills, and graphics-state changes', () => {
    const result = collectOpaqueFillTextEvidence(
      [
        OP.showText,
        OP.beginAnnotation,
        OP.constructPath,
        OP.showText,
        OP.setFillRGBColor,
        OP.setGState,
        OP.endAnnotation,
        OP.constructPath,
      ],
      [
        [glyphs('Page content')],
        [],
        path(OP.fill, [0, 0, 300, 20]),
        [glyphs('Annotation-local text')],
        ['#ffffff'],
        [[['ca', 0.2]]],
        [],
        path(OP.fill, [10, 170, 110, 180]),
      ],
      ops,
      200,
      0,
      0,
    );

    expect(result).toEqual({
      textRuns: ['Page content'],
      fills: [{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 1 }],
    });
  });

  it.each([
    ['non-normal blend mode', 'multiply'],
    ['unparseable blend mode', { name: 'Normal' }],
  ])('ignores a dark opaque fill using %s', (_name, blendMode) => {
    const result = collectOpaqueFillTextEvidence(
      [OP.showText, OP.setGState, OP.constructPath],
      [[glyphs('Covered text')], [[['BM', blendMode]]], path(OP.fill, [10, 170, 110, 180])],
      ops,
      200,
      0,
      0,
    );

    expect(result).toBeUndefined();
  });

  it.each(['Normal', 'source-over'])('accepts the normal blend mode %s', (blendMode) => {
    const result = collectOpaqueFillTextEvidence(
      [OP.showText, OP.setGState, OP.constructPath],
      [[glyphs('Covered text')], [[['BM', blendMode]]], path(OP.fill, [10, 170, 110, 180])],
      ops,
      200,
      0,
      0,
    );

    expect(result?.fills).toHaveLength(1);
  });

  it('collects fills again after the blend mode returns to normal', () => {
    const result = collectOpaqueFillTextEvidence(
      [OP.showText, OP.setGState, OP.constructPath, OP.setGState, OP.constructPath],
      [
        [glyphs('Covered text')],
        [[['BM', 'multiply']]],
        path(OP.fill, [10, 150, 110, 160]),
        [[['BM', 'source-over']]],
        path(OP.fill, [10, 170, 110, 180]),
      ],
      ops,
      200,
      0,
      0,
    );

    expect(result?.fills).toEqual([{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 1 }]);
  });

  it('restores blend mode across save/restore', () => {
    const result = collectOpaqueFillTextEvidence(
      [OP.showText, OP.save, OP.setGState, OP.constructPath, OP.restore, OP.constructPath],
      [
        [glyphs('Covered text')],
        [],
        [[['BM', 'multiply']]],
        path(OP.fill, [10, 150, 110, 160]),
        [],
        path(OP.fill, [10, 170, 110, 180]),
      ],
      ops,
      200,
      0,
      0,
    );

    expect(result?.fills).toEqual([{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 1 }]);
  });

  it('inherits state and CTM in a Form XObject, then restores the outer state', () => {
    const result = collectOpaqueFillTextEvidence(
      [OP.showText, OP.setGState, OP.formBegin, OP.constructPath, OP.setFillRGBColor, OP.formEnd, OP.constructPath],
      [
        [glyphs('Covered text')],
        [[['ca', 0.95]]],
        [[1, 0, 0, 1, 20, 30]],
        path(OP.fill, [10, 150, 110, 160]),
        ['#ffffff'],
        [],
        path(OP.fill, [10, 170, 110, 180]),
      ],
      ops,
      200,
      0,
      0,
    );

    expect(result?.fills).toEqual([
      { x: 30, y: 10, width: 100, height: 10, precedingTextRunCount: 1 },
      { x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 1 },
    ]);
  });

  it('restores blend mode after a Form XObject', () => {
    const result = collectOpaqueFillTextEvidence(
      [OP.showText, OP.formBegin, OP.setGState, OP.constructPath, OP.formEnd, OP.constructPath],
      [
        [glyphs('Covered text')],
        [[1, 0, 0, 1, 20, 30]],
        [[['BM', 'multiply']]],
        path(OP.fill, [10, 150, 110, 160]),
        [],
        path(OP.fill, [10, 170, 110, 180]),
      ],
      ops,
      200,
      0,
      0,
    );

    expect(result?.fills).toEqual([{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 1 }]);
  });

  it('suppresses fills under an active soft mask through Form XObjects until the mask is cleared', () => {
    const result = collectOpaqueFillTextEvidence(
      [OP.showText, OP.setGState, OP.formBegin, OP.constructPath, OP.formEnd, OP.setGState, OP.constructPath],
      [
        [glyphs('Covered text')],
        [[['SMask', true]]],
        [[1, 0, 0, 1, 20, 30]],
        path(OP.fill, [10, 150, 110, 160]),
        [],
        [[['SMask', false]]],
        path(OP.fill, [10, 170, 110, 180]),
      ],
      ops,
      200,
      0,
      0,
    );

    expect(result?.fills).toEqual([{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 1 }]);
  });

  it('restores soft-mask state across save/restore', () => {
    const result = collectOpaqueFillTextEvidence(
      [OP.showText, OP.save, OP.setGState, OP.constructPath, OP.restore, OP.constructPath],
      [
        [glyphs('Covered text')],
        [],
        [[['SMask', true]]],
        path(OP.fill, [10, 150, 110, 160]),
        [],
        path(OP.fill, [10, 170, 110, 180]),
      ],
      ops,
      200,
      0,
      0,
    );

    expect(result?.fills).toEqual([{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 1 }]);
  });

  it('restores the outer soft-mask state after a Form XObject', () => {
    const result = collectOpaqueFillTextEvidence(
      [OP.showText, OP.formBegin, OP.setGState, OP.constructPath, OP.formEnd, OP.constructPath],
      [
        [glyphs('Covered text')],
        [[1, 0, 0, 1, 20, 30]],
        [[['SMask', true]]],
        path(OP.fill, [10, 150, 110, 160]),
        [],
        path(OP.fill, [10, 170, 110, 180]),
      ],
      ops,
      200,
      0,
      0,
    );

    expect(result?.fills).toEqual([{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 1 }]);
  });

  it('does not collect fills while pdf.js renders a soft-mask definition Form', () => {
    const result = collectOpaqueFillTextEvidence(
      [OP.showText, OP.beginGroup, OP.formBegin, OP.constructPath, OP.formEnd, OP.endGroup, OP.constructPath],
      [
        [glyphs('Covered text')],
        [{ smask: { subtype: 'Alpha' } }],
        [[1, 0, 0, 1, 20, 30]],
        path(OP.fill, [10, 150, 110, 160]),
        [],
        [],
        path(OP.fill, [10, 170, 110, 180]),
      ],
      ops,
      200,
      0,
      0,
    );

    expect(result?.fills).toEqual([{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 1 }]);
  });

  it('suppresses fills in nested transparency groups, retains text, and resumes after the outer group', () => {
    const result = collectOpaqueFillTextEvidence(
      [
        OP.beginGroup,
        OP.showText,
        OP.constructPath,
        OP.beginGroup,
        OP.constructPath,
        OP.endGroup,
        OP.constructPath,
        OP.endGroup,
        OP.constructPath,
      ],
      [
        [{}],
        [glyphs('Covered text')],
        path(OP.fill, [10, 140, 110, 150]),
        [{}],
        path(OP.fill, [10, 150, 110, 160]),
        [],
        path(OP.fill, [10, 160, 110, 170]),
        [],
        path(OP.fill, [10, 170, 110, 180]),
      ],
      ops,
      200,
      0,
      0,
    );

    expect(result).toEqual({
      textRuns: ['Covered text'],
      fills: [{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 1 }],
    });
  });

  it('suppresses a fill inside optional content', () => {
    const result = collectOpaqueFillTextEvidence(
      [OP.showText, OP.beginMarkedContentProps, OP.constructPath, OP.endMarkedContent],
      [[glyphs('Covered text')], ['OC', { id: 'hidden-layer' }], path(OP.fill, [10, 170, 110, 180]), []],
      ops,
      200,
      0,
      0,
    );

    expect(result).toBeUndefined();
  });

  it('keeps optional-content suppression through nested ordinary marked content and retains text runs', () => {
    const result = collectOpaqueFillTextEvidence(
      [
        OP.beginMarkedContentProps,
        OP.showText,
        OP.beginMarkedContent,
        OP.showText,
        OP.constructPath,
        OP.endMarkedContent,
        OP.constructPath,
        OP.endMarkedContent,
        OP.constructPath,
      ],
      [
        ['OC', { id: 'hidden-layer' }],
        [glyphs('Optional layer text')],
        ['Span'],
        [glyphs('Nested text')],
        path(OP.fill, [10, 140, 110, 150]),
        [],
        path(OP.fill, [10, 150, 110, 160]),
        [],
        path(OP.fill, [10, 170, 110, 180]),
      ],
      ops,
      200,
      0,
      0,
    );

    expect(result).toEqual({
      textRuns: ['Optional layer text', 'Nested text'],
      fills: [{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 2 }],
    });
  });

  it('resumes collecting fills after the matching optional-content end', () => {
    const result = collectOpaqueFillTextEvidence(
      [
        OP.showText,
        OP.beginMarkedContent,
        OP.beginMarkedContentProps,
        OP.constructPath,
        OP.endMarkedContent,
        OP.constructPath,
        OP.endMarkedContent,
      ],
      [
        [glyphs('Covered text')],
        ['P'],
        ['OC', { id: 'hidden-layer' }],
        path(OP.fill, [10, 150, 110, 160]),
        [],
        path(OP.fill, [10, 170, 110, 180]),
        [],
      ],
      ops,
      200,
      0,
      0,
    );

    expect(result?.fills).toEqual([{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 1 }]);
  });
});

describe('detectPageWarnings text_under_opaque_fill', () => {
  it('warns at the 90% coverage boundary', () => {
    const out = detectPageWarnings(page([]), {
      spans: [span('Employee SSN', 10, 20, 100, 10)],
      opaqueFillText: evidence(['Employee SSN'], [{ x: 10, y: 20, width: 90, height: 10, precedingTextRunCount: 1 }]),
    });

    expect(out).toContainEqual(
      expect.objectContaining({
        code: 'text_under_opaque_fill',
        severity: 'error',
        message: expect.stringContaining('1 extracted native text run is at least 90% covered'),
      }),
    );
  });

  it('does not warn below 90% coverage or for short text', () => {
    const below = detectPageWarnings(page([]), {
      spans: [span('Employee SSN')],
      opaqueFillText: evidence(['Employee SSN'], [{ x: 10, y: 20, width: 89.9, height: 10, precedingTextRunCount: 1 }]),
    });
    const short = detectPageWarnings(page([]), {
      spans: [span('ID')],
      opaqueFillText: evidence(['ID'], [{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 1 }]),
    });

    expect(below.map((warning) => warning.code)).not.toContain('text_under_opaque_fill');
    expect(short.map((warning) => warning.code)).not.toContain('text_under_opaque_fill');
  });

  it('does not warn when the dark background was painted before the text', () => {
    const out = detectPageWarnings(page([]), {
      spans: [span('Visible foreground')],
      opaqueFillText: evidence(
        ['Visible foreground'],
        [{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 0 }],
      ),
    });

    expect(out.map((warning) => warning.code)).not.toContain('text_under_opaque_fill');
  });

  it('matches duplicate text sequentially and respects fill order', () => {
    const out = detectPageWarnings(page([]), {
      spans: [span('DUPLICATE', 10, 20), span('DUPLICATE', 10, 50)],
      opaqueFillText: evidence(
        ['DUPLICATE', 'DUPLICATE'],
        [{ x: 10, y: 50, width: 100, height: 10, precedingTextRunCount: 1 }],
      ),
    });

    expect(out.map((warning) => warning.code)).not.toContain('text_under_opaque_fill');
  });

  it('does not warn when an identical foreground run is painted after the fill but deduped to one span', () => {
    const out = detectPageWarnings(page([]), {
      spans: [span('SECRET')],
      opaqueFillText: evidence(
        ['SECRET', 'SECRET'],
        [{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 1 }],
      ),
    });

    expect(out.map((warning) => warning.code)).not.toContain('text_under_opaque_fill');
  });

  it('does not treat a later substring-containing run as an identical foreground run', () => {
    const out = detectPageWarnings(page([]), {
      spans: [span('SECRET')],
      opaqueFillText: evidence(
        ['SECRET', 'SECRETARY'],
        [{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 1 }],
      ),
    });

    expect(out.map((warning) => warning.code)).toContain('text_under_opaque_fill');
  });

  it('matches a TextSpan formed from adjacent showText runs without reordering them', () => {
    const out = detectPageWarnings(page([]), {
      spans: [span('Employee SSN')],
      opaqueFillText: evidence(
        ['Employee', 'SSN'],
        [{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 2 }],
      ),
    });

    expect(out.map((warning) => warning.code)).toContain('text_under_opaque_fill');
  });

  it('does not reorder adjacent text runs to manufacture a match', () => {
    const out = detectPageWarnings(page([]), {
      spans: [span('Employee SSN')],
      opaqueFillText: evidence(
        ['SSN', 'Employee'],
        [{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 2 }],
      ),
    });

    expect(out.map((warning) => warning.code)).not.toContain('text_under_opaque_fill');
  });

  it('does not treat Redact metadata as proof of an opaque appearance', () => {
    const out = detectPageWarnings(page([]), {
      spans: [span('Employee SSN')],
      annotations: [redact()],
    });

    expect(out.map((warning) => warning.code)).not.toContain('text_under_opaque_fill');
  });

  it('suppresses fill evidence on raster-backed text layers', () => {
    const context = {
      spans: [span('Employee SSN')],
      opaqueFillText: evidence(['Employee SSN'], [{ x: 10, y: 20, width: 100, height: 10, precedingTextRunCount: 1 }]),
      rasterBackedTextLayer: true,
    };
    const out = detectPageWarnings(page([]), context);

    expect(out.map((warning) => warning.code)).not.toContain('text_under_opaque_fill');
  });
});

describe('text_under_opaque_fill integration', () => {
  it('surfaces the generated covered secret in every output format by default', async () => {
    const result = await processDocument(SAMPLE_REDACTION_BYPASS_PDF, { noCache: true });
    const warning = result.pages[0].warnings?.find((item) => item.code === 'text_under_opaque_fill');

    expect(result.pages[0].text).toContain('Employee SSN: 123-45-6789');
    expect(warning).toMatchObject({ severity: 'error' });
    expect(warning?.message).toContain('Employee SSN: 123-45-6789');
    for (const output of [formatJson(result), formatXml(result), formatToon(result), formatMarkdown(result)]) {
      expect(output).toContain('text_under_opaque_fill');
    }
  });
});
