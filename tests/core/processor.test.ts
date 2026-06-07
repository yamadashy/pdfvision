import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getCacheDir } from '../../src/core/cache.js';
import { processFile } from '../../src/core/processor.js';

const SAMPLE_PDF = resolve(__dirname, '../fixtures/sample.pdf');

describe('processFile', () => {
  it('extracts text as JSON', async () => {
    const result = await processFile(SAMPLE_PDF, {
      format: 'json',
      noCache: true,
    });
    const parsed = JSON.parse(result);
    expect(parsed.totalPages).toBe(1);
    expect(parsed.pages).toHaveLength(1);
    expect(parsed.pages[0].text).toContain('Hello pdfvision');
  });

  it('extracts text as markdown', async () => {
    // Guard the format='markdown' wiring through processFile so the CLI
    // path can't silently fall through to text on a typo in the switch.
    const result = await processFile(SAMPLE_PDF, {
      format: 'markdown',
      noCache: true,
    });
    expect(result).toMatch(/^# .*sample\.pdf/);
    expect(result).toMatch(/## Page 1/);
    expect(result).toContain('Hello pdfvision');
  });

  it('extracts text as TOON', async () => {
    // Guard the format='toon' wiring through processFile so a typo in the
    // dispatch switch can't silently fall through to markdown.
    const { decode } = await import('@toon-format/toon');
    const result = await processFile(SAMPLE_PDF, {
      format: 'toon',
      noCache: true,
    });
    const parsed = decode(result) as { totalPages: number; pages: { text: string }[] };
    expect(parsed.totalPages).toBe(1);
    expect(parsed.pages).toHaveLength(1);
    expect(parsed.pages[0].text).toContain('Hello pdfvision');
  });

  it('respects page range', async () => {
    const result = await processFile(SAMPLE_PDF, {
      pages: '1',
      format: 'json',
      noCache: true,
    });
    const parsed = JSON.parse(result);
    expect(parsed.pages).toHaveLength(1);
    expect(parsed.pages[0].page).toBe(1);
  });

  it('passes form-field extraction through to processDocument', async () => {
    const result = await processFile(SAMPLE_PDF, {
      format: 'json',
      formFields: true,
      noCache: true,
    });
    const parsed = JSON.parse(result);
    expect(parsed.pages[0].formFields).toEqual([]);
  });

  it('passes vector-box extraction through to processDocument', async () => {
    const result = await processFile(SAMPLE_PDF, {
      format: 'json',
      vectorBoxes: true,
      noCache: true,
    });
    const parsed = JSON.parse(result);
    expect(parsed.pages[0].vectorBoxes).toEqual([]);
  });

  it('renders pages even when cache is disabled', async () => {
    const result = await processFile(SAMPLE_PDF, {
      format: 'json',
      render: true,
      noCache: true,
    });
    const parsed = JSON.parse(result);
    expect(parsed.pages[0].image).toBeTypeOf('string');
    expect(existsSync(parsed.pages[0].image)).toBe(true);
  });

  it('rejects malicious page input even with cache enabled', async () => {
    // user-controlled `pages` must not be able to traverse outside the cache dir
    await expect(
      processFile(SAMPLE_PDF, {
        pages: '/../../../escape-attempt',
        format: 'json',
        noCache: false,
      }),
    ).rejects.toThrow();
  });

  it('recovers when the cache file is corrupted', async () => {
    // Populate cache, then corrupt it. processFile should drop the corrupt
    // entry and re-extract instead of bubbling a JSON parse error.
    await processFile(SAMPLE_PDF, { format: 'json', noCache: false });

    const cacheDir = getCacheDir(SAMPLE_PDF);
    const cacheFile = readFileSync(SAMPLE_PDF); // just to keep imports honest
    expect(cacheFile.length).toBeGreaterThan(0);

    // Find the cache file we just wrote and corrupt it.
    const { readdirSync } = await import('node:fs');
    const entries = readdirSync(cacheDir).filter((e) => e.startsWith('result_'));
    expect(entries.length).toBeGreaterThan(0);
    const target = resolve(cacheDir, entries[0]);
    writeFileSync(target, '{not valid json');

    const result = await processFile(SAMPLE_PDF, { format: 'json', noCache: false });
    const parsed = JSON.parse(result);
    expect(parsed.totalPages).toBe(1);
    expect(parsed.pages[0].text).toContain('Hello pdfvision');
  });

  it('reflects the current invocation path even on cache hit', async () => {
    // populate cache from the canonical fixture path
    await processFile(SAMPLE_PDF, { format: 'json', noCache: false });

    // copy the same bytes to a different path; cache should hit by content hash,
    // but the returned `file` must point at the new path, not the original.
    const copyPath = `${SAMPLE_PDF}.copy.pdf`;
    copyFileSync(SAMPLE_PDF, copyPath);
    try {
      const result = await processFile(copyPath, { format: 'json', noCache: false });
      const parsed = JSON.parse(result);
      expect(parsed.file).toBe(copyPath);
    } finally {
      rmSync(copyPath, { force: true });
    }
  });
});
