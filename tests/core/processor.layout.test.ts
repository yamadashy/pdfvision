import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { processDocument } from '../../src/core/processor.js';

const SAMPLE_PDF = resolve(__dirname, '../fixtures/sample.pdf');
const SAMPLE_JA_PDF = resolve(__dirname, '../fixtures/sample-ja.pdf');
const SAMPLE_HEADERS_PDF = resolve(__dirname, '../fixtures/sample-headers.pdf');
const SAMPLE_COLUMNS_PDF = resolve(__dirname, '../fixtures/sample-columns.pdf');

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

  it('joins adjacent CJK glyph spans without inserting spurious spaces', async () => {
    // pdfjs splits a CJK run into per-character spans with no whitespace
    // span between them. A naive ' ' join produces e.g. `背景・ 目 的`
    // instead of `背景・目的`, which then breaks downstream search /
    // diff. The line-text join uses the visual gap between consecutive
    // spans to decide; this test guards that decision against the real
    // sample-ja fixture.
    const result = await processDocument(SAMPLE_JA_PDF, { noCache: true, layout: true, pages: '1' });
    const blocks = result.pages[0].layout?.blocks ?? [];
    const allLineText = blocks.flatMap((b) => b.lines.map((l) => l.text)).join('\n');
    // The fixture has `これは pdfvision のテスト用 PDF です。`; the
    // CJK runs (`これは`, `のテスト用`, `です`) must come through as
    // contiguous strings, with single spaces only at the
    // CJK ↔ Latin boundaries.
    expect(allLineText).toContain('これは');
    expect(allLineText).toContain('のテスト用');
    expect(allLineText).toContain('です');
    // Defensive: no run of CJK characters should be split by a space.
    expect(allLineText).not.toMatch(/[぀-ヿ一-鿿] [぀-ヿ一-鿿]/);
  });

  it('flags running header blocks as repeated across pages', async () => {
    // sample-headers.pdf places the same `pdfvision headers fixture`
    // text at the same y on every one of its three pages. The cross-page
    // post-processing must mark each occurrence as `repeated: true`
    // while leaving the per-page bodies (`Body of page 1`, etc.) alone.
    const result = await processDocument(SAMPLE_HEADERS_PDF, { noCache: true, layout: true });
    expect(result.pages.length).toBe(3);
    for (const page of result.pages) {
      const header = page.layout?.blocks.find((b) => b.text.includes('headers fixture'));
      expect(header?.repeated).toBe(true);
      const body = page.layout?.blocks.find((b) => b.text.startsWith('Body of page'));
      expect(body?.repeated).toBeUndefined();
    }
  });

  it('does not flag any block as repeated when no chrome is shared', async () => {
    // sample-ja.pdf has no running header / footer; every block's text
    // and y differ between pages, so the detector must leave all blocks
    // alone. Guards against an over-eager threshold.
    const result = await processDocument(SAMPLE_JA_PDF, { noCache: true, layout: true });
    for (const page of result.pages) {
      for (const block of page.layout?.blocks ?? []) {
        expect(block.repeated).toBeUndefined();
      }
    }
  });

  it('does not run repeated detection on a single-page extraction', async () => {
    // With one page selected the cross-page comparison has nothing to
    // compare against and would either always-flag or never-flag — both
    // of which are wrong. Skip the pass entirely.
    const result = await processDocument(SAMPLE_HEADERS_PDF, {
      noCache: true,
      layout: true,
      pages: '1',
    });
    for (const block of result.pages[0].layout?.blocks ?? []) {
      expect(block.repeated).toBeUndefined();
    }
  });

  it('classifies the larger-fontSize block as a heading on the columns fixture', async () => {
    // sample-columns.pdf has a 24pt heading line above two 12pt body
    // columns. The heading block must come back with role:'heading' and
    // the body blocks must not — otherwise downstream agents can't pick
    // section anchors out of the layout.
    const result = await processDocument(SAMPLE_COLUMNS_PDF, { noCache: true, layout: true });
    const blocks = result.pages[0].layout?.blocks ?? [];
    const headings = blocks.filter((b) => b.role === 'heading');
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(headings[0].text).toContain('Two-column heading');
    const bodyBlocks = blocks.filter((b) => b.text.startsWith('Left column') || b.text.startsWith('Right column'));
    for (const body of bodyBlocks) {
      expect(body.role).toBeUndefined();
    }
  });

  it('reorders multi-column blocks into reading order on the columns fixture', async () => {
    // sample-columns.pdf interleaves left and right columns in the
    // content stream, so a naive top-down sort would surface the
    // right-column line first. The column-aware reorder must emit the
    // heading, then both left-column lines, then both right-column lines.
    const result = await processDocument(SAMPLE_COLUMNS_PDF, { noCache: true, layout: true });
    const texts = (result.pages[0].layout?.blocks ?? []).map((b) => b.text);
    const headingIdx = texts.findIndex((t) => t.includes('Two-column heading'));
    const leftOneIdx = texts.findIndex((t) => t.includes('Left column line one'));
    const leftTwoIdx = texts.findIndex((t) => t.includes('Left column line two'));
    const rightOneIdx = texts.findIndex((t) => t.includes('Right column line one'));
    const rightTwoIdx = texts.findIndex((t) => t.includes('Right column line two'));
    expect(headingIdx).toBeGreaterThanOrEqual(0);
    expect(leftOneIdx).toBeGreaterThan(headingIdx);
    expect(leftTwoIdx).toBeGreaterThan(leftOneIdx);
    expect(rightOneIdx).toBeGreaterThan(leftTwoIdx);
    expect(rightTwoIdx).toBeGreaterThan(rightOneIdx);
  });

  it('does not attach a warnings field to pages with nothing to flag', async () => {
    // Sanity for the integration path: a clean fixture extracted with
    // --layout must come back with no `warnings` field (we omit the
    // field when the detector returns no findings rather than writing
    // an empty array). Same fixture set as the repeated-detection
    // tests; if either fires for a clean page it's a detector bug.
    const result = await processDocument(SAMPLE_HEADERS_PDF, { noCache: true, layout: true });
    for (const page of result.pages) {
      expect(page.warnings).toBeUndefined();
    }
  });

  it('does not attach geometry warnings when layout is off', async () => {
    // Same fixture, layout disabled. Geometry rules need layout bboxes,
    // so clean text-only pages should still come back without warnings.
    const result = await processDocument(SAMPLE_HEADERS_PDF, { noCache: true });
    for (const page of result.pages) {
      expect(page.warnings).toBeUndefined();
    }
  });

  it('keeps cache entries with vs without layout separate', async () => {
    // Use SAMPLE_HEADERS_PDF rather than SAMPLE_PDF: the headers fixture is
    // only consumed by --layout tests with `noCache: true`, so its cache
    // directory is otherwise idle. SAMPLE_PDF's cache dir is contended by
    // the corruption / chmod tests in processor.test.ts when those workers
    // run in parallel under vitest, which can race the atomicWrite path
    // and produce flaky ENOENT failures on slower CI runners.
    const noLayout = await processDocument(SAMPLE_HEADERS_PDF, { noCache: false });
    const withLayout = await processDocument(SAMPLE_HEADERS_PDF, { noCache: false, layout: true });
    expect(noLayout.pages[0].layout).toBeUndefined();
    expect(withLayout.pages[0].layout).toBeDefined();
  });
});
