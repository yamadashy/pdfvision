import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { processDocument } from '../../src/core/processor.js';

const SAMPLE_PDF = resolve(__dirname, '../fixtures/sample.pdf');
const SAMPLE_JA_PDF = resolve(__dirname, '../fixtures/sample-ja.pdf');

describe('processDocument geometry: true', () => {
  it('omits spans by default to keep JSON compact', async () => {
    // Most callers just need text + density signals. Every retained
    // positioned text item adds an object, so geometry remains opt-in.
    const result = await processDocument(SAMPLE_PDF, { noCache: true });
    expect(result.pages[0].spans).toBeUndefined();
  });

  it('emits per-text-item spans when geometry is requested', async () => {
    const result = await processDocument(SAMPLE_PDF, { noCache: true, geometry: true });
    const page = result.pages[0];
    const spans = page.spans ?? [];
    // The fixture's full phrase is one pdf.js text item, not one span per
    // glyph. Adjacent items would remain separate; exact duplicate draws
    // are covered by processDocument.test.ts.
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('Hello pdfvision');
    // Sanity: all spans fit inside the page bounds (top-down origin).
    for (const span of spans) {
      expect(span.x).toBeGreaterThanOrEqual(0);
      expect(span.y).toBeGreaterThanOrEqual(0);
      expect(span.x + span.width).toBeLessThanOrEqual(page.width + 0.5);
      expect(span.y + span.height).toBeLessThanOrEqual(page.height + 0.5);
      expect(span.fontSize).toBeGreaterThan(0);
    }
  });

  it('uses top-down coordinates for unrotated page-to-PNG mapping', async () => {
    // sample.pdf places "Hello pdfvision" near the top of the page with
    // 24-unit text. In top-down coords the y of that span must be small
    // (near the top), not near `height` (near the bottom).
    const result = await processDocument(SAMPLE_PDF, { noCache: true, geometry: true });
    const page = result.pages[0];
    const span = (page.spans ?? [])[0];
    expect(span.y).toBeLessThan(page.height / 2);
  });

  it('keeps the printable sample span count stable whether normalization is on or off', async () => {
    // Printable ASCII remains non-empty under normalization. An item made
    // empty by normalization may legitimately be omitted only in the
    // normalize-on result, so this invariant is intentionally fixture-scoped.
    const normalized = await processDocument(SAMPLE_PDF, { noCache: true, geometry: true });
    const raw = await processDocument(SAMPLE_PDF, { noCache: true, geometry: true, normalize: false });
    expect((normalized.pages[0].spans ?? []).length).toBe((raw.pages[0].spans ?? []).length);
  });

  it('keeps span font aliases stable when the page range changes', async () => {
    // pdf.js raw font keys include document/page-load counters, so the same
    // page can otherwise expose different `g_d*_f*` names when extracted
    // alone vs after earlier pages. Public geometry should stay comparable.
    const multiPage = await processDocument(SAMPLE_JA_PDF, { noCache: true, geometry: true, pages: '1,2' });
    const singlePage = await processDocument(SAMPLE_JA_PDF, { noCache: true, geometry: true, pages: '2' });

    expect(multiPage.pages.find((page) => page.page === 2)?.spans).toEqual(singlePage.pages[0].spans);
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
