import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { processFile } from '../../src/core/processor.js';

// Built by scripts/build-test-fixtures.mjs from a Noto Sans JP TTF shipped
// via the @expo-google-fonts/noto-sans-jp devDep. Exercises Japanese text
// extraction, multi-page output, and metadata fields that the minimal
// hand-crafted sample.pdf can't cover.
const SAMPLE_JA_PDF = resolve(__dirname, '../fixtures/sample-ja.pdf');

describe('processFile (Japanese fixture)', () => {
  it('extracts Japanese text and metadata as JSON', async () => {
    const result = await processFile(SAMPLE_JA_PDF, {
      format: 'json',
      noCache: true,
    });
    const parsed = JSON.parse(result);

    expect(parsed.totalPages).toBe(3);
    expect(parsed.metadata.title).toBe('pdfvision テストフィクスチャ');
    expect(parsed.metadata.subject).toBe('日本語抽出と複数ページのテスト');
    expect(parsed.metadata.author).toBe('pdfvision build-fixtures');
    expect(parsed.metadata.creator).toBe('pdfvision');
  });

  it('returns one entry per page across multiple pages', async () => {
    const result = await processFile(SAMPLE_JA_PDF, {
      format: 'json',
      noCache: true,
    });
    const parsed = JSON.parse(result);

    expect(parsed.pages).toHaveLength(3);
    expect(parsed.pages[0].text).toContain('これは pdfvision のテスト用 PDF です。');
    expect(parsed.pages[1].text).toContain('カタカナ・ひらがな・漢字');
    expect(parsed.pages[2].text).toContain('最後のページです。');
  });

  it('respects --pages range on multi-page docs', async () => {
    const result = await processFile(SAMPLE_JA_PDF, {
      pages: '2-3',
      format: 'json',
      noCache: true,
    });
    const parsed = JSON.parse(result);

    expect(parsed.pages.map((p: { page: number }) => p.page)).toEqual([2, 3]);
  });

  it('renders Japanese pages to non-empty PNGs', async () => {
    const result = await processFile(SAMPLE_JA_PDF, {
      format: 'json',
      render: true,
      noCache: true,
      pages: '1',
    });
    const parsed = JSON.parse(result);

    expect(parsed.pages[0].image).toBeTypeOf('string');
    const { existsSync, statSync } = await import('node:fs');
    expect(existsSync(parsed.pages[0].image)).toBe(true);
    expect(statSync(parsed.pages[0].image).size).toBeGreaterThan(0);
  });
});
