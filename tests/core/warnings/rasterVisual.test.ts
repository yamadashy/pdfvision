import { describe, expect, it } from 'vitest';
import { detectPageWarnings } from '../../../src/core/warnings/index.js';
import { block, page } from './helpers.js';

describe('detectPageWarnings', () => {
  it('suppresses OCR and raster warnings for low-content blank scan pages', () => {
    const out = detectPageWarnings({
      page: 1,
      text: '',
      charCount: 0,
      imageCount: 1,
      vectorCount: 0,
      textCoverage: 0,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 610,
      height: 792,
      renderContentRatio: 0.000703,
      imageBoxes: [{ x: 0, y: 0, width: 610, height: 792 }],
      quality: { nativeTextStatus: 'empty_but_visual_content', visualStatus: 'sparse' },
      ocr: { text: 'EE 5 \\ A i', confidence: 0.5, lang: 'eng' },
    });

    expect(out).toEqual([]);
  });

  it('keeps raster warnings for low-density pages with strong OCR text', () => {
    const out = detectPageWarnings({
      page: 1,
      text: '',
      charCount: 0,
      imageCount: 1,
      vectorCount: 0,
      textCoverage: 0,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 610,
      height: 792,
      renderContentRatio: 0.004746,
      imageBoxes: [{ x: 0, y: 0, width: 610, height: 792 }],
      quality: { nativeTextStatus: 'empty_but_visual_content', visualStatus: 'sparse' },
      ocr: {
        text: 'For sale by the National Technical Information Service, Springfield, Virginia 22151',
        confidence: 0.95,
        lang: 'eng',
      },
    });

    expect(out.map((w) => w.code)).toEqual(['raster_image_no_native_text']);
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

  it('emits only raster no-native-text warning for empty full-page raster scans', () => {
    const out = detectPageWarnings({
      page: 1,
      text: '',
      charCount: 0,
      imageCount: 1,
      vectorCount: 0,
      textCoverage: 0,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 1000,
      height: 1000,
      imageBoxes: [{ x: 0, y: 0, width: 1000, height: 1000 }],
      quality: { nativeTextStatus: 'empty_but_visual_content', visualStatus: 'ok' },
    });

    expect(out.map((w) => w.code)).toEqual(['raster_image_no_native_text']);
  });

  it('keeps large-raster warnings for native-text pages with little image overlap', () => {
    const out = detectPageWarnings({
      ...page([block(700, 50, 200, 200, { text: 'bullet panel' })], 1000, 1000),
      text: 'bullet panel',
      charCount: 12,
      imageCount: 1,
      imageBoxes: [{ x: 0, y: 0, width: 600, height: 600 }],
      quality: { nativeTextStatus: 'ok' },
    });

    expect(out.map((w) => w.code)).toEqual(['large_raster_low_text_overlap']);
  });

  it('keeps large-raster warnings on empty pages below the no-native-text raster threshold', () => {
    const out = detectPageWarnings({
      page: 1,
      text: '',
      charCount: 0,
      imageCount: 1,
      vectorCount: 0,
      textCoverage: 0,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 1000,
      height: 1000,
      imageBoxes: [{ x: 120, y: 140, width: 600, height: 500 }],
      quality: { nativeTextStatus: 'empty_but_visual_content' },
    });

    expect(out.map((w) => w.code)).toEqual(['large_raster_low_text_overlap']);
  });

  it('flags captioned medium raster figures with little overlapping native text', () => {
    // PLOS article-shaped case: a boxplot is not page-dominating, but
    // the nearby figure caption makes the raster chart semantically
    // important and its axis labels are not present as native text.
    const out = detectPageWarnings({
      ...page(
        [
          block(60, 278, 240, 70, {
            text: 'Figure 2. Distribution of citation counts by data availability.',
          }),
          block(330, 80, 220, 240, { text: 'body paragraph text outside the raster figure' }),
        ],
        612,
        792,
      ),
      imageCount: 1,
      imageBoxes: [{ x: 58, y: 60, width: 240, height: 208 }],
      quality: { nativeTextStatus: 'ok' },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      code: 'large_raster_low_text_overlap',
      severity: 'warning',
      imageBoxIndex: 0,
    });
    expect(out[0].message).toContain('captioned raster figure');
    expect(out[0].message).toContain('Figure 2');
  });

  it('does not flag medium raster images without nearby figure captions', () => {
    const out = detectPageWarnings({
      ...page([block(330, 80, 220, 240, { text: 'body paragraph text outside the raster image' })], 612, 792),
      imageCount: 1,
      imageBoxes: [{ x: 58, y: 60, width: 240, height: 208 }],
      quality: { nativeTextStatus: 'ok' },
    });
    expect(out.filter((w) => w.code === 'large_raster_low_text_overlap')).toEqual([]);
  });

  it('deduplicates large-raster warnings for repeated full-page image boxes', () => {
    // Scanned books can expose the same page-sized image through
    // multiple XObject draws. One warning is enough for an agent.
    const out = detectPageWarnings({
      ...page([block(20, 20, 10, 10, { text: 'noise' })], 1000, 1000),
      imageCount: 2,
      imageBoxes: [
        { x: 0, y: 0, width: 1000, height: 1000 },
        { x: 0.3, y: 0.2, width: 999.4, height: 999.6 },
      ],
      quality: { nativeTextStatus: 'sparse_text_with_visual_content' },
    });
    const warnings = out.filter((w) => w.code === 'large_raster_low_text_overlap');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].imageBoxIndex).toBe(0);
  });

  it('keeps large-raster warnings for distinct image regions', () => {
    const out = detectPageWarnings({
      ...page([block(480, 480, 10, 10, { text: 'caption' })], 1000, 1000),
      imageCount: 2,
      imageBoxes: [
        { x: 0, y: 0, width: 500, height: 500 },
        { x: 500, y: 500, width: 500, height: 500 },
      ],
      quality: { nativeTextStatus: 'ok' },
    });
    const warnings = out.filter((w) => w.code === 'large_raster_low_text_overlap');
    expect(warnings).toHaveLength(2);
    expect(warnings.map((w) => w.imageBoxIndex)).toEqual([0, 1]);
  });

  it('flags large raster images on sparse visual pages with only a little native text', () => {
    // SpeakerDeck screenshot slide-shaped case: the title remains as
    // native text, but the rest of the visual slide is a full-page
    // raster image whose labels will not appear in native extraction.
    const out = detectPageWarnings({
      ...page([block(62, 40, 118, 28, { text: 'Repomix' })], 612, 792),
      text: 'Repomix',
      charCount: 9,
      imageCount: 3,
      imageBoxes: [{ x: 0, y: 0, width: 612, height: 792 }],
      textCoverage: 0.012,
      quality: { nativeTextStatus: 'sparse_text_with_visual_content' },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'large_raster_low_text_overlap', severity: 'warning' });
  });

  it('flags large raster images on empty visual pages without native text', () => {
    const out = detectPageWarnings({
      page: 1,
      text: '',
      charCount: 0,
      imageCount: 1,
      vectorCount: 0,
      textCoverage: 0,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 1000,
      height: 1000,
      imageBoxes: [{ x: 120, y: 140, width: 600, height: 500 }],
      quality: { nativeTextStatus: 'empty_but_visual_content' },
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      code: 'large_raster_low_text_overlap',
      severity: 'warning',
      imageBoxIndex: 0,
    });
    expect(out[0].message).toContain('native text is empty');
  });

  it('flags raster-dominated pages whose human-visible text is not native text', () => {
    const out = detectPageWarnings({
      page: 1,
      text: '',
      charCount: 0,
      imageCount: 1,
      vectorCount: 0,
      textCoverage: 0,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 1000,
      height: 1000,
      imageBoxes: [{ x: 0, y: 0, width: 1000, height: 1000 }],
      quality: { nativeTextStatus: 'empty_but_visual_content', visualStatus: 'ok' },
    });

    const warning = out.find((w) => w.code === 'raster_image_no_native_text');
    expect(warning).toMatchObject({
      code: 'raster_image_no_native_text',
      severity: 'warning',
      imageBoxIndex: 0,
    });
    expect(warning?.message).toContain('native text is empty');
    expect(warning?.message).toContain('OCR');
  });

  it('flags tiled raster pages when each tile is below the single-image threshold', () => {
    const out = detectPageWarnings(
      {
        page: 1,
        text: '',
        charCount: 0,
        imageCount: 4,
        vectorCount: 72,
        textCoverage: 0,
        nonPrintableRatio: 0,
        nonPrintableCount: 0,
        width: 1000,
        height: 1000,
        quality: { nativeTextStatus: 'empty_but_visual_content' },
      },
      {
        imageBoxes: [
          { x: 0, y: 0, width: 400, height: 400 },
          { x: 400, y: 0, width: 400, height: 400 },
          { x: 0, y: 400, width: 400, height: 400 },
          { x: 400, y: 400, width: 400, height: 400 },
        ],
      },
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      code: 'large_raster_low_text_overlap',
      severity: 'warning',
    });
    expect(out[0].imageBoxIndex).toBeUndefined();
    expect(out[0].message).toContain('64.0%');
  });

  it('does not aggregate tiny raster icons into a large-raster warning', () => {
    const imageBoxes = Array.from({ length: 30 }, (_, index) => ({
      x: (index % 10) * 50,
      y: Math.floor(index / 10) * 50,
      width: 20,
      height: 20,
    }));
    const out = detectPageWarnings(
      {
        page: 1,
        text: '',
        charCount: 0,
        imageCount: imageBoxes.length,
        vectorCount: 0,
        textCoverage: 0,
        nonPrintableRatio: 0,
        nonPrintableCount: 0,
        width: 1000,
        height: 1000,
        quality: { nativeTextStatus: 'empty_but_visual_content' },
      },
      { imageBoxes },
    );

    expect(out.filter((w) => w.code === 'large_raster_low_text_overlap')).toEqual([]);
  });

  it('uses internal image boxes for sparse visual pages without exposing an imageBoxIndex', () => {
    // Baseline JSON does not include pages[].imageBoxes, but extraction
    // still computes image geometry internally. A scanned or screenshot
    // page with only tiny native text should warn even before the caller
    // knows to re-run with --image-boxes.
    const out = detectPageWarnings(
      {
        page: 1,
        text: 'tiny native text',
        charCount: 16,
        imageCount: 1,
        vectorCount: 0,
        textCoverage: 0.001,
        nonPrintableRatio: 0,
        nonPrintableCount: 0,
        width: 612,
        height: 792,
        quality: { nativeTextStatus: 'sparse_text_with_visual_content' },
      },
      { imageBoxes: [{ x: 0, y: 0, width: 612, height: 792 }] },
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'large_raster_low_text_overlap', severity: 'warning' });
    expect(out[0].imageBoxIndex).toBeUndefined();
    expect(out[0].message).toContain('native text is sparse');
  });

  it('does not add large-raster warnings when native text is already glyph-garbage', () => {
    const out = detectPageWarnings({
      ...page([block(20, 20, 300, 40, { text: '\x00\x01\x02' })], 1000, 1000),
      imageCount: 1,
      imageBoxes: [{ x: 0, y: 0, width: 600, height: 600 }],
      nonPrintableRatio: 0.4,
      nonPrintableCount: 3,
      quality: { nativeTextStatus: 'unusable_glyph_indices' },
    });
    expect(out.filter((w) => w.code === 'large_raster_low_text_overlap')).toEqual([]);
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
});
