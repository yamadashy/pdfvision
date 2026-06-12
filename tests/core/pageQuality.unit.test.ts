import { describe, expect, it } from 'vitest';
import { derivePageQuality } from '../../src/core/pageQuality.js';
import type { PageResult } from '../../src/types/index.js';

function makePage(overrides: Partial<PageResult> = {}): PageResult {
  return {
    page: 1,
    text: '',
    charCount: 0,
    imageCount: 0,
    vectorCount: 0,
    textCoverage: 0,
    nonPrintableRatio: 0,
    nonPrintableCount: 0,
    quality: { nativeTextStatus: 'empty' },
    width: 612,
    height: 792,
    ...overrides,
  };
}

describe('derivePageQuality', () => {
  it('flags mixed glyph indices separately from fully unusable pages', () => {
    const quality = derivePageQuality(
      makePage({
        text: 'garbled prefix on connectivity readable tail',
        charCount: 1330,
        textCoverage: 0.128,
        nonPrintableRatio: 0.141,
        nonPrintableCount: 188,
        renderContentRatio: 0.156,
      }),
    );

    expect(quality).toEqual({
      nativeTextStatus: 'mixed_glyph_indices',
      visualStatus: 'ok',
    });
  });

  it('keeps glyph-index boundary thresholds stable', () => {
    expect(
      derivePageQuality(
        makePage({
          text: 'clean enough',
          charCount: 12,
          nonPrintableRatio: 0.049,
          nonPrintableCount: 1,
        }),
      ).nativeTextStatus,
    ).toBe('ok');
    expect(
      derivePageQuality(
        makePage({
          text: 'mixed garbage',
          charCount: 14,
          nonPrintableRatio: 0.05,
          nonPrintableCount: 1,
        }),
      ).nativeTextStatus,
    ).toBe('mixed_glyph_indices');
    expect(
      derivePageQuality(
        makePage({
          text: 'mostly garbage',
          charCount: 14,
          nonPrintableRatio: 0.3,
          nonPrintableCount: 4,
        }),
      ).nativeTextStatus,
    ).toBe('unusable_glyph_indices');
  });

  it('keeps mostly glyph-index pages classified as unusable', () => {
    const quality = derivePageQuality(
      makePage({
        text: 'glyph garbage',
        charCount: 2760,
        textCoverage: 0.62,
        nonPrintableRatio: 0.62,
        nonPrintableCount: 1706,
      }),
    );

    expect(quality).toEqual({
      nativeTextStatus: 'unusable_glyph_indices',
    });
  });

  it('flags sparse native text that is not visible on a blank render', () => {
    const quality = derivePageQuality(
      makePage({
        text: '4\nI\n9',
        charCount: 5,
        imageCount: 1,
        textCoverage: 0.001,
        renderContentRatio: 0.000021,
      }),
    );

    expect(quality).toEqual({
      nativeTextStatus: 'sparse_text_on_blank_visual',
      visualStatus: 'blank',
    });
  });

  it('keeps tiny corroborated visual traces distinct from blank renders', () => {
    const quality = derivePageQuality(
      makePage({
        vectorCount: 1,
        renderContentRatio: 0.0008,
      }),
    );

    expect(quality).toEqual({
      nativeTextStatus: 'empty_but_visual_content',
      visualStatus: 'sparse',
    });
  });

  it('keeps near-threshold text-only render traces distinct from blank renders', () => {
    const quality = derivePageQuality(
      makePage({
        text: 'This second part of the text is in Page 2',
        charCount: 41,
        textCoverage: 0.004,
        imageCount: 0,
        vectorCount: 0,
        renderContentRatio: 0.000983,
      }),
    );

    expect(quality).toEqual({
      nativeTextStatus: 'ok',
      visualStatus: 'sparse',
    });
  });

  it('classifies low render ratios above the blank threshold as sparse', () => {
    const quality = derivePageQuality(
      makePage({
        renderContentRatio: 0.002,
      }),
    );

    expect(quality).toEqual({
      nativeTextStatus: 'empty_but_visual_content',
      visualStatus: 'sparse',
    });
  });

  it('keeps sparse visible-image pages distinct from blank renders', () => {
    const quality = derivePageQuality(
      makePage({
        text: '3',
        charCount: 1,
        imageCount: 72,
        textCoverage: 0.001,
        renderContentRatio: 0.0516,
      }),
    );

    expect(quality).toEqual({
      nativeTextStatus: 'sparse_text_with_visual_content',
      visualStatus: 'ok',
    });
  });

  it('treats lone watermark text over dense vector forms as sparse native text', () => {
    const quality = derivePageQuality(
      makePage({
        text: 'SAMPLE',
        charCount: 6,
        imageCount: 1,
        vectorCount: 2731,
        textCoverage: 0.111,
        renderContentRatio: 0.08,
      }),
    );

    expect(quality).toEqual({
      nativeTextStatus: 'sparse_text_with_visual_content',
      visualStatus: 'ok',
    });
  });

  it('keeps short text-only pages ok when render pixels come from native text', () => {
    const quality = derivePageQuality(
      makePage({
        text: 'Hello',
        charCount: 5,
        textCoverage: 0.01,
        renderContentRatio: 0.02,
      }),
    );

    expect(quality).toEqual({
      nativeTextStatus: 'ok',
      visualStatus: 'ok',
    });
  });
});
