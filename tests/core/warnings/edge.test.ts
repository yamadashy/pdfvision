import { describe, expect, it } from 'vitest';
import { detectPageWarnings } from '../../../src/core/warnings/index.js';
import type { PageResult } from '../../../src/types/index.js';
import { block, page } from './helpers.js';

describe('detectPageWarnings', () => {
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
      // absorbs page-view rounding fringes.
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

    it('does not flag minor top bleed from a large cover-title font bbox', () => {
      // IRS 1040 instructions cover-shaped case: the visible title is
      // fully on page, but pdf.js reports a tall font bbox whose ascender
      // starts slightly above y=0. That is font-metric bleed, not a
      // broken page extraction.
      const out = detectPageWarnings(page([block(120.45, -9.7, 413.72, 114.63, { text: '1040(and' })], 612, 792));
      expect(out.filter((w) => w.code === 'off_page')).toEqual([]);
    });

    it('still flags substantial off-page bleed on a large slide page', () => {
      const out = detectPageWarnings(page([block(260, -20, 1400, 67)], 1920, 1080));
      expect(out.some((w) => w.code === 'off_page' && w.message.includes('top'))).toBe(true);
    });

    it('does not flag right overhang from a trailing full-width closing paren advance', () => {
      // 総務省白書 title slide: 34.56pt CJK title ends in （概要）flush
      // against the right edge of an 842pt landscape page. The closing
      // paren's advance pushes the reported right edge to 857pt, but
      // its ink ends on the page — a human sees nothing clipped.
      const title = block(349.8, 257.9, 507.25, 34.56, {
        text: '令和7年版情報通信白書(概要)',
        lines: [
          { text: '令和7年版情報通信白書(概要)', x: 349.8, y: 257.9, width: 507.25, height: 34.56, fontSize: 34.56 },
        ],
      });
      const out = detectPageWarnings(page([title], 841.92, 595.32));
      expect(out.filter((w) => w.code === 'off_page')).toEqual([]);
    });

    it('still flags right overhang past the trailing-advance allowance', () => {
      // Same shape but the overhang is a full em — more than trailing
      // punctuation advance can explain, so something really is off-page.
      const title = block(349.8, 257.9, 530, 34.56, {
        text: '令和7年版情報通信白書(概要)',
        lines: [
          { text: '令和7年版情報通信白書(概要)', x: 349.8, y: 257.9, width: 530, height: 34.56, fontSize: 34.56 },
        ],
      });
      const out = detectPageWarnings(page([title], 841.92, 595.32));
      expect(out.some((w) => w.code === 'off_page' && w.message.includes('right'))).toBe(true);
    });

    it('still flags right overhang on a Latin line ending with a paren', () => {
      // ASCII ")" has a narrow advance — a half-em overhang on a Latin
      // line is real bleed, not a font-metric phantom.
      const latin = block(349.8, 257.9, 507.25, 34.56, {
        text: 'Annual Report (Summary)',
        lines: [{ text: 'Annual Report (Summary)', x: 349.8, y: 257.9, width: 507.25, height: 34.56, fontSize: 34.56 }],
      });
      const out = detectPageWarnings(page([latin], 841.92, 595.32));
      expect(out.some((w) => w.code === 'off_page' && w.message.includes('right'))).toBe(true);
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

    it('does not flag short centered bottom labels on slide-like pages', () => {
      const out = detectPageWarnings(page([block(328, 517, 123, 12, { text: 'ものづくり振興施策を掲載' })], 780, 540));
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

    it('does not flag slide deck lecture-number footers at the bottom edge', () => {
      const blocks = [
        block(420.6, 376, 95.97, 20.92, { text: 'Lecture 5 - 1' }),
        block(420.6, 378.85, 102, 20.27, { text: 'Lecture 5 -14' }),
        block(313.53, 380.35, 150.28, 18.02, { text: 'CS231n: Lecture 1 - 49' }),
      ];
      const out = detectPageWarnings(page(blocks, 720, 405));
      expect(out.filter((w) => w.code === 'near_bottom_edge')).toEqual([]);
    });

    it('does not flag short date footers at the bottom edge', () => {
      const out = detectPageWarnings(page([block(530.5, 381.75, 52.58, 18.02, { text: 'April 1,' })], 720, 405));
      expect(out.filter((w) => w.code === 'near_bottom_edge')).toEqual([]);
    });

    it('still flags non-reference body text near the bottom edge', () => {
      const out = detectPageWarnings(page([block(50, 758, 80, 9, { text: 'closing note' })], 594, 774));
      expect(out.some((w) => w.code === 'near_bottom_edge')).toBe(true);
    });

    it('does not flag Japanese source-attribution captions at the bottom edge', () => {
      // Government white-paper chart slides park 「(出典)…」/「…を基に作成」
      // attributions at the bottom of every chart box by design.
      const captions = [
        block(60, 580, 200, 10, { text: '総務省「通信利用動向調査」を基に作成' }),
        block(420, 580, 350, 10, {
          text: '(出典)Reuters Institute for the Study of Journalism「Digital News Report」(2024) を基に作成',
        }),
        block(420, 582, 280, 8, { text: '総務省「情報通信メディアの利用時間と情報行動に関する調査」' }),
        block(42.29, 523.85, 145.21, 9, {
          text: 'CX研究会 資料3事務局提出資料」)',
          lines: [
            {
              text: 'CX研究会 資料3事務局提出資料」)',
              x: 42.29,
              y: 523.85,
              width: 145.21,
              height: 9,
              fontSize: 9,
            },
          ],
        }),
      ];
      const out = detectPageWarnings(page(captions, 841.92, 595.32));
      expect(out.filter((w) => w.code === 'near_bottom_edge')).toEqual([]);
    });

    it('does not flag ※ footnote captions at the bottom edge', () => {
      const footnote = block(60, 582, 700, 10, {
        text: '※主要な事業者のシェアから推計。端数処理の関係や、本推計対象から外れる企業があり得ること等から、例えば、0%と表記されていても、当該国・地域のシェアが全く無いとは限らない。',
      });
      const out = detectPageWarnings(page([footnote], 841.92, 595.32));
      expect(out.filter((w) => w.code === 'near_bottom_edge')).toEqual([]);
    });

    it('does not flag English Source:/Note: captions at the bottom edge', () => {
      const out = detectPageWarnings(
        page([block(60, 580, 300, 10, { text: 'Source: OECD Digital Economy Outlook 2024' })], 841.92, 595.32),
      );
      expect(out.filter((w) => w.code === 'near_bottom_edge')).toEqual([]);
    });

    it('does not flag tiny-font caption tails well below the page body size', () => {
      // 総務省白書 p10: a wrapped citation tail (6.5pt) sits at the very
      // bottom of a slide whose body text runs at 9.6pt. Tiny type at the
      // bottom edge is intentional caption design, not crowded body text.
      const body = block(60, 60, 700, 400, {
        text: 'デジタル空間における情報流通の健全性確保に向けた取組が進められている。',
        lines: [
          {
            text: 'デジタル空間における情報流通の健全性確保に向けた取組が進められている。',
            x: 60,
            y: 60,
            width: 700,
            height: 11,
            fontSize: 9.6,
          },
        ],
      });
      const tail = block(268.9, 578.8, 62.4, 6.5, {
        text: '(第1回)事務局資料',
        lines: [{ text: '(第1回)事務局資料', x: 268.9, y: 578.8, width: 62.4, height: 6.5, fontSize: 6.24 }],
      });
      const out = detectPageWarnings(page([body, tail], 841.92, 595.32));
      expect(out.filter((w) => w.code === 'near_bottom_edge')).toEqual([]);
    });

    it('still flags body-sized text near the bottom edge when line data is present', () => {
      const body = block(60, 60, 700, 400, {
        text: 'main body paragraph text that fills the slide',
        lines: [
          {
            text: 'main body paragraph text that fills the slide',
            x: 60,
            y: 60,
            width: 700,
            height: 11,
            fontSize: 9.6,
          },
        ],
      });
      const crowded = block(60, 580, 400, 10, {
        text: 'closing body sentence pushed to the margin',
        lines: [
          { text: 'closing body sentence pushed to the margin', x: 60, y: 580, width: 400, height: 10, fontSize: 9.6 },
        ],
      });
      const out = detectPageWarnings(page([body, crowded], 841.92, 595.32));
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
    it('surfaces full-page raster-backed text layers while suppressing geometry warnings', () => {
      // Hidden OCR text over a scanned page often carries bboxes that
      // do not line up with the pixels a human sees. The processor
      // detects the full-page raster backdrop and asks the warning layer
      // to report the OCR-layer caveat instead of geometry-only findings.
      const out = detectPageWarnings(
        {
          ...page([block(50, 50, 300, 200), block(200, 150, 300, 150)]),
          imageCount: 2,
          textCoverage: 0.83,
        },
        {
          rasterBackedTextLayer: true,
        },
      );
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ code: 'raster_backed_text_layer', severity: 'warning' });
      expect(out[0].message).toContain('textCoverage 83.0%');
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('can surface raster-backed text layers without public layout output', () => {
      const noLayout: PageResult = {
        page: 1,
        text: 'hidden OCR layer',
        charCount: 16,
        imageCount: 1,
        vectorCount: 0,
        textCoverage: 0.42,
        nonPrintableRatio: 0,
        nonPrintableCount: 0,
        width: 612,
        height: 792,
        quality: { nativeTextStatus: 'ok' },
      };
      const out = detectPageWarnings(noLayout, { rasterBackedTextLayer: true });
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ code: 'raster_backed_text_layer' });
    });

    it('warns when a raster-backed text layer is dominated by printable symbol noise', () => {
      const noisyText =
        'X-693-70-326 RADIO ASTRONOMY EXPLORER-1 DATA DISPLAYS ^ ^ ►,, °^ ^^ _ -- ^- -, . ` ^ ; ^^ (CODE) ^ ^ ^ Q';
      const out = detectPageWarnings(
        {
          page: 1,
          text: noisyText,
          charCount: noisyText.length,
          imageCount: 1,
          vectorCount: 0,
          textCoverage: 0.22,
          nonPrintableRatio: 0,
          nonPrintableCount: 0,
          width: 602,
          height: 874,
          quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
        },
        { rasterBackedTextLayer: true },
      );

      expect(out.some((warning) => warning.code === 'raster_backed_text_layer')).toBe(true);
      expect(out.some((warning) => warning.code === 'raster_text_layer_symbol_noise')).toBe(true);
      expect(out.find((warning) => warning.code === 'raster_text_layer_symbol_noise')?.message).toContain(
        'printable symbols/punctuation',
      );
    });

    it('warns when a raster-backed text layer has fragmented Latin words', () => {
      const fragmentedText = [
        'T E C H N I C A L report text with usable context and broken words',
        'the scan output includes t h e and r e p o r t fragments',
        'another line has a n a l y s i s fragments beside normal prose',
      ]
        .join(' ')
        .repeat(4);
      const out = detectPageWarnings(
        {
          page: 1,
          text: fragmentedText,
          charCount: fragmentedText.length,
          imageCount: 1,
          vectorCount: 0,
          textCoverage: 0.18,
          nonPrintableRatio: 0,
          nonPrintableCount: 0,
          width: 566,
          height: 747,
          quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
        },
        { rasterBackedTextLayer: true },
      );

      expect(out.some((warning) => warning.code === 'raster_backed_text_layer')).toBe(true);
      const warning = out.find((item) => item.code === 'raster_text_layer_word_fragmentation');
      expect(warning).toMatchObject({ code: 'raster_text_layer_word_fragmentation', severity: 'warning' });
      expect(warning?.message).toContain('isolated Latin-letter fragments');
    });

    it('does not add symbol-noise warnings for ordinary raster-backed OCR prose', () => {
      const prose =
        'The first Radio Astronomy Explorer spacecraft was placed in a circular orbit and continuously observed low frequency radio noise.';
      const out = detectPageWarnings(
        {
          page: 1,
          text: prose,
          charCount: prose.length,
          imageCount: 1,
          vectorCount: 0,
          textCoverage: 0.22,
          nonPrintableRatio: 0,
          nonPrintableCount: 0,
          width: 575,
          height: 784,
          quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
        },
        { rasterBackedTextLayer: true },
      );

      expect(out.some((warning) => warning.code === 'raster_backed_text_layer')).toBe(true);
      expect(out.filter((warning) => warning.code === 'raster_text_layer_symbol_noise')).toEqual([]);
      expect(out.filter((warning) => warning.code === 'raster_text_layer_word_fragmentation')).toEqual([]);
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
});
