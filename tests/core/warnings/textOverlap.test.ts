import { describe, expect, it } from 'vitest';
import { detectPageWarnings } from '../../../src/core/warnings/index.js';
import { block, line, page } from './helpers.js';

describe('detectPageWarnings', () => {
  describe('text_overlap', () => {
    it('flags two non-repeated blocks whose bboxes overlap', () => {
      // Block A: 50,50 to 350,250. Block B: 200,150 to 500,300.
      // Intersection: 200,150 to 350,250 = 150×100 = 15000 pt².
      const out = detectPageWarnings(
        page([
          block(50, 50, 300, 200, { text: 'left column body text' }),
          block(200, 150, 300, 150, { text: 'right diagram label' }),
        ]),
      );
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

    it('does not flag duplicate text extraction blocks with the same bbox', () => {
      // Japanese manuals can emit the same vertical text run twice with
      // virtually identical geometry. That is duplicate extraction, not
      // two visible strings colliding.
      const text = '風雨にさらされるところには、据え付けない';
      const out = detectPageWarnings(
        page([
          block(525.76, 642.82, 12, 227.98, { text, writingMode: 'vertical' }),
          block(525.76, 642.82, 12, 228, { text, writingMode: 'vertical' }),
        ]),
      );
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('does not flag short duplicated vertical headings', () => {
      const text = '安全上のご注意';
      const out = detectPageWarnings(
        page([
          block(775.49, 52.49, 40, 288.32, { text, writingMode: 'vertical' }),
          block(773.17, 54.19, 40, 288.32, { text, writingMode: 'vertical' }),
        ]),
      );
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('does not flag short CJK vertical fragments contained in a larger extraction block', () => {
      const out = detectPageWarnings(
        page([
          block(260, 100, 20, 220, { text: '雷が鳴り出したら洗濯機やコンセントにはさわらないでください。' }),
          block(260, 210, 12, 80, { text: 'ください。', writingMode: 'vertical' }),
        ]),
      );
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('does not flag highly similar contained text extraction blocks', () => {
      // Some CJK PDFs expose a synthetic larger block plus the visual
      // vertical line blocks. The shorter block is readable content
      // duplicated from the larger extraction, not an independent
      // overlapping label.
      const out = detectPageWarnings(
        page([
          block(717.16, 37.36, 29.8, 441.66, {
            text: '※お読みになった後は、次にお使いになる場合にすぐ見られるところへ大切に保管 ※ご使用になる前に、',
          }),
          block(717.16, 166.96, 12, 396.01, {
            text: '次にお使いになる場合にすぐ見られるところへ大切に保管してください。',
            writingMode: 'vertical',
          }),
        ]),
      );
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

    it('does not flag multi-line math annotations sitting on prose lines', () => {
      // PMLR AudioLDM p.3 emits a compact superscript/subscript cluster
      // as a two-line block over the paragraph lines that define E^y and
      // f_audio(.). The visual text is inline notation, not a collision.
      const paragraph = block(55, 677, 234, 35, {
        text: 'We denote audio samples as x and the text description as y. A text encoder f (·) and an audio encoder f (·) are used to extract a text embedding E ∈ R and an audio',
        lines: [
          line('We denote audio samples as x and the text description as', 55, 678, 234, 10),
          line('y. A text encoder f (·) and an audio encoder f (·) are', 55, 690, 234, 10),
          line('used to extract a text embedding E ∈ R and an audio', 55, 702, 234, 10),
        ],
      });
      const annotation = block(201, 694, 118, 14, {
        text: 'audio\ny L N',
        lines: [line('audio', 248, 694, 16, 7), line('y L N', 201, 698, 118, 10)],
      });
      const out = detectPageWarnings(page([paragraph, annotation]));
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('does not flag compact subscript-only variable runs over formula prose', () => {
      // Transformer paper p.4 emits the subscripts from "d_k, d_k and d_v"
      // as a separate tiny block ("k k v") overlapping the prose line.
      // This is normal inline math typography, not a visible collision.
      const paragraph = block(107.64, 658, 396.35, 20.87, {
        text: 'linear projections to d , d and d dimensions, respectively. On each of these projected versions of',
        lines: [
          line(
            'we found it beneficial to linearly project the queries, keys and values h times with different, learned',
            107.64,
            658,
            396.35,
            9.96,
          ),
          line(
            'linear projections to d , d and d dimensions, respectively. On each of these projected versions of',
            108,
            668.91,
            395.99,
            9.96,
          ),
        ],
      });
      const subscripts = block(195.66, 673.4, 48.56, 6.97, {
        text: 'k k v',
        lines: [line('k k v', 195.66, 673.4, 48.56, 6.97)],
      });

      const out = detectPageWarnings(page([paragraph, subscripts]));
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('still flags overlapping compact diagram label groups', () => {
      // Dense figure labels can overlap because the diagram itself is
      // spatial, not a prose line with inline math annotations.
      const upperLabels = block(122, 70, 363, 27, {
        text: 'Text Encoder Audio VAE VAE VAE',
        lines: [
          line('Text Encoder', 122, 70, 60, 8),
          line('Audio VAE', 200, 84, 55, 8),
          line('VAE VAE', 400, 90, 80, 8),
        ],
      });
      const lowerLabels = block(119, 94, 372, 11, {
        text: 'E*ε R) Encoder Encoder Encoder Decoder',
        lines: [line('E*ε R)', 119, 94, 45, 7), line('Encoder Encoder Encoder Decoder', 170, 94, 250, 8)],
      });
      const out = detectPageWarnings(page([upperLabels, lowerLabels]));
      expect(out.filter((w) => w.code === 'text_overlap')).toHaveLength(1);
    });

    it('does not flag overlapping native labels contained in the same raster figure', () => {
      // Screenshot/chart PDFs can expose some labels as native text over
      // a raster panel. Overlapping label bboxes inside that panel are
      // figure structure, not independent page text colliding.
      const upperLabels = block(122, 290, 170, 16, {
        text: 'Hotel Pet Moving 1.8%',
        lines: [line('Hotel Pet Moving 1.8%', 122, 290, 170, 16)],
      });
      const lowerLabels = block(220, 296, 70, 18, {
        text: 'Finance Cook- Weather',
        lines: [line('Finance Cook- Weather', 220, 296, 70, 18)],
      });
      const p = {
        ...page([upperLabels, lowerLabels], 612, 792),
        imageCount: 1,
        imageBoxes: [{ x: 106, y: 256, width: 399, height: 146 }],
      };

      const out = detectPageWarnings(p);
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('still flags overlapping labels outside raster figure regions', () => {
      const upperLabels = block(122, 290, 170, 16, {
        text: 'Hotel Pet Moving 1.8%',
        lines: [line('Hotel Pet Moving 1.8%', 122, 290, 170, 16)],
      });
      const lowerLabels = block(220, 296, 70, 18, {
        text: 'Finance Cook- Weather',
        lines: [line('Finance Cook- Weather', 220, 296, 70, 18)],
      });
      const p = {
        ...page([upperLabels, lowerLabels], 612, 792),
        imageCount: 1,
        imageBoxes: [{ x: 320, y: 60, width: 80, height: 80 }],
      };

      const out = detectPageWarnings(p);
      expect(out.some((w) => w.code === 'text_overlap')).toBe(true);
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

    it('does not flag punctuation-only inline fragments centered on a paragraph line', () => {
      const paragraph = block(100, 100, 260, 14, {
        text: 'Thunderbird ownCloud Nextcloud',
        lines: [{ text: 'Thunderbird ownCloud Nextcloud', x: 100, y: 100, width: 260, height: 14, fontSize: 12 }],
      });
      const comma = block(168, 101, 3.2, 12, {
        text: ',',
        lines: [{ text: ',', x: 168, y: 101, width: 3.2, height: 12, fontSize: 12 }],
      });
      const out = detectPageWarnings(page([paragraph, comma]));
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('does not flag punctuation-only lines inside a neighbouring multi-line block', () => {
      const body = block(127.52, 397.9, 258.16, 14.1, {
        text: 'Thunderbird [10] ownCloud [11] Nextcloud [12][13]',
        lines: [
          {
            text: 'Thunderbird [10] ownCloud [11] Nextcloud [12][13]',
            x: 127.52,
            y: 397.9,
            width: 258.16,
            height: 14.1,
            fontSize: 9.6,
          },
        ],
      });
      const continuation = block(35.5, 400.25, 350.18, 28.5, {
        text: ', and as browser extensions for Google Chrome/Chromium,[14]',
        lines: [
          { text: ',', x: 349.14, y: 400.25, width: 3.23, height: 12, fontSize: 12 },
          {
            text: 'and as browser extensions for Google Chrome/Chromium,[14]',
            x: 35.5,
            y: 414.4,
            width: 350.18,
            height: 14.35,
            fontSize: 12,
          },
        ],
      });
      const out = detectPageWarnings(page([body, continuation]));
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('does not flag compact labels that share bbox slack with display numbers', () => {
      // JICA report page 50-shaped case: the label and a large
      // display number are visually separated, but the number block's
      // bbox includes top slack for a small parenthetical note.
      const label = block(359.38, 665.94, 70.17, 9.95, {
        text: 'ESG債※発行総額',
        lines: [{ text: 'ESG債※発行総額', x: 359.38, y: 665.94, width: 70.17, height: 9.95, fontSize: 9.21 }],
      });
      const value = block(394.54, 669.46, 94.36, 41.14, {
        text: '4,850(2024年3月末現在)',
        lines: [
          {
            text: '4,850(2024年3月末現在)',
            x: 394.54,
            y: 669.46,
            width: 94.36,
            height: 41.14,
            fontSize: 5.95,
          },
        ],
      });
      const out = detectPageWarnings(page([label, value]));
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('does not flag CJK infographic labels that sit above display numbers', () => {
      // JICA report page 13-shaped case: a short category label sits
      // above a large numeric value in the same infographic card. The
      // bboxes overlap, but the visible text is not colliding.
      const label = block(141.97, 361.39, 73.18, 10.63, {
        text: '無償資金協力 3',
        lines: [{ text: '無償資金協力 3', x: 141.97, y: 361.39, width: 73.18, height: 10.63, fontSize: 10.63 }],
      });
      const value = block(131.28, 362.28, 82.69, 46.74, {
        text: '1,553※',
        lines: [{ text: '1,553※', x: 131.28, y: 362.28, width: 82.69, height: 46.74, fontSize: 34.02 }],
      });
      const out = detectPageWarnings(page([label, value]));
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('still flags labels colliding with tall text that merely starts with digits', () => {
      const label = block(250, 104, 54, 10, {
        text: 'Status',
        lines: [{ text: 'Status', x: 250, y: 104, width: 54, height: 10, fontSize: 10 }],
      });
      const heading = block(100, 100, 240, 42, {
        text: '2024 Research Plan',
        lines: [{ text: '2024 Research Plan', x: 100, y: 100, width: 240, height: 42, fontSize: 30 }],
      });

      const out = detectPageWarnings(page([label, heading]));
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

    it('does not flag an indented continuation line under a triangle callout marker', () => {
      const marker = block(465.1, 122.36, 108.51, 14.28, {
        text: '▲ Make sure the SSN(s) above',
        lines: [
          {
            text: '▲ Make sure the SSN(s) above',
            x: 465.1,
            y: 122.36,
            width: 108.51,
            height: 14.28,
            fontSize: 13,
          },
        ],
      });
      const continuation = block(488.3, 130.76, 81.81, 7, {
        text: 'and on line 6c are correct.',
        lines: [
          {
            text: 'and on line 6c are correct.',
            x: 488.3,
            y: 130.76,
            width: 81.81,
            height: 7,
            fontSize: 7,
          },
        ],
      });
      const out = detectPageWarnings(page([marker, continuation]));
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('does not flag adjacent prose blocks when the lower line bbox is inflated by inline math', () => {
      const upper = block(55.44, 416.22, 236.01, 45.82, {
        text: 'A second advantage of using a learned linear reward function.\nfunction in Equation (4). If we do not represent R as a',
        lines: [
          {
            text: 'A second advantage of using a learned linear reward function.',
            x: 55.08,
            y: 416.22,
            width: 236.01,
            height: 9.96,
            fontSize: 10.15,
          },
          {
            text: 'function in Equation (4). If we do not represent R as a',
            x: 55.44,
            y: 452.08,
            width: 234,
            height: 9.96,
            fontSize: 10.16,
          },
        ],
      });
      const lower = block(55.44, 456.57, 234.35, 29.38, {
        text: 'linear combination of pretrained features, and instead let anyθ\nparameter in R change during each proposal, then for m',
        lines: [
          {
            text: 'linear combination of pretrained features, and instead let anyθ',
            x: 55.44,
            y: 456.57,
            width: 234.35,
            height: 17.43,
            fontSize: 9.96,
          },
          {
            text: 'parameter in R change during each proposal, then for m',
            x: 55.44,
            y: 475.99,
            width: 234,
            height: 9.96,
            fontSize: 10.16,
          },
        ],
      });

      const out = detectPageWarnings(page([upper, lower]));
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('does not flag icon markers overlapping the leading edge of callout text', () => {
      const icon = block(317.56, 292.76, 22.48, 21.6, {
        text: '▲',
        lines: [{ text: '▲', x: 317.56, y: 292.76, width: 22.48, height: 21.6, fontSize: 25.2 }],
      });
      const callout = block(326.48, 294.92, 235.51, 18.28, {
        text: '! Multiple jobs. Complete Steps 3 through 4(b) on only',
        lines: [
          {
            text: '! Multiple jobs. Complete Steps 3 through 4(b) on only',
            x: 326.48,
            y: 294.92,
            width: 235.51,
            height: 18.28,
            fontSize: 9,
          },
        ],
      });
      const out = detectPageWarnings(page([icon, callout]));
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

    it('caps noisy overlap pages and summarizes omitted pairs', () => {
      const blocks = Array.from({ length: 12 }, (_, index) =>
        block(50 + index * 2, 50 + index * 2, 120, 120, { text: String.fromCharCode(65 + index).repeat(24) }),
      );

      const overlaps = detectPageWarnings(page(blocks)).filter((w) => w.code === 'text_overlap');
      const detailed = overlaps.filter((w) => w.blockIndex !== undefined);
      const summary = overlaps.find((w) => w.blockIndex === undefined);

      expect(detailed).toHaveLength(8);
      expect(summary?.message).toMatch(/additional block bbox overlaps omitted/);
    });

    it('does not flag overlapping map stipple dot texture blocks as text collisions', () => {
      const dotLines = Array.from({ length: 6 }, (_, index) =>
        line(`${'. '.repeat(24)}${index === 2 ? 'BAY ' : ''}${'. '.repeat(12)}`, 100, 100 + index * 2, 210, 10),
      );
      const nearbyDotLines = Array.from({ length: 5 }, (_, index) =>
        line(`${'. '.repeat(18)}${index === 1 ? 'F ' : ''}${'. '.repeat(16)}`, 110, 104 + index * 2, 200, 10),
      );
      const out = detectPageWarnings(
        page([
          block(100, 100, 220, 24, { text: dotLines.map((item) => item.text).join('\n'), lines: dotLines }),
          block(110, 104, 210, 22, {
            text: nearbyDotLines.map((item) => item.text).join('\n'),
            lines: nearbyDotLines,
          }),
        ]),
      );

      expect(out.some((w) => w.code === 'dot_leader_noise')).toBe(true);
      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
    });

    it('does not flag short single-line dot texture overlaps as text collisions', () => {
      const out = detectPageWarnings(
        page([
          block(100, 100, 120, 12, { text: '... .......... ....' }),
          block(106, 102, 130, 12, { text: '.... ....... ... ..' }),
        ]),
      );

      expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
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
});
