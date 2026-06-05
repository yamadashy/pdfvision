import { describe, expect, it } from 'vitest';
import { detectPageWarnings } from '../../src/core/warnings.js';
import type { LayoutBlock, PageResult } from '../../src/types/index.js';

/** Build a layout block with sensible defaults the rules don't read.
 *  All four numeric coordinates are required because the rules
 *  inspect bbox geometry. */
function block(x: number, y: number, width: number, height: number, extras: Partial<LayoutBlock> = {}): LayoutBlock {
  return {
    text: extras.text ?? 'body',
    x,
    y,
    width,
    height,
    lines: extras.lines ?? [],
    ...extras,
  };
}

/** Build a PageResult shaped for the detector — only `layout`,
 *  `width`, `height` are read; the density / quality fields are
 *  required by the type but inert here. */
function page(blocks: LayoutBlock[], width = 612, height = 792): PageResult {
  return {
    page: 1,
    text: '',
    charCount: 0,
    imageCount: 0,
    vectorCount: 0,
    textCoverage: 0,
    nonPrintableRatio: 0,
    nonPrintableCount: 0,
    width,
    height,
    layout: { blocks },
    quality: { nativeTextStatus: 'ok' },
  };
}

describe('detectPageWarnings', () => {
  it('returns an empty array when no layout is present', () => {
    // Without layout there are no bboxes to inspect — the detector
    // must not crash and must not invent geometry warnings.
    const noLayout: PageResult = {
      page: 1,
      text: '',
      charCount: 0,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'empty' },
    };
    expect(detectPageWarnings(noLayout)).toEqual([]);
  });

  it('flags localized non-printable glyph noise below the mixed-glyph ratio threshold', () => {
    // Heritage Financial slide p5-shaped case: native text is otherwise
    // usable, but bullet glyphs come through as C1 control code points.
    const out = detectPageWarnings({
      page: 1,
      text: 'strategy bullets',
      charCount: 2600,
      imageCount: 1,
      vectorCount: 0,
      textCoverage: 0.327,
      nonPrintableRatio: 0.007,
      nonPrintableCount: 18,
      width: 720,
      height: 540,
      quality: { nativeTextStatus: 'ok' },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'localized_glyph_noise', severity: 'warning' });
    expect(out[0].message).toContain('18 non-printable');
  });

  it('does not duplicate localized glyph warnings when the page is already classified as mixed glyph indices', () => {
    const out = detectPageWarnings({
      page: 1,
      text: 'mixed garbage',
      charCount: 1330,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.128,
      nonPrintableRatio: 0.141,
      nonPrintableCount: 188,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'mixed_glyph_indices' },
    });
    expect(out.filter((w) => w.code === 'localized_glyph_noise')).toEqual([]);
  });

  it('flags large raster images with little overlapping native text', () => {
    // Investor-slide map case: a large raster area may contain labels
    // that native extraction cannot see even when nearby body text is OK.
    const out = detectPageWarnings({
      ...page([block(700, 50, 200, 200, { text: 'bullet panel' })], 1000, 1000),
      imageCount: 1,
      imageBoxes: [{ x: 0, y: 0, width: 600, height: 600 }],
      quality: { nativeTextStatus: 'ok' },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      code: 'large_raster_low_text_overlap',
      severity: 'warning',
      imageBoxIndex: 0,
    });
    expect(out[0].message).toContain('36.0%');
  });

  it('does not flag a large raster image when native text overlaps the image region', () => {
    const out = detectPageWarnings({
      ...page([block(20, 20, 300, 40, { text: 'native map labels' })], 1000, 1000),
      imageCount: 1,
      imageBoxes: [{ x: 0, y: 0, width: 600, height: 600 }],
      quality: { nativeTextStatus: 'ok' },
    });
    expect(out.filter((w) => w.code === 'large_raster_low_text_overlap')).toEqual([]);
  });

  it('does not claim low text overlap when no text bboxes were requested', () => {
    const out = detectPageWarnings({
      page: 1,
      text: 'native text may overlap the image, but bbox extraction did not run',
      charCount: 61,
      imageCount: 1,
      vectorCount: 0,
      textCoverage: 0.1,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 1000,
      height: 1000,
      imageBoxes: [{ x: 0, y: 0, width: 600, height: 600 }],
      quality: { nativeTextStatus: 'ok' },
    });
    expect(out.filter((w) => w.code === 'large_raster_low_text_overlap')).toEqual([]);
  });

  it('returns an empty array for a clean single-block page', () => {
    // One body block in the middle of US Letter, well-margined, no
    // chrome, on-page. No rule should fire.
    const out = detectPageWarnings(page([block(50, 50, 500, 600)]));
    expect(out).toEqual([]);
  });

  describe('off_page', () => {
    it('flags a block whose bbox extends past the right edge', () => {
      // Page is 612pt wide; block runs to x=900 → off by 288pt.
      const out = detectPageWarnings(page([block(50, 50, 850, 100)]));
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ code: 'off_page', severity: 'error', blockIndex: 0 });
      expect(out[0].message).toContain('right');
    });

    it('flags a block whose bbox extends past the bottom edge', () => {
      const out = detectPageWarnings(page([block(50, 700, 100, 200)]));
      expect(out.some((w) => w.code === 'off_page' && w.message.includes('bottom'))).toBe(true);
    });

    it('does not flag sub-point fractional bleed within OFF_PAGE_TOLERANCE_PT', () => {
      // Block right edge sits at 50 + 562.5 = 612.5, half a point past
      // the 612pt page width — well within the 1pt tolerance that
      // absorbs MediaBox rounding fringes.
      const out = detectPageWarnings(page([block(50, 50, 562.5, 100)]));
      expect(out.filter((w) => w.code === 'off_page')).toEqual([]);
    });

    it('does not flag small proportional title bleed on a large slide page', () => {
      // SpeakerDeck-style PDFs often place large title text a few
      // points past the slide edge. On a 1920x1080 canvas this is a
      // harmless typographic bleed, not a broken extraction.
      const out = detectPageWarnings(page([block(260, -5.5, 1400, 67)], 1920, 1080));
      expect(out.filter((w) => w.code === 'off_page')).toEqual([]);
    });

    it('still flags substantial off-page bleed on a large slide page', () => {
      const out = detectPageWarnings(page([block(260, -20, 1400, 67)], 1920, 1080));
      expect(out.some((w) => w.code === 'off_page' && w.message.includes('top'))).toBe(true);
    });
  });

  describe('text_overlap', () => {
    it('flags two non-repeated blocks whose bboxes overlap', () => {
      // Block A: 50,50 to 350,250. Block B: 200,150 to 500,300.
      // Intersection: 200,150 to 350,250 = 150×100 = 15000 pt².
      const out = detectPageWarnings(page([block(50, 50, 300, 200), block(200, 150, 300, 150)]));
      const overlap = out.find((w) => w.code === 'text_overlap');
      expect(overlap).toBeDefined();
      expect(overlap?.blockIndex).toBe(0);
      expect(overlap?.otherBlockIndex).toBe(1);
      expect(overlap?.message).toMatch(/15000\.0pt²/);
    });

    it('does not flag a sub-1pt² fringe overlap (rounding slack)', () => {
      // Adjacent blocks with a 0.5pt × 0.5pt rounding nick at the
      // corner — the loop's < 1 pt² floor should swallow it.
      const out = detectPageWarnings(page([block(50, 50, 100, 100), block(149.5, 149.5, 100, 100)]));
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('does not flag overlap when one block is repeated chrome', () => {
      // A page-spanning footer that brushes a body block by design
      // shouldn't double-fire; the body_near_repeated_chrome rule is
      // the right channel for that.
      const out = detectPageWarnings(page([block(50, 700, 500, 50), block(50, 720, 500, 30, { repeated: true })]));
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('does not flag tiny inline math fragments that sit inside a paragraph bbox', () => {
      // arXiv PDFs often emit subscripts / superscripts (`t-1`, `1 n`,
      // footnote markers) as separate tiny blocks whose bboxes overlap
      // the surrounding paragraph line. A human reads these as inline
      // notation, not as colliding text.
      const paragraph = block(50, 100, 400, 80, {
        text: 'The decoder consumes y t-1 while predicting the next token.',
        lines: [
          { text: 'The decoder consumes y while predicting', x: 50, y: 100, width: 300, height: 10, fontSize: 10 },
          { text: 'the next token.', x: 50, y: 112, width: 140, height: 10, fontSize: 10 },
        ],
      });
      const subscript = block(178, 104, 12, 7, {
        text: 't-1',
        lines: [{ text: 't-1', x: 178, y: 104, width: 12, height: 7, fontSize: 7 }],
      });
      const out = detectPageWarnings(page([paragraph, subscript]));
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('still flags a small independent label that collides with a text line', () => {
      const paragraph = block(50, 100, 400, 40, {
        text: 'The main paragraph has an overlapping callout.',
        lines: [
          {
            text: 'The main paragraph has an overlapping callout.',
            x: 50,
            y: 100,
            width: 310,
            height: 10,
            fontSize: 10,
          },
        ],
      });
      const label = block(178, 101, 12, 7, {
        text: 'ID',
        lines: [{ text: 'ID', x: 178, y: 101, width: 12, height: 7, fontSize: 7 }],
      });
      const out = detectPageWarnings(page([paragraph, label]));
      expect(out.some((w) => w.code === 'text_overlap')).toBe(true);
    });

    it('still flags a small parenthesized label over ordinary prose', () => {
      const paragraph = block(50, 100, 400, 40, {
        text: 'The main paragraph has an overlapping callout.',
        lines: [
          {
            text: 'The main paragraph has an overlapping callout.',
            x: 50,
            y: 100,
            width: 310,
            height: 10,
            fontSize: 10,
          },
        ],
      });
      const label = block(178, 101, 14, 7, {
        text: '(A)',
        lines: [{ text: '(A)', x: 178, y: 101, width: 14, height: 7, fontSize: 7 }],
      });
      const out = detectPageWarnings(page([paragraph, label]));
      expect(out.some((w) => w.code === 'text_overlap')).toBe(true);
    });

    it('does not flag an indented continuation line inside a loose bullet bbox', () => {
      const bullet = block(236, 458, 152, 25, {
        text: '! Specific rules apply to deter-',
        lines: [
          {
            text: '! Specific rules apply to deter-',
            x: 236,
            y: 458,
            width: 152,
            height: 25,
            fontSize: 19,
          },
        ],
      });
      const continuation = block(260, 470, 128, 10, {
        text: 'mine if you are a resident alien,',
        lines: [
          {
            text: 'mine if you are a resident alien,',
            x: 260,
            y: 470,
            width: 128,
            height: 10,
            fontSize: 10,
          },
        ],
      });
      const out = detectPageWarnings(page([bullet, continuation]));
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('does not treat a trailing exclamation mark as a loose continuation marker', () => {
      const upper = block(236, 458, 152, 10, {
        text: 'Important!',
        lines: [
          {
            text: 'Important!',
            x: 236,
            y: 458,
            width: 152,
            height: 10,
            fontSize: 10,
          },
        ],
      });
      const lower = block(260, 463, 128, 10, {
        text: 'overlapping body line',
        lines: [
          {
            text: 'overlapping body line',
            x: 260,
            y: 463,
            width: 128,
            height: 10,
            fontSize: 10,
          },
        ],
      });
      const out = detectPageWarnings(page([upper, lower]));
      expect(out.some((w) => w.code === 'text_overlap')).toBe(true);
    });

    it('does not flag compact subscript blocks embedded in a displayed formula', () => {
      const formula = block(300, 208, 43, 8, {
        text: 'τ τ −τ',
        lines: [{ text: 'τ τ −τ', x: 300, y: 208, width: 43, height: 8, fontSize: 8 }],
      });
      const subscript = block(328, 211, 4, 6, {
        text: '0',
        lines: [{ text: '0', x: 328, y: 211, width: 4, height: 6, fontSize: 6 }],
      });
      const out = detectPageWarnings(page([formula, subscript]));
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('does not flag small uncertainty rows that are visually part of a table row', () => {
      const row = block(113, 129, 385, 10, {
        text: 'RoB (AdptD)* 0.3M 87.1 94.2 88.5 60.8 93.1 90.2 71.5 89.7 84.4',
        lines: [
          {
            text: 'RoB (AdptD)* 0.3M 87.1 94.2 88.5 60.8 93.1 90.2 71.5 89.7 84.4',
            x: 113,
            y: 129,
            width: 385,
            height: 10,
            fontSize: 10,
          },
        ],
      });
      const uncertainty = block(242, 134, 234, 6, {
        text: '±.0 ±.1 ±1.1 ±.4 ±.1 ±.0 ±2.7 ±.3',
        lines: [
          {
            text: '±.0 ±.1 ±1.1 ±.4 ±.1 ±.0 ±2.7 ±.3',
            x: 242,
            y: 134,
            width: 234,
            height: 6,
            fontSize: 6,
          },
        ],
      });
      const out = detectPageWarnings(page([row, uncertainty]));
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('does not flag compact alphabetic labels embedded in formula text', () => {
      const paragraph = block(108, 472, 195, 10, {
        text: 'trainable parameters is |Θ| = d ×(l +l ).',
        lines: [
          {
            text: 'trainable parameters is |Θ| = d ×(l +l ).',
            x: 108,
            y: 472,
            width: 195,
            height: 10,
            fontSize: 10,
          },
        ],
      });
      const formulaLabel = block(232, 476, 64, 7, {
        text: 'model p i',
        lines: [{ text: 'model p i', x: 232, y: 476, width: 64, height: 7, fontSize: 7 }],
      });
      const out = detectPageWarnings(page([paragraph, formulaLabel]));
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('does not flag symbol-encoded formula fragments over a formula line', () => {
      const formula = block(120, 200, 220, 12, {
        text: 'p(y | x) = softmax(W h)',
        lines: [{ text: 'p(y | x) = softmax(W h)', x: 120, y: 200, width: 220, height: 12, fontSize: 12 }],
      });
      const encoded = block(180, 202, 24, 7, {
        text: '!"# !',
        lines: [{ text: '!"# !', x: 180, y: 202, width: 24, height: 7, fontSize: 7 }],
      });
      const out = detectPageWarnings(page([formula, encoded]));
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('does not flag small centered letter groups that are part of a formula', () => {
      const formula = block(108, 668, 396, 13, {
        text: 'φ(A, B, i, j) = ψ(Ui , Uj) = ‖Ui>U ‖2',
        lines: [
          {
            text: 'φ(A, B, i, j) = ψ(Ui , Uj) = ‖Ui>U ‖2',
            x: 108,
            y: 668,
            width: 396,
            height: 13,
            fontSize: 10,
          },
        ],
      });
      const subscript = block(374, 672, 29, 6, {
        text: 'A B F',
        lines: [{ text: 'A B F', x: 374, y: 672, width: 29, height: 6, fontSize: 5 }],
      });
      const out = detectPageWarnings(page([formula, subscript]));
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('does not flag short variable subscripts embedded in variable lists', () => {
      const formula = block(225, 531, 244, 10, {
        text: 'W , W , W , W 74.1 73.7 74.0 74.0 73.9',
        lines: [
          {
            text: 'W , W , W , W 74.1 73.7 74.0 74.0 73.9',
            x: 225,
            y: 531,
            width: 244,
            height: 10,
            fontSize: 10,
          },
        ],
      });
      const subscript = block(235, 535, 59, 7, {
        text: 'q k v o',
        lines: [{ text: 'q k v o', x: 235, y: 535, width: 59, height: 7, fontSize: 7 }],
      });
      const out = detectPageWarnings(page([formula, subscript]));
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('does not flag mixed alphanumeric formula annotations over math text', () => {
      const formula = block(108, 668, 396, 13, {
        text: 'singular values of Ui>Uj to be σ , σ ,· · · , σ',
        lines: [
          {
            text: 'singular values of Ui>Uj to be σ , σ ,· · · , σ',
            x: 108,
            y: 668,
            width: 396,
            height: 13,
            fontSize: 10,
          },
        ],
      });
      const subscript = block(214, 672, 52, 7, {
        text: 'A B 1 2 p',
        lines: [{ text: 'A B 1 2 p', x: 214, y: 672, width: 52, height: 7, fontSize: 7 }],
      });
      const out = detectPageWarnings(page([formula, subscript]));
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('does not flag numeric subscripts over compact variable lists', () => {
      const formula = block(68, 666, 104, 9, {
        text: 'x y x y x y c',
        lines: [{ text: 'x y x y x y c', x: 68, y: 666, width: 104, height: 9, fontSize: 9 }],
      });
      const subscript = block(72, 671, 72, 7, {
        text: '1 1 2 2 3 3',
        lines: [{ text: '1 1 2 2 3 3', x: 72, y: 671, width: 72, height: 7, fontSize: 7 }],
      });
      const out = detectPageWarnings(page([formula, subscript]));
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });
  });

  describe('near_bottom_edge', () => {
    it('flags a body block whose bottom is within 18pt of the page bottom', () => {
      // US Letter page 792pt tall; block ends at y+height=780 →
      // 12pt from the bottom, under the 18pt threshold.
      const out = detectPageWarnings(page([block(50, 700, 500, 80)]));
      const near = out.find((w) => w.code === 'near_bottom_edge');
      expect(near).toBeDefined();
      expect(near?.blockIndex).toBe(0);
    });

    it('does not flag a body block well above the bottom margin', () => {
      // Block ends at y=700, distance to bottom = 92pt, comfortably above the 18pt threshold.
      const out = detectPageWarnings(page([block(50, 50, 500, 650)]));
      expect(out.filter((w) => w.code === 'near_bottom_edge')).toEqual([]);
    });

    it('does not flag repeated chrome (it lives at the bottom on purpose)', () => {
      // A footer at the bottom margin is normal — the rule is for
      // body text that has drifted too far down.
      const out = detectPageWarnings(page([block(50, 770, 500, 20, { repeated: true })]));
      expect(out.filter((w) => w.code === 'near_bottom_edge')).toEqual([]);
    });

    it('does not flag URL reference blocks at the bottom edge', () => {
      const out = detectPageWarnings(
        page([block(650, 1050, 625, 24, { text: 'https://www.ipa.go.jp/sec/reports/20150331_1.html' })], 1920, 1080),
      );
      expect(out.filter((w) => w.code === 'near_bottom_edge')).toEqual([]);
    });

    it('does not flag centered numeric page numbers at the bottom edge', () => {
      const out = detectPageWarnings(page([block(294, 758, 6, 9, { text: '83' })], 594, 774));
      expect(out.filter((w) => w.code === 'near_bottom_edge')).toEqual([]);
    });

    it('does not flag centered roman numeral page numbers at the bottom edge', () => {
      const out = detectPageWarnings(page([block(294, 758, 8, 9, { text: 'iv' })], 594, 774));
      expect(out.filter((w) => w.code === 'near_bottom_edge')).toEqual([]);
    });

    it('does not flag common Page X of Y labels at the bottom edge', () => {
      const out = detectPageWarnings(page([block(257, 758, 80, 9, { text: 'Page 2 of 10' })], 594, 774));
      expect(out.filter((w) => w.code === 'near_bottom_edge')).toEqual([]);
    });

    it('still flags non-reference body text near the bottom edge', () => {
      const out = detectPageWarnings(page([block(50, 758, 80, 9, { text: 'closing note' })], 594, 774));
      expect(out.some((w) => w.code === 'near_bottom_edge')).toBe(true);
    });

    it('scales the threshold down for small pages so it stays proportional', () => {
      // A 200pt-tall thumbnail: 18pt threshold would be 9% of the
      // page — too aggressive. The min(18, h × 0.025) rule clamps
      // to 5pt for this height (200 × 0.025 = 5).
      const blocks = [block(50, 50, 100, 142)]; // ends at 192, 8pt from bottom
      const out = detectPageWarnings(page(blocks, 200, 200));
      expect(out.filter((w) => w.code === 'near_bottom_edge')).toEqual([]);
      // But block ending 2pt from bottom on the same small page is below the 5pt threshold.
      const tight = detectPageWarnings(page([block(50, 50, 100, 148)], 200, 200));
      expect(tight.some((w) => w.code === 'near_bottom_edge')).toBe(true);
    });
  });

  describe('chromeDetectionReliable context', () => {
    it('suppresses geometry warnings for full-page raster-backed text layers', () => {
      // Hidden OCR text over a scanned page often carries bboxes that
      // do not line up with the pixels a human sees. The processor
      // detects the full-page raster backdrop and asks the warning
      // layer to stay silent for geometry-only findings.
      const out = detectPageWarnings(page([block(50, 50, 300, 200), block(200, 150, 300, 150)]), {
        rasterBackedTextLayer: true,
      });
      expect(out).toEqual([]);
    });

    it('suppresses near_bottom_edge when the cross-page chrome pass had no material', () => {
      // Single-page extraction (`--pages 13 --layout`) — markRepeatedBlocks
      // bails on <2 pages so what's really a running footer reads as a
      // body block. Skipping near_bottom_edge under those conditions
      // is the right trade: silence one warning class on single-page
      // runs rather than fire false positives on every footer.
      const blocks = [block(50, 700, 500, 80)]; // ends 12pt from bottom
      const reliable = detectPageWarnings(page(blocks), { chromeDetectionReliable: true });
      expect(reliable.some((w) => w.code === 'near_bottom_edge')).toBe(true);
      const unreliable = detectPageWarnings(page(blocks), { chromeDetectionReliable: false });
      expect(unreliable.filter((w) => w.code === 'near_bottom_edge')).toEqual([]);
    });

    it('still runs body_near_repeated_chrome even when context says chrome detection was unreliable', () => {
      // body_near_repeated_chrome only fires when a block already has
      // `repeated: true`, so absence of cross-page evidence naturally
      // suppresses it; the gate doesn't need to enforce extra silence.
      const out = detectPageWarnings(page([block(50, 400, 500, 102.5), block(50, 506, 500, 12, { repeated: true })]), {
        chromeDetectionReliable: false,
      });
      expect(out.some((w) => w.code === 'body_near_repeated_chrome')).toBe(true);
    });
  });

  describe('body_near_repeated_chrome', () => {
    it('flags a body block whose bottom is < 6pt above a horizontally-overlapping repeated block', () => {
      // Body ends at y=502.5, chrome starts at y=506 → gap 3.5pt.
      // Mirrors the colopl page-13 scenario codex observed.
      const out = detectPageWarnings(
        page([
          block(50, 400, 500, 102.5, { text: 'body closing line' }),
          block(50, 506, 500, 12, { repeated: true, text: '© COLOPL, Inc.' }),
        ]),
      );
      const near = out.find((w) => w.code === 'body_near_repeated_chrome');
      expect(near).toBeDefined();
      expect(near?.blockIndex).toBe(0);
      expect(near?.otherBlockIndex).toBe(1);
    });

    it('does not flag when the body / chrome are horizontally disjoint', () => {
      // A footer that only lives in the right column shouldn't crowd
      // a body block in the left column.
      const out = detectPageWarnings(page([block(50, 700, 200, 50), block(400, 752, 150, 20, { repeated: true })]));
      expect(out.filter((w) => w.code === 'body_near_repeated_chrome')).toEqual([]);
    });

    it('does not flag a chrome block sitting above the body', () => {
      // A header above the body is fine — the rule pinpoints
      // body-crowding-footer specifically.
      const out = detectPageWarnings(
        page([block(50, 50, 500, 12, { repeated: true, text: 'header' }), block(50, 100, 500, 600)]),
      );
      expect(out.filter((w) => w.code === 'body_near_repeated_chrome')).toEqual([]);
    });

    it('flags actual bbox overlap with a repeated chrome block (negative gap)', () => {
      // Body bottom = 510, chrome top = 502 → vertical intersection
      // 502..510 = 8pt. This is the colopl page-13 worst case: the
      // closing line's bbox literally intersects the footer's bbox.
      // Previously the negative gap was skipped, leaving body↔chrome
      // overlap with no detection channel (text_overlap excludes
      // repeated blocks too).
      const out = detectPageWarnings(
        page([
          block(50, 400, 500, 110, { text: 'body closing line' }),
          block(50, 502, 500, 12, { repeated: true, text: '© COLOPL, Inc.' }),
        ]),
      );
      const overlap = out.find((w) => w.code === 'body_near_repeated_chrome');
      expect(overlap).toBeDefined();
      expect(overlap?.message).toMatch(/overlaps a repeated chrome block by 8\.0pt/);
      expect(overlap?.blockIndex).toBe(0);
      expect(overlap?.otherBlockIndex).toBe(1);
    });

    it('reports true intersection depth when a repeated header dips into the body top', () => {
      // Body at y=100,h=600 (bbox 100..700). Header at y=80,h=40 (bbox
      // 80..120). True vertical intersection = 100..120 = 20pt. The
      // naive `-gap = -(80 - 700) = 620` would report 620pt and let
      // that header outrank a footer barely touching the body's bottom
      // — so the rule must use true intersection depth.
      const out = detectPageWarnings(
        page([block(50, 80, 500, 40, { repeated: true, text: 'header' }), block(50, 100, 500, 600, { text: 'body' })]),
      );
      const overlap = out.find((w) => w.code === 'body_near_repeated_chrome');
      expect(overlap).toBeDefined();
      expect(overlap?.message).toMatch(/overlaps a repeated chrome block by 20\.0pt/);
      expect(overlap?.blockIndex).toBe(1);
      expect(overlap?.otherBlockIndex).toBe(0);
    });

    it('prefers an overlap finding over a near-gap finding when both exist on the same page', () => {
      // Body at y=100,h=400 (bbox 100..500). Header overlaps body top
      // by 10pt (chrome y=90,h=20 → bbox 90..110, overlap 100..110).
      // Footer sits 4pt below body bottom (chrome y=504,h=12). Both
      // chromes match the rule's geometric conditions; the overlap is
      // the worse readability problem so it must win selection.
      const out = detectPageWarnings(
        page([
          block(50, 90, 500, 20, { repeated: true, text: 'header' }),
          block(50, 100, 500, 400, { text: 'body' }),
          block(50, 504, 500, 12, { repeated: true, text: 'footer' }),
        ]),
      );
      const finding = out.find((w) => w.code === 'body_near_repeated_chrome');
      expect(finding).toBeDefined();
      expect(finding?.message).toMatch(/overlaps a repeated chrome block by 10\.0pt/);
      // Selection landed on the header (index 0), not the footer.
      expect(finding?.otherBlockIndex).toBe(0);
    });
  });

  it('sorts warnings deterministically (errors first, then by code + blockIndex)', () => {
    // Combine off_page (error) with text_overlap (warning) to
    // exercise the sort. Off-page must come first regardless of
    // insertion order.
    const out = detectPageWarnings(
      page([
        block(50, 50, 300, 200), // body A
        block(200, 150, 300, 150), // body B (overlap with A)
        block(50, 50, 700, 100), // body C (off right edge)
      ]),
    );
    expect(out[0].severity).toBe('error');
    expect(out[0].code).toBe('off_page');
    expect(out.slice(1).every((w) => w.severity === 'warning')).toBe(true);
  });
});
