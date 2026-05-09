import { describe, expect, it } from 'vitest';
import { buildImageBoxes, type ImageOps } from '../../src/core/imageBoxes.js';

// Use distinct integer ids so a synthetic op list reads cleanly when a
// test fails. The constants don't have to match the live pdf.js OPS
// values — buildImageBoxes only ever compares op codes against the
// fields of `ops`, so any disjoint set works.
const OP = {
  save: 1,
  restore: 2,
  transform: 3,
  formBegin: 4,
  formEnd: 5,
  paintImageXObject: 10,
  paintImageMaskXObject: 11,
  paintInlineImageXObject: 12,
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
  singleImageOps: new Set<number>([OP.paintImageXObject, OP.paintImageMaskXObject, OP.paintInlineImageXObject]),
  paintImageXObjectRepeat: OP.paintImageXObjectRepeat,
  paintImageMaskXObjectRepeat: OP.paintImageMaskXObjectRepeat,
  paintImageMaskXObjectGroup: OP.paintImageMaskXObjectGroup,
  paintInlineImageXObjectGroup: OP.paintInlineImageXObjectGroup,
};

// Page is a 612×792 portrait sheet with the canonical bottom-left origin
// at (0, 0). Convert to top-down by passing pageHeight=792, viewMinX=0,
// viewMinY=0 to the helper.
const PAGE_HEIGHT = 792;

describe('buildImageBoxes — single image draws', () => {
  it('emits one bbox at the unit square mapped through the current CTM', () => {
    // q 50 0 0 50 100 600 cm Do Q   →  50×50 at top-left (100, 142) in top-down coords
    // (PDF y=600 baseline + 50 height = 650 from bottom; 792-650 = 142)
    const fnArray = [OP.save, OP.transform, OP.paintImageXObject, OP.restore];
    const argsArray: unknown[][] = [[], [50, 0, 0, 50, 100, 600], ['img'], []];
    const boxes = buildImageBoxes(fnArray, argsArray, ops, PAGE_HEIGHT, 0, 0);
    expect(boxes).toEqual([{ x: 100, y: 142, width: 50, height: 50 }]);
  });

  it('falls back to the identity CTM after a restore', () => {
    // First image at (100, 100) under a 50×50 CTM, then a second image
    // at the page origin under the implicit identity. The identity bbox
    // ends up as a 1×1 sliver at the top-left — the assertion is mostly
    // that restore() really did pop, not that the second box is useful.
    const fnArray = [OP.save, OP.transform, OP.paintImageXObject, OP.restore, OP.paintImageXObject];
    const argsArray: unknown[][] = [[], [50, 0, 0, 50, 100, 100], ['a'], [], ['b']];
    const boxes = buildImageBoxes(fnArray, argsArray, ops, PAGE_HEIGHT, 0, 0);
    expect(boxes.length).toBe(2);
    expect(boxes[0]).toEqual({ x: 100, y: 642, width: 50, height: 50 });
    expect(boxes[1]).toEqual({ x: 0, y: 791, width: 1, height: 1 });
  });

  it('also recognises mask and inline single-instance image opcodes', () => {
    const fnArray = [
      OP.save,
      OP.transform,
      OP.paintImageMaskXObject,
      OP.restore,
      OP.save,
      OP.transform,
      OP.paintInlineImageXObject,
      OP.restore,
    ];
    const argsArray: unknown[][] = [[], [10, 0, 0, 10, 0, 0], [{}], [], [], [20, 0, 0, 20, 30, 30], [{}], []];
    const boxes = buildImageBoxes(fnArray, argsArray, ops, PAGE_HEIGHT, 0, 0);
    expect(boxes.length).toBe(2);
    expect(boxes[0].width).toBe(10);
    expect(boxes[1].width).toBe(20);
  });
});

describe('buildImageBoxes — multi-instance ops', () => {
  it('expands paintImageXObjectRepeat into one bbox per position', () => {
    // Args layout from pdf.js QueueOptimizer:
    //   [objId, scaleX, scaleY, positions]
    // Per instance the effective transform is [scaleX, 0, 0, scaleY, e, f].
    const positions = new Float32Array([100, 600, 200, 600, 100, 500, 200, 500]);
    const fnArray = [OP.paintImageXObjectRepeat];
    const argsArray: unknown[][] = [['img', 50, 50, positions]];
    const boxes = buildImageBoxes(fnArray, argsArray, ops, PAGE_HEIGHT, 0, 0);
    expect(boxes.length).toBe(4);
    expect(boxes).toEqual(
      expect.arrayContaining([
        { x: 100, y: 142, width: 50, height: 50 },
        { x: 200, y: 142, width: 50, height: 50 },
        { x: 100, y: 242, width: 50, height: 50 },
        { x: 200, y: 242, width: 50, height: 50 },
      ]),
    );
  });

  it('respects the surrounding CTM when expanding Repeat ops', () => {
    // The Repeat op's transform is right-multiplied into whatever CTM is
    // active at the time of the op. A leading `transform` that translates
    // by (10, 20) in PDF coords should shift every emitted bbox to match.
    const positions = new Float32Array([0, 0, 100, 0]);
    const fnArray = [OP.transform, OP.paintImageXObjectRepeat];
    const argsArray: unknown[][] = [
      [1, 0, 0, 1, 10, 20],
      ['img', 30, 30, positions],
    ];
    const boxes = buildImageBoxes(fnArray, argsArray, ops, PAGE_HEIGHT, 0, 0);
    expect(boxes.length).toBe(2);
    // PDF translation (10, 20) → top-down x = 10, y = pageHeight - (20 + 30) = 742
    expect(boxes[0]).toEqual({ x: 10, y: 742, width: 30, height: 30 });
    expect(boxes[1]).toEqual({ x: 110, y: 742, width: 30, height: 30 });
  });

  it('expands paintImageMaskXObjectRepeat using the [scaleX, skewX, skewY, scaleY] layout', () => {
    // pdf.js worker emits [img, scaleX, skewX, skewY, scaleY, positions].
    // The skew args differentiate this op from the regular Repeat (which
    // is [scaleX, scaleY] without skew slots).
    const positions = new Float32Array([100, 100, 300, 100]);
    const fnArray = [OP.paintImageMaskXObjectRepeat];
    const argsArray: unknown[][] = [[{}, 40, 0, 0, 40, positions]];
    const boxes = buildImageBoxes(fnArray, argsArray, ops, PAGE_HEIGHT, 0, 0);
    expect(boxes.length).toBe(2);
    expect(boxes[0]).toEqual({ x: 100, y: 652, width: 40, height: 40 });
    expect(boxes[1]).toEqual({ x: 300, y: 652, width: 40, height: 40 });
  });

  it('expands paintImageMaskXObjectGroup using each image transform', () => {
    const fnArray = [OP.paintImageMaskXObjectGroup];
    const argsArray: unknown[][] = [
      [
        [
          { transform: [25, 0, 0, 25, 50, 50] },
          { transform: [25, 0, 0, 25, 100, 50] },
          { transform: [25, 0, 0, 25, 150, 50] },
        ],
      ],
    ];
    const boxes = buildImageBoxes(fnArray, argsArray, ops, PAGE_HEIGHT, 0, 0);
    expect(boxes.length).toBe(3);
    expect(boxes.map((b) => b.x)).toEqual([50, 100, 150]);
    for (const box of boxes) {
      expect(box.width).toBe(25);
      expect(box.height).toBe(25);
    }
  });

  it('expands paintInlineImageXObjectGroup using each map entry transform', () => {
    const fnArray = [OP.paintInlineImageXObjectGroup];
    const argsArray: unknown[][] = [
      [
        { width: 1, height: 1 }, // imgData (unused for bbox)
        [
          { transform: [10, 0, 0, 10, 0, 0], x: 0, y: 0, w: 1, h: 1 },
          { transform: [10, 0, 0, 10, 50, 0], x: 0, y: 0, w: 1, h: 1 },
        ],
      ],
    ];
    const boxes = buildImageBoxes(fnArray, argsArray, ops, PAGE_HEIGHT, 0, 0);
    expect(boxes.length).toBe(2);
    expect(boxes[0].x).toBe(0);
    expect(boxes[1].x).toBe(50);
  });
});

describe('buildImageBoxes — Form XObjects', () => {
  it('treats paintFormXObjectBegin as a save plus a transform', () => {
    // Form XObject content drawn at unit-square coords inside the form;
    // the form is placed on the page at (200, 300) and scaled 60×60.
    // After the Begin op, drawing an image at the unit square should
    // therefore land at (200, 432) in top-down coords.
    const fnArray = [OP.formBegin, OP.paintImageXObject, OP.formEnd];
    const argsArray: unknown[][] = [
      [
        [60, 0, 0, 60, 200, 300],
        [0, 0, 1, 1],
      ], // [matrix, bbox]
      ['img'],
      [],
    ];
    const boxes = buildImageBoxes(fnArray, argsArray, ops, PAGE_HEIGHT, 0, 0);
    expect(boxes.length).toBe(1);
    expect(boxes[0]).toEqual({ x: 200, y: 432, width: 60, height: 60 });
  });

  it('pops the Form CTM at paintFormXObjectEnd so post-form draws use the outer CTM', () => {
    // Outer CTM scales 50×50 at (10, 10). Inside the form, an extra
    // transform shifts further; once we exit, a second image at the
    // unchanged outer CTM should still hit (10, ?, 50, 50).
    const fnArray = [OP.transform, OP.formBegin, OP.paintImageXObject, OP.formEnd, OP.paintImageXObject];
    const argsArray: unknown[][] = [
      [50, 0, 0, 50, 10, 10],
      [[1, 0, 0, 1, 0, 1], null], // form translates (0, 1) within the unit square
      ['img'],
      [],
      ['img'],
    ];
    const boxes = buildImageBoxes(fnArray, argsArray, ops, PAGE_HEIGHT, 0, 0);
    expect(boxes.length).toBe(2);
    // After the Form pop, the second image's CTM is back to the outer 50×50
    // at (10, 10), so its bbox sits at top-down (10, 732, 50, 50).
    expect(boxes[1]).toEqual({ x: 10, y: 732, width: 50, height: 50 });
  });

  it('skips a Form Begin with no matrix arg without crashing', () => {
    // Some PDFs emit `cm` ahead of the form and pass a null/undefined
    // matrix on the Begin op itself. The walker should still push/pop
    // the CTM stack rather than throwing.
    const fnArray = [OP.formBegin, OP.paintImageXObject, OP.formEnd];
    const argsArray: unknown[][] = [[null, null], ['img'], []];
    expect(() => buildImageBoxes(fnArray, argsArray, ops, PAGE_HEIGHT, 0, 0)).not.toThrow();
  });
});
