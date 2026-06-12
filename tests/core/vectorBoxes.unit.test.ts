import { describe, expect, it } from 'vitest';
import type { ImageOps } from '../../src/core/imageBoxes.js';
import { buildVectorBoxes } from '../../src/core/vectorBoxes.js';

const OP = {
  save: 1,
  restore: 2,
  transform: 3,
  formBegin: 4,
  formEnd: 5,
  constructPath: 6,
  stroke: 10,
  clip: 11,
  paintImageXObjectRepeat: 20,
  paintImageMaskXObjectRepeat: 21,
  paintImageMaskXObjectGroup: 22,
  paintInlineImageXObjectGroup: 23,
} as const;

const ops: ImageOps = {
  save: OP.save,
  restore: OP.restore,
  transform: OP.transform,
  formBegin: OP.formBegin,
  formEnd: OP.formEnd,
  singleImageOps: new Set<number>(),
  constructPath: OP.constructPath,
  pathPaintOps: new Set<number>([OP.stroke]),
  vectorPaintOps: new Set<number>([OP.stroke]),
  paintImageXObjectRepeat: OP.paintImageXObjectRepeat,
  paintImageMaskXObjectRepeat: OP.paintImageMaskXObjectRepeat,
  paintImageMaskXObjectGroup: OP.paintImageMaskXObjectGroup,
  paintInlineImageXObjectGroup: OP.paintInlineImageXObjectGroup,
};

const PAGE_HEIGHT = 792;

describe('buildVectorBoxes', () => {
  it('emits painted path bboxes in top-left coordinates', () => {
    const boxes = buildVectorBoxes(
      [OP.save, OP.transform, OP.constructPath, OP.restore],
      [[], [2, 0, 0, 3, 100, 200], [OP.stroke, [], new Float32Array([0, 0, 10, 20])], []],
      ops,
      PAGE_HEIGHT,
      0,
      0,
    );

    expect(boxes).toEqual([{ x: 100, y: 532, width: 20, height: 60 }]);
  });

  it('ignores non-paint path operations and missing bboxes', () => {
    const boxes = buildVectorBoxes(
      [OP.constructPath, OP.constructPath],
      [
        [OP.clip, [], new Float32Array([0, 0, 10, 10])],
        [OP.stroke, [], null],
      ],
      ops,
      PAGE_HEIGHT,
      0,
      0,
    );

    expect(boxes).toEqual([]);
  });

  it('inflates horizontal and vertical stroke bboxes so they can feed render regions', () => {
    const boxes = buildVectorBoxes(
      [OP.constructPath, OP.constructPath, OP.constructPath],
      [
        [OP.stroke, [], [10, 20, 30, 20]],
        [OP.stroke, [], [40, 50, 40, 80]],
        [OP.stroke, [], [50, 100, 70, 100.001]],
      ],
      ops,
      PAGE_HEIGHT,
      0,
      0,
    );

    expect(boxes).toEqual([
      { x: 10, y: 771.75, width: 20, height: 0.5 },
      { x: 39.75, y: 712, width: 0.5, height: 30 },
      { x: 50, y: 691.75, width: 20, height: 0.5 },
    ]);
  });

  it('applies Form XObject matrices before converting bboxes', () => {
    const boxes = buildVectorBoxes(
      [OP.formBegin, OP.constructPath, OP.formEnd],
      [
        [
          [10, 0, 0, 10, 50, 60],
          [0, 0, 1, 1],
        ],
        [OP.stroke, [], [0, 0, 2, 3]],
        [],
      ],
      ops,
      PAGE_HEIGHT,
      0,
      0,
    );

    expect(boxes).toEqual([{ x: 50, y: 702, width: 20, height: 30 }]);
  });

  it('ignores malformed transform matrices instead of poisoning later boxes', () => {
    const boxes = buildVectorBoxes(
      [OP.transform, OP.transform, OP.constructPath],
      [
        [2, 0, 0, 2, 100, 100],
        [Number.NaN, 0, 0, 1, 10, 10],
        [OP.stroke, [], [0, 0, 10, 10]],
      ],
      ops,
      PAGE_HEIGHT,
      0,
      0,
    );

    expect(boxes).toEqual([{ x: 100, y: 672, width: 20, height: 20 }]);
  });
});
