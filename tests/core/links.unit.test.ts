import { describe, expect, it } from 'vitest';
import { buildLinks } from '../../src/core/links.js';

describe('buildLinks', () => {
  it('extracts URL and destination link annotations with top-left bboxes', () => {
    const links = buildLinks(
      [
        {
          subtype: 'Link',
          url: 'https://example.com/paper',
          rect: [100, 700, 160, 720],
        },
        {
          subtype: 'Link',
          dest: 'cite.transformer',
          rect: [40, 600, 80, 612],
        },
        {
          subtype: 'Widget',
          url: 'https://ignored.example',
          rect: [0, 0, 10, 10],
        },
      ],
      792,
    );

    expect(links).toEqual([
      { type: 'url', target: 'https://example.com/paper', x: 100, y: 72, width: 60, height: 20 },
      { type: 'destination', target: 'cite.transformer', x: 40, y: 180, width: 40, height: 12 },
    ]);
  });

  it('falls back to unsafeUrl and preserves array destinations', () => {
    const links = buildLinks(
      [
        { subtype: 'Link', unsafeUrl: 'mailto:reader@example.com', rect: [10, 10, 20, 20] },
        { subtype: 'Link', dest: ['chapter', { name: 'XYZ' }], rect: [20, 30, 40, 50] },
      ],
      100,
    );

    expect(links).toEqual([
      { type: 'destination', target: ['chapter', { name: 'XYZ' }], x: 20, y: 50, width: 20, height: 20 },
      { type: 'url', target: 'mailto:reader@example.com', x: 10, y: 80, width: 10, height: 10 },
    ]);
  });

  it('ignores link annotations with non-finite rect coordinates', () => {
    const links = buildLinks(
      [
        { subtype: 'Link', url: 'https://bad.example', rect: [10, 10, Number.NaN, 20] },
        { subtype: 'Link', url: 'https://good.example', rect: [10, 10, 20, 20] },
      ],
      100,
    );

    expect(links).toEqual([{ type: 'url', target: 'https://good.example', x: 10, y: 80, width: 10, height: 10 }]);
  });
});
