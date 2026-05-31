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
} as const;

const ops: ImageOps = {
  save: 10,
  restore: 11,
  transform: 12,
  formBegin: 13,
  formEnd: 14,
  singleImageOps: new Set<number>(),
  constructPath: OP.constructPath,
  pathPaintOps: new Set<number>([OP.stroke, OP.fill]),
  vectorPaintOps: new Set<number>([OP.shadingFill, OP.rawFillPath]),
  paintImageXObjectRepeat: 20,
  paintImageMaskXObjectRepeat: 21,
  paintImageMaskXObjectGroup: 22,
  paintInlineImageXObjectGroup: 23,
};

describe('countVectorPaintOps', () => {
  it('counts painted constructPath operations and direct vector paint ops', () => {
    const fnArray = [OP.constructPath, OP.constructPath, OP.constructPath, OP.shadingFill, OP.rawFillPath];
    const argsArray: unknown[][] = [[OP.stroke], [OP.endPath], [OP.clip], [], []];
    expect(countVectorPaintOps(fnArray, argsArray, ops)).toBe(3);
  });
});
