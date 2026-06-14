import { describe, expect, it } from 'vitest';
import { detectPageWarnings } from '../../src/core/warnings.js';
import type { LayoutBlock, LayoutLine, PageResult } from '../../src/types/index.js';

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

function line(text: string, x: number, y: number, width = 30, height = 8): LayoutLine {
  return { text, x, y, width, height, fontSize: 8 };
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
    vectorCount: 0,
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

  it('suppresses geometry warnings when glyph garbage makes layout bboxes unreliable', () => {
    const out = detectPageWarnings({
      ...page([block(50, -10, 100, 50), block(60, 0, 100, 50)]),
      text: `${'\u0003'.repeat(20)} readable text`,
      charCount: 34,
      nonPrintableCount: 20,
      nonPrintableRatio: 0.2,
      quality: { nativeTextStatus: 'mixed_glyph_indices', visualStatus: 'ok' },
    });

    expect(out.some((w) => w.code === 'glyph_garbage_text')).toBe(true);
    expect(out.filter((w) => w.code === 'off_page')).toEqual([]);
    expect(out.filter((w) => w.code === 'text_overlap')).toEqual([]);
  });

  it('keeps geometry warnings on low-ratio mixed glyph pages', () => {
    const out = detectPageWarnings({
      ...page([block(50, -10, 100, 50)]),
      text: `${'\u0003'.repeat(6)} mostly readable text with localized symbols`,
      charCount: 47,
      nonPrintableCount: 6,
      nonPrintableRatio: 0.06,
      quality: { nativeTextStatus: 'mixed_glyph_indices', visualStatus: 'ok' },
    });

    expect(out.some((w) => w.code === 'glyph_garbage_text')).toBe(true);
    expect(out.some((w) => w.code === 'off_page')).toBe(true);
  });

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

  it('flags localized non-printable glyph noise below the mixed-glyph ratio threshold', () => {
    // Heritage Financial slide p5-shaped case: native text is otherwise
    // usable, but bullet glyphs come through as C1 control code points.
    const out = detectPageWarnings({
      page: 1,
      text: 'strategy bullets',
      charCount: 2600,
      imageCount: 1,
      vectorCount: 0,
      textCoverage: 0.327,
      nonPrintableRatio: 0.007,
      nonPrintableCount: 18,
      width: 720,
      height: 540,
      quality: { nativeTextStatus: 'ok' },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'localized_glyph_noise', severity: 'warning' });
    expect(out[0].message).toContain('18 non-printable');
  });

  it('flags page-wide glyph garbage when native text is mixed or unusable', () => {
    const mixed = detectPageWarnings({
      page: 1,
      text: 'mixed garbage',
      charCount: 1330,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.128,
      nonPrintableRatio: 0.141,
      nonPrintableCount: 188,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'mixed_glyph_indices' },
    });
    expect(mixed[0]).toMatchObject({ code: 'glyph_garbage_text', severity: 'warning' });
    expect(mixed[0].message).toContain('partly raw glyph-index garbage');
    expect(mixed[0].message).toContain('14.1%');

    const unusable = detectPageWarnings({
      page: 1,
      text: '￿￿￿￿',
      charCount: 4,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.004,
      nonPrintableRatio: 1,
      nonPrintableCount: 4,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'unusable_glyph_indices' },
    });
    expect(unusable[0]).toMatchObject({ code: 'glyph_garbage_text', severity: 'warning' });
    expect(unusable[0].message).toContain('mostly raw glyph-index garbage');
    expect(unusable[0].message).toContain('100.0%');
  });

  it('flags private-use glyph code text when the whole page is PUA-dominant', () => {
    // PDF.js issue215-shaped case: the visible page says "OPENMAGAZIN",
    // but the text stream is printable PUA glyph IDs with no usable
    // Unicode mapping. `nonPrintableRatio` intentionally stays 0.
    const out = detectPageWarnings({
      page: 1,
      text: '\uf76f\uf770\uf765\uf76e\uf76d\uf761\uf767\uf761\uf77a\uf769\uf76e',
      charCount: 11,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.03,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 595.28,
      height: 841.89,
      quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'glyph_garbage_text', severity: 'warning' });
    expect(out[0].message).toContain('private-use glyph codes');
    expect(out[0].message).toContain('100.0% PUA');
  });

  it('flags short private-use glyph code pages when all text is PUA', () => {
    const out = detectPageWarnings({
      page: 1,
      text: '\uf8f2\uf8f3',
      charCount: 2,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.07,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 200,
      height: 50,
      quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'glyph_garbage_text', severity: 'warning' });
    expect(out[0].message).toContain('100.0% PUA');
  });

  it('does not flag isolated private-use icon glyphs in otherwise readable text', () => {
    const out = detectPageWarnings({
      page: 1,
      text: 'Download \uf019 report',
      charCount: 17,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.03,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
    });
    expect(out.filter((w) => w.code === 'glyph_garbage_text')).toEqual([]);
    expect(out.filter((w) => w.code === 'localized_glyph_noise')).toEqual([]);
  });

  it('flags localized private-use glyphs when they dominate a short text run', () => {
    const out = detectPageWarnings({
      page: 1,
      text: '\ue0e0cm',
      charCount: 3,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.06,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 200,
      height: 50,
      quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'localized_glyph_noise', severity: 'warning' });
    expect(out[0].message).toContain('private-use glyph code');
    expect(out[0].message).toContain('33.3% PUA');
  });

  it('flags repeated private-use glyphs inside otherwise readable math text', () => {
    const text =
      'Readable vector worksheet '.repeat(8) +
      '\uf0d7 \uf076 \uf02d \uf02b \uf0b1 \uf03d \uf0b0 \uf0e5 \uf076 \uf02b \uf03d \uf0b1';
    const out = detectPageWarnings({
      page: 1,
      text,
      charCount: text.length,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.12,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'localized_glyph_noise', severity: 'warning' });
    expect(out[0].message).toContain('12 private-use glyph codes');
  });

  it('flags pdf.js font mapping warnings when printable native text otherwise looks ok', () => {
    const out = detectPageWarnings(
      {
        page: 1,
        text: '’>in',
        charCount: 4,
        imageCount: 0,
        vectorCount: 0,
        textCoverage: 0.04,
        nonPrintableRatio: 0,
        nonPrintableCount: 0,
        width: 120,
        height: 40,
        quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
      },
      { pdfJsWarnings: ['Warning: No cmap table available.'] },
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'font_mapping_warning', severity: 'warning' });
    expect(out[0].message).toContain('No cmap table available');
  });

  it('does not duplicate font mapping warnings on pages already flagged as glyph noise', () => {
    const out = detectPageWarnings(
      {
        page: 1,
        text: '\ue0e0cm',
        charCount: 3,
        imageCount: 0,
        vectorCount: 0,
        textCoverage: 0.06,
        nonPrintableRatio: 0,
        nonPrintableCount: 0,
        width: 200,
        height: 50,
        quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
      },
      { pdfJsWarnings: ['Warning: No cmap table available.'] },
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'localized_glyph_noise', severity: 'warning' });
  });

  it('flags two localized non-printable glyphs when exact symbols may matter', () => {
    // ResNet figure-equation-shaped case: only two control characters,
    // but they sit inside a visible formula (`F(x)+x`) where exact
    // symbols matter.
    const out = detectPageWarnings({
      page: 1,
      text: 'F(x)\x01+\x01x',
      charCount: 10,
      imageCount: 0,
      vectorCount: 12,
      textCoverage: 0.02,
      nonPrintableRatio: 0.002,
      nonPrintableCount: 2,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'ok' },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'localized_glyph_noise', severity: 'warning' });
    expect(out[0].message).toContain('2 non-printable');
  });

  it('does not flag a single isolated non-printable glyph as localized glyph noise', () => {
    const out = detectPageWarnings({
      page: 1,
      text: 'mostly clean text\x01',
      charCount: 18,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.05,
      nonPrintableRatio: 0.001,
      nonPrintableCount: 1,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'ok' },
    });
    expect(out.filter((w) => w.code === 'localized_glyph_noise')).toEqual([]);
  });

  it('flags Unicode replacement characters as localized glyph noise', () => {
    // PLOS article page-shaped case: a relation symbol visually renders,
    // but the native text stream exposes U+FFFD in prose. The page is
    // otherwise healthy, so density signals alone would hide the loss.
    const out = detectPageWarnings({
      page: 1,
      text: 'white � 0.165, light grey 0.166-0.335',
      charCount: 42,
      imageCount: 0,
      vectorCount: 10,
      textCoverage: 0.04,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'ok' },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'localized_glyph_noise', severity: 'warning' });
    expect(out[0].message).toContain('1 Unicode replacement character');
    expect(out[0].message).toContain('U+FFFD');
  });

  it('does not duplicate replacement-character warnings on glyph-garbage pages', () => {
    const out = detectPageWarnings({
      page: 1,
      text: 'mostly broken �\x01\x02',
      charCount: 17,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.02,
      nonPrintableRatio: 0.35,
      nonPrintableCount: 2,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'unusable_glyph_indices' },
    });
    expect(out.filter((w) => w.code === 'localized_glyph_noise')).toEqual([]);
  });

  it('flags isolated Latin-extended glyph noise inside CJK text', () => {
    // Aozora PDF-shaped case: dotted TOC leaders visually render as
    // horizontal rules, but the text stream maps each small leader mark
    // to U+1EDE LATIN CAPITAL LETTER O WITH HORN AND HOOK ABOVE.
    const out = detectPageWarnings({
      page: 1,
      text: `${'青空文庫の説明です。'.repeat(20)}サイトを選ぶỞ Ở2\n作品を読むỞ Ở2\n入力ミスを指摘するỞ Ở5`,
      charCount: 250,
      imageCount: 1,
      vectorCount: 17,
      textCoverage: 0.137,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 595.2,
      height: 841.8,
      quality: { nativeTextStatus: 'ok' },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'localized_glyph_noise', severity: 'warning' });
    expect(out[0].message).toContain('isolated Latin-extended glyphs inside CJK text');
    expect(out[0].message).toContain('"Ở"');
  });

  it('does not flag Latin-extended glyphs that are part of Latin words', () => {
    const out = detectPageWarnings({
      page: 1,
      text: `${'日本語の本文です。'.repeat(20)} Cafe São Paulo and Nguyễn Văn A are cited here.`,
      charCount: 260,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.1,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'ok' },
    });
    expect(out.filter((w) => w.code === 'localized_glyph_noise')).toEqual([]);
  });

  it('flags Latin-1 supplement dominated printable mojibake', () => {
    // PDF.js issue3025-shaped case: the render shows Devanagari glyphs,
    // but the native text is printable Latin-1 code noise.
    const out = detectPageWarnings({
      page: 1,
      text: 'ã½ãá Ìãã',
      charCount: 9,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.071,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 200,
      height: 50,
      quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'localized_glyph_noise', severity: 'warning' });
    expect(out[0].message).toContain('Latin-1 supplement glyphs');
  });

  it('does not flag ordinary accented Latin prose as Latin-1 mojibake', () => {
    const out = detectPageWarnings({
      page: 1,
      text: 'KÖNYVAJÁNLÓ: Think Like A Programmer',
      charCount: 36,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.011,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
    });
    expect(out.filter((w) => w.code === 'localized_glyph_noise')).toEqual([]);
  });

  it('does not flag standalone French diacritics as Latin-1 mojibake', () => {
    const out = detectPageWarnings({
      page: 1,
      text: 'à À â Â ä Ä ç Ç é É è È ê Ê ë Ë î Î ï Ï ô Ô ù Ù û Û ü Ü\n1',
      charCount: 57,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.006,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 595.28,
      height: 841.89,
      quality: { nativeTextStatus: 'ok', visualStatus: 'sparse' },
    });
    expect(out.filter((w) => w.code === 'localized_glyph_noise')).toEqual([]);
  });

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

  it('flags dense aligned numeric tables that native text can flatten', () => {
    // Apple 10-K gross-margin-page-shaped case: the text is native and
    // readable, but multiple right-aligned numeric columns are visually
    // a table whose row/column relationships matter.
    const out = detectPageWarnings(
      page([
        block(40, 80, 200, 120, {
          text: 'labels',
          lines: [
            line('Gross margin', 40, 80, 120),
            line('Products', 70, 100, 60),
            line('Services', 70, 112, 60),
            line('Total gross margin', 70, 124, 120),
            line('Products', 70, 148, 60),
            line('Services', 70, 160, 60),
            line('Total gross margin percentage', 70, 172, 160),
          ],
        }),
        block(300, 80, 50, 120, {
          text: '2023\n108,803\n60,345\n169,148\n36.5 %\n70.8 %\n44.1 %',
          lines: [
            line('2023', 318, 80, 20),
            line('108,803', 300, 100, 38),
            line('60,345', 307, 112, 31),
            line('169,148', 300, 124, 38),
            line('36.5 %', 306, 148, 32),
            line('70.8 %', 306, 160, 32),
            line('44.1 %', 306, 172, 32),
          ],
        }),
        block(390, 80, 50, 120, {
          text: '2022\n114,728\n56,054\n170,782\n36.3 %\n71.7 %\n43.3 %',
          lines: [
            line('2022', 408, 80, 20),
            line('114,728', 390, 100, 38),
            line('56,054', 397, 112, 31),
            line('170,782', 390, 124, 38),
            line('36.3 %', 396, 148, 32),
            line('71.7 %', 396, 160, 32),
            line('43.3 %', 396, 172, 32),
          ],
        }),
      ]),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'tabular_numeric_layout', severity: 'warning' });
    expect(out[0].message).toContain('aligned columns');
  });

  it('does not flag a single aligned numeric list as a table', () => {
    const out = detectPageWarnings(
      page([
        block(300, 80, 50, 180, {
          text: 'numeric list',
          lines: Array.from({ length: 12 }, (_, i) => line(`${2020 + i}`, 300, 80 + i * 12, 24)),
        }),
      ]),
    );
    expect(out.filter((w) => w.code === 'tabular_numeric_layout')).toEqual([]);
  });

  it('does not flag chart-axis labels without shared numeric rows', () => {
    const out = detectPageWarnings(
      page([
        block(80, 100, 24, 220, {
          text: 'y axis',
          lines: Array.from({ length: 8 }, (_, i) => line(`${70 - i * 10}.0%`, 80, 100 + i * 30, 24)),
        }),
        block(250, 115, 30, 220, {
          text: 'data labels',
          lines: [line('64.7%', 250, 115, 30), line('56.8%', 250, 245, 30), line('31.2%', 250, 325, 30)],
        }),
        block(120, 360, 250, 8, {
          text: 'x axis',
          lines: Array.from({ length: 6 }, (_, i) => line(`${70 + i * 5}.0%`, 120 + i * 45, 360, 30)),
        }),
      ]),
    );
    expect(out.filter((w) => w.code === 'tabular_numeric_layout')).toEqual([]);
  });

  it('does not flag chart data labels whose shared numeric rows have irregular cadence', () => {
    const ys = [328, 348, 371, 376, 504, 521, 526, 532, 540, 549, 560, 573];
    const out = detectPageWarnings(
      page([
        block(90, 320, 260, 260, {
          text: 'chart labels',
          lines: ys.flatMap((y, index) => [
            line(`${80 - index}.0`, 100, y, 20),
            line(`${70 - index}.0`, 180, y + (index % 3 === 0 ? 0 : 1.2), 20),
            line(`${30 + index}.0`, 260, y, 20),
          ]),
        }),
      ]),
    );
    expect(out.filter((w) => w.code === 'tabular_numeric_layout')).toEqual([]);
  });

  it('flags irregular financial tables when numeric columns recur across rows', () => {
    const ys = [100, 126, 151, 177, 228, 241, 255, 270];
    const out = detectPageWarnings(
      page([
        block(50, 90, 500, 200, {
          text: 'financial table',
          lines: ys.flatMap((y, index) => [
            line(index === 2 ? 'methods' : `Financial row ${index + 1}`, 50, y, 140),
            line(`(${index + 1}.0)`, 260, y + 1.2, 20),
            line(`(${index + 2}.0)`, 315, y + 1.2, 20),
            line(`(${index + 3}.0)`, 370, y + 1.2, 20),
            line(index % 3 === 0 ? '-' : `(${index + 4}.0)`, 425, y + 1.2, 20),
            line(`(${index + 5}.0)`, 480, y + 1.2, 20),
          ]),
        }),
      ]),
    );
    expect(out.some((w) => w.code === 'tabular_numeric_layout')).toBe(true);
  });

  it('does not flag ordinary prose with occasional numeric-only lines', () => {
    const out = detectPageWarnings(
      page([
        block(40, 80, 500, 300, {
          text: 'body',
          lines: [
            line('The study covers the 2023 reporting period.', 40, 80, 220),
            line('It compares earlier reports from 2022 and 2021.', 40, 94, 260),
            line('2023', 40, 120, 20),
            line('2022', 40, 134, 20),
            line('2021', 40, 148, 20),
            line('The rest of the page is prose, not a numeric table.', 40, 176, 280),
            line('A figure caption mentions 95 % agreement inline.', 40, 190, 250),
          ],
        }),
      ]),
    );
    expect(out.filter((w) => w.code === 'tabular_numeric_layout')).toEqual([]);
  });

  it('does not duplicate localized glyph warnings when the page is already classified as mixed glyph indices', () => {
    const out = detectPageWarnings({
      page: 1,
      text: 'mixed garbage',
      charCount: 1330,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.128,
      nonPrintableRatio: 0.141,
      nonPrintableCount: 188,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'mixed_glyph_indices' },
    });
    expect(out.filter((w) => w.code === 'localized_glyph_noise')).toEqual([]);
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

  describe('reading_order_divergence', () => {
    /** Page shaped like PLoS Medicine p.1: the title heading leads the
     *  visual flow but the producer emitted it after the body columns. */
    function divergentPage(): PageResult {
      const title = 'Why Most Published Research Findings Are False';
      const body = 'Published research findings are sometimes refuted by subsequent evidence. '.repeat(20);
      const blocks = [
        block(45, 61, 433, 40, { text: title, role: 'heading' }),
        block(45, 121, 156, 300, { text: body.slice(0, 500) }),
        block(219, 141, 153, 500, { text: body.slice(500, 1000) }),
        block(393, 141, 156, 500, { text: body.slice(1000) }),
      ];
      return { ...page(blocks, 594, 783), text: `${body}${title}`, charCount: body.length + title.length };
    }

    it('flags a leading heading that only appears late in the native text stream', () => {
      const out = detectPageWarnings(divergentPage());
      const divergence = out.find((w) => w.code === 'reading_order_divergence');
      expect(divergence).toBeDefined();
      expect(divergence?.blockIndex).toBe(0);
      expect(divergence?.message).toContain('Why Most Published Research Findings');
    });

    it('does not flag when native order matches the layout order', () => {
      const aligned = divergentPage();
      const title = 'Why Most Published Research Findings Are False';
      aligned.text = `${title}\n${aligned.text.slice(0, aligned.text.length - title.length)}`;
      const out = detectPageWarnings(aligned);
      expect(out.filter((w) => w.code === 'reading_order_divergence')).toEqual([]);
    });

    it('does not flag headings that are late in BOTH orders (right-column section heads)', () => {
      // A section heading at the top of the right column is visually
      // high on the page but legitimately late in the reading flow.
      const body = 'Body paragraph text for the left column. '.repeat(30);
      const heading = 'Modeling the Framework for False Positives';
      const blocks = [
        block(45, 50, 156, 600, { text: body }),
        block(219, 50, 153, 20, { text: heading, role: 'heading' }),
        block(219, 80, 153, 570, { text: body }),
        block(393, 50, 156, 600, { text: body }),
      ];
      const p = { ...page(blocks, 594, 783), text: `${body}${heading}${body}${body}` };
      const out = detectPageWarnings(p);
      expect(out.filter((w) => w.code === 'reading_order_divergence')).toEqual([]);
    });

    it('flags compact math blocks whose native text stream reorders visible characters', () => {
      // PDF.js bug2004951-shaped case: the visual line is "3√x + y",
      // but the native text stream can emit the superscript after the
      // baseline expression as "√x + y3".
      const blocks = [
        block(72, 88, 85, 20, { text: '1 Example', role: 'heading' }),
        block(72, 121, 52, 12, { text: 'Some text' }),
        block(288, 148, 37, 13, { text: '3√x + y' }),
      ];
      const p = {
        ...page(blocks, 612, 792),
        text: '1 Example\nSome text\n√x + y3',
        charCount: 27,
        vectorCount: 1,
        quality: { nativeTextStatus: 'sparse_text_with_visual_content' as const },
      };

      const out = detectPageWarnings(p);
      const divergence = out.find((w) => w.code === 'reading_order_divergence');
      expect(divergence).toMatchObject({ severity: 'warning', blockIndex: 2 });
      expect(divergence?.message).toContain('3√x + y');
    });

    it('does not flag compact math blocks when native and visual order agree', () => {
      const blocks = [
        block(72, 88, 85, 20, { text: '1 Example', role: 'heading' }),
        block(288, 148, 37, 13, { text: '3√x + y' }),
      ];
      const p = { ...page(blocks, 612, 792), text: '1 Example\n3√x + y', charCount: 17 };
      const out = detectPageWarnings(p);
      expect(out.filter((w) => w.code === 'reading_order_divergence')).toEqual([]);
    });

    it('does not treat form date placeholder slashes as compact math order divergence', () => {
      const dateLabel = 'Deceased MM / DD / YYYY Spouse MM / DD / YYYY';
      const blocks = [
        block(72, 88, 85, 20, { text: 'Form 1040', role: 'heading' }),
        block(385, 61, 189, 7, { text: dateLabel }),
      ];
      const p = {
        ...page(blocks, 612, 792),
        text: `Form 1040\nDeceased MM DD YYYY Spouse MM DD YYYY////`,
        charCount: 58,
        vectorCount: 502,
      };
      const out = detectPageWarnings(p);
      expect(out.filter((w) => w.code === 'reading_order_divergence')).toEqual([]);
    });
  });

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
