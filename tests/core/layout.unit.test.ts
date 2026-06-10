import { describe, expect, it } from 'vitest';
import { buildLayout, markRepeatedBlocks } from '../../src/core/layout.js';
import { detectPageWarnings } from '../../src/core/warnings.js';
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

  it('does not classify a standalone social handle as a heading', () => {
    // SpeakerDeck title-slide-shaped case: a large @handle is author
    // metadata / byline, not a section anchor an agent should chunk on.
    const spans: TextSpan[] = [
      span('OSS title', 80, 80, 40, 220),
      span('@yamadashy', 120, 160, 28, 160),
      span('Small body line for median weighting.', 80, 230, 11),
      span('Another body line keeps the page from being title-only.', 80, 245, 11),
    ];
    const layout = buildLayout(spans);
    const title = layout.blocks.find((b) => b.text.includes('OSS title'));
    const handle = layout.blocks.find((b) => b.text.includes('@yamadashy'));
    expect(title?.role).toBe('heading');
    expect(handle?.role).toBeUndefined();
  });

  it('promotes top-of-page paper titles in the legacy heading band to level 1', () => {
    // BERT / ACL paper-shaped case: title is around 1.3x body, not the
    // 1.4x poster-title band, but visually it is the document title.
    const bodyLines: TextSpan[] = [];
    for (let i = 0; i < 20; i++) {
      bodyLines.push(span('Body text line that establishes the paper body median.', 72, 220 + i * 12, 10.9));
    }
    const spans: TextSpan[] = [
      span('BERT: Pre-training of Deep Bidirectional Transformers for', 116, 68, 14.3, 360),
      span('Language Understanding', 160, 84, 14.3, 180),
      ...bodyLines,
    ];
    const layout = buildLayout(spans);
    const title = layout.blocks.find((b) => b.text.includes('BERT:'));
    expect(title?.role).toBe('heading');
    expect(title?.level).toBe(1);
  });

  it('demotes person-name bylines directly under a document title', () => {
    // ResNet / CVPR paper-shaped case: author names sit below the title
    // at section-heading font size, but they are byline metadata, not
    // section anchors.
    const bodyLines: TextSpan[] = [];
    for (let i = 0; i < 18; i++) {
      bodyLines.push(span('Body text line that establishes the paper body median.', 50, 250 + i * 12, 9.96));
    }
    const spans: TextSpan[] = [
      span('Deep Residual Learning for Image Recognition', 150, 100, 14.35, 290),
      span('Kaiming He', 136, 150, 11.96, 60),
      span('Jian Sun', 418, 150, 11.96, 42),
      span('1. Introduction', 50, 530, 11.96, 76),
      ...bodyLines,
    ];
    const layout = buildLayout(spans);
    const title = layout.blocks.find((b) => b.text.includes('Deep Residual'));
    const author = layout.blocks.find((b) => b.text.includes('Kaiming He'));
    const section = layout.blocks.find((b) => b.text.includes('Introduction'));
    expect(title?.level).toBe(1);
    expect(author?.role).toBeUndefined();
    expect(section?.role).toBe('heading');
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

  it('attaches a 0..1 roleConfidence whenever a block is classified as heading', () => {
    // The number is the agent-facing knob for threshold-based dispatch
    // ("only treat >= 0.7 as a section anchor"). Pinning to a specific
    // value would be brittle, but the field must (a) exist for every
    // heading and (b) sit in [0, 1].
    const spans: TextSpan[] = [
      span('Title', 50, 50, 30, 100),
      span('First sentence of body content that anchors the median.', 50, 100, 11),
      span('Second sentence keeps the body weighting high.', 50, 115, 11),
      span('Third sentence pushes char count above credible body.', 50, 130, 11),
    ];
    const layout = buildLayout(spans);
    const title = layout.blocks.find((b) => b.text.includes('Title'));
    expect(title?.role).toBe('heading');
    expect(title?.roleConfidence).toBeTypeOf('number');
    expect(title?.roleConfidence ?? 0).toBeGreaterThan(0);
    expect(title?.roleConfidence ?? 0).toBeLessThanOrEqual(1);
  });

  it('does not attach roleConfidence to blocks that are not headings', () => {
    // Negative complement to the heading-confidence test — body blocks
    // must come back with the field absent so consumers can tell "no
    // role" from "low-confidence role".
    const spans: TextSpan[] = [
      span('Body line one stays at the body fontSize.', 50, 50, 12),
      span('Body line two keeps the page uniformly body.', 50, 70, 12),
    ];
    const layout = buildLayout(spans);
    for (const block of layout.blocks) {
      expect(block.roleConfidence).toBeUndefined();
    }
  });

  it('does not classify punctuation-only icon text as a heading', () => {
    const spans: TextSpan[] = [
      span('!', 50, 50, 24, 10),
      span('Body text around a caution icon should anchor the body font.', 80, 52, 10, 260),
      span('More body text keeps the page from looking like a poster.', 80, 66, 10, 260),
    ];
    const layout = buildLayout(spans, 612);
    const icon = layout.blocks.find((b) => b.text === '!');
    expect(icon?.role).toBeUndefined();
    expect(icon?.roleConfidence).toBeUndefined();
  });

  it('does not classify bullet list items as headings only because the bullet glyph is large', () => {
    const spans: TextSpan[] = [
      span('• You have a valid social security number', 50, 50, 15, 220),
      span('Continuation text at the normal body size.', 50, 72, 10, 220),
      span('More body text keeps the median at the body size.', 50, 86, 10, 220),
    ];
    const layout = buildLayout(spans, 612);
    const bullet = layout.blocks.find((b) => b.text.startsWith('•'));
    expect(bullet?.role).toBeUndefined();
    expect(bullet?.roleConfidence).toBeUndefined();
  });

  it('reports higher roleConfidence for clear titles than for borderline subheadings', () => {
    // Ordering is the agent-facing contract: an agent thresholding at
    // 0.7 should reliably pick up clear titles and reliably drop
    // borderline level-3 subsections, regardless of exact numeric values.
    const titleSpans: TextSpan[] = [
      span('Big Bold Title', 50, 50, 30, 100),
      span('First sentence of body content that anchors the median fontSize.', 50, 100, 11),
      span('Second sentence keeps the body weighting clearly high.', 50, 115, 11),
      span('Third sentence pushes char count above credible body.', 50, 130, 11),
    ];
    const subSpans: TextSpan[] = [];
    subSpans.push(span('Body paragraph above the candidate subheading.', 50, 100, 10));
    subSpans.push(span('3.1. Subsection', 50, 200, 11, 80));
    for (let i = 0; i < 20; i++) {
      subSpans.push(span('Body content sits underneath the subheading here.', 50, 220 + i * 10, 10));
    }
    const titleLayout = buildLayout(titleSpans);
    const subLayout = buildLayout(subSpans);
    const title = titleLayout.blocks.find((b) => b.text.includes('Big Bold Title'));
    const sub = subLayout.blocks.find((b) => b.text.includes('Subsection'));
    expect(title?.roleConfidence).toBeGreaterThan(sub?.roleConfidence ?? 1);
  });
});

describe('buildLayout — multi-column reading order', () => {
  it('does not let a tall drop cap absorb the following paragraph lines into one layout line', () => {
    const spans: TextSpan[] = [
      span('T', 50, 40, 40, 24),
      span('he first visual line starts beside the drop cap.', 75, 50, 10, 210),
      span('second visual line should stay separate.', 75, 62, 10, 190),
      span('third visual line continues below.', 50, 74, 10, 180),
    ];
    const layout = buildLayout(spans, 595);
    const lines = layout.blocks.flatMap((block) => block.lines.map((line) => line.text));

    expect(lines).toEqual([
      'The first visual line starts beside the drop cap.',
      'second visual line should stay separate.',
      'third visual line continues below.',
    ]);
  });

  it('splits recurring narrow gutters in dense two-column journal text', () => {
    // Nature-style two-column body rows can have only ~13pt between the
    // left and right columns. That is below the default 16pt hard gutter,
    // but the same page-wide gutter repeats row after row.
    const spans: TextSpan[] = [
      span('Left row one fills the first text column', 45, 50, 10, 245),
      span('Right row one fills the second text column', 303, 50, 10, 245),
      span('Left row two continues the same paragraph', 45, 62, 10, 245),
      span('Right row two continues the right paragraph', 303, 62, 10, 245),
      span('Left row three keeps the gutter recurring', 45, 74, 10, 245),
      span('Right row three keeps the gutter recurring', 303, 74, 10, 245),
      span('Left row four confirms the same gutter', 45, 86, 10, 245),
      span('Right row four confirms the same gutter', 303, 86, 10, 245),
      span('Left row five has a short opposite-column mate', 45, 98, 10, 245),
      span('Right.', 303, 98, 10, 28),
    ];
    const layout = buildLayout(spans, 595);
    const lineTexts = layout.blocks.flatMap((block) => block.lines.map((line) => line.text));

    expect(lineTexts).not.toContain(
      'Left row one fills the first text column Right row one fills the second text column',
    );
    expect(lineTexts).not.toContain('Left row five has a short opposite-column mate Right.');
    expect(layout.blocks[0].text).toContain('Left row one');
    expect(layout.blocks[0].text).toContain('Left row five');
    expect(layout.blocks.at(-1)?.text).toContain('Right.');
  });

  it('keeps a one-off wide justified gap on the same line', () => {
    const spans: TextSpan[] = [
      span('Single column text before a wide justified space', 45, 50, 10, 245),
      span('continues after the same wide space', 303, 50, 10, 245),
    ];
    const layout = buildLayout(spans, 595);

    expect(layout.blocks[0].lines[0].text).toBe(
      'Single column text before a wide justified space continues after the same wide space',
    );
  });

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

  it('does not glue staggered lines from different columns into one block', () => {
    // IRS-style three-column instructions: the PDF stream can emit row N
    // as left+right, then row N+1 as left+middle+right. The right line
    // from row N must not merge with the left line from row N+1 just
    // because their vertical gap is paragraph-sized.
    const spans: TextSpan[] = [
      span('Left row 1.', 42, 40, 10, 164),
      span('Right row 1.', 406, 40, 10, 164),
      span('Left row 2.', 42, 52, 10, 164),
      span('Middle heading', 224, 54, 16, 164),
      span('Right row 2.', 406, 64, 10, 164),
      span('Left row 3.', 42, 76, 10, 164),
      span('Middle body.', 224, 88, 10, 164),
      span('Right row 3.', 406, 88, 10, 164),
    ];
    const layout = buildLayout(spans, 612);
    const texts = layout.blocks.map((b) => b.text);

    expect(texts.some((text) => text.includes('Left row 1.') && text.includes('Left row 2.'))).toBe(true);
    expect(texts.some((text) => text.includes('Right row 1.'))).toBe(true);
    expect(texts).not.toContain('Right row 1.\nLeft row 2.');
    expect(texts).not.toContain('Middle body. Right row 3.');
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
        vectorCount: 0,
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
    // Seed roleConfidence on the EN block so we can assert it's wiped
    // along with role / level when the block is reclassified as chrome.
    for (const page of pages) {
      const en = page.layout?.blocks[0];
      if (en) en.roleConfidence = 0.9;
    }
    markRepeatedBlocks(pages);
    for (const page of pages) {
      const en = page.layout?.blocks[0];
      const body = page.layout?.blocks[1];
      expect(en?.repeated).toBe(true);
      expect(en?.role).toBeUndefined();
      expect(en?.level).toBeUndefined();
      expect(en?.roleConfidence).toBeUndefined();
      // Body blocks (different text per page) stay non-repeated and
      // keep whatever role they had.
      expect(body?.repeated).toBeUndefined();
    }
  });

  it('marks footer blocks as repeated when a stable footer line is paired with changing page labels', () => {
    const stableFooter =
      'Brought to you by NOAA Library | Unauthenticated | Downloaded 09/12/25 01:27 PM UTC2. Global Climate';

    function makePage(pageNum: number, pageLabel: string): PageResult {
      const caption: LayoutBlock = {
        text: `Plate 2.1 caption page ${pageNum}`,
        x: 307,
        y: 643,
        width: 270,
        height: 108.5,
        lines: [{ text: `Plate 2.1 caption page ${pageNum}`, x: 307, y: 643, width: 270, height: 9, fontSize: 8 }],
      };
      const footer: LayoutBlock = {
        text: `${stableFooter}\n${pageLabel}`,
        x: 301,
        y: 765.23,
        width: 278,
        height: 11.77,
        lines: [
          { text: stableFooter, x: 301, y: 765.68, width: 245.88, height: 8, fontSize: 6 },
          { text: pageLabel, x: 562, y: 765.23, width: 15.14, height: 8, fontSize: 8 },
        ],
      };
      return {
        page: pageNum,
        text: `${caption.text}\n${footer.text}`,
        charCount: caption.text.length + footer.text.length + 1,
        imageCount: 7,
        vectorCount: 0,
        textCoverage: 0.05,
        nonPrintableRatio: 0,
        nonPrintableCount: 0,
        width: 594,
        height: 792,
        quality: { nativeTextStatus: 'ok' },
        layout: { blocks: [caption, footer] },
      };
    }

    const pages = [makePage(12, 'S22'), makePage(13, 'S23'), makePage(14, 'S24')];
    markRepeatedBlocks(pages);

    for (const page of pages) {
      expect(page.layout?.blocks[0].repeated).toBeUndefined();
      expect(page.layout?.blocks[1].repeated).toBe(true);
      const warnings = detectPageWarnings(page, { chromeDetectionReliable: true });
      expect(warnings.filter((w) => w.code === 'near_bottom_edge')).toEqual([]);
    }
  });

  it('does not mark repeated table headers in the page body as chrome', () => {
    // Annual-report tables can repeat the same year/change header at
    // the same y on adjacent pages. That is table structure, not a
    // running page header or footer.
    function makePage(pageNum: number): PageResult {
      const tableHeader: LayoutBlock = {
        text: '2023 Change 2022 Change 2021',
        x: 240,
        y: 130,
        width: 260,
        height: 10,
        lines: [{ text: '2023 Change 2022 Change 2021', x: 240, y: 130, width: 260, height: 10, fontSize: 8 }],
      };
      const bodyBlock: LayoutBlock = {
        text: `Products page ${pageNum}`,
        x: 50,
        y: 150,
        width: 300,
        height: 10,
        lines: [{ text: `Products page ${pageNum}`, x: 50, y: 150, width: 300, height: 10, fontSize: 8 }],
      };
      return {
        page: pageNum,
        text: `${tableHeader.text}\n${bodyBlock.text}`,
        charCount: 50,
        imageCount: 0,
        vectorCount: 0,
        textCoverage: 0.1,
        nonPrintableRatio: 0,
        nonPrintableCount: 0,
        width: 612,
        height: 792,
        quality: { nativeTextStatus: 'ok' },
        layout: { blocks: [tableHeader, bodyBlock] },
      };
    }

    const pages = [makePage(1), makePage(2), makePage(3)];
    markRepeatedBlocks(pages);
    for (const page of pages) {
      expect(page.layout?.blocks[0].repeated).toBeUndefined();
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

  it('synthesizes a space between two CJK glyphs when the gap looks like an inserted full-width space', () => {
    // A gap above the tight CJK join threshold but below the layout
    // gutter threshold should stay on one line and produce a word
    // boundary, as with an inserted U+3000 full-width space.
    const spans: TextSpan[] = [
      span('序', 50, 50, 12, 12),
      span('文', 65.36, 50, 12, 12), // tight pair (ratio 0.28) — merged
      span('第', 86, 50, 12, 12), // gap = 86 - 77.36 = 8.64 ≈ 0.72 × fontSize → space
      span('一', 101.36, 50, 12, 12),
      span('条', 116.72, 50, 12, 12),
    ];
    const layout = buildLayout(spans);
    expect(layout.blocks[0].lines[0].text).toBe('序文 第一条');
  });

  it('keeps Japanese vertical glyph stacks as separate top-to-bottom blocks', () => {
    // Japanese slide-title-shaped input from a public government PDF:
    // pdf.js emits one square-ish glyph per span. A y-row-only layout pass
    // used to merge the two vertical columns row-wise (`縦 書\n書 籍...`).
    const spans: TextSpan[] = [
      span('ネットの横書き', 290, 430, 32, 210),
      span('縦', 36, 194, 76, 72),
      span('書', 36, 299, 76, 72),
      span('き', 36, 405, 76, 72),
      span('書', 182, 97, 76, 72),
      span('籍', 182, 202, 76, 72),
      span('の', 182, 308, 76, 72),
      span('と', 589, 137, 92, 86),
    ];
    const layout = buildLayout(spans, 720);
    const verticalBlocks = layout.blocks.filter((block) => block.writingMode === 'vertical');

    expect(verticalBlocks.map((block) => block.text)).toEqual(expect.arrayContaining(['縦書き', '書籍の']));
    expect(verticalBlocks.every((block) => block.lines[0]?.writingMode === 'vertical')).toBe(true);
    expect(layout.blocks.map((block) => block.text)).not.toContain('縦 書\n書 籍\nき の');
  });

  it('does not treat aligned first glyphs of horizontal CJK lines as vertical writing', () => {
    const spans: TextSpan[] = [
      span('日', 50, 50, 12, 12),
      span('本', 63, 50, 12, 12),
      span('語', 76, 50, 12, 12),
      span('日', 50, 68, 12, 12),
      span('本', 63, 68, 12, 12),
      span('語', 76, 68, 12, 12),
      span('日', 50, 86, 12, 12),
      span('本', 63, 86, 12, 12),
      span('語', 76, 86, 12, 12),
    ];
    const layout = buildLayout(spans);

    expect(layout.blocks.some((block) => block.writingMode === 'vertical')).toBe(false);
    expect(layout.blocks.flatMap((block) => block.lines.map((line) => line.text))).toEqual([
      '日本語',
      '日本語',
      '日本語',
    ]);
  });

  it('does not extract small horizontal CJK labels with wide spacing as vertical blocks', () => {
    // Table/list-shaped Japanese text can repeat short labels at the same
    // x across rows while using a deliberate full-width-ish gap inside
    // each row. Those rows should stay horizontal, not get stripped into a
    // top-to-bottom label.
    const spans: TextSpan[] = [
      span('序', 50, 50, 12, 12),
      span('文', 66.64, 50, 12, 12), // gap ≈ 0.72 × fontSize
      span('本', 90, 50, 12, 40),
      span('序', 50, 68, 12, 12),
      span('文', 66.64, 68, 12, 12),
      span('本', 90, 68, 12, 40),
      span('序', 50, 86, 12, 12),
      span('文', 66.64, 86, 12, 12),
      span('本', 90, 86, 12, 40),
    ];
    const layout = buildLayout(spans);

    expect(layout.blocks.some((block) => block.writingMode === 'vertical')).toBe(false);
    expect(layout.blocks.flatMap((block) => block.lines.map((line) => line.text))).toEqual([
      '序 文 本',
      '序 文 本',
      '序 文 本',
    ]);
  });

  it('keeps a semantic space before a URL when the visual gap is narrowly below the default threshold', () => {
    // ACL-style font-run boundary: the gap before the URL is just below
    // 0.25x fontSize, but the token is visually and semantically
    // separated ("at https://..."), not `athttps://...`.
    const spans: TextSpan[] = [
      span('els are available at', 82.91, 451.93, 10.91, 80.3),
      span('https://github.com/', 165.9, 451.93, 10.91, 124.36),
    ];
    const layout = buildLayout(spans);

    expect(layout.blocks[0].lines[0].text).toBe('els are available at https://github.com/');
  });

  it('splits large numeric callouts from small annotation lines while keeping the unit', () => {
    // Japanese infographic-shaped case: a small "75%" annotation sits
    // above a large "9,308万枚" KPI. The large number's tall bbox used
    // to pull the KPI into the annotation line.
    const spans: TextSpan[] = [
      span('国⺠の', 91.92, 218.48, 10.02, 30.06),
      span('75%', 121.98, 218.48, 10.02, 20.81),
      span('9,308', 91.92, 238.46, 54.02, 139.46),
      span('万枚', 231.43, 264.46, 28.02, 56.1),
    ];
    const layout = buildLayout(spans);
    const lines = layout.blocks.flatMap((block) => block.lines.map((line) => line.text));
    expect(lines).toEqual(['国⺠の75%', '9,308万枚']);
  });

  it('emits row-major table hints for aligned numeric statement rows', () => {
    // Financial statement-shaped case: layout blocks can be column-major,
    // but table hints should preserve row/cell order for value lookup.
    const spans: TextSpan[] = [
      span('Products', 50, 100, 8, 36),
      span('$', 180, 100, 8, 4),
      span('298,085', 210, 100, 8, 32),
      span('316,199', 290, 100, 8, 32),
      span('297,392', 370, 100, 8, 32),
      span('Services', 50, 112, 8, 34),
      span('85,200', 210, 112, 8, 28),
      span('78,129', 290, 112, 8, 28),
      span('68,425', 370, 112, 8, 28),
      span('Total net sales', 50, 124, 8, 70),
      span('383,285', 210, 124, 8, 32),
      span('394,328', 290, 124, 8, 32),
      span('365,817', 370, 124, 8, 32),
    ];
    const layout = buildLayout(spans, 612);
    expect(layout.tables).toHaveLength(1);
    expect(layout.tables?.[0].rowCount).toBe(3);
    expect(layout.tables?.[0].columnCount).toBe(4);
    expect(layout.tables?.[0].rows.map((row) => row.cells.map((cell) => cell.text))).toEqual([
      ['Products', '$ 298,085', '316,199', '297,392'],
      ['Services', '85,200', '78,129', '68,425'],
      ['Total net sales', '383,285', '394,328', '365,817'],
    ]);
  });

  it('suppresses chart-like numeric labels with irregular row cadence', () => {
    const ys = [100, 107, 120, 139, 149, 172];
    const spans = ys.flatMap((y, index) => [
      span(`${80 - index}.0`, 100, y, 8, 20),
      span(`${70 - index * 2}.0`, 180, y + (index % 2 === 0 ? 0 : 1.5), 8, 20),
      span(`${30 + index}.0`, 260, y, 8, 20),
    ]);
    const layout = buildLayout(spans, 612);
    expect(layout.tables).toBeUndefined();
  });

  it('keeps irregular financial tables when numeric columns recur across rows', () => {
    const rows = [
      { label: 'Opening balance', y: 100, values: ['(25.4)', '(2.6)', '(50.2)', '(0.1)', '(78.3)'] },
      { label: 'Changes in valuation period', y: 126, values: ['(0.8)', '(0.1)', '(1.7)', '-', '(2.6)'] },
      { label: 'methods', y: 151, values: ['(0.1)', '0.3', '0.8', '-', '1.0'] },
      { label: 'Changes in law or policy', y: 177, values: ['(1.1)', '-', '-', '-', '(1.1)'] },
      { label: 'assumptions', y: 228, values: ['-', '(0.3)', '(4.5)', '-', '(4.8)'] },
      { label: 'Change in projection base', y: 241, values: ['-', '(0.6)', '(1.5)', '-', '(2.1)'] },
      { label: 'Net change in open group measure', y: 255, values: ['(2.5)', '(0.7)', '(6.9)', '-', '(10.1)'] },
      { label: 'Open group measure, end of year', y: 270, values: ['(27.9)', '(3.3)', '(57.1)', '(0.1)', '(88.4)'] },
    ];
    const valueXs = [260, 315, 370, 425, 480];
    const spans = rows.flatMap((row) => [
      span(row.label, 50, row.y, 9, Math.min(200, row.label.length * 4.5)),
      ...row.values.map((value, index) => span(value, valueXs[index], row.y + 1.2, 9, value.length * 4.5)),
    ]);
    const layout = buildLayout(spans, 560);

    expect(layout.tables).toHaveLength(1);
    expect(layout.tables?.[0].rowCount).toBe(8);
    expect(layout.tables?.[0].columnCount).toBe(6);
    expect(layout.tables?.[0].rows[0].cells.map((cell) => cell.text)).toEqual([
      'Opening balance',
      '(25.4)',
      '(2.6)',
      '(50.2)',
      '(0.1)',
      '(78.3)',
    ]);
  });

  it('splits dense recurring numeric gutters inside table rows', () => {
    const rows = [
      ['2015', '57.6', '73.3', '40.7', '81.2'],
      ['2016', '58.1', '74.3', '42.4', '82.5'],
      ['2017', '58.8', '75.3', '42.5', '83.6'],
      ['2018', '60.0', '76.8', '45.9', '84.8'],
      ['2019', '60.6', '77.7', '47.5', '85.3'],
    ];
    const xs = [80, 120, 150, 180, 210];
    const spans = rows.flatMap((row, rowIndex) =>
      row.map((text, columnIndex) => span(text, xs[columnIndex], 100 + rowIndex * 8, 8, 16)),
    );
    const layout = buildLayout(spans, 300);
    expect(layout.tables?.[0].rows[0].cells.map((cell) => cell.text)).toEqual(['2015', '57.6', '73.3', '40.7', '81.2']);
  });

  it('moves currency symbols that were joined onto the previous table value', () => {
    const spans: TextSpan[] = [
      span('Products', 50, 100, 8, 36),
      span('$', 180, 100, 8, 4),
      span('298,085', 210, 100, 8, 32),
      span('$', 248, 100, 8, 4),
      span('316,199', 290, 100, 8, 32),
      span('$', 328, 100, 8, 4),
      span('297,392', 370, 100, 8, 32),
      span('Services', 50, 112, 8, 34),
      span('85,200', 210, 112, 8, 28),
      span('78,129', 290, 112, 8, 28),
      span('68,425', 370, 112, 8, 28),
    ];
    const layout = buildLayout(spans, 612);

    expect(layout.tables?.[0].rows[0].cells.map((cell) => cell.text)).toEqual([
      'Products',
      '$ 298,085',
      '$ 316,199',
      '$ 297,392',
    ]);
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

  it('does not merge vertical side labels into horizontal text lines', () => {
    const spans: TextSpan[] = [
      { text: '(Version 2)', x: 114, y: 200, width: 45, height: 10, fontSize: 10 },
      { text: 'arXiv:2106.09685v2 [cs.CL] 16 Oct 2021', x: 12, y: 214, width: 20, height: 346, fontSize: 20 },
      span('Abstract body text starts in the main column.', 144, 265, 10, 220),
    ];
    const layout = buildLayout(spans, 612);
    const sidebar = layout.blocks.find((b) => b.text.includes('arXiv'));
    const version = layout.blocks.find((b) => b.text.includes('Version'));

    expect(sidebar?.text).toBe('arXiv:2106.09685v2 [cs.CL] 16 Oct 2021');
    expect(sidebar?.width).toBe(20);
    expect(version?.text).toBe('(Version 2)');
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
