import { describe, expect, it } from 'vitest';
import { processDocument } from '../../../src/core/processor.js';
import { classifyXfaStaticLayer } from '../../../src/core/warnings/xfaForm.js';
import type { PageResult } from '../../../src/types/index.js';
import {
  buildHybridXfaPdf,
  buildPlainFormPdf,
  buildScannedXfaPdf,
  buildXfaPlaceholderPdf,
  buildXfaPlaceholderWithFieldsPdf,
  buildXfaWithBlankSecondPagePdf,
} from '../../helpers/xfaPdfs.js';

const PLACEHOLDER_TEXT =
  'Please wait... If this message is not eventually replaced by the proper contents of the document, ' +
  'your PDF viewer may not be able to display this type of document. You can upgrade to the latest ' +
  'version of Adobe Reader for Windows, Mac, or Linux by visiting http://www.adobe.com/go/reader_download.';

type TestPage = Parameters<typeof classifyXfaStaticLayer>[0]['pages'][number];

const page = (text: string, extra: Partial<TestPage> = {}): TestPage => ({
  text,
  charCount: text.length,
  imageCount: 0,
  vectorCount: 0,
  ...extra,
});

describe('classifyXfaStaticLayer', () => {
  it('calls the Adobe boilerplate page a viewer placeholder', () => {
    expect(classifyXfaStaticLayer({ isAcroFormPresent: false, pages: [page(PLACEHOLDER_TEXT)] })).toBe(
      'viewer_placeholder',
    );
  });

  it('matches a localized placeholder through the Adobe download link alone', () => {
    const french = 'Veuillez patienter... rendez-vous sur http://www.adobe.com/go/reader_download pour mettre a jour.';
    expect(classifyXfaStaticLayer({ isAcroFormPresent: false, pages: [page(french)] })).toBe('viewer_placeholder');
  });

  it('reports the placeholder page of a document with real fields as fields-only, not as either extreme', () => {
    expect(classifyXfaStaticLayer({ isAcroFormPresent: true, pages: [page(PLACEHOLDER_TEXT)] })).toBe(
      'field_layer_only',
    );
  });

  it('counts a scanned page as real content, since a render or OCR reads it', () => {
    expect(classifyXfaStaticLayer({ isAcroFormPresent: false, pages: [page('2', { imageCount: 1 })] })).toBe(
      'static_content',
    );
    expect(classifyXfaStaticLayer({ isAcroFormPresent: false, pages: [page('2', { vectorCount: 40 })] })).toBe(
      'static_content',
    );
    expect(
      classifyXfaStaticLayer({
        isAcroFormPresent: false,
        pages: [page('2', { quality: { nativeTextStatus: 'empty_but_visual_content', visualStatus: 'ok' } })],
      }),
    ).toBe('static_content');
  });

  it('counts recovered OCR text as real content', () => {
    const ocr = { text: 'Recovered by OCR: the sponsor declaration and the signature block.', confidence: 82 };
    expect(
      classifyXfaStaticLayer({
        isAcroFormPresent: false,
        pages: [page('2', { ocr: ocr as PageResult['ocr'] })],
      }),
    ).toBe('static_content');
  });

  it('still calls it a placeholder when OCR only recovers the boilerplate', () => {
    const ocr = { text: PLACEHOLDER_TEXT, confidence: 88 };
    expect(
      classifyXfaStaticLayer({
        isAcroFormPresent: false,
        pages: [page(PLACEHOLDER_TEXT, { ocr: ocr as PageResult['ocr'] })],
      }),
    ).toBe('viewer_placeholder');
  });

  it('does not call a real form page a placeholder', () => {
    const real = 'Form 1040 U.S. Individual Income Tax Return. '.repeat(20);
    expect(classifyXfaStaticLayer({ isAcroFormPresent: true, pages: [page(real)] })).toBe('static_content');
  });

  it('does not fire on a long page that merely mentions upgrading Adobe Reader', () => {
    const manual = `${'Chapter 4: troubleshooting the reader. '.repeat(60)} please wait for adobe reader to finish.`;
    expect(classifyXfaStaticLayer({ isAcroFormPresent: false, pages: [page(manual)] })).toBe('static_content');
  });

  it('does not fire when one of the extracted pages carries real content', () => {
    expect(
      classifyXfaStaticLayer({
        isAcroFormPresent: false,
        pages: [page(PLACEHOLDER_TEXT), page('Real page text that the static layer actually carries.')],
      }),
    ).toBe('static_content');
  });

  it('hedges instead of guessing when nothing was extracted and no marker matched', () => {
    expect(classifyXfaStaticLayer({ isAcroFormPresent: false, pages: [page('')] })).toBe('unconfirmed');
    expect(classifyXfaStaticLayer({ isAcroFormPresent: false, pages: [page('page 7')] })).toBe('unconfirmed');
    expect(classifyXfaStaticLayer({ isAcroFormPresent: false, pages: [] })).toBe('unconfirmed');
  });

  it('does not report a blank page of a document whose fields are real as unreadable', () => {
    expect(classifyXfaStaticLayer({ isAcroFormPresent: true, pages: [page('')] })).toBe('field_layer_only');
    expect(classifyXfaStaticLayer({ isAcroFormPresent: true, pages: [] })).toBe('field_layer_only');
  });

  it('vouches for the pages only when a page carried content', () => {
    expect(
      classifyXfaStaticLayer({ isAcroFormPresent: true, pages: [page('Real extracted body text on this page.')] }),
    ).toBe('static_content');
  });
});

describe('XFA warnings on extracted documents', () => {
  it('reports a dynamic XFA form as an unreadable source', async () => {
    const result = await processDocument('xfa-placeholder.pdf', {
      sourceData: buildXfaPlaceholderPdf(),
      noCache: true,
    });

    expect(result.xfa).toBe(true);
    expect(result.pages[0].warnings).toContainEqual(
      expect.objectContaining({
        code: 'xfa_form',
        severity: 'error',
        message: expect.stringContaining('only the XFA (LiveCycle) viewer placeholder'),
      }),
    );
  });

  it('does not claim a hybrid AcroForm+XFA form is a placeholder', async () => {
    const result = await processDocument('xfa-hybrid.pdf', {
      sourceData: buildHybridXfaPdf(),
      noCache: true,
    });

    expect(result.xfa).toBe(true);
    expect(result.pages[0].text).toContain('Application to Sponsor');
    const codes = (result.pages[0].warnings ?? []).map((warning) => warning.code);
    expect(codes).not.toContain('xfa_form');
    expect(result.pages[0].warnings).toContainEqual(
      expect.objectContaining({
        code: 'xfa_static_content',
        severity: 'warning',
        message: expect.stringContaining("the document's own content"),
      }),
    );
  });

  it('neither vouches for nor condemns a placeholder page whose form also has real fields', async () => {
    const result = await processDocument('xfa-placeholder-with-fields.pdf', {
      sourceData: buildXfaPlaceholderWithFieldsPdf(),
      noCache: true,
      formFields: true,
    });

    const codes = (result.pages[0].warnings ?? []).map((warning) => warning.code);
    expect(codes).not.toContain('xfa_form');
    expect(codes).not.toContain('xfa_static_content');
    expect(result.pages[0].warnings).toContainEqual(
      expect.objectContaining({
        code: 'xfa_fields_only',
        severity: 'warning',
        message: expect.stringContaining('do not read the page text as the document'),
      }),
    );
    const message = (result.pages[0].warnings ?? []).find((warning) => warning.code === 'xfa_fields_only')?.message;
    expect(message).toContain('static AcroForm field layer is real');
    expect(message).not.toContain("the document's own content");
  });

  it('does not send a scanned XFA page to Acrobat when a render would read it', async () => {
    const result = await processDocument('xfa-scanned.pdf', {
      sourceData: buildScannedXfaPdf(),
      noCache: true,
    });

    expect(result.pages[0].imageCount).toBeGreaterThan(0);
    const codes = (result.pages[0].warnings ?? []).map((warning) => warning.code);
    expect(codes).not.toContain('xfa_form');
    expect(codes).toContain('xfa_static_content');
  });

  it('hedges on a scoped selection that lands on a blank page, and does not on the whole document', async () => {
    const sourceData = buildXfaWithBlankSecondPagePdf();
    const whole = await processDocument('xfa-blank-tail.pdf', { sourceData, noCache: true });
    expect((whole.pages[0].warnings ?? []).map((warning) => warning.code)).toContain('xfa_static_content');

    const scoped = await processDocument('xfa-blank-tail.pdf', { sourceData, noCache: true, pages: '2' });
    expect(scoped.pages[0].warnings).toContainEqual(
      expect.objectContaining({
        code: 'xfa_form',
        severity: 'warning',
        message: expect.stringContaining('render or OCR them to check'),
      }),
    );
  });

  it('says nothing about XFA on a document that declares none', async () => {
    const result = await processDocument('plain-form.pdf', {
      sourceData: buildPlainFormPdf(),
      noCache: true,
    });

    expect(result.xfa).toBeUndefined();
    const codes = (result.pages[0].warnings ?? []).map((warning) => warning.code);
    expect(codes).not.toContain('xfa_form');
    expect(codes).not.toContain('xfa_static_content');
  });
});
