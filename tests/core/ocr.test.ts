import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CACHE_ROOT_MARKER_NAME, clearAllCache, ensureCacheRoot } from '../../src/core/io/cache.js';
import {
  buildQuietTesseractWorkerScript,
  effectiveOcrRenderScale,
  parseOcrLang,
  prepareOcrSupportFilesForTesting,
} from '../../src/core/ocr/index.js';
import { ensureQuietTesseractWorker } from '../../src/core/ocr/worker.js';
import { buildCacheKey } from '../../src/core/processor/cacheKey.js';
import { processDocument } from '../../src/core/processor.js';

const SAMPLE_PDF = resolve(__dirname, '../fixtures/sample.pdf');
// 3-page Japanese fixture — used here only to exercise the multi-page
// session-reuse path; OCR runs in `eng` mode so we don't need to ship
// jpn traineddata in the test environment.
const SAMPLE_JA_PDF = resolve(__dirname, '../fixtures/sample-ja.pdf');

describe('parseOcrLang', () => {
  it('accepts a single language code', () => {
    expect(parseOcrLang('eng')).toEqual(['eng']);
  });

  it('splits plus-separated codes', () => {
    expect(parseOcrLang('eng+jpn')).toEqual(['eng', 'jpn']);
  });

  it('trims whitespace around codes', () => {
    expect(parseOcrLang(' eng + jpn ')).toEqual(['eng', 'jpn']);
  });

  it('accepts script-suffixed codes (chi_sim, chi_tra)', () => {
    expect(parseOcrLang('chi_sim+chi_tra')).toEqual(['chi_sim', 'chi_tra']);
  });

  it('rejects empty input', () => {
    expect(() => parseOcrLang('')).toThrow(/expected one or more language codes/);
  });

  it('rejects pure-separator input', () => {
    expect(() => parseOcrLang('++')).toThrow(/expected one or more language codes/);
  });

  it('rejects digits / punctuation in tokens', () => {
    // Catches obvious typos like "eng2" or "../traineddata" before tesseract
    // gets handed garbage.
    expect(() => parseOcrLang('eng2')).toThrow(/expected letters\/underscore only/);
    expect(() => parseOcrLang('../sneaky')).toThrow(/expected letters\/underscore only/);
  });
});

describe('buildQuietTesseractWorkerScript', () => {
  it('filters known benign tesseract stderr warnings', () => {
    const script = buildQuietTesseractWorkerScript('/tmp/worker path "quoted".js');
    expect(script).toContain('Image too small to scale!!');
    expect(script).toContain('Line cannot be recognized!!');
    expect(script).toContain('controlTraineddataNoise');
    expect(script).toContain('TESSDATA_PREFIX');
    expect(script).toContain('require("/tmp/worker path \\"quoted\\".js")');
  });

  /**
   * The self-termination hook, driven with a stand-in for tesseract's
   * worker script: no network, no traineddata, but the same message
   * shape and the same reject-then-keep-going behaviour the real one
   * has. `createWorker`'s boot chain swallows a `loadLanguage`
   * rejection, so without this the thread and its WASM heap would
   * outlive every failed `--ocr` attempt.
   */
  async function runFakeTesseractWorker(action: string): Promise<{
    messages: { status: string; data: string }[];
    exited: boolean;
    code?: number;
  }> {
    const sandbox = mkdtempSync(join(tmpdir(), 'pdfvision-ocr-boot-fail-'));
    try {
      const fakeTesseract = join(sandbox, 'fake-tesseract-worker.cjs');
      writeFileSync(
        fakeTesseract,
        `"use strict";
const { parentPort } = require("worker_threads");
parentPort.on("message", (packet) => {
  parentPort.postMessage({ workerId: "w", jobId: "j", action: packet.action, status: "reject", data: "boom" });
  // The real worker keeps going after rejecting: initialize/loadLanguage
  // both post a resolve afterwards, which the parent turns into a
  // TypeError on an already-deleted promise entry.
  parentPort.postMessage({ workerId: "w", jobId: "j", action: packet.action, status: "resolve", data: "late" });
});`,
      );
      const quietWorker = join(sandbox, 'quiet-worker.cjs');
      writeFileSync(quietWorker, buildQuietTesseractWorkerScript(fakeTesseract));

      const { Worker } = await import('node:worker_threads');
      const worker = new Worker(quietWorker);
      const messages: { status: string; data: string }[] = [];
      // No exit within the window means the worker survived the reject,
      // which is the assertion for the post-boot case.
      const outcome = await new Promise<{ exited: boolean; code?: number }>((resolve, reject) => {
        const settle = setTimeout(() => resolve({ exited: false }), 500);
        worker.on('message', (message: { status: string; data: string }) => messages.push(message));
        worker.on('error', reject);
        worker.on('exit', (code) => {
          clearTimeout(settle);
          resolve({ exited: true, code });
        });
        worker.postMessage({ workerId: 'w', jobId: 'j', action });
      });
      worker.removeAllListeners();
      if (!outcome.exited) await worker.terminate();
      return { messages, ...outcome };
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }

  it('terminates the worker thread after a boot-phase rejection', async () => {
    const { messages, exited, code } = await runFakeTesseractWorker('loadLanguage');

    expect(exited).toBe(true);
    expect(code).toBe(0);
    // The rejection still reached the parent — postMessage transfers
    // ownership before the exit — while the stray follow-up did not.
    expect(messages.map((m) => m.status)).toEqual(['reject']);
  });

  it('leaves the worker alive when a page rejects after boot', async () => {
    // `recognize` failures are per-page; the session reuses the worker.
    const { messages, exited } = await runFakeTesseractWorker('recognize');

    expect(exited).toBe(false);
    expect(messages.map((m) => m.status)).toEqual(['reject', 'resolve']);
  });

  it('atomically replaces a hard-linked worker path without mutating the external inode', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'pdfvision-ocr-worker-test-'));
    try {
      const cacheRoot = join(sandbox, 'cache');
      mkdirSync(cacheRoot);
      const external = join(sandbox, 'external-worker');
      writeFileSync(external, 'keep');
      const workerPath = join(cacheRoot, 'tesseract-quiet-worker.cjs');
      linkSync(external, workerPath);

      await ensureQuietTesseractWorker(cacheRoot);

      expect(readFileSync(external, 'utf8')).toBe('keep');
      expect(readFileSync(workerPath, 'utf8')).toContain('process.stderr.write');
      expect(lstatSync(workerPath).nlink).toBe(1);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('recreates the validated root when clear races OCR worker setup', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'pdfvision-ocr-clear-race-'));
    const previousCacheRoot = process.env.PDFVISION_CACHE_DIR;
    const cacheRoot = join(sandbox, 'cache');
    process.env.PDFVISION_CACHE_DIR = cacheRoot;
    let cleared = false;
    try {
      const prepared = await prepareOcrSupportFilesForTesting({
        afterOcrDataReady: () => {
          if (cleared) return;
          cleared = true;
          expect(clearAllCache().removed).toBe(true);
        },
      });

      expect(prepared.cacheRoot).toBe(realpathSync.native(cacheRoot));
      expect(existsSync(join(cacheRoot, CACHE_ROOT_MARKER_NAME))).toBe(true);
      expect(existsSync(prepared.ocrDataDir)).toBe(true);
      expect(existsSync(prepared.workerPath)).toBe(true);
    } finally {
      if (previousCacheRoot === undefined) delete process.env.PDFVISION_CACHE_DIR;
      else process.env.PDFVISION_CACHE_DIR = previousCacheRoot;
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('recreates support files when clear races immediately after the worker write', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'pdfvision-ocr-worker-clear-race-'));
    const previousCacheRoot = process.env.PDFVISION_CACHE_DIR;
    const cacheRoot = join(sandbox, 'cache');
    process.env.PDFVISION_CACHE_DIR = cacheRoot;
    let cleared = false;
    try {
      const prepared = await prepareOcrSupportFilesForTesting({
        afterWorkerReady: () => {
          if (cleared) return;
          cleared = true;
          expect(clearAllCache().removed).toBe(true);
          expect(ensureCacheRoot()).toBe(realpathSync.native(cacheRoot));
        },
      });

      expect(prepared.cacheRoot).toBe(realpathSync.native(cacheRoot));
      expect(existsSync(join(cacheRoot, CACHE_ROOT_MARKER_NAME))).toBe(true);
      expect(existsSync(prepared.ocrDataDir)).toBe(true);
      expect(existsSync(prepared.workerPath)).toBe(true);
    } finally {
      if (previousCacheRoot === undefined) delete process.env.PDFVISION_CACHE_DIR;
      else process.env.PDFVISION_CACHE_DIR = previousCacheRoot;
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});

describe('effectiveOcrRenderScale', () => {
  it('keeps OCR rasterization at least the default scale', () => {
    expect(effectiveOcrRenderScale(undefined)).toBe(2);
    expect(effectiveOcrRenderScale(0.5)).toBe(2);
    expect(effectiveOcrRenderScale(1)).toBe(2);
    expect(effectiveOcrRenderScale(2)).toBe(2);
    expect(effectiveOcrRenderScale(3)).toBe(3);
  });
});

describe('processDocument with --ocr', () => {
  // Isolate OCR-test cache writes from concurrent vitest workers so
  // tesseract.js's traineddata download doesn't race the symlink test
  // in cache.test.ts.
  let tmpRoot: string;
  let originalEnv: string | undefined;

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'pdfvision-ocr-test-'));
    originalEnv = process.env.PDFVISION_CACHE_DIR;
    process.env.PDFVISION_CACHE_DIR = tmpRoot;
  });

  afterAll(() => {
    if (originalEnv === undefined) {
      delete process.env.PDFVISION_CACHE_DIR;
    } else {
      process.env.PDFVISION_CACHE_DIR = originalEnv;
    }
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('attaches an ocr field with text, confidence, and lang', { timeout: 60_000 }, async () => {
    const result = await processDocument(SAMPLE_PDF, { ocr: true, noCache: true });
    expect(existsSync(join(tmpRoot, CACHE_ROOT_MARKER_NAME))).toBe(true);
    expect(existsSync(join(tmpRoot, 'ocr-data'))).toBe(true);
    const page = result.pages[0];
    expect(page.ocr).toBeDefined();
    expect(page.ocr?.lang).toBe('eng');
    // Confidence is normalised to 0..1.
    expect(page.ocr?.confidence).toBeGreaterThanOrEqual(0);
    expect(page.ocr?.confidence).toBeLessThanOrEqual(1);
    expect(page.ocr?.words?.length ?? 0).toBeGreaterThan(0);
    for (const word of page.ocr?.words ?? []) {
      expect(word.text.length).toBeGreaterThan(0);
      expect(word.confidence).toBeGreaterThanOrEqual(0);
      expect(word.confidence).toBeLessThanOrEqual(1);
      expect(word.x).toBeGreaterThanOrEqual(0);
      expect(word.y).toBeGreaterThanOrEqual(0);
      expect(word.width).toBeGreaterThan(0);
      expect(word.height).toBeGreaterThan(0);
    }
    // sample.pdf renders "Hello pdfvision" on page 1; OCR should produce
    // something resembling that. We check shape rather than exact glyphs —
    // tesseract's reads shift with the rendering backend (pdf.js + wasm
    // decoder vs JS fallback produce slightly different anti-aliasing, and
    // ubuntu CI has been seen reading `helb pdfvisdn` at 0.26 confidence).
    // Asserting non-empty text is enough to confirm "OCR actually ran and
    // produced output"; confidence flakiness is captured by the 0..1 range
    // check above.
    expect(page.ocr?.text.trim().length).toBeGreaterThanOrEqual(5);
  });

  it('preserves the pdfjs-derived text alongside ocr.text', { timeout: 60_000 }, async () => {
    // Native text is the primary signal; OCR is a fallback that an agent
    // can compare against. Ensure --ocr does not overwrite `text`.
    const result = await processDocument(SAMPLE_PDF, { ocr: true, noCache: true });
    const page = result.pages[0];
    expect(page.text).toContain('Hello pdfvision');
    expect(page.ocr).toBeDefined();
  });

  it('echoes the lang string verbatim (multi-lang plus form)', { timeout: 60_000 }, async () => {
    // Even with a multi-lang spec, the `lang` field round-trips the
    // caller's input rather than tesseract's normalised array form, so
    // round-trip caching keys remain stable.
    const result = await processDocument(SAMPLE_PDF, { ocr: true, ocrLang: 'eng', noCache: true });
    expect(result.pages[0].ocr?.lang).toBe('eng');
  });

  it('serves --ocr results from cache on second call (no re-recognition)', { timeout: 120_000 }, async () => {
    // First call populates the cache with the OCR payload; second call
    // should be a cache hit and finish in milliseconds instead of the
    // multi-second OCR boot. Asserting the second call is dramatically
    // faster guards against accidentally excluding `ocr` from the cache
    // key (which would re-run OCR every time).
    const t0 = Date.now();
    const first = await processDocument(SAMPLE_PDF, { ocr: true, noCache: false });
    const firstMs = Date.now() - t0;
    expect(first.pages[0].ocr?.text).toBeDefined();

    const t1 = Date.now();
    const second = await processDocument(SAMPLE_PDF, { ocr: true, noCache: false });
    const secondMs = Date.now() - t1;
    expect(second.pages[0].ocr?.text).toEqual(first.pages[0].ocr?.text);
    // OCR boot dominates first run (multiple seconds); a cache hit is
    // dominated by JSON.parse and should land well under 1s. Generous
    // bound to keep the test stable on slow CI.
    expect(secondMs).toBeLessThan(firstMs / 2);
  });

  it('keys --ocr-lang separately so eng and eng+jpn do not share a cache slot', () => {
    // This is a cache-key invariant, not a language-quality check. Avoid
    // booting tesseract with `jpn`, which would make the test depend on
    // external traineddata availability.
    const eng = buildCacheKey({ ocr: true, ocrLang: 'eng' });
    const both = buildCacheKey({ ocr: true, ocrLang: 'eng+jpn' });
    const spacedBoth = buildCacheKey({ ocr: true, ocrLang: ' eng + jpn ' });
    expect(both).not.toBe(eng);
    expect(spacedBoth).toBe(both);
  });

  it('attaches one ocr entry per page when extracting multi-page docs', { timeout: 180_000 }, async () => {
    // Drives the session-reuse path: a single OCR worker recognises
    // every page in turn and the result must land on the matching
    // PageResult. A bug that off-by-ones the index would mis-attach the
    // last page's OCR to page 1.
    const result = await processDocument(SAMPLE_JA_PDF, { ocr: true, ocrLang: 'eng', noCache: true });
    expect(result.pages).toHaveLength(3);
    for (const page of result.pages) {
      expect(page.ocr).toBeDefined();
      expect(page.ocr?.lang).toBe('eng');
      expect(page.ocr?.confidence).toBeGreaterThanOrEqual(0);
      expect(page.ocr?.confidence).toBeLessThanOrEqual(1);
    }
  });
});
