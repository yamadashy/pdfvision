import { describe, expect, it } from 'vitest';
import { processDocument } from '../../../src/core/processor.js';
import { detectRtlScriptText } from '../../../src/core/warnings/rtlScript.js';
import type { PageResult, PageWarning } from '../../../src/types/index.js';

function pageWithText(text: string): PageResult {
  return {
    page: 1,
    text,
    charCount: text.length,
    imageCount: 0,
    vectorCount: 0,
    textCoverage: 0.1,
    nonPrintableRatio: 0,
    nonPrintableCount: 0,
    width: 612,
    height: 792,
    quality: { nativeTextStatus: 'ok' },
  };
}

function warningsFor(text: string): PageWarning[] {
  const warnings: PageWarning[] = [];
  detectRtlScriptText(pageWithText(text), warnings);
  return warnings;
}

function buildRawPdf(objects: string[]): Uint8Array {
  let body = '%PDF-1.7\n';
  const offsets: number[] = [0];
  for (const [index, object] of objects.entries()) {
    offsets[index + 1] = Buffer.byteLength(body, 'binary');
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(body, 'binary');
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(body, 'binary'));
}

function buildRtlTextPdf(): Uint8Array {
  const content = `BT /F1 12 Tf 72 720 Td <${'01'.repeat(60)}> Tj ET`;
  const toUnicode = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /RtlTest def
/CMapType 2 def
1 begincodespacerange
<00> <FF>
endcodespacerange
1 beginbfchar
<01> <0627>
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;

  return buildRawPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'binary')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding /ToUnicode 6 0 R >>',
    `<< /Length ${Buffer.byteLength(toUnicode, 'binary')} >>\nstream\n${toUnicode}\nendstream`,
  ]);
}

describe('rtl_script_text warning', () => {
  it('flags a pure Arabic paragraph with the measured percentage', () => {
    const warnings = warningsFor('هذه فقرة عربية للاختبار '.repeat(4));

    expect(warnings).toEqual([
      {
        code: 'rtl_script_text',
        severity: 'warning',
        message:
          '100% of letters are right-to-left script; extraction preserves logical order but may drop inter-word spaces or mirror paired brackets — verify against a render when exact wording matters',
      },
    ]);
  });

  it('does not flag English text', () => {
    expect(
      warningsFor('This English paragraph contains more than fifty letters and remains entirely left to right.'),
    ).toEqual([]);
  });

  it('does not flag mixed text below the RTL ratio threshold', () => {
    expect(warningsFor(`${'ا'.repeat(14)}${'a'.repeat(46)}`)).toEqual([]);
  });

  it('does not flag short RTL text', () => {
    expect(warningsFor('ا'.repeat(49))).toEqual([]);
  });

  it('attaches the warning to an extracted page result', async () => {
    const result = await processDocument('rtl-text.pdf', {
      sourceData: buildRtlTextPdf(),
      noCache: true,
    });

    expect(result.pages[0].text).toBe('ا'.repeat(60));
    expect(result.pages[0].warnings).toContainEqual(
      expect.objectContaining({ code: 'rtl_script_text', severity: 'warning' }),
    );
  });
});
