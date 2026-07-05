import { describe, expect, it } from 'vitest';
import { detectPageWarnings } from '../../../src/core/warnings/index.js';
import { block, line, page } from './helpers.js';

describe('detectPageWarnings', () => {
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

  it('flags long repeated CJK glyph runs in otherwise readable text', () => {
    const out = detectPageWarnings({
      page: 1,
      text: `2024年（令和6年）の本文は正常に読める。\n${'令'.repeat(12)}\n本文は続く。`,
      charCount: 48,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.1,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 595,
      height: 842,
      quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
    });

    const warning = out.find((w) => w.code === 'localized_glyph_noise' && w.message.includes('repeated CJK glyph'));
    expect(warning?.message).toContain('repeated CJK glyph');
    expect(warning?.message).toContain('令令');
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

  it('flags raw embedded LaTeX source payloads in native text', () => {
    const payload = `<latexit sha1_base64="7yFrn0YPyuP5dVIvc7Tl2zcbS/g=">${'AAAB+Hic'.repeat(20)}</latexit>`;
    const out = detectPageWarnings({
      page: 1,
      text: `Figure caption ${payload} visible paragraph`,
      charCount: payload.length + 32,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.12,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
    });

    expect(out).toContainEqual(
      expect.objectContaining({
        code: 'raw_embedded_source_text',
        severity: 'warning',
      }),
    );
    expect(out.find((w) => w.code === 'raw_embedded_source_text')?.message).toContain('raw embedded LaTeX source');
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

  it('flags a single non-printable glyph in a large display line', () => {
    const displayLine = { ...line('Symbol: \x93', 495, 500, 228, 50), fontSize: 50 };
    const out = detectPageWarnings({
      ...page([
        block(495, 500, 228, 50, {
          text: 'Symbol: \x93',
          lines: [displayLine],
        }),
      ]),
      text: `${'clean title block '.repeat(12)}Symbol: \x93`,
      charCount: 221,
      nonPrintableRatio: 0.005,
      nonPrintableCount: 1,
    });

    const glyphWarnings = out.filter((w) => w.code === 'localized_glyph_noise');
    expect(glyphWarnings).toHaveLength(1);
    expect(glyphWarnings[0]).toMatchObject({ severity: 'warning', blockIndex: 0 });
    expect(glyphWarnings[0].message).toContain('single non-printable code point in a large display line');
  });

  it('does not flag a single non-printable glyph in an ordinary body-sized line', () => {
    const bodyLine = { ...line('mostly clean text\x01', 40, 120, 120, 12), fontSize: 12 };
    const out = detectPageWarnings({
      ...page([
        block(40, 120, 120, 12, {
          text: 'mostly clean text\x01',
          lines: [bodyLine],
        }),
      ]),
      text: `${'mostly clean text '.repeat(60)}\x01`,
      charCount: 1081,
      nonPrintableRatio: 0.001,
      nonPrintableCount: 1,
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

  it('flags uppercase LJ inside lowercase words as printable glyph noise', () => {
    const out = detectPageWarnings({
      page: 1,
      text: 'Plan generation\nCost-optimal planning\nPlan veriLJcation',
      charCount: 59,
      imageCount: 0,
      vectorCount: 39,
      textCoverage: 0.12,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'localized_glyph_noise', severity: 'warning' });
    expect(out[0].message).toContain('veriLJcation');
  });

  it('does not flag standalone LJ acronyms as printable glyph noise', () => {
    const out = detectPageWarnings({
      page: 1,
      text: 'The LJ benchmark and LJ model family are listed separately.',
      charCount: 60,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.12,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
    });

    expect(out.filter((w) => w.code === 'localized_glyph_noise')).toEqual([]);
  });

  it('flags likely artificial spaces between CJK glyphs', () => {
    const out = detectPageWarnings({
      page: 1,
      text: '全 世 界 无 产 者,联 合 起 来A',
      charCount: 20,
      imageCount: 0,
      vectorCount: 2,
      textCoverage: 0.007,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 462.5,
      height: 625.9,
      quality: { nativeTextStatus: 'sparse_text_with_visual_content', visualStatus: 'sparse' },
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'localized_glyph_noise', severity: 'warning' });
    expect(out[0].message).toContain('spaces between 8 adjacent CJK glyph pairs');
  });

  it('does not flag a small number of deliberate CJK spacing boundaries', () => {
    const out = detectPageWarnings({
      page: 1,
      text: '令和 6 年 給与所得者の扶養控除等申告書',
      charCount: 20,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.02,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'ok' },
    });

    expect(out.filter((w) => w.code === 'localized_glyph_noise')).toEqual([]);
  });

  it('flags adjacent duplicated CJK glyph pairs as printable glyph noise', () => {
    const text =
      '図表 1-1-29 過去 3 年間のハラスメント該当事例の有無\n' +
      '図図表表 3377 過過去去33年年間間ののハハララススメメンントト該該当当事事例例のの有有無無';
    const out = detectPageWarnings({
      page: 1,
      text,
      charCount: Array.from(text).length,
      imageCount: 0,
      vectorCount: 20,
      textCoverage: 0.04,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 595.28,
      height: 841.89,
      quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'localized_glyph_noise', severity: 'warning' });
    expect(out[0].message).toContain('adjacent duplicated CJK glyph pairs');
    expect(out[0].message).toContain('"図図"');
  });

  it('does not flag ordinary Japanese prose with a few repeated CJK characters', () => {
    const text = 'ここでは人々の暮らしを支える取り組みを説明します。各地域での活動はますます重要になります。';
    const out = detectPageWarnings({
      page: 1,
      text,
      charCount: Array.from(text).length,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.03,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'ok' },
    });

    expect(out.filter((w) => w.code === 'localized_glyph_noise')).toEqual([]);
  });

  it('flags sequential rare CJK extension glyph runs as printable glyph noise', () => {
    const out = detectPageWarnings({
      page: 1,
      text: '㐂㐄㐆㐈㐊㐌㐎㐐㐒㐔㐖㐘',
      charCount: 12,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.029,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 595.28,
      height: 841.89,
      quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'localized_glyph_noise', severity: 'warning' });
    expect(out[0].message).toContain('sequential run of rare CJK extension code points');
    expect(out[0].message).toContain('"㐂"');
  });

  it('does not flag non-sequential rare CJK extension text', () => {
    const out = detectPageWarnings({
      page: 1,
      text: '㐂㔾㚡㝵㠯㣇㥯㩻 alongside annotations',
      charCount: 29,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0.04,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      width: 612,
      height: 792,
      quality: { nativeTextStatus: 'ok', visualStatus: 'ok' },
    });

    expect(out.filter((w) => w.code === 'localized_glyph_noise')).toEqual([]);
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
});
