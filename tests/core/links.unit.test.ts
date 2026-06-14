import { describe, expect, it, vi } from 'vitest';
import { buildLinks } from '../../src/core/links.js';

describe('buildLinks', () => {
  it('extracts URL and destination link annotations with top-left bboxes', async () => {
    const links = await buildLinks(
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
      0,
      0,
      {
        resolveDestinationPage: (target) => (target === 'cite.transformer' ? 7 : undefined),
      },
    );

    expect(links).toEqual([
      { type: 'url', target: 'https://example.com/paper', x: 100, y: 72, width: 60, height: 20 },
      { type: 'destination', target: 'cite.transformer', page: 7, x: 40, y: 180, width: 40, height: 12 },
    ]);
  });

  it('falls back to unsafeUrl and preserves array destinations', async () => {
    const links = await buildLinks(
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

  it('caches resolved destination pages within one page', async () => {
    const resolveDestinationPage = vi.fn(async () => 5);
    const links = await buildLinks(
      [
        { subtype: 'Link', dest: 'section.1', rect: [10, 80, 40, 100] },
        { subtype: 'Link', dest: 'section.1', rect: [50, 80, 80, 100] },
      ],
      120,
      0,
      0,
      { resolveDestinationPage },
    );

    expect(resolveDestinationPage).toHaveBeenCalledOnce();
    expect(links).toEqual([
      { type: 'destination', target: 'section.1', page: 5, x: 10, y: 20, width: 30, height: 20 },
      { type: 'destination', target: 'section.1', page: 5, x: 50, y: 20, width: 30, height: 20 },
    ]);
  });

  it('attaches visible text inside the link rectangle when label lines are available', async () => {
    const links = await buildLinks([{ subtype: 'Link', dest: 'page.2', rect: [93, 684.6, 136.2, 710.4] }], 792, 0, 0, {
      resolveDestinationPage: () => 2,
      labelLines: [{ text: 'Hello', x: 100.5, y: 87, width: 26.48, height: 12 }],
    });

    expect(links).toEqual([
      { type: 'destination', target: 'page.2', page: 2, text: 'Hello', x: 93, y: 81.6, width: 43.2, height: 25.8 },
    ]);
  });

  it('ignores link annotations with non-finite rect coordinates', async () => {
    const links = await buildLinks(
      [
        { subtype: 'Link', url: 'https://bad.example', rect: [10, 10, Number.NaN, 20] },
        { subtype: 'Link', url: 'https://good.example', rect: [10, 10, 20, 20] },
      ],
      100,
    );

    expect(links).toEqual([{ type: 'url', target: 'https://good.example', x: 10, y: 80, width: 10, height: 10 }]);
  });

  it('rejects invalid page geometry parameters before coordinate conversion', async () => {
    await expect(buildLinks([], Number.NaN)).rejects.toThrow(/pageHeight/);
    await expect(buildLinks([], 0)).rejects.toThrow(/pageHeight/);
    await expect(buildLinks([], 100, Number.NEGATIVE_INFINITY)).rejects.toThrow(/viewMinX and viewMinY/);
    await expect(buildLinks([], 100, 0, Number.NaN)).rejects.toThrow(/viewMinX and viewMinY/);
  });
});
