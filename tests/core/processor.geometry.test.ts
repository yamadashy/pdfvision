import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { processDocument } from '../../src/core/processor.js';

const SAMPLE_PDF = resolve(__dirname, '../fixtures/sample.pdf');
const SAMPLE_JA_PDF = resolve(__dirname, '../fixtures/sample-ja.pdf');

describe('processDocument geometry: true', () => {
  it('omits spans by default to keep JSON compact', async () => {
    // Most callers just need text + density signals. Spans can outnumber
    // characters by 5–10× in slide decks, so they must be opt-in.
    const result = await processDocument(SAMPLE_PDF, { noCache: true });
    expect(result.pages[0].spans).toBeUndefined();
  });

  it('emits per-text-item spans when geometry is requested', async () => {
    const result = await processDocument(SAMPLE_PDF, { noCache: true, geometry: true });
    const page = result.pages[0];
    const spans = page.spans ?? [];
    expect(spans.length).toBeGreaterThan(0);
    expect(spans[0].text).toContain('Hello');
    // Sanity: all spans fit inside the page bounds (top-down origin).
    for (const span of spans) {
      expect(span.x).toBeGreaterThanOrEqual(0);
      expect(span.y).toBeGreaterThanOrEqual(0);
      expect(span.x + span.width).toBeLessThanOrEqual(page.width + 0.5);
      expect(span.y + span.height).toBeLessThanOrEqual(page.height + 0.5);
      expect(span.fontSize).toBeGreaterThan(0);
    }
  });

  it('uses top-down coordinates (y grows downward) so spans overlay rendered PNGs', async () => {
    // sample.pdf places "Hello pdfvision" near the top of the page with
    // 24pt text. In top-down coords the y of that span must be small
    // (near the top), not near `height` (near the bottom).
    const result = await processDocument(SAMPLE_PDF, { noCache: true, geometry: true });
    const page = result.pages[0];
    const span = (page.spans ?? [])[0];
    expect(span.y).toBeLessThan(page.height / 2);
  });

  it('returns the same number of spans whether normalize is on or off', async () => {
    // Normalization is a per-string transform; it doesn't drop or split
    // pdf.js text items, so the span count must match. Guards against
    // accidental coupling between normalize and item iteration.
    const normalized = await processDocument(SAMPLE_JA_PDF, { noCache: true, geometry: true });
    const raw = await processDocument(SAMPLE_JA_PDF, { noCache: true, geometry: true, normalize: false });
    expect((normalized.pages[0].spans ?? []).length).toBe((raw.pages[0].spans ?? []).length);
  });

  it('keeps cache entries with vs without geometry separate', async () => {
    // Without the cache key bumping, the second call could return the
    // first call's payload and the spans field would be missing.
    const noGeom = await processDocument(SAMPLE_PDF, { noCache: false });
    const geom = await processDocument(SAMPLE_PDF, { noCache: false, geometry: true });
    expect(noGeom.pages[0].spans).toBeUndefined();
    expect(geom.pages[0].spans).toBeDefined();
  });
});
