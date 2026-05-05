import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { processDocument, processFile } from '../../src/core/processor.js';

const SAMPLE_PDF = resolve(__dirname, '../fixtures/sample.pdf');
const SAMPLE_JA_PDF = resolve(__dirname, '../fixtures/sample-ja.pdf');

describe('processDocument', () => {
  it('returns a structured DocumentResult, no JSON parsing required', async () => {
    const result = await processDocument(SAMPLE_PDF, { noCache: true });

    // Compile-time + runtime: caller can hit fields directly without parse.
    expect(result.file).toBe(SAMPLE_PDF);
    expect(result.totalPages).toBe(1);
    expect(result.metadata).toMatchObject({
      title: null,
      author: null,
      subject: null,
      creator: null,
    });
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].text).toContain('Hello pdfvision');
  });

  it('accepts no options (all defaults)', async () => {
    const result = await processDocument(SAMPLE_PDF);
    expect(result.totalPages).toBe(1);
  });

  it('honours pages selector', async () => {
    const result = await processDocument(SAMPLE_JA_PDF, { pages: '2-3', noCache: true });
    expect(result.pages.map((p) => p.page)).toEqual([2, 3]);
  });

  it('returns image paths when render is enabled', async () => {
    const result = await processDocument(SAMPLE_PDF, {
      render: true,
      noCache: true,
    });
    expect(result.pages[0].image).toBeTypeOf('string');
    expect(existsSync(result.pages[0].image as string)).toBe(true);
  });

  it('produces the same DocumentResult that processFile then JSON.parse would', async () => {
    // Same content under both APIs is the contract.
    const direct = await processDocument(SAMPLE_PDF, { noCache: true });
    const formatted = await processFile(SAMPLE_PDF, {
      format: 'json',
      noCache: true,
    });
    expect(JSON.parse(formatted)).toEqual(direct);
  });

  it('rejects invalid pages with a thrown Error', async () => {
    await expect(processDocument(SAMPLE_PDF, { pages: 'abc', noCache: true })).rejects.toThrow(/positive integer/);
  });

  it('is reachable through the package public entrypoint', async () => {
    // Guard against accidentally breaking the index.ts re-export of the
    // new API. Library consumers will hit `import { processDocument } from
    // 'pdfvision'`, so the public path needs its own test.
    const pkg = await import('../../src/index.js');
    expect(typeof pkg.processDocument).toBe('function');
    const result = await pkg.processDocument(SAMPLE_PDF, { noCache: true });
    expect(result.totalPages).toBe(1);
  });
});
