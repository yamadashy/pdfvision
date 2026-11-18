import { describe, expect, it } from 'vitest';
import {
  arrowTip,
  filledTriangle,
  isRingOutline,
  isSquareOutline,
  isTickStroke,
} from '../../src/core/graphics/shapeKinds.js';
import { addVectorShape, emptyShapeSet } from '../../src/core/graphics/vectorShapes.js';
import { circle, rectOutline, shape, stroked } from '../helpers/vectorShapes.js';

const frame = { pageHeight: 800, viewMinX: 0, viewMinY: 0 };

describe('addVectorShape', () => {
  it('keeps vertices in the page frame, drops curve control points and marks closed subpaths', () => {
    const set = emptyShapeSet();
    // moveTo (10,10) lineTo (20,10) curveTo (…, 20,20) closePath, under a 2× scale.
    addVectorShape(
      set,
      [new Float32Array([0, 10, 10, 1, 20, 10, 2, 25, 12, 25, 18, 20, 20, 4])],
      [2, 0, 0, 2, 0, 0],
      { stroke: '#ff0000', lineWidth: 1 },
      frame,
      0,
    );
    expect(set.shapes).toHaveLength(1);
    const [s] = set.shapes;
    expect(s.subpaths[0].points).toEqual([20, 780, 40, 780, 40, 760]);
    expect(s.subpaths[0].closed).toBe(true);
    expect(s.curves).toBe(1);
    expect(s.lineWidth).toBe(2);
    expect(s.stroke).toBe('#ff0000');
  });

  it('stops collecting once the page budget is spent and says so', () => {
    const set = emptyShapeSet();
    const path = [new Float32Array([0, 0, 0, 1, 1, 1])];
    for (let i = 0; i < 7000; i++)
      addVectorShape(set, path, [1, 0, 0, 1, 0, 0], { lineWidth: 1, fill: '#000000' }, frame, i);
    expect(set.truncated).toBe(true);
    expect(set.shapes.length).toBeLessThan(7000);
  });

  it('skips a path with more vertices than any mark needs', () => {
    const set = emptyShapeSet();
    const data = [0, 0, 0];
    for (let i = 1; i < 400; i++) data.push(1, i, i % 7);
    addVectorShape(set, [new Float32Array(data)], [1, 0, 0, 1, 0, 0], { lineWidth: 1, stroke: '#000000' }, frame, 0);
    expect(set.shapes).toHaveLength(0);
    expect(set.truncated).toBe(false);
  });
});

describe('shape kinds', () => {
  it('reads a stroked V with the longer arm rising right as a tick', () => {
    expect(
      isTickStroke(
        stroked([
          [329, 185],
          [333.5, 190.5],
          [342, 178],
        ]),
      ),
    ).toBe(true);
  });

  it('does not read an L corner, a single diagonal, a mirrored V or a closed triangle as a tick', () => {
    // L: down, then flat to the right.
    expect(
      isTickStroke(
        stroked([
          [0, 0],
          [0, 10],
          [10, 10],
        ]),
      ),
    ).toBe(false);
    expect(
      isTickStroke(
        stroked([
          [0, 10],
          [10, 0],
        ]),
      ),
    ).toBe(false);
    // Long arm on the left (a ∨ leaning the wrong way).
    expect(
      isTickStroke(
        stroked([
          [0, 0],
          [8, 12],
          [11, 8],
        ]),
      ),
    ).toBe(false);
    expect(
      isTickStroke(
        shape(
          [
            [
              [329, 185],
              [333.5, 190.5],
              [342, 178],
            ],
          ],
          { stroke: '#000000', closed: true },
        ),
      ),
    ).toBe(false);
  });

  it('tells a square outline and a ring from a filled box', () => {
    expect(isSquareOutline(rectOutline(10, 10, 9, 9), 4.5, 16)).toBe(true);
    expect(isSquareOutline(rectOutline(10, 10, 30, 9), 4.5, 16)).toBe(false);
    expect(isRingOutline(circle(20, 20, 4.2, { stroke: '#000000' }), 4.5, 16)).toBe(true);
    expect(isRingOutline(circle(20, 20, 4.2, { fill: '#000000' }), 4.5, 16)).toBe(false);
  });

  it('finds an arrowhead tip along the line it caps, and refuses a wedge set across it', () => {
    const head = filledTriangle(
      shape(
        [
          [
            [100, 50],
            [95, 47],
            [95, 53],
          ],
        ],
        { fill: '#333333' },
      ),
    );
    expect(head).toBeDefined();
    expect(arrowTip(head ?? [], { x: 1, y: 0 })?.apex).toEqual({ x: 100, y: 50 });
    expect(arrowTip(head ?? [], { x: 0, y: 1 })).toBeUndefined();
  });
});
