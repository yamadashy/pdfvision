import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { processDocument } from '../../src/core/processor.js';

// sample-compat.pdf embeds fullwidth Latin / fullwidth digits / halfwidth
// katakana in both metadata and the page body — the codepoints AI agents
// most often see leaking out of Japanese PDFs produced by Office / iWork.
const SAMPLE_COMPAT_PDF = resolve(__dirname, '../fixtures/sample-compat.pdf');

describe('processDocument NFKC normalization', () => {
  it('normalizes compatibility codepoints in text and metadata by default', async () => {
    const result = await processDocument(SAMPLE_COMPAT_PDF, { noCache: true });
    // Fullwidth `Ｃｏｍｐａｔ ２０２６` collapses to ASCII; halfwidth katakana
    // `ｶﾅ` collapses to fullwidth `カナ`. Both are the canonical forms an
    // agent would expect when grepping or computing diffs.
    expect(result.metadata.title).toBe('Compat 2026');
    expect(result.pages[0].text).toBe('ABC123 カナ');
    // charCount must reflect the post-normalization length so it agrees
    // with text.length on the consumer side.
    expect(result.pages[0].charCount).toBe(result.pages[0].text.length);
  });

  it('exposes rawText alongside text when normalization changed the string', async () => {
    // Agents that need to diff (or audit) what the normalizer touched
    // shouldn't have to re-run with --no-normalize. rawText is only
    // surfaced when it actually differs from text, so already-canonical
    // PDFs don't pay the JSON-size cost.
    const result = await processDocument(SAMPLE_COMPAT_PDF, { noCache: true });
    expect(result.pages[0].rawText).toBe('ＡＢＣ１２３ ｶﾅ');
    expect(result.pages[0].text).toBe('ABC123 カナ');
  });

  it('omits rawText when text is already in canonical form', async () => {
    // sample.pdf is plain ASCII so NFKC is a no-op and rawText would
    // duplicate text. It must not appear on the result.
    const SAMPLE_PDF = resolve(__dirname, '../fixtures/sample.pdf');
    const result = await processDocument(SAMPLE_PDF, { noCache: true });
    expect(result.pages[0].rawText).toBeUndefined();
  });

  it('omits rawText when normalize: false is passed', async () => {
    // With normalize: false, text is already the raw form; a separate
    // rawText would be redundant.
    const result = await processDocument(SAMPLE_COMPAT_PDF, { noCache: true, normalize: false });
    expect(result.pages[0].rawText).toBeUndefined();
  });

  it('preserves raw codepoints when normalize: false is passed', async () => {
    // Forensic / glyph-level callers can opt out and get exactly what
    // pdf.js emitted, including the compatibility codepoints.
    const result = await processDocument(SAMPLE_COMPAT_PDF, { noCache: true, normalize: false });
    expect(result.metadata.title).toBe('Ｃｏｍｐａｔ ２０２６');
    expect(result.pages[0].text).toBe('ＡＢＣ１２３ ｶﾅ');
  });

  it('keeps cache entries for normalized vs raw text separate', async () => {
    // Same PDF, both flags. Cache key includes the normalize flag so the
    // second call cannot return a stale payload from the first.
    const normalized = await processDocument(SAMPLE_COMPAT_PDF, { noCache: false });
    const raw = await processDocument(SAMPLE_COMPAT_PDF, { noCache: false, normalize: false });
    expect(normalized.pages[0].text).toBe('ABC123 カナ');
    expect(raw.pages[0].text).toBe('ＡＢＣ１２３ ｶﾅ');
  });
});
