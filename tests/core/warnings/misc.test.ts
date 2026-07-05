import { describe, expect, it } from 'vitest';
import { detectPageWarnings } from '../../../src/core/warnings/index.js';
import type { PageResult } from '../../../src/types/index.js';
import { block, line, page } from './helpers.js';

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

  it('flags long native text runs that are too tiny to read normally', () => {
    const out = detectPageWarnings(
      page(
        [
          block(254, 76, 86, 18, { text: 'AcroForm', lines: [line('AcroForm', 254, 76, 86, 18)] }),
          block(2.84, 839.67, 16.17, 1, {
            text: 'Powered by TCPDF (www.tcpdf.org)',
            repeated: true,
            lines: [
              { text: 'Powered by TCPDF (www.tcpdf.org)', x: 2.84, y: 839.67, width: 16.17, height: 1, fontSize: 1 },
            ],
          }),
        ],
        595.28,
        841.89,
      ),
    );

    expect(out).toEqual([
      expect.objectContaining({
        code: 'tiny_native_text_noise',
        severity: 'warning',
      }),
    ]);
    expect(out[0].message).toContain('Powered by TCPDF');
  });

  it('returns an empty array for a clean single-block page', () => {
    // One body block in the middle of US Letter, well-margined, no
    // chrome, on-page. No rule should fire.
    const out = detectPageWarnings(page([block(50, 50, 500, 600)]));
    expect(out).toEqual([]);
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
