import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { processDocument, processFile } from '../../src/core/processor.js';

const SAMPLE_PDF = resolve(__dirname, '../fixtures/sample.pdf');
const SAMPLE_JA_PDF = resolve(__dirname, '../fixtures/sample-ja.pdf');
const SAMPLE_WITH_IMAGE_PDF = resolve(__dirname, '../fixtures/sample-with-image.pdf');
const SAMPLE_TILED_PDF = resolve(__dirname, '../fixtures/sample-tiled.pdf');

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

  it('reports per-page density metadata so agents can spot image-only pages', async () => {
    const result = await processDocument(SAMPLE_PDF, { noCache: true });
    const page = result.pages[0];
    expect(page.charCount).toBe(page.text.length);
    expect(page.charCount).toBeGreaterThan(0);
    expect(page.imageCount).toBeGreaterThanOrEqual(0);
    expect(page.textCoverage).toBeGreaterThanOrEqual(0);
    expect(page.textCoverage).toBeLessThanOrEqual(1);
  });

  it('reports page dimensions in points so agents can reason about layout', async () => {
    // sample.pdf is US Letter (612 × 792 pt). Width / height let downstream
    // consumers map render coords / future bbox data back onto the page.
    const result = await processDocument(SAMPLE_PDF, { noCache: true });
    expect(result.pages[0].width).toBe(612);
    expect(result.pages[0].height).toBe(792);
  });

  it('omits the top-level overview field on single-page docs', async () => {
    // A 1-row overview is just noise — agents already see the per-page
    // signal on `pages[0]`. Skip it so the JSON / Markdown stay clean.
    const result = await processDocument(SAMPLE_PDF, { noCache: true });
    expect(result.overview).toBeUndefined();
  });

  it('emits a top-level overview summary on multi-page docs', async () => {
    // Mirrors the per-page density signals so agents reading top-down (LLM
    // chat / IDE preview) can spot outliers before walking pages[].
    const result = await processDocument(SAMPLE_JA_PDF, { noCache: true });
    expect(result.overview).toBeDefined();
    expect(result.overview).toHaveLength(result.pages.length);
    const first = (result.overview ?? [])[0];
    expect(first.page).toBe(result.pages[0].page);
    expect(first.charCount).toBe(result.pages[0].charCount);
    expect(first.width).toBe(result.pages[0].width);
  });

  it('counts embedded raster images in imageCount', async () => {
    // The fixture embeds the same tiny PNG twice. Without this assertion
    // the density signal could regress to "always 0" and the silent-failure
    // detection that motivates F1 would be useless on real-world PDFs.
    const result = await processDocument(SAMPLE_WITH_IMAGE_PDF, { noCache: true });
    expect(result.pages[0].imageCount).toBeGreaterThanOrEqual(2);
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

  it('writes rendered PNGs into a caller-supplied renderOutput directory', async () => {
    // Agent ergonomics: with renderOutput the PNGs should land directly in
    // the caller's chosen directory (created if missing) rather than tmp.
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join, dirname } = await import('node:path');
    const baseTmp = mkdtempSync(join(tmpdir(), 'pdfvision-render-output-test-'));
    const outDir = join(baseTmp, 'nested', 'images'); // not yet created
    try {
      const result = await processDocument(SAMPLE_PDF, {
        render: true,
        renderOutput: outDir,
        noCache: true,
      });
      const imagePath = result.pages[0].image as string;
      expect(imagePath).toBeTypeOf('string');
      expect(existsSync(imagePath)).toBe(true);
      // The PNG must be inside the requested directory, not anywhere else.
      expect(dirname(imagePath)).toBe(outDir);
    } finally {
      rmSync(baseTmp, { recursive: true, force: true });
    }
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

  it('drops the cache entry when a previously rendered image has gone missing', async () => {
    // Populate the rendered cache, then delete the PNG file out from under
    // it. The next call must detect the missing image, drop the stale
    // payload, and re-render instead of returning a path the caller can't
    // use. This exercises isUsableImage + the cache-eviction branch.
    //
    // Use SAMPLE_TILED_PDF rather than SAMPLE_PDF: SAMPLE_PDF's cache dir
    // is contended by the corruption / chmod tests in processor.test.ts
    // when those workers run in parallel under vitest, which can race
    // this test's renderPage atomicWrite and produce flaky ENOENT
    // failures on slower CI runners. SAMPLE_TILED_PDF's cache dir is
    // otherwise idle (every other reference uses noCache: true).
    const { unlinkSync } = await import('node:fs');
    const populated = await processDocument(SAMPLE_TILED_PDF, { render: true, noCache: false });
    const imagePath = populated.pages[0].image as string;
    expect(existsSync(imagePath)).toBe(true);
    unlinkSync(imagePath);

    const recovered = await processDocument(SAMPLE_TILED_PDF, { render: true, noCache: false });
    expect(recovered.pages[0].image).toBeTypeOf('string');
    expect(existsSync(recovered.pages[0].image as string)).toBe(true);
  });

  it('survives an unwriteable cache file when recovering from corruption', async () => {
    // Cache eviction during recovery must be best-effort: even if dropping
    // the corrupted entry fails (read-only mount, permission race, ...)
    // the call should still extract from source and return a valid result.
    const { writeFileSync, chmodSync, readdirSync } = await import('node:fs');
    const { getCacheDir } = await import('../../src/core/cache.js');

    // Populate cache, then corrupt it and lock the parent dir read-only
    // so dropCached's rmSync would normally throw.
    await processDocument(SAMPLE_PDF, { noCache: false });
    const cacheDir = getCacheDir(SAMPLE_PDF);
    const entries = readdirSync(cacheDir).filter((e) => e.startsWith('result_'));
    expect(entries.length).toBeGreaterThan(0);
    const target = resolve(cacheDir, entries[0]);
    writeFileSync(target, '{not valid json');

    if (process.platform !== 'win32') {
      // Make the cache dir read-only so unlink fails. Restore in finally.
      chmodSync(cacheDir, 0o500);
    }
    try {
      const result = await processDocument(SAMPLE_PDF, { noCache: false });
      expect(result.totalPages).toBe(1);
      expect(result.pages[0].text).toContain('Hello pdfvision');
    } finally {
      if (process.platform !== 'win32') {
        chmodSync(cacheDir, 0o700);
      }
    }
  });
});
