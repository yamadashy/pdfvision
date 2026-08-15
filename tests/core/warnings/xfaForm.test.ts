import { describe, expect, it } from 'vitest';
import { processDocument } from '../../../src/core/processor.js';
import { classifyXfaStaticLayer } from '../../../src/core/warnings/xfaForm.js';
import { buildHybridXfaPdf, buildPlainFormPdf, buildXfaPlaceholderPdf } from '../../helpers/xfaPdfs.js';

const PLACEHOLDER_TEXT =
  'Please wait... If this message is not eventually replaced by the proper contents of the document, ' +
  'your PDF viewer may not be able to display this type of document. You can upgrade to the latest ' +
  'version of Adobe Reader for Windows, Mac, or Linux by visiting http://www.adobe.com/go/reader_download.';

const page = (text: string) => ({ text, charCount: text.length });

describe('classifyXfaStaticLayer', () => {
  it('calls the Adobe boilerplate page a viewer placeholder', () => {
    expect(classifyXfaStaticLayer({ isAcroFormPresent: false, pages: [page(PLACEHOLDER_TEXT)] })).toBe(
      'viewer_placeholder',
    );
  });

  it('still calls it a placeholder when the document also carries AcroForm fields', () => {
    expect(classifyXfaStaticLayer({ isAcroFormPresent: true, pages: [page(PLACEHOLDER_TEXT)] })).toBe(
      'viewer_placeholder',
    );
  });

  it('matches a localized placeholder through the Adobe download link alone', () => {
    const french = 'Veuillez patienter... rendez-vous sur http://www.adobe.com/go/reader_download pour mettre a jour.';
    expect(classifyXfaStaticLayer({ isAcroFormPresent: false, pages: [page(french)] })).toBe('viewer_placeholder');
  });

  it('treats a bare page with no field layer as a placeholder', () => {
    expect(classifyXfaStaticLayer({ isAcroFormPresent: false, pages: [page('')] })).toBe('viewer_placeholder');
  });

  it('does not call a real form page a placeholder', () => {
    const real = 'Form 1040 U.S. Individual Income Tax Return. '.repeat(20);
    expect(classifyXfaStaticLayer({ isAcroFormPresent: true, pages: [page(real)] })).toBe('static_content');
  });

  it('does not fire on a blank page inside a document whose fields are real', () => {
    expect(classifyXfaStaticLayer({ isAcroFormPresent: true, pages: [page('')] })).toBe('static_content');
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
        message: expect.stringContaining('can be read as-is'),
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
