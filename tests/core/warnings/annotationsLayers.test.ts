import { describe, expect, it } from 'vitest';
import { detectPageWarnings } from '../../../src/core/warnings/index.js';
import { page } from './helpers.js';

describe('detectPageWarnings', () => {
  it('warns when optional-content text may include default-hidden layers', () => {
    const out = detectPageWarnings(page([]), {
      optionalContentText: true,
      hasHiddenOptionalContent: true,
    });

    expect(out).toEqual([
      expect.objectContaining({
        code: 'optional_content_text_may_include_hidden_layers',
        severity: 'warning',
      }),
    ]);
  });

  it('does not warn for optional-content text when all layers are visible', () => {
    const out = detectPageWarnings(page([]), {
      optionalContentText: true,
      hasHiddenOptionalContent: false,
    });

    expect(out.some((w) => w.code === 'optional_content_text_may_include_hidden_layers')).toBe(false);
  });

  it('flags visible FreeText annotation contents missing from native page text', () => {
    const out = detectPageWarnings({
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
      quality: { nativeTextStatus: 'empty_but_visual_content', visualStatus: 'ok' },
      annotations: [
        {
          subtype: 'FreeText',
          contents: 'Hello World from Acrobat',
          hasAppearance: true,
          flags: ['print'],
          x: 46.5,
          y: 151.98,
          width: 156.39,
          height: 18.97,
        },
      ],
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      code: 'annotation_text_missing_from_native',
      severity: 'warning',
    });
    expect(out[0].message).toContain('Hello World from Acrobat');
  });

  it('does not flag FreeText annotations already represented in native page text', () => {
    const out = detectPageWarnings({
      page: 1,
      text: 'Hello World from Acrobat',
      charCount: 24,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.01,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
      annotations: [
        {
          subtype: 'FreeText',
          contents: 'Hello World from Acrobat',
          hasAppearance: true,
          flags: ['print'],
          x: 46.5,
          y: 151.98,
          width: 156.39,
          height: 18.97,
        },
      ],
    });

    expect(out.filter((w) => w.code === 'annotation_text_missing_from_native')).toEqual([]);
  });

  it('does not flag hidden or appearance-less FreeText annotations', () => {
    const out = detectPageWarnings({
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
      annotations: [
        {
          subtype: 'FreeText',
          contents: 'Hidden comment',
          hasAppearance: true,
          flags: ['hidden'],
          x: 10,
          y: 20,
          width: 100,
          height: 20,
        },
        {
          subtype: 'FreeText',
          contents: 'No appearance comment',
          hasAppearance: false,
          flags: ['print'],
          x: 10,
          y: 50,
          width: 100,
          height: 20,
        },
      ],
    });

    expect(out.filter((w) => w.code === 'annotation_text_missing_from_native')).toEqual([]);
  });
});
