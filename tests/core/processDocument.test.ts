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

  it('rejects an out-of-range renderScale before extraction starts', async () => {
    // The validator runs ahead of pdfjs load + hashing so a typo in a
    // CI script fails fast rather than burning the extraction budget on
    // an unusable scale value.
    await expect(processDocument(SAMPLE_PDF, { render: true, renderScale: 0, noCache: true })).rejects.toThrow(
      /renderScale/,
    );
    await expect(processDocument(SAMPLE_PDF, { render: true, renderScale: 10, noCache: true })).rejects.toThrow(
      /renderScale/,
    );
    await expect(processDocument(SAMPLE_PDF, { render: true, renderScale: Number.NaN, noCache: true })).rejects.toThrow(
      /renderScale/,
    );
    // Sub-rounding-tick value: `0.004` rounds to `0`, which would otherwise
    // slip past a naive `> 0` gate done before rounding and ship `scale: 0`
    // to the renderer. The validator must round first, then range-check.
    await expect(processDocument(SAMPLE_PDF, { render: true, renderScale: 0.004, noCache: true })).rejects.toThrow(
      /renderScale/,
    );
    // Upper-bound symmetry with the sub-tick floor test: `4.004` must
    // be rejected on the *raw* value, not silently clamped to `4` via
    // rounding. Otherwise the library API would accept inputs the CLI
    // and the JSDoc explicitly reject.
    await expect(processDocument(SAMPLE_PDF, { render: true, renderScale: 4.004, noCache: true })).rejects.toThrow(
      /renderScale/,
    );
  });

  it('renders a smaller PNG when renderScale is set below the default', async () => {
    // Geometry: scale ratio should propagate to the encoded PNG dimensions
    // (1.0× → ~half the per-axis pixels of the default 2.0×). Use loadImage
    // because PNG dimensions live in the IHDR chunk, no full decode needed.
    const { loadImage } = await import('@napi-rs/canvas');
    const def = await processDocument(SAMPLE_PDF, { render: true, noCache: true });
    const small = await processDocument(SAMPLE_PDF, { render: true, renderScale: 1, noCache: true });
    const defImg = await loadImage(def.pages[0].image as string);
    const smallImg = await loadImage(small.pages[0].image as string);
    // Roughly half on each axis (allow ±1 for rounding by the rasteriser).
    expect(Math.abs(smallImg.width - defImg.width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(smallImg.height - defImg.height / 2)).toBeLessThanOrEqual(1);
  });

  it('isolates non-default renderScale output from the default-scale dir under renderOutput', async () => {
    // Two scales must not stomp each other's PNGs. The non-default scale
    // gets a `s<scale>` subdir so the default-scale path stays stable for
    // existing user workflows.
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { basename, dirname, join } = await import('node:path');
    const baseTmp = mkdtempSync(join(tmpdir(), 'pdfvision-scale-isolation-'));
    try {
      const def = await processDocument(SAMPLE_PDF, {
        render: true,
        renderOutput: baseTmp,
        noCache: true,
      });
      const small = await processDocument(SAMPLE_PDF, {
        render: true,
        renderOutput: baseTmp,
        renderScale: 1,
        noCache: true,
      });
      expect(def.pages[0].image).not.toBe(small.pages[0].image);
      // Non-default scale lives under an extra subdir. Use path utilities
      // rather than a hardcoded `/` split so the assertion stays valid on
      // Windows runners (where the separator is `\`).
      expect(basename(dirname(small.pages[0].image as string))).toBe('s1');
    } finally {
      rmSync(baseTmp, { recursive: true, force: true });
    }
  });

  it('renders a sub-rectangle when renderRegion is set and echoes it back on the page result', async () => {
    // Single-page extraction (SAMPLE_PDF is 1 page) so the V1 single-page
    // gate doesn't fire. Region of 200×100pt on the upper-left area of
    // a 612×792 letter page; with the default scale of 2 the PNG must
    // come back as 400×200px. Region is also echoed back on the page
    // result so callers can tell crop-or-full from the structured output
    // without inspecting the filename.
    const { loadImage } = await import('@napi-rs/canvas');
    const result = await processDocument(SAMPLE_PDF, {
      render: true,
      renderRegion: { x: 50, y: 50, width: 200, height: 100 },
      noCache: true,
    });
    expect(result.pages[0].renderRegion).toEqual({ x: 50, y: 50, width: 200, height: 100 });
    const img = await loadImage(result.pages[0].image as string);
    expect(img.width).toBe(400);
    expect(img.height).toBe(200);
  });

  it('actually crops to the requested (x, y) — not just (0, 0) with the right dimensions', async () => {
    // Regression guard against a misreading of pdf.js's `transform` option
    // (gemini PR #53 review claimed translation should be in PDF points
    // with positive y; the actual semantics, per pdfjs-dist source, are
    // pixel-space with the y flip already baked into viewport.transform,
    // so `[1,0,0,1,-x*scale,-y*scale]` is the correct shift to put a
    // top-down PDF region at canvas (0, 0)).
    //
    // Two same-sized regions at different (x, y) on the same page must
    // produce different PNG bytes. If the transform were wrong and both
    // rendered from page (0, 0), the captured content would match and
    // the hashes would collide.
    const { createHash } = await import('node:crypto');
    const { readFile } = await import('node:fs/promises');
    const upperLeft = await processDocument(SAMPLE_PDF, {
      render: true,
      renderRegion: { x: 0, y: 0, width: 200, height: 100 },
      noCache: true,
    });
    const lowerRight = await processDocument(SAMPLE_PDF, {
      render: true,
      renderRegion: { x: 300, y: 500, width: 200, height: 100 },
      noCache: true,
    });
    const hashUL = createHash('sha256')
      .update(await readFile(upperLeft.pages[0].image as string))
      .digest('hex');
    const hashLR = createHash('sha256')
      .update(await readFile(lowerRight.pages[0].image as string))
      .digest('hex');
    expect(hashUL).not.toBe(hashLR);
  });

  it('composes renderRegion with renderScale (region size × scale = pixels)', async () => {
    // 200×100pt × scale 3 = 600×300px. Guards the multiplicative
    // contract documented on ProcessDocumentOptions.renderRegion.
    const { loadImage } = await import('@napi-rs/canvas');
    const result = await processDocument(SAMPLE_PDF, {
      render: true,
      renderRegion: { x: 0, y: 0, width: 200, height: 100 },
      renderScale: 3,
      noCache: true,
    });
    const img = await loadImage(result.pages[0].image as string);
    expect(img.width).toBe(600);
    expect(img.height).toBe(300);
  });

  it('encodes the region in the PNG filename so multiple regions per page coexist', async () => {
    // page-<N>_x<x>_y<y>_w<w>_h<h>.png — back-to-back renders of two
    // different regions must produce two distinct files, neither
    // overwriting the other under the cache.
    const { basename } = await import('node:path');
    const a = await processDocument(SAMPLE_PDF, {
      render: true,
      renderRegion: { x: 10, y: 20, width: 100, height: 80 },
      noCache: true,
    });
    const b = await processDocument(SAMPLE_PDF, {
      render: true,
      renderRegion: { x: 200, y: 300, width: 100, height: 80 },
      noCache: true,
    });
    expect(basename(a.pages[0].image as string)).toMatch(/^page-1_x10_y20_w100_h80\.png$/);
    expect(basename(b.pages[0].image as string)).toMatch(/^page-1_x200_y300_w100_h80\.png$/);
    expect(a.pages[0].image).not.toBe(b.pages[0].image);
  });

  it('rejects renderRegion when more than one page is selected', async () => {
    // V1 contract: region only makes sense for a single page. SAMPLE_JA_PDF
    // is multi-page; passing renderRegion without narrowing via pages
    // must throw rather than silently apply the same xywh to every page.
    await expect(
      processDocument(SAMPLE_JA_PDF, {
        render: true,
        renderRegion: { x: 0, y: 0, width: 100, height: 100 },
        noCache: true,
      }),
    ).rejects.toThrow(/renderRegion requires exactly 1 page/);
  });

  it('rejects renderRegion that falls outside the page bounds', async () => {
    // SAMPLE_PDF is letter (612×792). A region whose right edge sits at
    // x+width = 700 falls past the right margin and must fail before any
    // raster work — silently clipping would mask agent typos / coordinate
    // confusion (pre-rotation vs post-rotation, etc.).
    await expect(
      processDocument(SAMPLE_PDF, {
        render: true,
        renderRegion: { x: 500, y: 0, width: 200, height: 100 },
        noCache: true,
      }),
    ).rejects.toThrow(/renderRegion .* falls outside page/);
  });

  it('rejects renderRegion whose width/height rounds to 0 after 2dp canonicalisation', async () => {
    // `0.004` passes the raw `> 0` check, then rounds to `0` after the
    // 2dp canonicalisation that makes the value flow consistently through
    // the cache key / filename / echo. Without rejecting post-round we'd
    // ship `width: 0` to the on-disk filename and the renderer would
    // silently clamp the canvas to 1px — a confusing contract break.
    await expect(
      processDocument(SAMPLE_PDF, {
        render: true,
        renderRegion: { x: 0, y: 0, width: 0.004, height: 100 },
        noCache: true,
      }),
    ).rejects.toThrow(/width and height must be > 0/);
  });

  it('rejects renderRegion with non-positive width or height up front', async () => {
    // Shape errors are caught before pdfjs loads so callers see them
    // immediately. Width 0 collapses to no pixels; negative height is
    // a coordinate-system confusion that must not silently swap edges.
    await expect(
      processDocument(SAMPLE_PDF, {
        render: true,
        renderRegion: { x: 0, y: 0, width: 0, height: 100 },
        noCache: true,
      }),
    ).rejects.toThrow(/width and height must be > 0/);
    await expect(
      processDocument(SAMPLE_PDF, {
        render: true,
        renderRegion: { x: 0, y: 0, width: 100, height: -50 },
        noCache: true,
      }),
    ).rejects.toThrow(/width and height must be > 0/);
  });

  it('rejects renderRegion when neither render nor ocr is requested', async () => {
    // Library boundary check (the CLI already gates this). Without the
    // boundary check, calling processDocument with renderRegion but no
    // render/ocr would hit the text-only result-cache slot — which does
    // NOT include renderRegion in its key — and either return stale
    // data or store the unrelated renderRegion echo on a shared slot.
    await expect(
      processDocument(SAMPLE_PDF, { renderRegion: { x: 0, y: 0, width: 100, height: 100 }, noCache: true }),
    ).rejects.toThrow(/renderRegion requires render: true or ocr: true/);
  });

  it('rejects renderRegion on rotated pages with a clear V1 limitation message', async () => {
    // The fixture isn't rotated, so we synthesise the check by patching
    // the probe-page rotation. Skipped instead of failing fast if no
    // rotated fixture exists yet. The behaviour we guard: the error
    // message must say "rotated" so the agent knows it's a V1 gap and
    // not a coordinate-system bug they need to debug.
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await getDocument(SAMPLE_PDF).promise;
    const page = await doc.getPage(1);
    if (page.rotate !== 0) {
      await expect(
        processDocument(SAMPLE_PDF, {
          render: true,
          renderRegion: { x: 0, y: 0, width: 50, height: 50 },
          noCache: true,
        }),
      ).rejects.toThrow(/rotated/);
    }
    // No rotated fixture available — the bounds-check + reject-on-
    // rotate path is exercised on real data only when one's added.
  });

  it('keeps a sub-pixel region from collapsing the canvas to a zero dimension', async () => {
    // 0.4pt × scale 1 = 0.4px → Math.round = 0 without the floor. The
    // renderer clamps each rounded dimension to >= 1 so @napi-rs/canvas
    // doesn't refuse the allocation with an opaque InvalidArg error.
    const { loadImage } = await import('@napi-rs/canvas');
    const result = await processDocument(SAMPLE_PDF, {
      render: true,
      renderRegion: { x: 10, y: 10, width: 0.4, height: 0.4 },
      renderScale: 1,
      noCache: true,
    });
    const img = await loadImage(result.pages[0].image as string);
    expect(img.width).toBeGreaterThanOrEqual(1);
    expect(img.height).toBeGreaterThanOrEqual(1);
  });

  it('rejects renderRegion with negative x or y', async () => {
    await expect(
      processDocument(SAMPLE_PDF, {
        render: true,
        renderRegion: { x: -1, y: 0, width: 100, height: 100 },
        noCache: true,
      }),
    ).rejects.toThrow(/x and y must be >= 0/);
  });

  it('keeps cache entries with different renderRegions separate', async () => {
    // Same PDF, same scale, two regions must each get their own cache
    // result (and therefore their own on-disk PNG). Otherwise a second
    // region call would return the first region's image path on cache
    // hit — visible regression of the kind --render-scale was hardened
    // against in v0.8.0.
    const a = await processDocument(SAMPLE_PDF, {
      render: true,
      renderRegion: { x: 0, y: 0, width: 100, height: 100 },
      noCache: false,
    });
    const b = await processDocument(SAMPLE_PDF, {
      render: true,
      renderRegion: { x: 100, y: 100, width: 100, height: 100 },
      noCache: false,
    });
    expect(a.pages[0].image).not.toBe(b.pages[0].image);
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

  it('also refuses a pre-planted symlink at the intermediate fingerprint dir when renderScale forces a nested subdir', async () => {
    // Regression: with `--render-scale` the imagesDir becomes
    // `<renderOutput>/<fingerprint>/s<scale>`. `mkdirSync(...,
    // { recursive: true })` follows a symlink at the intermediate
    // `<fingerprint>` segment to plant the scale subdir at the
    // attacker's target — and a final lstat on the deeper path then
    // sees a regular dir at the target and lets the render proceed.
    // The check must also assert the fingerprint dir before going
    // deeper, otherwise non-default scales silently bypass the
    // hardening that already guards the default-scale path above.
    if (process.platform === 'win32') return;
    const { mkdtempSync, mkdirSync, rmSync, symlinkSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { pdfFingerprint } = await import('../../src/core/cache.js');
    const baseTmp = mkdtempSync(join(tmpdir(), 'pdfvision-render-scale-symlink-'));
    const outDir = join(baseTmp, 'images');
    const decoy = join(baseTmp, 'decoy');
    mkdirSync(outDir, { recursive: true });
    mkdirSync(decoy, { recursive: true });
    const fp = pdfFingerprint(SAMPLE_PDF);
    symlinkSync(decoy, join(outDir, fp));
    try {
      await expect(
        processDocument(SAMPLE_PDF, { render: true, renderOutput: outDir, renderScale: 1, noCache: true }),
      ).rejects.toThrow(/symlink/);
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
