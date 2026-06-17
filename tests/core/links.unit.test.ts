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

  it('clips inline text for narrow links inside a wider label line', async () => {
    const labelLine = {
      text: 'Appendix A: Descriptions of AI Actor Tasks from Figures 2 and 3',
      x: 90,
      y: 50,
      width: 334.57,
      height: 12,
    };
    const links = await buildLinks(
      [
        { subtype: 'Link', dest: 'figure.caption.2', rect: [386.36, 138, 394.33, 150] },
        { subtype: 'Link', dest: 'figure.caption.3', rect: [417.59, 138, 425.56, 150] },
      ],
      200,
      0,
      0,
      { labelLines: [labelLine] },
    );

    expect(links).toEqual([
      { type: 'destination', target: 'figure.caption.2', text: '2', x: 386.36, y: 50, width: 7.97, height: 12 },
      { type: 'destination', target: 'figure.caption.3', text: '3', x: 417.59, y: 50, width: 7.97, height: 12 },
    ]);
  });

  it('clips citation labels when a link sits near the center of a wider prose line', async () => {
    const labelLine = {
      text: 'cosine schedule (Loshchilov & Hutter, 2016). Initial hyper-',
      x: 307.44,
      y: 337.99,
      width: 235.66,
      height: 9.96,
    };
    const links = await buildLinks(
      [{ subtype: 'Link', dest: 'cite.loshchilov2016sgdr', rect: [374.57, 440.89, 458.83, 451.83] }],
      792,
      0,
      0,
      { labelLines: [labelLine] },
    );

    expect(links).toHaveLength(1);
    expect(links[0].text).toContain('Loshchilov');
    expect(links[0].text).not.toContain('cosine schedule');
    expect(links[0].text).not.toContain('Initial hyper');
  });

  it('does not expand narrow citation punctuation into a neighboring token', async () => {
    const links = await buildLinks(
      [
        { subtype: 'Link', dest: 'cite.JapaneseStableVLM', rect: [205.68, 756.71, 213.24, 768.46] },
        { subtype: 'Link', dest: 'cite.JapaneseStableVLM', rect: [129.68, 716.85, 137.02, 727.81] },
      ],
      841.89,
      0,
      0,
      {
        labelLines: [
          {
            text: 'data (Shing and Akiba, 2023a,b; Tanahashi et al.,',
            x: 70.87,
            y: 70.92,
            width: 219.63,
            height: 10.91,
          },
          {
            text: 'Akiba, 2023a,b; Tanahashi et al., 2023; Inoue et al.,',
            x: 70.47,
            y: 111.56,
            width: 220.03,
            height: 10.91,
          },
        ],
      },
    );

    expect(links).toEqual([
      { type: 'destination', target: 'cite.JapaneseStableVLM', x: 205.68, y: 73.43, width: 7.56, height: 11.75 },
      { type: 'destination', target: 'cite.JapaneseStableVLM', x: 129.68, y: 114.08, width: 7.34, height: 10.96 },
    ]);
  });

  it('truncates very long visible link text', async () => {
    const longText = 'Chapter '.repeat(60).trim();
    const links = await buildLinks(
      [{ subtype: 'Link', url: 'https://example.com', rect: [0, 0, 500, 500] }],
      600,
      0,
      0,
      {
        labelLines: [{ text: longText, x: 10, y: 110, width: 400, height: 12 }],
      },
    );

    expect(links[0].text?.length).toBe(240);
    expect(links[0].text?.endsWith('...')).toBe(true);
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
