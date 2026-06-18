import { describe, expect, it } from 'vitest';
import type { ImageOps } from '../../src/core/imageBoxes.js';
import { countVectorPaintOps } from '../../src/core/vectorOps.js';

const OP = {
  constructPath: 1,
  stroke: 2,
  fill: 3,
  endPath: 4,
  clip: 5,
  shadingFill: 6,
  rawFillPath: 7,
  setFillRGBColor: 8,
} as const;

const ops: ImageOps = {
  save: 10,
  restore: 11,
  transform: 12,
  formBegin: 13,
  formEnd: 14,
  setFillColorN: 15,
  fillColorOps: new Set<number>([15, OP.setFillRGBColor]),
  singleImageOps: new Set<number>(),
  constructPath: OP.constructPath,
  pathPaintOps: new Set<number>([OP.stroke, OP.fill]),
  pathFillOps: new Set<number>([OP.fill]),
  vectorPaintOps: new Set<number>([OP.shadingFill, OP.rawFillPath]),
  shadingFill: OP.shadingFill,
  paintImageXObjectRepeat: 20,
  paintImageMaskXObjectRepeat: 21,
  paintImageMaskXObjectGroup: 22,
  paintInlineImageXObjectGroup: 23,
};

describe('countVectorPaintOps', () => {
  it('counts painted constructPath operations and direct vector paint ops', () => {
    const fnArray = [OP.constructPath, OP.constructPath, OP.constructPath, OP.shadingFill, OP.rawFillPath];
    const argsArray: unknown[][] = [
      [OP.stroke, [0, 0, 10, 10], [0, 0, 10, 10]],
      [OP.endPath, [0, 0, 10, 10], [0, 0, 10, 10]],
      [OP.clip, [0, 0, 10, 10], [0, 0, 10, 10]],
      [],
      [],
    ];
    expect(countVectorPaintOps(fnArray, argsArray, ops)).toBe(3);
  });

  it('does not count empty constructPath paint operations', () => {
    const fnArray = [OP.constructPath, OP.constructPath, OP.constructPath];
    const argsArray: unknown[][] = [
      [OP.stroke, [null], null],
      [OP.fill, [null], undefined],
      [OP.stroke, [0, 0, 10, 10], [0, 0, 10, 10]],
    ];
    expect(countVectorPaintOps(fnArray, argsArray, ops)).toBe(1);
  });

  it('does not count white full-page fill backgrounds when page dimensions are available', () => {
    const fnArray = [OP.setFillRGBColor, OP.constructPath, OP.constructPath];
    const argsArray: unknown[][] = [
      ['#ffffff'],
      [OP.fill, [0, 0, 612, 792], [0, 0, 612, 792]],
      [OP.fill, [10, 10, 20, 20], [10, 10, 20, 20]],
    ];

    expect(countVectorPaintOps(fnArray, argsArray, ops, 612, 792)).toBe(1);
    expect(countVectorPaintOps(fnArray, argsArray, ops)).toBe(2);
  });
});
