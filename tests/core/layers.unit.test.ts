import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it, vi } from 'vitest';
import { buildLayers } from '../../src/core/document/layers.js';

describe('buildLayers', () => {
  it('returns an empty group list when optional content config is missing', async () => {
    const doc = {
      getOptionalContentConfig: vi.fn(async () => null),
    } as unknown as PDFDocumentProxy;

    await expect(buildLayers(doc)).resolves.toEqual({ groups: [] });
  });

  it('returns an empty group list when optional content config is not iterable', async () => {
    const doc = {
      getOptionalContentConfig: vi.fn(async () => ({ name: 'Broken config' })),
    } as unknown as PDFDocumentProxy;

    await expect(buildLayers(doc)).resolves.toEqual({ groups: [] });
  });
});
