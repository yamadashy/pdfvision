import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { processDocument } from '../../src/core/processor.js';

const SAMPLE_PDF = resolve(__dirname, '../fixtures/sample.pdf');
const SAMPLE_JA_PDF = resolve(__dirname, '../fixtures/sample-ja.pdf');

describe('processDocument layout: true', () => {
  it('omits layout by default', async () => {
    const result = await processDocument(SAMPLE_PDF, { noCache: true });
    expect(result.pages[0].layout).toBeUndefined();
  });

  it('emits a layout structure of blocks containing lines when requested', async () => {
    const result = await processDocument(SAMPLE_PDF, { noCache: true, layout: true });
    const layout = result.pages[0].layout;
    expect(layout).toBeDefined();
    expect(layout?.blocks.length).toBeGreaterThan(0);
    const block = layout?.blocks[0];
    expect(block?.text).toContain('Hello');
    expect(block?.lines.length).toBeGreaterThan(0);
    expect(block?.lines[0].text).toContain('Hello');
    expect(block?.lines[0].fontSize).toBeGreaterThan(0);
  });

  it('keeps spans hidden when layout is on but geometry is not', async () => {
    // --layout uses spans internally but doesn't expose them; keeping the
    // raw spans out of the default output saves on the verbose payload.
    const result = await processDocument(SAMPLE_PDF, { noCache: true, layout: true });
    expect(result.pages[0].spans).toBeUndefined();
  });

  it('exposes both spans and layout when both flags are on', async () => {
    const result = await processDocument(SAMPLE_PDF, { noCache: true, layout: true, geometry: true });
    expect(result.pages[0].spans).toBeDefined();
    expect(result.pages[0].layout).toBeDefined();
  });

  it('groups two visually different paragraphs into separate blocks', async () => {
    // sample-ja.pdf page 1 has a 20pt line followed by a 14pt line. The
    // font-size jump should split them into two blocks even though the
    // vertical gap is small.
    const result = await processDocument(SAMPLE_JA_PDF, { noCache: true, layout: true, pages: '1' });
    const layout = result.pages[0].layout;
    expect(layout?.blocks.length).toBeGreaterThanOrEqual(2);
    const sizes = (layout?.blocks ?? []).map((b) => b.lines[0].fontSize);
    expect(new Set(sizes).size).toBeGreaterThan(1);
  });

  it('orders blocks top-to-bottom on the page', async () => {
    const result = await processDocument(SAMPLE_JA_PDF, { noCache: true, layout: true, pages: '1' });
    const blocks = result.pages[0].layout?.blocks ?? [];
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i].y).toBeGreaterThanOrEqual(blocks[i - 1].y);
    }
  });

  it('keeps cache entries with vs without layout separate', async () => {
    const noLayout = await processDocument(SAMPLE_PDF, { noCache: false });
    const withLayout = await processDocument(SAMPLE_PDF, { noCache: false, layout: true });
    expect(noLayout.pages[0].layout).toBeUndefined();
    expect(withLayout.pages[0].layout).toBeDefined();
  });
});
