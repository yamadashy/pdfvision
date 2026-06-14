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

  it('promotes centered all-caps financial statement titles even at body font size', () => {
    const spans: TextSpan[] = [
      span('Apple Inc.', 286.76, 60.08, 8.1, 38.7),
      span('CONSOLIDATED BALANCE SHEETS', 151.45, 78.3, 8.1, 309.31),
      span(
        '(In millions, except number of shares, which are reflected in thousands, and par value)',
        151.45,
        88.65,
        8.1,
        309.31,
      ),
      span('ASSETS:', 288.55, 128.25, 8.1, 35.11),
      span('Current assets:', 19.12, 139.05, 8.1, 122.02),
      span('Cash and cash equivalents', 19.12, 149.85, 8.1, 122.02),
      span('$', 431.83, 149.85, 8.1, 4.5),
      span('29,965', 476.68, 149.85, 8.1, 29.28),
      span('Marketable securities', 19.12, 160.65, 8.1, 122.02),
      span('31,590', 476.68, 160.65, 8.1, 29.28),
    ];

    const layout = buildLayout(spans, 612);
    const title = layout.blocks.find((block) => block.text.includes('CONSOLIDATED BALANCE SHEETS'));
    const company = layout.blocks.find((block) => block.text.includes('Apple Inc.'));
    const body = layout.blocks.find((block) => block.text.includes('Current assets'));

    expect(title?.role).toBe('heading');
    expect(title?.level).toBe(1);
    expect(title?.roleConfidence).toBeGreaterThanOrEqual(0.75);
    expect(company?.role).toBeUndefined();
    expect(body?.role).toBeUndefined();
  });

  it('does not promote Japanese body fragments when dense table text lowers the median font size', () => {
    const tableLines: TextSpan[] = [];
    for (let i = 0; i < 24; i++) {
      tableLines.push(span('総 数 (100.0) ( 13.1) ( 58.7) ( 6.0) ( 3.0) ( 5.9)', 80, 220 + i * 11, 8.28, 360));
    }
    const spans: TextSpan[] = [
      span('また、厚生労働省が行った調査によると、こどもについての悩みがある。', 62, 84, 11.34, 442),
      span('これらの困難があると考えられる。', 62, 104, 11.34, 181),
      span('1. はじめに', 62, 150, 11.34, 80),
      ...tableLines,
    ];

    const layout = buildLayout(spans, 595);
    const prose = layout.blocks.find((block) => block.text.includes('厚生労働省'));
    const sentence = layout.blocks.find((block) => block.text.includes('これらの困難'));
    const heading = layout.blocks.find((block) => block.text.includes('はじめに'));

    expect(prose?.role).toBeUndefined();
    expect(sentence?.role).toBeUndefined();
    expect(heading?.role).toBe('heading');
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

  it('marks standalone decimal-numbered paper sections even when font size matches body', () => {
    const bodyLines: TextSpan[] = [];
    for (let i = 0; i < 10; i++) {
      bodyLines.push(
        span('The paragraph text uses the same font size as the numbered section heading.', 108, 520 + i * 11, 9.96),
      );
    }
    const spans: TextSpan[] = [
      span(
        'The Transformer follows this overall architecture using stacked self-attention and point-wise, fully',
        108,
        434,
        9.96,
        398,
      ),
      span('connected layers for both the encoder and decoder, shown in Figure 1.', 108, 445, 9.96, 360),
      span('3.1 Encoder and Decoder Stacks', 108, 480.68, 9.96, 145.01),
      ...bodyLines,
    ];

    const layout = buildLayout(spans, 612);
    const heading = layout.blocks.find((block) => block.text.includes('3.1 Encoder'));

    expect(heading?.role).toBe('heading');
    expect(heading?.level).toBe(2);
    expect(heading?.roleConfidence).toBeGreaterThanOrEqual(0.65);
  });

  it('marks standalone lettered report sections even when font size matches body', () => {
    const bodyLines: TextSpan[] = [];
    for (let i = 0; i < 10; i++) {
      bodyLines.push(
        span('Report instruction body text establishes a credible body font class.', 97, 220 + i * 14, 12),
      );
    }
    const spans: TextSpan[] = [
      span('A paragraph above the section heading provides surrounding body text.', 97, 100, 12, 390),
      span('C. Preparation of Report.', 72, 152.16, 12, 142.08),
      ...bodyLines,
    ];

    const layout = buildLayout(spans, 612);
    const heading = layout.blocks.find((block) => block.text.includes('Preparation of Report'));

    expect(heading?.role).toBe('heading');
    expect(heading?.level).toBe(2);
    expect(heading?.roleConfidence).toBeGreaterThanOrEqual(0.65);
  });

  it('does not mark tight lettered list items as section headings', () => {
    const spans: TextSpan[] = [
      span('The following alternatives are available to the applicant.', 72, 100, 12, 360),
      span('A. First listed condition.', 97, 115, 12, 150),
      span('B. Second listed condition.', 97, 129, 12, 160),
      span('Body text continues immediately after the lettered list items.', 72, 143, 12, 360),
      span('Additional body text establishes a credible body font class.', 72, 180, 12, 360),
      span('Additional body text establishes a credible body font class.', 72, 194, 12, 360),
      span('Additional body text establishes a credible body font class.', 72, 208, 12, 360),
      span('Additional body text establishes a credible body font class.', 72, 222, 12, 360),
    ];

    const layout = buildLayout(spans, 612);

    expect(layout.blocks.find((block) => block.text.includes('First listed'))?.role).toBeUndefined();
    expect(layout.blocks.find((block) => block.text.includes('Second listed'))?.role).toBeUndefined();
  });

  it('does not treat decimal numeric table cells as numbered section headings', () => {
    const bodyLines: TextSpan[] = [];
    for (let i = 0; i < 10; i++) {
      bodyLines.push(span('Body paragraph text establishes enough credible body content.', 58, 220 + i * 12, 8));
    }
    const spans: TextSpan[] = [
      span('Odds Ratio (95% confidence interval)', 382.68, 93.66, 6.97, 115.49),
      span('6.0 (0.6 to 288.5)', 382.68, 154.43, 6.97, 49.97),
      span('6.4 (2.0 to 21.9)', 382.67, 179.32, 6.97, 46.41),
      ...bodyLines,
    ];

    const layout = buildLayout(spans, 612);

    expect(layout.blocks.find((block) => block.text.includes('6.0'))?.role).toBeUndefined();
    expect(layout.blocks.find((block) => block.text.includes('6.4'))?.role).toBeUndefined();
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

  it('keeps long rotated text spans as separate layout lines', () => {
    const spans: TextSpan[] = [
      {
        text: 'This is my second page. It will have a landscape layout.',
        x: 89.04,
        y: 449.12,
        width: 12,
        height: 270.88,
        fontSize: 12,
      },
      {
        text: 'Second line here.',
        x: 102.84,
        y: 636.96,
        width: 12,
        height: 83.04,
        fontSize: 12,
      },
    ];

    const layout = buildLayout(spans, 612, 792);

    expect(layout.blocks.map((block) => block.text)).toEqual([
      'This is my second page. It will have a landscape layout.',
      'Second line here.',
    ]);
  });

  it('does not classify digit-only page labels as headings', () => {
    const spans: TextSpan[] = [
      span('Software tools', 56, 21, 10.5, 62),
      span('10', 34, 740, 17, 16),
      span('This body text establishes a normal font size for the page.', 56, 120, 10, 300),
      span('More body text keeps the body font credible.', 56, 136, 10, 240),
    ];
    const layout = buildLayout(spans, 595);
    const pageLabel = layout.blocks.find((block) => block.text === '10');

    expect(pageLabel?.role).toBeUndefined();
    expect(pageLabel?.level).toBeUndefined();
    expect(pageLabel?.roleConfidence).toBeUndefined();
  });

  it('marks top-of-slide titles even when bullet text is larger', () => {
    // CS231n slide-shaped case: slide body bullets are visually larger
    // than the top title, but the top title is still the page heading.
    const spans: TextSpan[] = [
      span('Today’s agenda', 42.75, 30.77, 30, 209.55),
      span('● A brief history of computer vision', 41.43, 160.49, 32, 499.4),
      span('● CS231n overview', 41.43, 198.65, 32, 320),
      span('Lecture 1 - 2', 396.13, 375.57, 20, 120.49),
      span('March 30, 2021', 570.13, 375.57, 20, 138.9),
      span('Fei-Fei Li, Ranjay Krishna, Danfei Xu', 12.44, 376.13, 18, 295.88),
    ];
    const layout = buildLayout(spans, 720, 405);
    const title = layout.blocks.find((block) => block.text === 'Today’s agenda');
    const bullets = layout.blocks.find((block) => block.text.includes('brief history'));

    expect(title?.role).toBe('heading');
    expect(title?.level).toBe(1);
    expect(bullets?.role).toBeUndefined();
  });

  it('does not classify arXiv side labels, email metadata, or footnoted bylines as headings', () => {
    const bodyLines: TextSpan[] = [];
    for (let i = 0; i < 20; i++) {
      bodyLines.push(span('Body paragraph line that establishes the article font size.', 72, 250 + i * 12, 10, 420));
    }
    const spans: TextSpan[] = [
      span('Mamba: Linear-Time Sequence Modeling with Selective State Spaces', 76, 90, 17.2, 482),
      span('Albert Gu∗1 and Tri Dao∗2', 254, 130, 12, 124),
      span('agu@cs.cmu.edu, tri@tridao.me', 235, 170, 12, 168),
      {
        text: 'arXiv:2312.00752v2 [cs.LG] 31 May 2024',
        x: 12,
        y: 206,
        width: 20,
        height: 354,
        fontSize: 20,
      },
      ...bodyLines,
    ];

    const layout = buildLayout(spans, 612);
    const title = layout.blocks.find((block) => block.text.includes('Mamba:'));
    const byline = layout.blocks.find((block) => block.text.includes('Albert Gu'));
    const email = layout.blocks.find((block) => block.text.includes('agu@cs.cmu.edu'));
    const sideLabel = layout.blocks.find((block) => block.text.includes('arXiv:'));

    expect(title?.role).toBe('heading');
    expect(byline?.role).toBeUndefined();
    expect(email?.role).toBeUndefined();
    expect(sideLabel?.role).toBeUndefined();
  });

  it('does not classify compact diagram labels as headings', () => {
    const bodyLines: TextSpan[] = [];
    for (let i = 0; i < 20; i++) {
      bodyLines.push(span('Body paragraph line that keeps the median near ten points.', 72, 320 + i * 12, 10, 420));
    }
    const spans: TextSpan[] = [
      span('A', 315, 104, 11.8, 8),
      span('B', 225, 199, 11.8, 8),
      span('C', 400, 199, 11.8, 8),
      span('h!"#', 87, 171, 11.8, 22),
      span('h!', 527, 172, 11.8, 10),
      span('y!', 478, 193, 11.8, 10),
      ...bodyLines,
    ];

    const layout = buildLayout(spans, 612);
    for (const text of ['A', 'B', 'C', 'h!"#', 'h!', 'y!']) {
      const block = layout.blocks.find((candidate) => candidate.text === text);
      expect(block?.role).toBeUndefined();
      expect(block?.roleConfidence).toBeUndefined();
    }
  });

  it('does not classify sentence fragments with small font jitter as level-3 headings', () => {
    const bodyLines: TextSpan[] = [];
    for (let i = 0; i < 20; i++) {
      bodyLines.push(span('Body paragraph line that establishes the paper body median.', 70, 250 + i * 12, 10, 220));
    }
    const spans: TextSpan[] = [
      span('so well from their mainly English training data to', 306, 100, 11, 218),
      span('Intuitively, one way to achieve strong perfor-', 317, 130, 11, 209),
      span('et al., 2023). Our guiding inquiry in this work is', 306, 160, 11, 218),
      ...bodyLines,
    ];

    const layout = buildLayout(spans, 595);
    for (const fragment of ['so well', 'Intuitively', 'et al.']) {
      const block = layout.blocks.find((candidate) => candidate.text.includes(fragment));
      expect(block?.role).toBeUndefined();
      expect(block?.roleConfidence).toBeUndefined();
    }
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

  it('does not merge tiny embedded thumbnail text into a normal caption line', () => {
    const spans: TextSpan[] = [
      span('Figure 2: Title page of the DocLayNet paper - left PDF, right rendered', 108, 369.47, 9.96, 396),
      span(
        'Despite the substantial improvements achieved with machine-learning approaches, document',
        329.6,
        373.21,
        3,
        187.31,
      ),
    ];
    const layout = buildLayout(spans, 595);
    const lineTexts = layout.blocks.flatMap((block) => block.lines.map((line) => line.text));

    expect(lineTexts).toContain('Figure 2: Title page of the DocLayNet paper - left PDF, right rendered');
    expect(lineTexts).toContain(
      'Despite the substantial improvements achieved with machine-learning approaches, document',
    );
    expect(lineTexts).not.toContain(
      'Figure 2: Title page of the DocLayNet paper - left PDF, right renderedDespite the substantial improvements achieved with machine-learning approaches, document',
    );
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

  it('splits recurring right side-panel starts away from adjacent body lines', () => {
    // Wikipedia export-shaped case: body prose and a right infobox table
    // share baselines with only a ~15pt gap. The repeated side-panel start
    // at x≈400 should split even though the gap is just under the hard
    // single-row gutter threshold.
    const spans: TextSpan[] = [
      span('PDF.js is used in', 35.5, 400.25, 12, 88.89),
      span('Thunderbird', 127.52, 400, 12, 68.05),
      span('[10]', 198.8, 397.9, 9.6, 17.22),
      span('ownCloud', 219.16, 400, 12, 53.81),
      span('[11]', 276.2, 397.9, 9.6, 15.45),
      span('Nextcloud', 294.79, 400, 12, 54.35),
      span('[12]', 352.38, 397.9, 9.6, 16.69),
      span('[13]', 369.06, 397.9, 9.6, 16.62),
      span('Original author(s)', 400.75, 394.69, 10.56, 88.59),
      span('Andreas Gal', 496.84, 394.69, 10.56, 58.7),
      span('and as browser extensions for', 35.5, 416.75, 12, 173.58),
      span('Google Chrome', 216.05, 416.5, 12, 86.39),
      span('/', 302.44, 416.75, 12, 5.63),
      span('Chromium', 308.07, 416.5, 12, 57.63),
      span('[14]', 368.93, 414.4, 9.6, 16.75),
      span('Developer(s)', 400.75, 414.19, 10.56, 63.97),
      span('Mozilla', 496.84, 414.19, 10.56, 32.86),
    ];
    const layout = buildLayout(spans, 612);
    const lineTexts = layout.blocks.flatMap((block) => block.lines.map((line) => line.text));

    expect(lineTexts).toContain('Original author(s) Andreas Gal');
    expect(lineTexts).toContain('Developer(s)');
    expect(lineTexts.some((text) => text.includes('Nextcloud') && text.includes('Original author(s)'))).toBe(false);
    expect(lineTexts.some((text) => text.includes('Chromium') && text.includes('Developer(s)'))).toBe(false);
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

  it('keeps numbered column-local headings in their column order', () => {
    const spans: TextSpan[] = [
      span('Abstract body in the left column appears before the introduction.', 70, 100, 10, 220),
      span('Figure 1: Right-column caption that should not precede Introduction.', 306, 130, 10, 220),
      span('Right-column prose continues under the figure caption.', 306, 160, 10, 220),
      span('1 Introduction', 70, 200, 12, 84),
      span('Most modern large language models are trained on English text.', 70, 224, 10, 220),
      span('More right-column prose belongs after the left column.', 306, 254, 10, 220),
    ];

    const layout = buildLayout(spans, 595);
    const texts = layout.blocks.map((b) => b.text);
    const introIndex = texts.findIndex((text) => text.includes('1 Introduction'));
    const figureIndex = texts.findIndex((text) => text.includes('Figure 1:'));

    expect(introIndex).toBeGreaterThan(-1);
    expect(figureIndex).toBeGreaterThan(-1);
    expect(introIndex).toBeLessThan(figureIndex);
  });

  it('keeps ACL first-page left-column introduction before right-column figure captions', () => {
    const spans: TextSpan[] = [
      span('Abstract', 157.75, 218.9, 11.96, 44.49),
      span('We ask whether multilingual language models', 86.54, 240.47, 10.91, 187.58),
      span('trained on unbalanced, English-dominated cor-', 86.54, 254.02, 10.91, 187.58),
      span('pora use English as an internal pivot language-', 86.54, 267.56, 10.91, 187.58),
      span('a question of key importance for understanding', 86.54, 281.1, 10.91, 187.58),
      span('how these systems generalize across languages.', 86.54, 294.64, 10.91, 187.58),
      span('Figure 1: Illustration of logit lens, which applies lan-', 306.14, 424.31, 10.12, 219.94),
      span('guage modeling head prematurely to latent embeddings', 306.14, 436.26, 10.1, 218.63),
      span('intermediate layers decode English flower.', 306.14, 448.21, 10.1, 205),
      span('so well from their mainly English training data to', 306.14, 569.15, 11.05, 218.28),
      span('other languages?', 306.14, 582.69, 10.91, 73.62),
      span('Intuitively, one way to achieve strong perfor-', 316.99, 597.79, 11.13, 209.24),
      span('made available here: https://github.com/', 87.87, 599.14, 10.16, 185.25),
      span('epfl-dlab/llm-latent-language.', 87.87, 611.1, 9.96, 148.45),
      span('mance on non-English data in a data-efficient man-', 306.14, 611.34, 10.91, 220.09),
      span('ner is to use English as a pivot language, by first', 306.14, 624.89, 10.91, 220.09),
      span('translating input to English and then translating back.', 316.99, 638.44, 10.91, 209.24),
      span('glish, and then translating the answer back to the', 306.14, 651.99, 11.13, 218.28),
      span('input language. This method has been shown to', 306.14, 665.54, 11.13, 218.28),
      span('lead to high performance when implemented ex-', 306.14, 679.09, 11.13, 220.09),
      span('plicitly (Shi et al., 2022; Ahuja et al., 2023; Huang', 306.14, 692.64, 10.91, 218.28),
      span('et al., 2023). Our guiding inquiry in this work is', 306.14, 706.19, 11.13, 218.28),
      span('whether pivoting to English also occurs implicitly', 305.75, 719.74, 10.99, 219.05),
      span('when LLMs are prompted in non-English.', 305.75, 733.29, 10.91, 184.23),
      span('In the research community as well as the popular', 316.99, 748.39, 10.91, 207.62),
      span('press, many seem to assume that the answer is yes,', 306.14, 761.94, 10.91, 219.64),
      span('1 Introduction', 70.86, 630.68, 11.96, 82.81),
      span('15366', 285.14, 780.4, 10.91, 27.27),
      span(
        'Proceedings of the 62nd Annual Meeting of the Association for Computational Linguistics',
        51.41,
        804.55,
        7.97,
        492.46,
      ),
    ];

    const layout = buildLayout(spans, 595.28);
    const texts = layout.blocks.map((b) => b.text);
    const introIndex = texts.findIndex((text) => text.includes('1 Introduction'));
    const figureIndex = texts.findIndex((text) => text.includes('Figure 1:'));
    const proceedingsIndex = texts.findIndex((text) => text.includes('Proceedings of the 62nd'));
    const rightBody = texts.find((text) => text.includes('mance on non-English'));

    expect(introIndex).toBeGreaterThan(-1);
    expect(figureIndex).toBeGreaterThan(-1);
    expect(introIndex).toBeLessThan(figureIndex);
    expect(rightBody).toContain('by first\ntranslating input to English');
    expect(rightBody).not.toContain('firsttranslating');
    expect(rightBody).not.toContain('15366');
    expect(rightBody).not.toContain('Proceedings of the 62nd');
    expect(proceedingsIndex).toBeGreaterThan(-1);
  });

  it('moves first-page bottom permission notes after the main two-column body', () => {
    const spans: TextSpan[] = [
      span('Abstract', 54, 333, 10.96, 40),
      span('Left abstract line that begins the main paper body.', 54, 349, 8.97, 239),
      span('Left abstract line that continues before the introduction.', 54, 361, 8.97, 239),
      span('1. Introduction', 54, 566, 10.96, 78),
      span('Left introduction reaches the handoff to the right column.', 54, 582, 8.97, 239),
      span('for example, is the de facto standard for client-side web programming', 54, 618, 8.97, 239),
      span('Permission to make digital or hard copies of all or part of this work for personal or', 54, 665, 6.97, 239),
      span('classroom use is granted without fee provided that copies are not made or distributed', 54, 673, 6.97, 239),
      span(
        'for profit or commercial advantage and that copies bear this notice and the full citation',
        54,
        681,
        6.97,
        239,
      ),
      span('PLDI’09, June 15–20, 2009, Dublin, Ireland.', 54, 707, 6.97, 130),
      span('and is used for the application logic of browser-based productivity', 317, 335, 8.97, 239),
      span('applications such as Google Mail and Google Docs.', 317, 347, 8.97, 239),
      span('Compilers for statically typed languages rely on type information.', 317, 385, 8.97, 239),
    ];

    const layout = buildLayout(spans, 612, 792);
    const texts = layout.blocks.map((block) => block.text);
    const permissionIndex = texts.findIndex((text) => text.includes('Permission to make digital'));
    const venueIndex = texts.findIndex((text) => text.includes('PLDI’09'));
    const rightColumnIndex = texts.findIndex((text) => text.includes('and is used for the application logic'));

    expect(permissionIndex).toBeGreaterThan(-1);
    expect(venueIndex).toBeGreaterThan(-1);
    expect(rightColumnIndex).toBeGreaterThan(-1);
    expect(rightColumnIndex).toBeLessThan(permissionIndex);
    expect(rightColumnIndex).toBeLessThan(venueIndex);
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

  it('does not mark repeated short form control labels as page chrome', () => {
    function makePage(pageNum: number, bodyText: string): PageResult {
      const bodyBlock: LayoutBlock = {
        text: bodyText,
        x: 327,
        y: 38,
        width: 230,
        height: 34,
        lines: [
          { text: bodyText.slice(0, 50), x: 327, y: 38, width: 230, height: 10, fontSize: 10 },
          { text: 'Yes. Continue', x: 350, y: 62.5, width: 62, height: 10, fontSize: 10 },
        ],
      };
      const noBlock: LayoutBlock = {
        text: 'No.',
        x: 466,
        y: 62.9,
        width: 16,
        height: 10,
        lines: [{ text: 'No.', x: 466, y: 62.9, width: 16, height: 10, fontSize: 10 }],
      };
      const stopBlock: LayoutBlock = {
        text: 'STOP',
        x: 488,
        y: 67.3,
        width: 12,
        height: 5.4,
        lines: [{ text: 'STOP', x: 488, y: 67.3, width: 12, height: 5.4, fontSize: 5.4 }],
      };
      return {
        page: pageNum,
        text: `${bodyText}\nNo.\nSTOP`,
        charCount: bodyText.length + 9,
        imageCount: 0,
        vectorCount: 10,
        textCoverage: 0.2,
        nonPrintableRatio: 0,
        nonPrintableCount: 0,
        width: 612,
        height: 792,
        quality: { nativeTextStatus: 'ok' },
        layout: { blocks: [bodyBlock, noBlock, stopBlock] },
      };
    }

    const pages = [
      makePage(20, 'Can you claim the credit for this relative?'),
      makePage(40, 'Is your social security number valid for EIC purposes?'),
      makePage(41, 'Did you have investment income above the threshold?'),
    ];
    markRepeatedBlocks(pages);

    for (const page of pages) {
      expect(page.layout?.blocks[1].repeated).toBeUndefined();
      expect(page.layout?.blocks[2].repeated).toBeUndefined();
      const warnings = detectPageWarnings(page, { chromeDetectionReliable: true });
      expect(warnings.filter((w) => w.code === 'body_near_repeated_chrome')).toEqual([]);
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

  it('marks digit-varying edge footers as repeated chrome', () => {
    function makePage(pageNum: number): PageResult {
      const footer: LayoutBlock = {
        text: `Lecture 5 - ${pageNum}`,
        x: 402.58,
        y: 378.88,
        width: 124,
        height: 20,
        lines: [{ text: `Lecture 5 - ${pageNum}`, x: 402.58, y: 378.88, width: 124, height: 20, fontSize: 18 }],
      };
      return {
        page: pageNum,
        text: footer.text,
        charCount: footer.text.length,
        imageCount: 1,
        vectorCount: 0,
        textCoverage: 0.05,
        nonPrintableRatio: 0,
        nonPrintableCount: 0,
        width: 720,
        height: 405,
        quality: { nativeTextStatus: 'ok' },
        layout: { blocks: [footer] },
      };
    }

    const pages = [makePage(5), makePage(18), makePage(36)];
    markRepeatedBlocks(pages);

    for (const page of pages) {
      expect(page.layout?.blocks[0].repeated).toBe(true);
      const warnings = detectPageWarnings(page, { chromeDetectionReliable: true });
      expect(warnings.filter((w) => w.code === 'near_bottom_edge')).toEqual([]);
    }
  });

  it('splits repeated footer lines away from adjacent body text in the same edge block', () => {
    function makePage(pageNum: number): PageResult {
      const block: LayoutBlock = {
        text: `Stack activations to get a\n6x28x28 output image!\nLecture 5 - ${pageNum}`,
        x: 420.6,
        y: 317.2,
        width: 277.66,
        height: 82.02,
        lines: [
          { text: 'Stack activations to get a', x: 488.15, y: 317.2, width: 210.11, height: 20.28, fontSize: 20.27 },
          { text: '6x28x28 output image!', x: 497.6, y: 341.25, width: 190.61, height: 20.27, fontSize: 20.27 },
          { text: `Lecture 5 - ${pageNum}`, x: 420.6, y: 378.9, width: 105.16, height: 20.32, fontSize: 18.02 },
        ],
      };
      return {
        page: pageNum,
        text: block.text,
        charCount: block.text.length,
        imageCount: 1,
        vectorCount: 0,
        textCoverage: 0.05,
        nonPrintableRatio: 0,
        nonPrintableCount: 0,
        width: 720,
        height: 405,
        quality: { nativeTextStatus: 'ok' },
        layout: { blocks: [block] },
      };
    }

    const pages = [makePage(58), makePage(59), makePage(60)];
    markRepeatedBlocks(pages);

    for (const page of pages) {
      expect(page.layout?.blocks).toHaveLength(2);
      const [body, footer] = page.layout?.blocks ?? [];
      expect(body?.text).toBe('Stack activations to get a\n6x28x28 output image!');
      expect(body?.repeated).toBeUndefined();
      expect(footer?.text).toBe(`Lecture 5 - ${page.page}`);
      expect(footer?.repeated).toBe(true);
      const warnings = detectPageWarnings(page, { chromeDetectionReliable: true });
      expect(warnings.filter((w) => w.code === 'near_bottom_edge')).toEqual([]);
    }
  });

  it('marks spaced digit-only edge page labels as repeated chrome', () => {
    function makePage(pageNum: number, pageLabel: string): PageResult {
      const footer: LayoutBlock = {
        text: pageLabel,
        x: 818,
        y: 576,
        width: pageLabel.length * 5,
        height: 9,
        lines: [{ text: pageLabel, x: 818, y: 576, width: pageLabel.length * 5, height: 9, fontSize: 9 }],
      };
      return {
        page: pageNum,
        text: footer.text,
        charCount: footer.text.length,
        imageCount: 0,
        vectorCount: 0,
        textCoverage: 0.01,
        nonPrintableRatio: 0,
        nonPrintableCount: 0,
        width: 841.89,
        height: 595.28,
        quality: { nativeTextStatus: 'ok' },
        layout: { blocks: [footer] },
      };
    }

    const pages = [makePage(9, '8'), makePage(80, '7 9'), makePage(104, '1 0 3')];
    markRepeatedBlocks(pages);

    expect(pages[0].layout?.blocks[0].repeated).toBeUndefined();
    expect(pages[1].layout?.blocks[0].repeated).toBe(true);
    expect(pages[2].layout?.blocks[0].repeated).toBe(true);

    for (const page of pages) {
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

  it('keeps display-spaced CJK title glyphs on one layout line', () => {
    const spans: TextSpan[] = [span('科', 265.44, 161.04, 15.96, 15.96), span('学', 313.68, 161.04, 15.96, 15.96)];
    const layout = buildLayout(spans, 595);
    expect(layout.blocks).toHaveLength(1);
    expect(layout.blocks[0].lines[0].text).toBe('科 学');
    expect(layout.blocks[0].x).toBe(265.44);
    expect(layout.blocks[0].width).toBe(64.2);
  });

  it('still splits dense CJK glyph rows at column gutters', () => {
    const spans: TextSpan[] = [
      span('北', 50, 80, 10, 10),
      span('海', 62, 80, 10, 10),
      span('道', 110, 80, 10, 10),
      span('東', 122, 80, 10, 10),
    ];
    const layout = buildLayout(spans, 300);
    expect(layout.blocks.flatMap((block) => block.lines.map((line) => line.text))).toEqual(['北海', '道東']);
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

  it('marks tall CJK spans as vertical columns in right-to-left order', () => {
    // PDF.js vertical.pdf-shaped input: each vertical column arrives as
    // one tall span whose text is already top-to-bottom.
    const spans: TextSpan[] = [
      span('あいうえお', 233.86, 21.97, 9.21, 9.21),
      span('日本語', 218.27, 21.97, 9.21, 9.21),
    ];
    spans[0].height = 46.06;
    spans[1].height = 27.64;

    const layout = buildLayout(spans, 300);
    expect(layout.blocks.map((block) => block.text)).toEqual(['あいうえお', '日本語']);
    expect(layout.blocks.every((block) => block.writingMode === 'vertical')).toBe(true);
    expect(layout.blocks.every((block) => block.lines[0]?.writingMode === 'vertical')).toBe(true);
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

  it('preserves tight Latin word spaces in separated word spans', () => {
    // PDF.js bug1513120-shaped case: word spans are separated by only
    // ~0.24em, but the rendered line is normal English with spaces.
    const spans: TextSpan[] = [
      span('Questions', 23.04, 159.84, 12.96, 53.52),
      span('about', 79.68, 159.84, 12.96, 30),
      span('your', 112.8, 159.84, 12.96, 23.76),
      span('bill?', 139.68, 159.84, 12.96, 22.08),
    ];
    const layout = buildLayout(spans);

    expect(layout.blocks[0].lines[0].text).toBe('Questions about your bill?');
  });

  it('does not attach small punctuation-only spans to the next body line', () => {
    // PDF.js bug1513120 also emits a tiny standalone "." just above
    // the next line. It is not a word prefix for "Monday-Friday".
    const spans: TextSpan[] = [
      span('.', 23.04, 175.44, 6.72, 1.68),
      span('Monday-Friday', 23.04, 178.8, 11.28, 66.96),
      span('7', 92.88, 178.8, 11.28, 5.52),
      span('a.m.-9', 101.28, 178.8, 11.28, 28.8),
      span('p.m.', 132.96, 178.8, 11.28, 19.92),
    ];
    const layout = buildLayout(spans);
    const lines = layout.blocks.flatMap((block) => block.lines.map((line) => line.text));

    expect(lines).toEqual(['.', 'Monday-Friday 7 a.m.-9 p.m.']);
  });

  it('keeps Arabic word spaces when shaped word boxes have tight gaps', () => {
    // Arabic shaping can make pdf.js word boxes sit closer than the
    // Latin-oriented font-size gap threshold even though the source
    // text has spaces between words.
    const spans: TextSpan[] = [
      span('العربية', 257.55, 184, 36, 83.92),
      span('اخلطوط', 346.8, 184, 36, 86.94),
      span('انواع', 439.06, 184, 36, 62.93),
    ];
    const layout = buildLayout(spans);

    expect(layout.blocks[0].lines[0].text).toBe('العربية اخلطوط انواع');
  });

  it('does not split Type3-style wide word spacing rows into columns', () => {
    // PDF.js Type3WordSpacing-shaped case: synthetic word spacing can be
    // much wider than ordinary Latin text, but the short word sequence is
    // still one visual line rather than three columns.
    const spans: TextSpan[] = [
      span('ab', 20, 30, 10, 20),
      span('ba', 60, 30, 10, 20),
      span('abba', 100, 30, 10, 40),
      span('ab', 50, 60, 10, 20),
      span('ba', 120, 60, 10, 20),
      span('abba', 190, 60, 10, 40),
    ];
    const layout = buildLayout(spans, 300);

    expect(layout.blocks.flatMap((block) => block.lines.map((line) => line.text))).toEqual([
      'ab ba abba',
      'ab ba abba',
    ]);
  });

  it('splits recurring narrow gutters on wide pages with side panels', () => {
    // A landscape financial-report page can reserve the right third for
    // a numeric side table, so the two body columns span only about 60%
    // of the physical page width. Their gutter is still a recurring visual
    // column break and must not be treated as a wide word space.
    const spans: TextSpan[] = [
      span('left row one contains prose', 27, 70, 11.04, 293),
      span('right row one contains prose', 334.85, 70, 11.04, 285),
      span('left row two contains prose', 27, 83.2, 11.04, 293),
      span('right row two contains prose', 334.85, 83.2, 11.04, 285),
      span('left row three contains prose', 27, 96.4, 11.04, 293),
      span('right row three contains prose', 334.85, 96.4, 11.04, 285),
      span('left row four contains prose', 27, 109.6, 11.04, 293),
      span('right row four contains prose', 334.85, 109.6, 11.04, 285),
      span('Revenue', 669.89, 109.6, 9, 37),
      span('2025e', 805.34, 109.6, 9, 27),
    ];
    const layout = buildLayout(spans, 960);

    const texts = layout.blocks.map((block) => block.text);
    expect(texts).toContain(
      [
        'left row one contains prose',
        'left row two contains prose',
        'left row three contains prose',
        'left row four contains prose',
      ].join('\n'),
    );
    expect(texts).toContain(
      [
        'right row one contains prose',
        'right row two contains prose',
        'right row three contains prose',
        'right row four contains prose',
      ].join('\n'),
    );
    expect(texts.some((text) => text.includes('left row one') && text.includes('right row one'))).toBe(false);
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

  it('preserves leading headers and sparse first rows for wide numeric tables', () => {
    // Attention-paper-shaped case: the table body has stable numeric
    // columns, but the visible header stack and first rows have fewer
    // populated values. Agents still need the crop/table hint to start at
    // the human-visible table top, not at the first fully populated row.
    const spans: TextSpan[] = [
      span('BLEU', 311, 95, 7.5, 24),
      span('Training Cost (FLOPs)', 383, 95, 7.5, 114),
      span('Model', 136, 103, 7.5, 28),
      span('EN-DE EN-FR', 288, 111, 7.5, 68),
      span('EN-DE', 387, 111, 7.5, 28),
      span('EN-FR', 459, 111, 7.5, 28),
      span('ByteNet [18]', 136, 122, 7.5, 50),
      span('23.75', 291, 122, 7.5, 22),
      span('Deep-Att + PosUnk [39]', 136, 134, 7.5, 94),
      span('39.2', 336, 134, 7.5, 18),
      span('1.0 · 10^20', 454, 134, 7.5, 42),
      span('GNMT + RL [38]', 136, 145, 7.5, 60),
      span('24.6', 292, 145, 7.5, 18),
      span('39.92', 336, 145, 7.5, 22),
      span('2.3 · 10^19', 374, 145, 7.5, 42),
      span('1.4 · 10^20', 454, 145, 7.5, 42),
      span('ConvS2S [9]', 136, 156, 7.5, 48),
      span('25.16', 288, 156, 7.5, 22),
      span('40.46', 336, 156, 7.5, 22),
      span('9.6 · 10^18', 374, 156, 7.5, 42),
      span('1.5 · 10^20', 454, 156, 7.5, 42),
      span('MoE [32]', 136, 168, 7.5, 36),
      span('26.03', 288, 168, 7.5, 22),
      span('40.56', 336, 168, 7.5, 22),
      span('2.0 · 10^19', 374, 168, 7.5, 42),
      span('1.2 · 10^20', 454, 168, 7.5, 42),
      span('Transformer base', 136, 180, 7.5, 66),
      span('27.3', 292, 180, 7.5, 18),
      span('38.1', 336, 180, 7.5, 18),
      span('3.3 · 10^18', 374, 180, 7.5, 42),
      span('3.3 · 10^18', 454, 180, 7.5, 42),
    ];
    const layout = buildLayout(spans, 612);
    const rows = layout.tables?.[0].rows.map((row) => row.cells.map((cell) => cell.text));

    expect(layout.tables).toHaveLength(1);
    expect(layout.tables?.[0].y).toBeLessThan(100);
    expect(rows?.slice(0, 5)).toEqual([
      ['BLEU', 'Training Cost (FLOPs)'],
      ['Model'],
      ['EN-DE EN-FR', 'EN-DE', 'EN-FR'],
      ['ByteNet [18]', '23.75'],
      ['Deep-Att + PosUnk [39]', '39.2', '1.0 · 10^20'],
    ]);
    expect(rows).toContainEqual(['GNMT + RL [38]', '24.6', '39.92', '2.3 · 10^19', '1.4 · 10^20']);
  });

  it('keeps benchmark score and percentile rows in wide table hints', () => {
    // GPT-4 technical-report-shaped case: early rows use score/total and
    // percentile cells before the table later switches to plain percent
    // values. These score cells are still numeric table values.
    const spans: TextSpan[] = [
      span('Exam', 160, 112, 7.5, 24),
      span('GPT-4', 300, 112, 7.5, 28),
      span('GPT-4 (no vision)', 372, 112, 7.5, 80),
      span('GPT-3.5', 480, 112, 7.5, 34),
      span('Uniform Bar Exam', 160, 132, 7.5, 74),
      span('298 / 400 (~90th)', 288, 132, 7.5, 72),
      span('298 / 400 (~90th)', 378, 132, 7.5, 72),
      span('213 / 400 (~10th)', 468, 132, 7.5, 72),
      span('LSAT', 160, 148, 7.5, 24),
      span('163 (~88th)', 312, 148, 7.5, 48),
      span('161 (~83rd)', 402, 148, 7.5, 48),
      span('149 (~40th)', 492, 148, 7.5, 48),
      span('SAT Math', 160, 164, 7.5, 42),
      span('700 / 800 (89th)', 296, 164, 7.5, 64),
      span('700 / 800 (89th)', 386, 164, 7.5, 64),
      span('590 / 800 (70th)', 476, 164, 7.5, 64),
      span('GRE Writing', 160, 180, 7.5, 48),
      span('4 (54th - 68th)', 298, 180, 7.5, 62),
      span('4 (54th - 68th)', 388, 180, 7.5, 62),
      span('4 (31st - 48th)', 478, 180, 7.5, 62),
      span('Medical Knowledge', 160, 196, 7.5, 78),
      span('75%', 344, 196, 7.5, 16),
      span('75%', 434, 196, 7.5, 16),
      span('53%', 524, 196, 7.5, 16),
      span('AMC 10', 160, 212, 7.5, 34),
      span('30 / 150', 328, 212, 7.5, 32),
      span('36 / 150', 418, 212, 7.5, 32),
      span('36 / 150', 508, 212, 7.5, 32),
      span('Codeforces Rating', 160, 228, 7.5, 78),
      span('392 (below 5th)', 296, 228, 7.5, 64),
      span('392 (below 5th)', 386, 228, 7.5, 64),
      span('260 (below 5th)', 476, 228, 7.5, 64),
    ];
    const layout = buildLayout(spans, 612);
    const rows = layout.tables?.[0].rows.map((row) => row.cells.map((cell) => cell.text));

    expect(layout.tables).toHaveLength(1);
    expect(layout.tables?.[0].y).toBeLessThan(120);
    expect(rows?.slice(0, 5)).toEqual([
      ['Exam', 'GPT-4', 'GPT-4 (no vision)', 'GPT-3.5'],
      ['Uniform Bar Exam', '298 / 400 (~90th)', '298 / 400 (~90th)', '213 / 400 (~10th)'],
      ['LSAT', '163 (~88th)', '161 (~83rd)', '149 (~40th)'],
      ['SAT Math', '700 / 800 (89th)', '700 / 800 (89th)', '590 / 800 (70th)'],
      ['GRE Writing', '4 (54th - 68th)', '4 (54th - 68th)', '4 (31st - 48th)'],
    ]);
    expect(rows).toContainEqual(['Codeforces Rating', '392 (below 5th)', '392 (below 5th)', '260 (below 5th)']);
  });

  it('ignores decorative dotted rule text when grouping table rows', () => {
    // PLOS-style tables can encode a left dotted border as one tall
    // punctuation-only text line. That decorative line overlaps every
    // data row vertically and must not become the row-grouping anchor.
    const dottedRule: TextSpan = {
      text: '. . . . . . . . . . . . . . . . . . . . . . . . . . . . . .',
      x: 50.11,
      y: 547.81,
      width: 8.97,
      height: 183.47,
      fontSize: 8.97,
    };
    const spans: TextSpan[] = [
      dottedRule,
      span('Table 3. Exploratory regressions on citation count', 64.06, 550.42, 8.97, 220),
      span('Number of articles (% of total)', 174.33, 575.32, 6.97, 94.96),
      span('Number of citations (% of total)', 291.96, 575.32, 6.97, 99.27),
      span('Percent increase in citation count', 409.6, 575.32, 6.97, 105),
      span('p-value', 527.24, 575.32, 6.97, 24),
      span('TOTAL', 66.5, 590.29, 6.97, 20.03),
      span('41', 174.33, 590.29, 6.97, 7.41),
      span('5334', 291.97, 590.29, 6.97, 14.81),
      span('Trial size.25 patients', 66.5, 602.76, 6.97, 64.43),
      span('26 (63%)', 174.33, 602.76, 6.97, 26.02),
      span('3704 (69%)', 291.97, 602.76, 6.97, 33.16),
      span('122%', 409.61, 602.76, 6.97, 16.19),
      span('0.001', 527.24, 602.76, 6.97, 18),
      span('Clinical endpoint', 66.5, 615.17, 6.97, 50.07),
      span('18 (44%)', 174.33, 615.17, 6.97, 26.02),
      span('3404 (64%)', 291.97, 615.17, 6.97, 33.16),
      span('79%', 409.61, 615.17, 6.97, 12.63),
      span('0.01', 527.25, 615.17, 6.97, 12.12),
      span('Affymetrix platform', 66.5, 627.65, 6.97, 57.84),
      span('22 (54%)', 174.33, 627.65, 6.97, 26.02),
      span('2735 (51%)', 291.96, 627.65, 6.97, 33.16),
      span('18%', 409.6, 627.65, 6.97, 12.63),
      span('0.43', 527.24, 627.65, 6.97, 12.12),
    ];
    const layout = buildLayout(spans, 612);
    const rows = layout.tables?.[0].rows.map((row) => row.cells.map((cell) => cell.text));

    expect(layout.tables).toHaveLength(1);
    expect(layout.tables?.[0].columnCount).toBe(5);
    expect(rows).toContainEqual(['TOTAL', '41', '5334']);
    expect(rows).toContainEqual(['Trial size.25 patients', '26 (63%)', '3704 (69%)', '122%', '0.001']);
    expect(rows).toContainEqual(['Clinical endpoint', '18 (44%)', '3404 (64%)', '79%', '0.01']);
  });

  it('emits row-major table hints for two-column numeric year/value rows', () => {
    // Berkshire annual-report-shaped case: a compact year/value table
    // has only two semantic columns, with a detached currency marker on
    // the first value row. It is still a human-visible table whose rows
    // should survive separately from surrounding prose.
    const spans: TextSpan[] = [
      span('it has grown, as the following table shows:', 27, 180.5, 9.5, 156.41),
      span('Year', 91, 195, 9.5, 17.95),
      span('Float (in millions)', 414.25, 195, 9.5, 69.73),
      span('1970', 91, 209.55, 9.5, 19),
      span('$', 402.8, 209.55, 9.5, 4.75),
      span('39', 476.45, 209.55, 9.5, 9.5),
      span('1980', 91, 220.1, 9.5, 19),
      span('237', 471.7, 220.1, 9.5, 14.25),
      span('1990', 91, 230.65, 9.5, 19),
      span('1,632', 464.55, 230.65, 9.5, 21.38),
      span('2000', 91, 241.2, 9.5, 19),
      span('27,871', 459.8, 241.2, 9.5, 26.13),
      span('2010', 91, 251.75, 9.5, 19),
      span('65,832', 459.8, 251.75, 9.5, 26.13),
      span('2020', 91, 262.3, 9.5, 19),
      span('138,503', 455.05, 262.3, 9.5, 30.88),
      span('2022', 91, 272.85, 9.5, 19),
      span('164,109', 455.05, 272.85, 9.5, 30.88),
      span('2023', 91, 283.4, 9.5, 19),
      span('168,895', 455.05, 283.4, 9.5, 30.88),
      span('We may in time experience a decline in float.', 51, 297.4, 9.5, 160),
    ];
    const layout = buildLayout(spans, 594);

    expect(layout.tables).toHaveLength(1);
    expect(layout.tables?.[0].rowCount).toBe(8);
    expect(layout.tables?.[0].columnCount).toBe(2);
    expect(layout.tables?.[0].rows.map((row) => row.cells.map((cell) => cell.text))).toEqual([
      ['1970', '$ 39'],
      ['1980', '237'],
      ['1990', '1,632'],
      ['2000', '27,871'],
      ['2010', '65,832'],
      ['2020', '138,503'],
      ['2022', '164,109'],
      ['2023', '168,895'],
    ]);
  });

  it('trims side-panel financial table rows away from adjacent prose columns', () => {
    // PDF.js marked-content-shaped case: prose columns and a compact
    // financial side panel share y positions. Table hints should describe
    // the side panel, not the full visual row spanning body text.
    const rows = [
      { label: 'Revenue', y: 100, values: ['275.5', '295.6', '319.4', '330.7'] },
      { label: 'EBITA', y: 112, values: ['8.8', '10.3', '12.2', '12.7'] },
      { label: 'Net income', y: 124, values: ['4.4', '5.6', '7.1', '7.5'] },
    ];
    const valueXs = [765, 807, 850, 892];
    const spans = rows.flatMap((row, index) => {
      const prose =
        index === 1
          ? [span("Kreate's EBITA increased to 2.8 MEUR during the quarter.", 335, row.y, 11, 260)]
          : [
              span(`left prose row ${index} with many words`, 27, row.y, 11, 260),
              span(`middle prose row ${index} with many words`, 335, row.y, 11, 260),
            ];
      return [
        ...prose,
        span(row.label, 670, row.y + 1, 9, Math.min(90, row.label.length * 5)),
        ...row.values.map((value, valueIndex) => span(value, valueXs[valueIndex], row.y + 1, 9, value.length * 5)),
      ];
    });
    const layout = buildLayout(spans, 960);

    expect(layout.tables).toHaveLength(1);
    expect(layout.tables?.[0].x).toBeGreaterThanOrEqual(660);
    expect(layout.tables?.[0].columnCount).toBe(5);
    expect(layout.tables?.[0].rows.map((row) => row.cells.map((cell) => cell.text))).toEqual([
      ['Revenue', '275.5', '295.6', '319.4', '330.7'],
      ['EBITA', '8.8', '10.3', '12.2', '12.7'],
      ['Net income', '4.4', '5.6', '7.1', '7.5'],
    ]);
  });

  it('trims adjacent prose after compact numeric table prefixes', () => {
    // ResNet-paper-shaped case: a left-column table can share y-overlap
    // with right-column body prose. The prose line must not become a
    // spurious final table cell.
    const rows = [
      {
        label: 'VGG [40] (v5)',
        y: 291.7,
        values: ['24.4', '7.1'],
        prose: 'Table 3 shows that all three options are considerably bet-',
      },
      {
        label: 'PReLU-net [12]',
        y: 303.75,
        values: ['21.59', '5.71'],
        prose: 'ter than the plain counterpart. B is slightly better than A. We',
      },
      {
        label: 'BN-inception [16]',
        y: 315.81,
        values: ['21.99', '5.81'],
        prose: 'argue that this is because the zero-padded dimensions in A',
      },
      {
        label: 'ResNet-34 B',
        y: 328.26,
        values: ['21.84', '5.71'],
        prose: 'indeed have no residual learning. C is marginally better than',
      },
    ];
    const spans = rows.flatMap((row) => [
      span(row.prose, 320.82, row.y - 4.17, 9.96, 224.3),
      span(row.label, 67.1, row.y, 8.97, Math.min(70, row.label.length * 4.5)),
      span(row.values[0], 201.76, row.y, 8.97, row.values[0].length * 4.5),
      span(row.values[1], 249.16, row.y, 8.97, row.values[1].length * 4.5),
    ]);
    const layout = buildLayout(spans, 612);
    const tableRows = layout.tables?.[0].rows.map((row) => row.cells.map((cell) => cell.text));

    expect(layout.tables).toHaveLength(1);
    expect(layout.tables?.[0].columnCount).toBe(3);
    expect(tableRows).toEqual([
      ['VGG [40] (v5)', '24.4', '7.1'],
      ['PReLU-net [12]', '21.59', '5.71'],
      ['BN-inception [16]', '21.99', '5.81'],
      ['ResNet-34 B', '21.84', '5.71'],
    ]);
  });

  it('does not trim long financial row labels before recurring numeric columns', () => {
    // Berkshire annual-report-shaped case: a long financial row label can
    // look prose-like, but when it is followed by recurring year columns it
    // is part of the table. Side-panel trimming must not drop the label and
    // first value just because there is another numeric gutter later.
    const rows = [
      {
        label: 'Gains (losses) before income taxes and noncontrolling interests',
        y: 100,
        values: ['74,855', '(67,899)', '78,542'],
      },
      { label: 'Income taxes and noncontrolling interests', y: 112, values: ['15,982', '(14,287)', '16,202'] },
      { label: 'Net earnings (loss)', y: 124, values: ['58,873', '(53,612)', '62,340'] },
      { label: 'Effective income tax rate', y: 136, values: ['21.3%', '20.9%', '20.4%'] },
    ];
    const valueXs = [369.95, 437.97, 512.65];
    const spans = rows.flatMap((row) => [
      span(row.label, 45, row.y, 10, Math.min(260, row.label.length * 4.2)),
      ...row.values.map((value, index) => span(value, valueXs[index], row.y, 10, value.length * 4.5)),
    ]);
    const layout = buildLayout(spans, 612);
    const tableRows = layout.tables?.[0].rows.map((row) => row.cells.map((cell) => cell.text));

    expect(tableRows).toContainEqual([
      'Gains (losses) before income taxes and noncontrolling interests',
      '74,855',
      '(67,899)',
      '78,542',
    ]);
    expect(tableRows).toContainEqual(['Income taxes and noncontrolling interests', '15,982', '(14,287)', '16,202']);
  });

  it('keeps numeric-only subtotal rows aligned with recurring financial table columns', () => {
    // Berkshire-style balance sheets often show subtotals as unlabeled
    // numeric rows under the year columns. They are human-visible table
    // rows even though they do not have a label cell.
    const spans: TextSpan[] = [
      span('Assets', 50, 96, 8, 28),
      span('2023', 443, 108, 8, 28),
      span('2022', 516, 108, 8, 28),
      span('Cash and cash equivalents', 55, 120, 8, 120),
      span('33,672', 443, 120, 8, 28),
      span('32,260', 516, 120, 8, 28),
      span('Short-term investments', 55, 132, 8, 108),
      span('31,397', 443, 132, 8, 28),
      span('9,138', 522, 132, 8, 22),
      span('Other', 55, 144, 8, 28),
      span('19,568', 443, 144, 8, 28),
      span('19,657', 516, 144, 8, 28),
      span('811,206', 438, 156, 8, 33),
      span('726,002', 511, 156, 8, 33),
      span('Railroad, Utilities and Energy:', 45, 168, 8, 140),
      span('Cash and cash equivalents*', 55, 180, 8, 124),
      span('2,290', 449, 180, 8, 22),
      span('2,545', 522, 180, 8, 22),
      span('Property, plant and equipment', 55, 192, 8, 132),
      span('170,224', 438, 192, 8, 33),
      span('160,579', 511, 192, 8, 33),
      span('Other', 55, 204, 8, 28),
      span('30,397', 443, 204, 8, 28),
      span('22,190', 516, 204, 8, 28),
      span('258,772', 438, 216, 8, 33),
      span('222,463', 511, 216, 8, 33),
      span('$ 1,069,978 $', 411.65, 228, 8, 78),
      span('948,465', 511, 228, 8, 33),
    ];
    const layout = buildLayout(spans, 612);
    const rows = layout.tables?.[0].rows.map((row) => row.cells.map((cell) => cell.text));

    expect(rows).toContainEqual(['811,206', '726,002']);
    expect(rows).toContainEqual(['258,772', '222,463']);
    expect(rows).toContainEqual(['$ 1,069,978', '$ 948,465']);
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
    const valueXs = [310, 365, 420, 475, 530];
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

  it('attaches label-only continuation rows to the following table row label', () => {
    const rows = [
      {
        label: 'over the next 75 years, beginning of the year',
        y: 100,
        values: ['(25.4)', '(2.6)', '(50.2)', '(0.1)', '(78.3)'],
      },
      { label: 'Changes in valuation period', y: 126, values: ['(0.8)', '(0.1)', '(1.7)', '-', '(2.6)'] },
      { label: 'methods', y: 151, values: ['(0.1)', '0.3', '0.8', '-', '1.0'] },
      { label: 'Changes in law or policy', y: 177, values: ['(1.1)', '-', '-', '-', '(1.1)'] },
      { label: 'assumptions', y: 228, values: ['-', '(0.3)', '(4.5)', '-', '(4.8)'] },
      { label: 'Change in projection base', y: 241, values: ['-', '(0.6)', '(1.5)', '-', '(2.1)'] },
      { label: 'Net change in open group measure', y: 255, values: ['(2.5)', '(0.7)', '(6.9)', '-', '(10.1)'] },
      { label: 'Open group measure, end of year', y: 270, values: ['(27.9)', '(3.3)', '(57.1)', '(0.1)', '(88.4)'] },
    ];
    const valueXs = [310, 365, 420, 475, 530];
    const spans = [
      span('NPV of future revenue less future expenditures', 50, 76, 9, 190),
      span('for current and future participants (open group)', 57, 88, 9, 190),
      span('Reasons for changes in the NPV during the year:', 57, 113, 9, 190),
      ...rows.flatMap((row) => [
        span(row.label, 57, row.y, 9, Math.min(200, row.label.length * 4.5)),
        ...row.values.map((value, index) => span(value, valueXs[index], row.y + 1.2, 9, value.length * 4.5)),
      ]),
    ];
    const layout = buildLayout(spans, 620);

    const labels = (layout.tables ?? []).flatMap((table) => table.rows.map((row) => row.cells[0]?.text));
    expect(labels).toContain(
      'NPV of future revenue less future expenditures for current and future participants (open group) over the next 75 years, beginning of the year',
    );
    expect(labels).toContain('Changes in valuation period');
    expect(labels.some((label) => label?.startsWith('Reasons for changes'))).toBe(false);
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

  it('splits compact numeric side-table gutters with comma and ratio values', () => {
    // PDF.js issue10900-shaped case: a small table can sit far from the
    // page edge and still have recurring numeric gutters that should
    // survive as row-major cells.
    const rows = [
      { y: 178.44, values: ['3', '3', '3', '3'], widths: [4.19, 4.19, 4.19, 4.19] },
      { y: 187.8, values: ['851.5', '854.9', '839.3', '837.5'], widths: [18.95, 18.95, 18.95, 18.95] },
      { y: 198.83, values: ['633.6', '727.8', '789.9', '796.2'], widths: [18.95, 18.95, 18.95, 18.95] },
      { y: 209.03, values: ['1,485.1', '1,582.7', '1,629.2', '1,633.7'], widths: [25.32, 25.31, 25.31, 25.31] },
      { y: 219.23, values: ['114.2', '121.7', '125.3', '130.7'], widths: [18.96, 18.95, 18.95, 18.95] },
      { y: 228.6, values: ['13.0x', '13.0x', '13.0x', '12.5x'], widths: [18.53, 18.53, 18.53, 18.53] },
    ];
    const xs = [
      [474.35, 510.49, 546.61, 582.73],
      [459.6, 495.73, 531.84, 567.96],
      [459.59, 495.72, 531.84, 567.95],
      [453.23, 489.35, 525.46, 561.57],
      [459.59, 495.72, 531.84, 567.95],
      [462.6, 498.72, 534.83, 570.95],
    ];
    const spans = rows.flatMap((row, rowIndex) =>
      row.values.map((value, columnIndex) =>
        span(value, xs[rowIndex][columnIndex], row.y, 7.56, row.widths[columnIndex]),
      ),
    );

    const layout = buildLayout(spans, 612);

    expect(layout.tables).toHaveLength(1);
    expect(layout.tables?.[0].rowCount).toBe(6);
    expect(layout.tables?.[0].columnCount).toBe(4);
    expect(layout.tables?.[0].rows.map((row) => row.cells.map((cell) => cell.text))).toEqual(
      rows.map((row) => row.values),
    );
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

  it('does not merge stacked slide label spans when bboxes are taller than their font', () => {
    // Some slide PDFs report text-item bboxes much taller than the
    // visible glyph line. Use font-size-capped height for line grouping
    // so a lower label line does not glue onto the line above it.
    const spans: TextSpan[] = [
      { text: 'Natural Language', x: 261.65, y: 269.96, width: 127.94, height: 52.84, fontSize: 18 },
      { text: 'Processing', x: 291.79, y: 297.2, width: 79.39, height: 38.8, fontSize: 18 },
    ];
    const layout = buildLayout(spans, 720);
    const lines = layout.blocks.flatMap((block) => block.lines.map((line) => line.text));

    expect(lines).toEqual(['Natural Language', 'Processing']);
    expect(layout.blocks[0].text).toBe('Natural Language\nProcessing');
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
