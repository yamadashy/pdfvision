import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { collectInvisibleTextEvidence, type TextRenderingOps } from '../../../src/core/graphics/invisibleText.js';
import { processDocument } from '../../../src/core/processor.js';
import { detectPageWarnings } from '../../../src/core/warnings/index.js';
import { formatJson } from '../../../src/output/json.js';
import { formatMarkdown } from '../../../src/output/markdown.js';
import { formatToon } from '../../../src/output/toon.js';
import { formatXml } from '../../../src/output/xml.js';
import { page } from './helpers.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SAMPLE_INVISIBLE_TEXT_PDF = resolve(__dirname, '../../fixtures/sample-invisible-text.pdf');

const OP = {
  save: 1,
  restore: 2,
  formBegin: 3,
  formEnd: 4,
  setTextRenderingMode: 5,
  showText: 6,
} as const;

const ops: TextRenderingOps = {
  save: OP.save,
  restore: OP.restore,
  formBegin: OP.formBegin,
  formEnd: OP.formEnd,
  setTextRenderingMode: OP.setTextRenderingMode,
  textShowOps: new Set([OP.showText]),
};

function glyphs(text: string): Array<{ unicode: string }> {
  return [...text].map((unicode) => ({ unicode }));
}

describe('collectInvisibleTextEvidence', () => {
  it('attributes text-show operations while rendering mode 3 is active', () => {
    const evidence = collectInvisibleTextEvidence(
      [OP.setTextRenderingMode, OP.showText, OP.save, OP.setTextRenderingMode, OP.showText, OP.restore, OP.showText],
      [[3], [glyphs('HIDDEN MARKER')], [], [0], [glyphs('visible')], [], [glyphs('SECOND HIDDEN')]],
      ops,
    );

    expect(evidence).toEqual({ runCount: 2, sampleText: 'HIDDEN MARKER SECOND HIDDEN' });
  });

  it('does not report ordinary visible text-show operations', () => {
    expect(
      collectInvisibleTextEvidence([OP.setTextRenderingMode, OP.showText], [[0], [glyphs('VISIBLE MARKER')]], ops),
    ).toBeUndefined();
  });

  // Form XObjects inherit the graphics state in effect at Do (PDF 32000-1
  // 8.10.2); pdf.js's canvas renderer likewise save()s on
  // paintFormXObjectBegin. Invisible mode must carry into the form and be
  // restored after it.
  it('inherits the rendering mode into form XObjects and restores it after', () => {
    const evidence = collectInvisibleTextEvidence(
      [
        OP.setTextRenderingMode,
        OP.formBegin,
        OP.showText,
        OP.setTextRenderingMode,
        OP.showText,
        OP.formEnd,
        OP.showText,
      ],
      [[3], [], [glyphs('HIDDEN IN FORM')], [0], [glyphs('visible in form')], [], [glyphs('HIDDEN AFTER FORM')]],
      ops,
    );

    expect(evidence).toEqual({ runCount: 2, sampleText: 'HIDDEN IN FORM HIDDEN AFTER FORM' });
  });
});

describe('detectPageWarnings invisible_text', () => {
  it('emits an error with an attributed sample', () => {
    const out = detectPageWarnings(page([]), {
      invisibleText: { runCount: 1, sampleText: 'HIDDEN INSTRUCTION MARKER' },
    });

    expect(out).toContainEqual(
      expect.objectContaining({
        code: 'invisible_text',
        severity: 'error',
        message: expect.stringContaining('sample: "HIDDEN INSTRUCTION MARKER"'),
      }),
    );
  });

  it('suppresses the warning on a raster-backed OCR text layer', () => {
    const out = detectPageWarnings(page([]), {
      invisibleText: { runCount: 1, sampleText: 'SEARCHABLE SCAN TEXT' },
      rasterBackedTextLayer: true,
    });

    expect(out.map((warning) => warning.code)).not.toContain('invisible_text');
  });

  it('suppresses sparse invisible OCR residue over a full-page raster', () => {
    const out = detectPageWarnings(page([], 300, 500), {
      invisibleText: { runCount: 1, sampleText: 'SPARSE OCR RESIDUE' },
      imageBoxes: [{ x: 0, y: 0, width: 300, height: 500 }],
    });

    expect(out.map((warning) => warning.code)).not.toContain('invisible_text');
  });
});

describe('invisible_text integration', () => {
  it('surfaces the always-on warning from the generated PDF in every output format', async () => {
    const result = await processDocument(SAMPLE_INVISIBLE_TEXT_PDF, { noCache: true });
    const warning = result.pages[0].warnings?.find((item) => item.code === 'invisible_text');

    expect(result.pages[0].text).toContain('HIDDEN INSTRUCTION MARKER');
    expect(warning).toMatchObject({ severity: 'error' });
    expect(warning?.message).toContain('not visible to a human viewer but is included in the extracted text');
    expect(warning?.message).toContain('HIDDEN INSTRUCTION MARKER');
    for (const output of [formatJson(result), formatXml(result), formatToon(result), formatMarkdown(result)]) {
      expect(output).toContain('invisible_text');
    }
  });
});
