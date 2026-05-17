import { describe, expect, it } from 'vitest';
import { buildLayout, markRepeatedBlocks } from '../../src/core/layout.js';
import type { LayoutBlock, PageResult, TextSpan } from '../../src/types/index.js';

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
    // Ratio 30/11 = 2.7× → level 1 (titles).
    expect(layout.blocks[0].level).toBe(1);
  });

  it('flags arxiv-style 1.20× section headings (12pt over 10pt body) at level 2', () => {
    // The most common LaTeX article layout: 10pt body with 12pt section
    // headings. Ratio 1.20 sits in the 1.15–1.25 band, so the block must
    // also be short and standalone to qualify. Many body lines push
    // bodyChars above the credible-body threshold so low-tier headings
    // get unlocked.
    const bodyLines: TextSpan[] = [];
    for (let i = 0; i < 20; i++) {
      bodyLines.push(span('Body paragraph line that adds enough chars for credible body.', 50, 200 + i * 12, 10));
    }
    const spans: TextSpan[] = [span('1 Introduction', 50, 100, 12), ...bodyLines];
    const layout = buildLayout(spans);
    const heading = layout.blocks.find((b) => b.text.includes('Introduction'));
    expect(heading?.role).toBe('heading');
    expect(heading?.level).toBe(2);
  });

  it('flags a 1.10× single-line subheading at level 3 when it is standalone and short', () => {
    // ResNet-style "3.1. Residual Learning" at 10.96pt over 9.96pt body
    // (ratio ≈ 1.10) — too low for level 2, but the strict level-3 gate
    // (short, single-line, standalone, locally larger) catches it.
    const bodyLines: TextSpan[] = [];
    for (let i = 0; i < 20; i++) {
      bodyLines.push(span('Lots of body content sits underneath the subheading here.', 50, 220 + i * 10, 10));
    }
    const spans: TextSpan[] = [
      span('Body paragraph above the subheading boundary line.', 50, 100, 10),
      span('3.1. Subsection', 50, 200, 11, 80),
      ...bodyLines,
    ];
    const layout = buildLayout(spans);
    const heading = layout.blocks.find((b) => b.text.includes('Subsection'));
    expect(heading?.role).toBe('heading');
    expect(heading?.level).toBe(3);
  });

  it('does NOT flag a 1.10× line at level 3 when surrounded by same-fontSize body', () => {
    // The candidate sits at 1.10× the body median (11 vs 10) — the borderline
    // ratio level 3 is supposed to handle. We pin the y-neighbours at the
    // same body fontSize as the rest of the page so the "locally larger"
    // structural gate has no fontSize-drop on either side to anchor on,
    // and the candidate falls back to looking like a body emphasis run
    // rather than a subheading. The strict gate must reject it.
    const spans: TextSpan[] = [
      span('Body line one above the candidate.', 50, 100, 10),
      span('Candidate line.', 50, 120, 11, 80),
      span('Body line two below the candidate.', 50, 140, 10),
    ];
    const layout = buildLayout(spans);
    for (const block of layout.blocks) {
      expect(block.role).toBeUndefined();
    }
  });

  it('still flags a level-1 title on sparse pages where the body is too short to be credible', () => {
    // A poster / cover page typically has a giant title and a tiny tagline;
    // bodyChars stays under the credible-body threshold so level 2/3
    // wouldn't fire, but level 1 (ratio ≥ 1.40) must still pass so the
    // title isn't lost. 48pt over 12pt = 4.0×.
    const spans: TextSpan[] = [span('Poster Title', 50, 50, 48, 200), span('Short tagline.', 50, 120, 12)];
    const layout = buildLayout(spans);
    const title = layout.blocks.find((b) => b.text.includes('Poster Title'));
    expect(title?.role).toBe('heading');
    expect(title?.level).toBe(1);
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

  it('keeps per-column headings inside their columns when each column has its own heading at the same y', () => {
    // Classic two-column paper: every column gets its own heading at the
    // same y, followed by that column's body underneath. The expected
    // output keeps each heading attached to its column rather than
    // surfacing both headings up front and the bodies after — the
    // promote-heading-to-separator path must NOT fire when there's a
    // parallel heading in another column at the same y.
    const spans: TextSpan[] = [
      span('Left heading', 50, 100, 24),
      span('Right heading', 320, 100, 24),
      span('Left body line.', 50, 140, 12),
      span('Right body line.', 320, 140, 12),
    ];
    const layout = buildLayout(spans, 595);
    const texts = layout.blocks.map((b) => b.text);
    expect(texts).toEqual(['Left heading', 'Left body line.', 'Right heading', 'Right body line.']);
  });

  it('still reorders columns when a standalone heading is centered between them', () => {
    // A centered heading at x=230 sits between the left column at x=50
    // and the right column at x=320. If the heading were left in the
    // narrow set as its own one-block x-cluster, the < 2-blocks gate
    // would disable column reorder for the whole page and the body
    // columns would stay interleaved. Promoting standalone headings
    // *before* validating column counts keeps reorder enabled.
    const spans: TextSpan[] = [
      span('Left top A', 50, 100, 12),
      span('Right top A', 320, 100, 12),
      span('Left top B', 50, 130, 12),
      span('Right top B', 320, 130, 12),
      span('Section', 230, 200, 24),
      span('Left bottom A', 50, 250, 12),
      span('Right bottom A', 320, 250, 12),
      span('Left bottom B', 50, 280, 12),
      span('Right bottom B', 320, 280, 12),
    ];
    const layout = buildLayout(spans, 595);
    const texts = layout.blocks.map((b) => b.text);
    expect(texts).toEqual([
      'Left top A',
      'Left top B',
      'Right top A',
      'Right top B',
      'Section',
      'Left bottom A',
      'Left bottom B',
      'Right bottom A',
      'Right bottom B',
    ]);
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

  it('demotes a repeated-chrome block from heading role (the EN running-header case)', () => {
    // Three pages, each carrying a tiny "EN" marker at y=40 plus a
    // body paragraph below. The heading classifier slips because the
    // marker is short and slightly larger than the body fontSize; the
    // cross-page repeated detector flags it, and markRepeatedBlocks
    // must drop the heading role so agents iterating `headings` no
    // longer see "EN" once per page.
    function makePage(pageNum: number, bodyText: string): PageResult {
      const enBlock: LayoutBlock = {
        text: 'EN',
        x: 50,
        y: 40,
        width: 20,
        height: 14,
        lines: [{ text: 'EN', x: 50, y: 40, width: 20, height: 14, fontSize: 14 }],
        role: 'heading',
        level: 1,
      };
      const bodyBlock: LayoutBlock = {
        text: bodyText,
        x: 50,
        y: 100,
        width: 400,
        height: 12,
        lines: [{ text: bodyText, x: 50, y: 100, width: 400, height: 12, fontSize: 10 }],
      };
      return {
        page: pageNum,
        text: `EN\n${bodyText}`,
        charCount: bodyText.length + 3,
        imageCount: 0,
        textCoverage: 0.5,
        nonPrintableRatio: 0,
        nonPrintableCount: 0,
        width: 612,
        height: 792,
        quality: { nativeTextStatus: 'ok' },
        layout: { blocks: [enBlock, bodyBlock] },
      };
    }

    const pages: PageResult[] = [
      makePage(1, 'Body of page 1'),
      makePage(2, 'Body of page 2'),
      makePage(3, 'Body of page 3'),
    ];
    markRepeatedBlocks(pages);
    for (const page of pages) {
      const en = page.layout?.blocks[0];
      const body = page.layout?.blocks[1];
      expect(en?.repeated).toBe(true);
      expect(en?.role).toBeUndefined();
      expect(en?.level).toBeUndefined();
      // Body blocks (different text per page) stay non-repeated and
      // keep whatever role they had.
      expect(body?.repeated).toBeUndefined();
    }
  });

  it('concatenates consecutive CJK glyph spans without synthetic whitespace', () => {
    // Chinese UDHR-shaped input: per-character spans whose gap reflects
    // the real PDF (~0.28 × fontSize between consecutive glyphs, the
    // residual space left by pdf.js's justification-positioned items).
    // The default 0.25 threshold would insert a space at every glyph;
    // the shared CJK threshold (0.3) must keep them merged so the
    // layout text matches `pages[].text` produced by joinPageText.
    const spans: TextSpan[] = [
      span('人', 50, 50, 12, 12),
      span('人', 65.36, 50, 12, 12), // gap = 65.36 - 62 = 3.36 ≈ 0.28 × fontSize
      span('生', 80.72, 50, 12, 12),
      span('而', 96.08, 50, 12, 12),
      span('自', 111.44, 50, 12, 12),
      span('由', 126.8, 50, 12, 12),
    ];
    const layout = buildLayout(spans);
    expect(layout.blocks[0].lines[0].text).toBe('人人生而自由');
  });

  it('keeps a space between a CJK glyph and an adjacent Latin token', () => {
    // The CJK-pair guard must not over-merge across script boundaries —
    // `2024 年` stays separated because only one side is CJK leading and
    // the default 0.25 threshold applies.
    const spans: TextSpan[] = [span('2024', 50, 50, 12, 24), span('年', 80, 50, 12, 12)];
    const layout = buildLayout(spans);
    expect(layout.blocks[0].lines[0].text).toBe('2024 年');
  });

  it('synthesizes a space between two CJK glyphs when the gap is column-break wide', () => {
    // A multi-fontSize gap (column gutter, inserted U+3000 full-width
    // space, or letterspaced heading) sits well above 0.3 × fontSize
    // and produces a word boundary.
    const spans: TextSpan[] = [
      span('序', 50, 50, 12, 12),
      span('文', 65.36, 50, 12, 12), // tight pair (ratio 0.28) — merged
      span('第', 110, 50, 12, 12), // gap = 110 - 77.36 = 32.64 ≈ 2.7 × fontSize → split
      span('一', 125.36, 50, 12, 12),
      span('条', 140.72, 50, 12, 12),
    ];
    const layout = buildLayout(spans);
    expect(layout.blocks[0].lines[0].text).toBe('序文 第一条');
  });

  it('does not fragment text when spans report fontSize 0 (broken PDF guard)', () => {
    // Some malformed PDFs strip the text matrix scale, leaving fontSize=0
    // on every span. Without a fallback the threshold collapses to 0 and
    // every positive gap synthesizes a space, fragmenting Latin words
    // into single letters. The 12pt fontSize fallback keeps the default
    // 0.25 threshold meaningful: gap 2pt < 12pt × 0.25 = 3pt → no space.
    const spans: TextSpan[] = [
      { text: 'hello', x: 50, y: 50, width: 25, height: 0, fontSize: 0 },
      { text: 'world', x: 77, y: 50, width: 25, height: 0, fontSize: 0 },
    ];
    const layout = buildLayout(spans);
    expect(layout.blocks[0].lines[0].text).toBe('helloworld');
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
