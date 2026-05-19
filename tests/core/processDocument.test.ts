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

  it('writes rendered PNGs into a per-PDF subdirectory of the caller-supplied renderOutput', async () => {
    // Agent ergonomics: with renderOutput the PNGs land under the caller's
    // chosen directory (created if missing) rather than tmp. They sit in a
    // per-PDF subdirectory (keyed by content fingerprint) so two different
    // PDFs sharing the same `--render-output ./images` never overwrite each
    // other — see the "keeps per-PDF rendered PNGs isolated" test below.
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join, dirname, relative } = await import('node:path');
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
      // The PNG sits one level below the requested dir (in a fingerprint
      // subdir), not anywhere outside it.
      const rel = relative(outDir, imagePath);
      expect(rel.startsWith('..')).toBe(false);
      expect(dirname(imagePath).startsWith(outDir)).toBe(true);
      expect(dirname(imagePath)).not.toBe(outDir);
    } finally {
      rmSync(baseTmp, { recursive: true, force: true });
    }
  });

  it('keeps per-PDF rendered PNGs isolated when two PDFs share the same renderOutput directory', async () => {
    // Regression: previously `renderer` always wrote `page-${n}.png` into the
    // caller-supplied renderOutput dir verbatim. Running two different PDFs
    // against the same `--render-output ./img` overwrote A's page-1.png with
    // B's bytes — and worse, `isReusableImage` then handed B's PNG back as
    // A's image on subsequent runs because the filename matched.
    //
    // Contract: distinct PDFs sharing a renderOutput directory MUST end up
    // with distinct on-disk PNG paths, and the first PDF's image bytes
    // MUST survive a subsequent render of the second PDF.
    const { mkdtempSync, rmSync, readFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { createHash } = await import('node:crypto');
    const baseTmp = mkdtempSync(join(tmpdir(), 'pdfvision-render-collision-test-'));
    const sharedOut = join(baseTmp, 'images');
    try {
      const a = await processDocument(SAMPLE_PDF, {
        render: true,
        renderOutput: sharedOut,
        noCache: true,
      });
      const aImagePath = a.pages[0].image as string;
      const aBytesBefore = createHash('sha256').update(readFileSync(aImagePath)).digest('hex');

      const b = await processDocument(SAMPLE_WITH_IMAGE_PDF, {
        render: true,
        renderOutput: sharedOut,
        noCache: true,
      });
      const bImagePath = b.pages[0].image as string;

      // Different PDFs must resolve to different on-disk paths under the
      // shared directory.
      expect(aImagePath).not.toBe(bImagePath);
      // A's PNG bytes must still match the original A render — they must
      // not have been silently replaced by B's render.
      const aBytesAfter = createHash('sha256').update(readFileSync(aImagePath)).digest('hex');
      expect(aBytesAfter).toBe(aBytesBefore);
    } finally {
      rmSync(baseTmp, { recursive: true, force: true });
    }
  });

  it('keeps cached image paths isolated when two PDFs share renderOutput across cache hits', async () => {
    // Complements the noCache regression test above with the cache-hit
    // half of the same bug: a stale cached `pages[].image` must continue
    // to point at the original PDF's fingerprint subdir even after a
    // different PDF has been rendered into the same renderOutput. Uses
    // an isolated PDFVISION_CACHE_DIR so this test never races the
    // shared cache root with other vitest workers.
    const { mkdtempSync, rmSync, readFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { createHash } = await import('node:crypto');
    const cacheRoot = mkdtempSync(join(tmpdir(), 'pdfvision-cache-isolation-test-'));
    const sharedOut = mkdtempSync(join(tmpdir(), 'pdfvision-render-isolation-test-'));
    const originalCache = process.env.PDFVISION_CACHE_DIR;
    process.env.PDFVISION_CACHE_DIR = cacheRoot;
    try {
      const a1 = await processDocument(SAMPLE_PDF, {
        render: true,
        renderOutput: sharedOut,
        noCache: false,
      });
      const aImagePath = a1.pages[0].image as string;
      const aBytesBefore = createHash('sha256').update(readFileSync(aImagePath)).digest('hex');

      await processDocument(SAMPLE_WITH_IMAGE_PDF, {
        render: true,
        renderOutput: sharedOut,
        noCache: false,
      });

      // Re-run A: should hit the cache and hand back the same path.
      const a2 = await processDocument(SAMPLE_PDF, {
        render: true,
        renderOutput: sharedOut,
        noCache: false,
      });
      expect(a2.pages[0].image).toBe(aImagePath);
      const aBytesAfter = createHash('sha256')
        .update(readFileSync(a2.pages[0].image as string))
        .digest('hex');
      expect(aBytesAfter).toBe(aBytesBefore);
    } finally {
      if (originalCache === undefined) delete process.env.PDFVISION_CACHE_DIR;
      else process.env.PDFVISION_CACHE_DIR = originalCache;
      rmSync(cacheRoot, { recursive: true, force: true });
      rmSync(sharedOut, { recursive: true, force: true });
    }
  });

  it('refuses to render when the per-PDF subdir under renderOutput is a pre-planted symlink', async () => {
    // Hardening: the fingerprint subdir name is deterministic, so on a
    // shared writable host another process could plant
    // `<renderOutput>/<fingerprint>` as a symlink to elsewhere and
    // redirect our `page-N.png` writes. Catch that before any render
    // happens — silently following the symlink would be a security
    // regression vs the cache hierarchy's posture.
    //
    // POSIX-only: Windows `symlinkSync` needs elevated privileges or
    // a special `type: 'dir'` mode and is awkward to test there. The
    // matching cache-side symlink tests in `tests/core/cache.test.ts`
    // also skip Windows for the same reason.
    if (process.platform === 'win32') return;
    const { mkdtempSync, mkdirSync, rmSync, symlinkSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { pdfFingerprint } = await import('../../src/core/cache.js');
    const baseTmp = mkdtempSync(join(tmpdir(), 'pdfvision-render-symlink-test-'));
    const outDir = join(baseTmp, 'images');
    const decoy = join(baseTmp, 'decoy');
    mkdirSync(outDir, { recursive: true });
    mkdirSync(decoy, { recursive: true });
    const fp = pdfFingerprint(SAMPLE_PDF);
    symlinkSync(decoy, join(outDir, fp));
    try {
      await expect(processDocument(SAMPLE_PDF, { render: true, renderOutput: outDir, noCache: true })).rejects.toThrow(
        /symlink/,
      );
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

  it('rejects processFile({ stripRepeated, layout: false }) before any extraction work', async () => {
    // Library variant of the CLI's `--strip-repeated requires --layout`
    // check. Fail fast so the caller doesn't pay seconds of pdf.js
    // work just to hit a render-time rejection.
    await expect(
      processFile(SAMPLE_PDF, { format: 'markdown', stripRepeated: true, layout: false, noCache: true }),
    ).rejects.toThrow(/stripRepeated requires layout/);
  });

  it('rejects processFile({ stripRepeated, format: "json" }) — strip is markdown-only', async () => {
    // JSON / XML already expose `repeated: true` on each layout block,
    // so the formatter never consults `stripRepeated` there. Without
    // this guard the library would silently no-op while the CLI errors
    // — keep the two surfaces symmetric.
    await expect(
      processFile(SAMPLE_PDF, { format: 'json', stripRepeated: true, layout: true, noCache: true }),
    ).rejects.toThrow(/stripRepeated only applies to markdown/);
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

  it('keeps the public surface narrow — internal cache + renderer entry points stay unexported', async () => {
    // Negative guard against the public surface accidentally widening
    // again. Earlier versions re-exported cache primitives and the
    // pdf.js-backed renderer entry points from `src/index.ts`; both
    // had no useful contract for library consumers (renderPage
    // required a `PDFDocumentProxy`, which made pdf.js the de-facto
    // public contract). They live under `src/core/*` now and must
    // not leak back out of the package barrel.
    const pkg = (await import('../../src/index.js')) as Record<string, unknown>;
    expect(pkg.getCacheDir).toBeUndefined();
    expect(pkg.getCached).toBeUndefined();
    expect(pkg.setCache).toBeUndefined();
    expect(pkg.renderPage).toBeUndefined();
    expect(pkg.renderPages).toBeUndefined();
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
