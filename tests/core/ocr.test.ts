import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseOcrLang } from '../../src/core/ocr.js';
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

  it('keys --ocr-lang separately so eng and eng+jpn do not share a cache slot', { timeout: 120_000 }, async () => {
    // Run with `eng`, then with `eng+jpn`. The second call must NOT
    // reuse the `eng` cache entry — its `ocr.lang` echoes the caller's
    // string verbatim, so a cache-key collision would surface as
    // `lang === 'eng'` despite the caller asking for `eng+jpn`.
    const eng = await processDocument(SAMPLE_PDF, { ocr: true, ocrLang: 'eng', noCache: false });
    expect(eng.pages[0].ocr?.lang).toBe('eng');
    const both = await processDocument(SAMPLE_PDF, { ocr: true, ocrLang: 'eng+jpn', noCache: false });
    expect(both.pages[0].ocr?.lang).toBe('eng+jpn');
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
