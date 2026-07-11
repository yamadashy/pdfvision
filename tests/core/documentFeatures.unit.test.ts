import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { extractDocumentFeatures } from '../../src/core/processor/documentFeatures.js';

interface StubDocOverrides {
  info?: Record<string, unknown>;
  attachments?: Map<string, Record<string, unknown>> | null;
  javaScriptActions?: Record<string, string[]> | null;
}

// Minimal PDFDocumentProxy stub for the default (flagless) feature pass:
// getMetadata / getOutline / getAttachments are always called, the layers
// pass falls back to `{ groups: [] }` when getOptionalContentConfig throws.
function stubDoc(overrides: StubDocOverrides = {}): PDFDocumentProxy {
  return {
    getMetadata: async () => ({ info: overrides.info ?? {} }),
    getOutline: async () => null,
    getAttachments: async () => overrides.attachments ?? null,
    getJSActions: async () => overrides.javaScriptActions ?? null,
    getOptionalContentConfig: async () => {
      throw new Error('not available in stub');
    },
  } as unknown as PDFDocumentProxy;
}

describe('extractDocumentFeatures presence signals', () => {
  it('reports isXfaPresent from the document info dictionary', async () => {
    const features = await extractDocumentFeatures(stubDoc({ info: { IsXFAPresent: true } }), {});
    expect(features.isXfaPresent).toBe(true);
  });

  it('stays false for ordinary documents', async () => {
    const features = await extractDocumentFeatures(stubDoc(), {});
    expect(features.isXfaPresent).toBe(false);
    expect(features.attachmentCount).toBeUndefined();
    expect(features.javascriptActionCount).toBeUndefined();
  });

  it('counts document-level embedded files without the attachment pass', async () => {
    const features = await extractDocumentFeatures(
      stubDoc({
        attachments: new Map([
          ['data.csv', {}],
          ['notes.txt', {}],
        ]),
      }),
      {},
    );
    expect(features.attachmentCount).toBe(2);
    expect(features.attachments).toBeUndefined();
  });

  it('counts document-level JavaScript scripts without the viewer pass', async () => {
    const features = await extractDocumentFeatures(
      stubDoc({
        javaScriptActions: {
          NamedScript: ['app.alert("named");'],
          OpenAction: ['app.alert("open");'],
        },
      }),
      {},
    );

    expect(features.javascriptActionCount).toBe(2);
    expect(features.viewer).toBeUndefined();
  });
});
