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
    // must not crash and must not invent warnings.
    const noLayout: PageResult = {
      page: 1,
      text: '',
      charCount: 0,
      imageCount: 0,
      textCoverage: 0,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'empty' },
    };
    expect(detectPageWarnings(noLayout)).toEqual([]);
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
