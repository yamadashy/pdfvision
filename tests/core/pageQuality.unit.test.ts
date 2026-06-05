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
