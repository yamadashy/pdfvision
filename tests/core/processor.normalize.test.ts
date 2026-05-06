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
