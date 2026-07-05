import { describe, expect, it } from 'vitest';
import { detectPageWarnings } from '../../../src/core/warnings/index.js';
import { page } from './helpers.js';

describe('detectPageWarnings', () => {
  it('flags low-confidence OCR when native extraction needs OCR', () => {
    const out = detectPageWarnings({
      page: 1,
      text: '',
      charCount: 0,
      imageCount: 1,
      vectorCount: 0,
      textCoverage: 0,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 600,
      height: 792,
      quality: { nativeTextStatus: 'empty_but_visual_content', visualStatus: 'ok' },
      ocr: { text: 'partial scanned form text', confidence: 0.38, lang: 'eng' },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'ocr_low_confidence', severity: 'warning' });
    expect(out[0].message).toContain('38.0%');
  });

  it('does not flag low-confidence OCR when native text is already usable', () => {
    const out = detectPageWarnings({
      page: 1,
      text: 'usable native text',
      charCount: 18,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.2,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
      ocr: { text: 'usable native text', confidence: 0.31, lang: 'eng' },
    });
    expect(out.filter((w) => w.code === 'ocr_low_confidence')).toEqual([]);
  });

  it('flags high-confidence OCR that disagrees with short native text', () => {
    const out = detectPageWarnings({
      page: 1,
      text: '6XPPD',
      charCount: 5,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.003,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'ok', visualStatus: 'sparse' },
      ocr: { text: 'Summa', confidence: 0.94, lang: 'eng' },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'ocr_native_text_mismatch', severity: 'warning' });
    expect(out[0].message).toContain('Summa');
    expect(out[0].message).toContain('6XPPD');
  });

  it('does not flag OCR-native mismatches when OCR confidence is low', () => {
    const out = detectPageWarnings({
      page: 1,
      text: '6XPPD',
      charCount: 5,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.003,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'ok', visualStatus: 'sparse' },
      ocr: { text: 'Summa', confidence: 0.62, lang: 'eng' },
    });
    expect(out.filter((w) => w.code === 'ocr_native_text_mismatch')).toEqual([]);
  });

  it('flags high-confidence OCR word mismatches on raster-backed text layers', () => {
    const out = detectPageWarnings(
      {
        page: 1,
        text: 'OF TWO UNPOWEEECD IWNNED PARAGLIDERS',
        charCount: 39,
        imageCount: 1,
        vectorCount: 0,
        textCoverage: 0.12,
        nonPrintableRatio: 0,
        nonPrintableCount: 0,
        width: 612,
        height: 792,
        quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
        ocr: {
          text: 'OF TWO UNPOWERED MANNED PARAGLIDERS',
          confidence: 0.75,
          lang: 'eng',
          words: [{ text: 'MANNED', confidence: 0.93, x: 275, y: 356, width: 44, height: 10 }],
        },
      },
      { rasterBackedTextLayer: true },
    );

    const warning = out.find((w) => w.code === 'ocr_native_text_mismatch');
    expect(warning).toMatchObject({ code: 'ocr_native_text_mismatch', severity: 'warning' });
    expect(warning?.message).toContain('MANNED');
    expect(warning?.message).toContain('IWNNED');
    expect(warning?.message).toContain('--ocr');
  });

  it('does not flag OCR-native mismatches when OCR only captured part of the native text', () => {
    const out = detectPageWarnings({
      page: 1,
      text: 'Project 2061 Science for All Americans Floyd James Rutherford and Andrew Ahlgren',
      charCount: 76,
      imageCount: 0,
      vectorCount: 22,
      textCoverage: 0.03,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
      ocr: { text: 'Project 2061 Science for All Americans', confidence: 0.93, lang: 'eng+jpn' },
    });
    expect(out.filter((w) => w.code === 'ocr_native_text_mismatch')).toEqual([]);
  });

  it('flags high-confidence OCR that preserves word spacing better than raster-backed native text', () => {
    const nativeText =
      'VISIT OUR WEBSITE\nOurwebsite, www.socialsecurity.gov, isa valuableresourcefor\n' +
      'informationaboutall of SocialSecurity programs. Atourwebsite, youalsocan applyfor benefits and requesta statement.';
    const ocrText =
      'VISIT OUR WEBSITE\nOur website, www.socialsecurity.gov, is a valuable resource for\n' +
      'information about all of Social Security programs. At our website, you also can apply for benefits and request a statement.';
    const out = detectPageWarnings(
      {
        ...page([]),
        text: nativeText,
        charCount: nativeText.length,
        imageCount: 2,
        textCoverage: 0.18,
        quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
        ocr: { text: ocrText, confidence: 0.91, lang: 'eng' },
      },
      { rasterBackedTextLayer: true },
    );

    const warning = out.find((w) => w.code === 'ocr_native_spacing_loss');
    expect(warning).toMatchObject({ code: 'ocr_native_spacing_loss', severity: 'warning' });
    expect(warning?.message).toContain('word spacing');
    expect(warning?.message).toContain('word boundaries');
  });

  it('does not flag OCR spacing loss when native and OCR spacing are similar', () => {
    const text =
      'VISIT OUR WEBSITE\nOur website, www.socialsecurity.gov, is a valuable resource for\n' +
      'information about all of Social Security programs. At our website, you also can apply for benefits and request a statement.';
    const out = detectPageWarnings(
      {
        ...page([]),
        text,
        charCount: text.length,
        imageCount: 2,
        textCoverage: 0.18,
        quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
        ocr: { text, confidence: 0.91, lang: 'eng' },
      },
      { rasterBackedTextLayer: true },
    );

    expect(out.filter((w) => w.code === 'ocr_native_spacing_loss')).toEqual([]);
  });

  it('flags low-confidence OCR on raster-backed text layers even when native status is ok', () => {
    const out = detectPageWarnings(
      {
        page: 1,
        text: 'raster-backed OCR layer',
        charCount: 24,
        imageCount: 1,
        vectorCount: 0,
        textCoverage: 0.14,
        nonPrintableRatio: 0,
        nonPrintableCount: 0,
        width: 396,
        height: 600,
        quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
        ocr: { text: '崩れたOCR結果', confidence: 0.43, lang: 'jpn' },
      },
      { rasterBackedTextLayer: true },
    );

    expect(out.map((w) => w.code)).toContain('ocr_low_confidence');
    const warning = out.find((w) => w.code === 'ocr_low_confidence');
    expect(warning?.message).toContain('43.0%');
    expect(warning?.message).toContain('raster-backed text layer');
  });

  it('does not flag low-confidence OCR on blank renders', () => {
    const out = detectPageWarnings({
      page: 1,
      text: '',
      charCount: 0,
      imageCount: 1,
      vectorCount: 0,
      textCoverage: 0,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'empty_but_visual_content', visualStatus: 'blank' },
      ocr: { text: '', confidence: 0, lang: 'eng' },
    });
    expect(out.filter((w) => w.code === 'ocr_low_confidence')).toEqual([]);
  });

  it('flags low-confidence OCR noise on blank renders', () => {
    const out = detectPageWarnings({
      page: 1,
      text: '',
      charCount: 0,
      imageCount: 1,
      vectorCount: 0,
      textCoverage: 0,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'empty', visualStatus: 'blank' },
      ocr: { text: '-— -—— ——\n-\n’\n. BN', confidence: 0.2, lang: 'eng' },
    });

    expect(out.filter((w) => w.code === 'ocr_low_confidence')).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'ocr_low_confidence', severity: 'warning' });
    expect(out[0].message).toContain('blank render');
    expect(out[0].message).toContain('20.0%');
  });
});
