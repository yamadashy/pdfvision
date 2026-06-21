import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { buildViewerState } from '../../src/core/document/viewer.js';

describe('buildViewerState', () => {
  it('decodes permissions and keeps viewer preferences JSON-safe', async () => {
    const doc = {
      getPageLayout: async () => '',
      getPageMode: async () => 'UseThumbs',
      getViewerPreferences: async () => ({
        DisplayDocTitle: true,
        PrintPageRange: [1, 2],
        BadNumber: Number.NaN,
        Nested: { Direction: 'Ｒ２Ｌ' },
      }),
      getOpenAction: async () => ({ action: 'Print' }),
      getJSActions: async () => ({
        printMe: ['this.print(true);'],
        bad: [42, 'ＯＫ'],
      }),
      getPermissions: async () => [0x04, 0x10, 0x800, 999],
      getMarkInfo: async () => ({ Marked: false, UserProperties: true, Suspects: true }),
    } as unknown as PDFDocumentProxy;

    const viewer = await buildViewerState(doc, { normalizeText: (value) => value.normalize('NFKC') });

    expect(viewer).toEqual({
      pageMode: 'UseThumbs',
      viewerPreferences: {
        DisplayDocTitle: true,
        PrintPageRange: [1, 2],
        Nested: { Direction: 'R2L' },
      },
      openAction: {
        type: 'action',
        action: 'Print',
      },
      jsActions: {
        printMe: ['this.print(true);'],
        bad: ['ＯＫ'],
      },
      permissions: {
        flags: [0x04, 0x10, 0x800, 999],
        allowed: ['print', 'copy', 'printHighQuality'],
      },
      markInfo: {
        marked: false,
        userProperties: true,
        suspects: true,
      },
    });
  });

  it('normalizes JavaScript action names without rewriting script source', async () => {
    const doc = {
      getPageLayout: async () => '',
      getPageMode: async () => 'UseNone',
      getViewerPreferences: async () => null,
      getOpenAction: async () => null,
      getJSActions: async () => ({
        Ｏｐｅｎ: ['var Ａ = "Ｆｕｌｌｗｉｄｔｈ"; app.alert(Ａ);'],
      }),
      getPermissions: async () => null,
      getMarkInfo: async () => null,
    } as unknown as PDFDocumentProxy;

    const viewer = await buildViewerState(doc, { normalizeText: (value) => value.normalize('NFKC') });

    expect(viewer.jsActions).toEqual({
      Open: ['var Ａ = "Ｆｕｌｌｗｉｄｔｈ"; app.alert(Ａ);'],
    });
  });

  it('preserves an empty permissions array as an explicit no-allowed-permissions signal', async () => {
    const doc = {
      getPageLayout: async () => '',
      getPageMode: async () => 'UseNone',
      getViewerPreferences: async () => null,
      getOpenAction: async () => null,
      getJSActions: async () => null,
      getPermissions: async () => [],
      getMarkInfo: async () => null,
    } as unknown as PDFDocumentProxy;

    const viewer = await buildViewerState(doc);

    expect(viewer).toEqual({ permissions: { flags: [], allowed: [] } });
  });
});
