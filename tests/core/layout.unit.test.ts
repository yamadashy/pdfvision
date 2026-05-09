import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../src/core/layout.js';
import type { TextSpan } from '../../src/types/index.js';

/**
 * Produce a span shaped like the ones pdf.js emits, but with explicit
 * coordinates so each test can target a specific layout shape. The text
 * is repeated to set a realistic char-weighted fontSize median.
 */
function span(text: string, x: number, y: number, fontSize: number, width = text.length * fontSize * 0.5): TextSpan {
  return {
    text,
    x,
    y,
    width,
    height: fontSize,
    fontSize,
  };
}

describe('buildLayout — heading classification', () => {
  it('marks a block as heading when its dominant fontSize is ≥ 1.25× the body median', () => {
    // 24pt heading + 12pt body, body has the longer text so the char-
    // weighted median resolves to 12pt.
    const spans: TextSpan[] = [
      span('Heading', 50, 50, 24),
      span('This is the body paragraph that defines the median fontSize.', 50, 100, 12),
      span('A second body line keeps the body weighting clearly dominant.', 50, 120, 12),
    ];
    const layout = buildLayout(spans);
    const headingBlock = layout.blocks.find((b) => b.text.includes('Heading'));
    const bodyBlock = layout.blocks.find((b) => b.text.includes('body paragraph'));
    expect(headingBlock?.role).toBe('heading');
    expect(bodyBlock?.role).toBeUndefined();
  });

  it('does not flag a block as heading when fontSize is uniform across the page', () => {
    const spans: TextSpan[] = [
      span('First paragraph', 50, 50, 12),
      span('Second paragraph', 50, 100, 12),
      span('Third paragraph', 50, 150, 12),
    ];
    const layout = buildLayout(spans);
    for (const block of layout.blocks) {
      expect(block.role).toBeUndefined();
    }
  });

  it('uses char-weighted median so a single short oversize line stays a heading', () => {
    // The heading is one short word at 30pt; body is many sentences at
    // 11pt. An unweighted median across blocks would flip to 11pt anyway,
    // but char-weighting protects against pages where the heading and
    // body block counts are balanced (e.g. a poster with three big words
    // and three short body lines). The heading should still classify.
    const spans: TextSpan[] = [
      span('Title', 50, 50, 30, 100),
      span('First sentence of the actual body content lives here.', 50, 100, 11),
      span('Second sentence of the actual body content also here.', 50, 115, 11),
      span('Third sentence keeps the char count well above the heading.', 50, 130, 11),
    ];
    const layout = buildLayout(spans);
    expect(layout.blocks[0].role).toBe('heading');
  });
});

describe('buildLayout — multi-column reading order', () => {
  it('reorders narrow blocks by (column, y) when two columns are detected', () => {
    // pageWidth 595 (A4). Two ~240pt columns at x=50 and x=320.
    const spans: TextSpan[] = [
      // Right-column lines, written first to ensure detection cannot
      // rely on stream order.
      span('Right column line one.', 320, 110, 12),
      span('Right column line two.', 320, 140, 12),
      // Left column.
      span('Left column line one.', 50, 110, 12),
      span('Left column line two.', 50, 140, 12),
    ];
    const layout = buildLayout(spans, 595);
    const texts = layout.blocks.map((b) => b.text);
    // The first two blocks should both be the left column, then the right.
    expect(texts.length).toBe(4);
    expect(texts[0]).toContain('Left column line one');
    expect(texts[1]).toContain('Left column line two');
    expect(texts[2]).toContain('Right column line one');
    expect(texts[3]).toContain('Right column line two');
  });

  it('keeps a page-spanning block in its y position between column groups', () => {
    // Top heading spans the page width, then two columns underneath.
    // Reading order should be: heading, then left col, then right col.
    const spans: TextSpan[] = [
      // Wide heading. Width > 60% × 595 = 357 → counted as spanning.
      span('Two-column heading that spans the entire page width above', 50, 50, 24, 500),
      // Left column.
      span('Left line A.', 50, 110, 12),
      span('Left line B.', 50, 140, 12),
      // Right column.
      span('Right line A.', 320, 110, 12),
      span('Right line B.', 320, 140, 12),
    ];
    const layout = buildLayout(spans, 595);
    expect(layout.blocks[0].text).toContain('Two-column heading');
    expect(layout.blocks[1].text).toContain('Left line A');
    expect(layout.blocks[2].text).toContain('Left line B');
    expect(layout.blocks[3].text).toContain('Right line A');
    expect(layout.blocks[4].text).toContain('Right line B');
  });

  it('treats a mid-page heading as a column separator instead of pulling it into the left column', () => {
    // A heading sitting between two column rows must split the flow:
    // both columns above the heading reorder, then the heading, then
    // both columns below the heading. The previous implementation kept
    // narrow headings (glyph-advance < 60% of page width) in `narrow`
    // and they joined the left column at x=50, so the right column
    // above the heading slipped to *after* the heading in the output.
    const spans: TextSpan[] = [
      span('Left top', 50, 100, 12),
      span('Right top', 320, 100, 12),
      span('Section heading', 50, 200, 24),
      span('Left bottom', 50, 250, 12),
      span('Right bottom', 320, 250, 12),
    ];
    const layout = buildLayout(spans, 595);
    const texts = layout.blocks.map((b) => b.text);
    expect(texts).toEqual(['Left top', 'Right top', 'Section heading', 'Left bottom', 'Right bottom']);
  });

  it('leaves a single-column page in plain top-down order', () => {
    const spans: TextSpan[] = [
      span(`Paragraph one. ${'Long enough text. '.repeat(10)}`, 50, 50, 12, 500),
      span(`Paragraph two. ${'Long enough text. '.repeat(10)}`, 50, 100, 12, 500),
      span(`Paragraph three. ${'Long enough text. '.repeat(10)}`, 50, 150, 12, 500),
      span(`Paragraph four. ${'Long enough text. '.repeat(10)}`, 50, 200, 12, 500),
    ];
    const layout = buildLayout(spans, 595);
    const ys = layout.blocks.map((b) => b.y);
    // Same as input order — each block already y-sorted.
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(layout.blocks[0].text.startsWith('Paragraph one')).toBe(true);
  });

  it('does not falsely detect columns when only one block sits at a different x', () => {
    // Four body blocks at x=50 plus a single right-margin note. The
    // detection requires every candidate column to have ≥ 2 blocks, so
    // the margin alone should not flip the page into column-reorder
    // mode. Without reorder, the output preserves the natural y-sort,
    // which interleaves the margin note between body lines rather than
    // collecting it into its own column at the end.
    const spans: TextSpan[] = [
      span(`Body line 1. ${'extra '.repeat(15)}`, 50, 50, 12, 200),
      span(`Body line 2. ${'extra '.repeat(15)}`, 50, 80, 12, 200),
      span(`Body line 3. ${'extra '.repeat(15)}`, 50, 110, 12, 200),
      span(`Body line 4. ${'extra '.repeat(15)}`, 50, 140, 12, 200),
      span('A margin note', 320, 80, 10, 100),
    ];
    const layout = buildLayout(spans, 595);
    // Exact y-order is preserved: body 1, then the body-2 / margin pair
    // at y=80 in some order, then body 3, then body 4. A column-reorder
    // would have collected the margin note last; that must not happen.
    const lastText = layout.blocks.at(-1)?.text ?? '';
    expect(lastText).toContain('Body line 4');
  });
});
