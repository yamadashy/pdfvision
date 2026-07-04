import { describe, expect, it } from 'vitest';
import { detectPageWarnings } from '../../../src/core/warnings/index.js';
import { clusteredChartVectorBoxes, scatteredSmallVectorBoxes } from './helpers.js';

describe('detectPageWarnings', () => {
  it('flags dense vector graphics that may carry form or chart structure outside text', () => {
    // IRS Form 1040-shaped case: text extraction is healthy, but the
    // checkbox/table/form geometry is mostly vector drawing operations.
    const out = detectPageWarnings({
      page: 1,
      text: 'Form 1040 U.S. Individual Income Tax Return',
      charCount: 5337,
      imageCount: 0,
      vectorCount: 502,
      textCoverage: 0.277,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'ok' },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'dense_vector_graphics', severity: 'warning' });
    expect(out[0].message).toContain('502 vector drawing operations');
  });

  it('does not flag text-dominant pages with only scattered small vector decorations', () => {
    const out = detectPageWarnings(
      {
        page: 1,
        text: 'Title and abstract text with decorative identity badges',
        charCount: 4165,
        imageCount: 0,
        vectorCount: 317,
        textCoverage: 0.305,
        nonPrintableRatio: 0,
        nonPrintableCount: 0,
        width: 612,
        height: 792,
        quality: { nativeTextStatus: 'ok' },
      },
      { vectorBoxes: scatteredSmallVectorBoxes(317) },
    );

    expect(out.filter((w) => w.code === 'dense_vector_graphics')).toEqual([]);
  });

  it('still flags dense vector graphics concentrated into a chart-like region', () => {
    const out = detectPageWarnings(
      {
        page: 1,
        text: 'Text around a vector chart',
        charCount: 2600,
        imageCount: 0,
        vectorCount: 260,
        textCoverage: 0.22,
        nonPrintableRatio: 0,
        nonPrintableCount: 0,
        width: 612,
        height: 792,
        quality: { nativeTextStatus: 'ok' },
      },
      { vectorBoxes: clusteredChartVectorBoxes(260) },
    );

    expect(out.filter((w) => w.code === 'dense_vector_graphics')).toHaveLength(1);
  });

  it('falls back to count-only dense vector detection when vector boxes are unavailable', () => {
    const out = detectPageWarnings({
      page: 1,
      text: 'Dense vector page without vector-box extraction',
      charCount: 2400,
      imageCount: 0,
      vectorCount: 260,
      textCoverage: 0.24,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'ok' },
    });

    expect(out.filter((w) => w.code === 'dense_vector_graphics')).toHaveLength(1);
  });

  it('still flags scattered small vector decorations when native text is sparse', () => {
    const out = detectPageWarnings(
      {
        page: 1,
        text: 'Sparse labels',
        charCount: 300,
        imageCount: 0,
        vectorCount: 260,
        textCoverage: 0.05,
        nonPrintableRatio: 0,
        nonPrintableCount: 0,
        width: 612,
        height: 792,
        quality: { nativeTextStatus: 'ok' },
      },
      { vectorBoxes: scatteredSmallVectorBoxes(260) },
    );

    expect(out.filter((w) => w.code === 'dense_vector_graphics')).toHaveLength(1);
  });

  it('does not flag ordinary low-count vector decorations as dense vector graphics', () => {
    const out = detectPageWarnings({
      page: 1,
      text: 'ordinary page with a few rules',
      charCount: 500,
      imageCount: 0,
      vectorCount: 24,
      textCoverage: 0.2,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'ok' },
    });
    expect(out.filter((w) => w.code === 'dense_vector_graphics')).toEqual([]);
  });

  it('flags vector-only visual pages without native text', () => {
    const out = detectPageWarnings({
      page: 1,
      text: '',
      charCount: 0,
      imageCount: 0,
      vectorCount: 1,
      textCoverage: 0,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 200,
      height: 200,
      quality: { nativeTextStatus: 'empty_but_visual_content', visualStatus: 'ok' },
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'vector_graphics_no_native_text', severity: 'warning' });
    expect(out[0].message).toContain('1 vector drawing operation');
  });

  it('does not flag vector-only pages whose only vector boxes are page-edge hairlines', () => {
    const out = detectPageWarnings(
      {
        page: 1,
        text: '',
        charCount: 0,
        imageCount: 0,
        vectorCount: 2,
        textCoverage: 0,
        nonPrintableRatio: 0,
        nonPrintableCount: 0,
        width: 249.45,
        height: 321.22,
        quality: { nativeTextStatus: 'empty_but_visual_content', visualStatus: 'sparse' },
      },
      {
        vectorBoxes: [
          { x: 0, y: -0.2, width: 249.45, height: 0.5 },
          { x: 0, y: 320.72, width: 249.45, height: 0.5 },
        ],
      },
    );

    expect(out.filter((w) => w.code === 'vector_graphics_no_native_text')).toEqual([]);
  });

  it('still flags vector-only pages with an internal hairline diagram', () => {
    const out = detectPageWarnings(
      {
        page: 1,
        text: '',
        charCount: 0,
        imageCount: 0,
        vectorCount: 1,
        textCoverage: 0,
        nonPrintableRatio: 0,
        nonPrintableCount: 0,
        width: 200,
        height: 200,
        quality: { nativeTextStatus: 'empty_but_visual_content', visualStatus: 'sparse' },
      },
      { vectorBoxes: [{ x: 40, y: 90, width: 120, height: 0.5 }] },
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'vector_graphics_no_native_text', severity: 'warning' });
  });

  it('does not flag blank vector-only pages without render evidence', () => {
    const out = detectPageWarnings({
      page: 1,
      text: '',
      charCount: 0,
      imageCount: 0,
      vectorCount: 1,
      textCoverage: 0,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 200,
      height: 200,
      quality: { nativeTextStatus: 'empty_but_visual_content', visualStatus: 'blank' },
    });

    expect(out.filter((w) => w.code === 'vector_graphics_no_native_text')).toEqual([]);
  });
});
