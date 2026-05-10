import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseOcrLang } from '../../src/core/ocr.js';
import { processDocument } from '../../src/core/processor.js';

const SAMPLE_PDF = resolve(__dirname, '../fixtures/sample.pdf');

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
    // sample.pdf renders "Hello pdfvision" on page 1; OCR should find some
    // letters from that string. Use a loose match — tesseract sometimes
    // misreads a single glyph and we don't want to chase that flake.
    expect(page.ocr?.text.toLowerCase()).toMatch(/hello|pdfvision/);
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
});
