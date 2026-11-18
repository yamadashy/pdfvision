import { describe, expect, it } from 'vitest';
import { chooseReadingFrame } from '../../../src/core/geometry/pageFrame.js';
import { detectPageWarnings } from '../../../src/core/warnings/index.js';
import { page } from './helpers.js';

// On a stored 200×300 page at /Rotate 90, `[1,0,0,1,…]` text is upright as
// stored and `[0,1,-1,0,…]` text is upright only after the rotation.
const STORED_UPRIGHT = [10, 0, 0, 10, 20, 280];
const DISPLAYED_UPRIGHT = [0, 10, -10, 0, 180, 20];

function items(stored: number, displayed: number) {
  return [
    ...Array.from({ length: stored }, () => ({ str: 'stored', transform: STORED_UPRIGHT })),
    ...Array.from({ length: displayed }, () => ({ str: 'turned', transform: DISPLAYED_UPRIGHT })),
  ];
}

function rotatedWarning(readUnrotated: { sidewaysTextShare: number }) {
  return detectPageWarnings({ ...page([], 200, 300), rotation: 90 }, { readUnrotated }).find(
    (warning) => warning.code === 'rotated_page_read_unrotated',
  );
}

describe('rotated_page_read_unrotated', () => {
  it('records how much text the stored frame leaves sideways', () => {
    const frame = chooseReadingFrame([0, 0, 200, 300], 90, items(6, 4));
    expect(frame.rotation).toBe(0);
    expect(frame.sidewaysTextShare).toBeCloseTo(0.4);
    expect(chooseReadingFrame([0, 0, 200, 300], 90, items(6, 0)).sidewaysTextShare).toBeUndefined();
  });

  it('tells the reader that text set the other way reads sideways, instead of calling the page clean', () => {
    const message = rotatedWarning({ sidewaysTextShare: 0.4 })?.message ?? '';
    expect(message).toContain('most of the text is upright');
    expect(message).toContain('40% of its characters are set the other way');
    expect(message).toContain('render the page and read that text from the image');
  });

  it('keeps the plain message when the text is all upright as stored', () => {
    const message = rotatedWarning({ sidewaysTextShare: 0 })?.message ?? '';
    expect(message).toContain('where the text is upright');
    expect(message).not.toContain('set the other way');
  });
});
