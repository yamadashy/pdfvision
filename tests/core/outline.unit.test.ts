import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it, vi } from 'vitest';
import { buildOutline } from '../../src/core/outline.js';

describe('buildOutline', () => {
  it('maps nested URL and destination outline nodes and resolves destination pages', async () => {
    const pageRef = { num: 42, gen: 0 };
    const doc = {
      getDestination: vi.fn(async (name: string) => (name === 'intro' ? [pageRef, { name: 'XYZ' }, 0, 0, 0] : null)),
      getPageIndex: vi.fn(async (ref: unknown) => (ref === pageRef ? 2 : 0)),
    } as unknown as PDFDocumentProxy;

    const outline = await buildOutline(
      [
        {
          title: 'Ｉｎｔｒｏ',
          dest: 'intro',
          items: [{ title: 'Website', url: 'https://example.com' }],
        },
        {
          title: 'Explicit',
          dest: [1, { name: 'Fit' }],
        },
      ],
      doc,
      { normalizeText: (value) => value.normalize('NFKC') },
    );

    expect(outline).toEqual([
      {
        title: 'Intro',
        type: 'destination',
        target: 'intro',
        page: 3,
        items: [{ title: 'Website', type: 'url', target: 'https://example.com' }],
      },
      {
        title: 'Explicit',
        type: 'destination',
        target: '[1,{"name":"Fit"}]',
        page: 2,
      },
    ]);
  });

  it('returns an empty array when no outline exists', async () => {
    const doc = {} as PDFDocumentProxy;
    await expect(buildOutline(null, doc)).resolves.toEqual([]);
  });

  it('keeps destination targets even when the destination page cannot be resolved', async () => {
    const doc = {
      getDestination: vi.fn(async () => null),
    } as unknown as PDFDocumentProxy;

    const outline = await buildOutline([{ title: 'Missing target', dest: 'missing' }], doc);

    expect(outline).toEqual([{ title: 'Missing target', type: 'destination', target: 'missing' }]);
  });

  it('promotes children of invalid empty-title grouping nodes', async () => {
    const doc = {} as PDFDocumentProxy;

    const outline = await buildOutline([{ title: '', items: [{ title: 'Child', url: 'https://example.com' }] }], doc);

    expect(outline).toEqual([{ title: 'Child', type: 'url', target: 'https://example.com' }]);
  });
});
