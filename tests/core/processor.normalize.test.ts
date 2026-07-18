import { resolve } from 'node:path';
import { decode } from '@toon-format/toon';
import { describe, expect, it } from 'vitest';
import { normalizeText } from '../../src/core/processor/textUtils.js';
import { processDocument, processFile } from '../../src/core/processor.js';

// sample-compat.pdf embeds fullwidth Latin / fullwidth digits / halfwidth
// katakana in both metadata and the page body — the codepoints AI agents
// most often see leaking out of Japanese PDFs produced by Office / iWork.
const SAMPLE_COMPAT_PDF = resolve(__dirname, '../fixtures/sample-compat.pdf');

function buildRawPdf(objects: string[]): Uint8Array {
  let body = '%PDF-1.7\n';
  const offsets: number[] = [0];
  for (const [index, object] of objects.entries()) {
    offsets[index + 1] = Buffer.byteLength(body, 'binary');
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(body, 'binary');
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(body, 'binary'));
}

function buildPdfWithEmbeddedBackspace(): Uint8Array {
  const stream = 'BT /F1 12 Tf 72 720 Td (Before) Tj T* (\\010) Tj T* (After) Tj ET';
  return buildRawPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream, 'binary')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]);
}

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
    // PDFs don't pay the structured-output size cost.
    const result = await processDocument(SAMPLE_COMPAT_PDF, { noCache: true });
    expect(result.pages[0].rawText).toBe('ＡＢＣ１２３ ｶﾅ');
    expect(result.pages[0].text).toBe('ABC123 カナ');
  });

  it('preserves normalized text and rawText through TOON format dispatch', async () => {
    const options = { noCache: true } as const;
    const [toon, json] = await Promise.all([
      processFile(SAMPLE_COMPAT_PDF, { ...options, format: 'toon' }),
      processFile(SAMPLE_COMPAT_PDF, { ...options, format: 'json' }),
    ]);
    const decoded = decode(toon) as { pages: { text: string; rawText?: string }[] };
    const parsedJson = JSON.parse(json);

    expect(decoded).toEqual(parsedJson);
    expect(decoded.pages[0].text).toBe('ABC123 カナ');
    expect(decoded.pages[0].rawText).toBe('ＡＢＣ１２３ ｶﾅ');
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
    // Forensic / code-point-level callers can opt out and get exactly what
    // pdf.js emitted, including the compatibility codepoints.
    const result = await processDocument(SAMPLE_COMPAT_PDF, { noCache: true, normalize: false });
    expect(result.metadata.title).toBe('Ｃｏｍｐａｔ ２０２６');
    expect(result.pages[0].text).toBe('ＡＢＣ１２３ ｶﾅ');
  });

  it('strips C0 controls from normalized text while preserving tab and line separators', () => {
    expect(normalizeText('A\tB\nC\rD\bE')).toBe('A\tB\nC\rDE');
  });

  it('drops control-only lines without swallowing genuine adjacent blank lines', () => {
    expect(normalizeText('A\n\x01\n\nB')).toBe('A\n\nB');
    expect(normalizeText('A\n\x01\nB')).toBe('A\nB');
    expect(normalizeText('A\n\n\x01\nB')).toBe('A\n\nB');
    expect(normalizeText('A\n\x01\n\n\nB')).toBe('A\n\n\nB');
    expect(normalizeText('A\n\x01\n\nB\n\x01\n\nC')).toBe('A\n\nB\n\nC');
  });

  it('preserves rawText and non-printable counters when normalized text strips C0 controls', async () => {
    const result = await processDocument('memory://embedded-backspace.pdf', {
      sourceData: buildPdfWithEmbeddedBackspace(),
      noCache: true,
    });

    const page = result.pages[0];
    expect(page.text).toBe('BeforeAfter');
    expect(page.rawText).toBe('Before\bAfter');
    expect(page.charCount).toBe(page.text.length);
    expect(page.nonPrintableCount).toBe(1);
    expect(page.nonPrintableRatio).toBe(0.083);
  });

  it('keeps original C0 controls when normalize: false is passed', async () => {
    const result = await processDocument('memory://embedded-backspace.pdf', {
      sourceData: buildPdfWithEmbeddedBackspace(),
      noCache: true,
      normalize: false,
    });

    const page = result.pages[0];
    expect(page.text).toBe('Before\bAfter');
    expect(page.rawText).toBeUndefined();
    expect(page.nonPrintableCount).toBe(1);
    expect(page.nonPrintableRatio).toBe(0.083);
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
