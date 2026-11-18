import { describe, expect, it } from 'vitest';
import { formatMarkdown } from '../../src/output/markdown.js';
import { formatXml } from '../../src/output/xml.js';
import type { DocumentResult, LayoutBlock, LayoutLine, PageResult } from '../../src/types/index.js';

function line(text: string, y: number, extra: Partial<LayoutLine> = {}): LayoutLine {
  return { text, x: 90, y, width: 300, height: 12, fontSize: 12, ...extra };
}

function block(lines: LayoutLine[]): LayoutBlock {
  return { text: lines.map((l) => l.text).join('\n'), x: 90, y: lines[0].y, width: 300, height: 40, lines };
}

function result(layout: PageResult['layout']): DocumentResult {
  return {
    file: '/tmp/x.pdf',
    totalPages: 1,
    metadata: { title: null, author: null, subject: null, creator: null },
    pages: [
      {
        page: 1,
        text: 'native',
        charCount: 6,
        imageCount: 0,
        vectorCount: 0,
        textCoverage: 0.1,
        nonPrintableRatio: 0,
        nonPrintableCount: 0,
        quality: { nativeTextStatus: 'ok' },
        width: 612,
        height: 792,
        layout,
      },
    ],
  };
}

describe('margin line numbers and indentation in output', () => {
  const numbered = result({
    blocks: [
      block([
        line('Lena M. Okafor (SBN 318442)', 72, { lineNumber: 1 }),
        line('lokafor@okaforvance.example', 84),
        line('OKAFOR & VANCE LLP', 96, { lineNumber: 2 }),
      ]),
    ],
    lineNumbers: { first: 1, last: 28 },
  });

  it('starts each numbered Markdown line with its number, under a note naming the range', () => {
    const out = formatMarkdown(numbered);
    expect(out).toContain(
      '_Margin line numbers 1–28: each numbered line below starts with its number._\n\n1 Lena M. Okafor (SBN 318442)\nlokafor@okaforvance.example\n2 OKAFOR & VANCE LLP',
    );
  });

  it('writes the numbers and the range as XML attributes, keeping the text clean', () => {
    const out = formatXml(numbered);
    expect(out).toContain('<layout firstLineNumber="1" lastLineNumber="28">');
    expect(out).toContain('lineNumber="1">Lena M. Okafor (SBN 318442)</line>');
  });

  it('prints no note and no prefixes on a page without line numbers', () => {
    const out = formatMarkdown(result({ blocks: [block([line('plain text', 72)])] }));
    expect(out).not.toContain('Margin line numbers');
    expect(out).toContain('\nplain text');
  });

  it('writes the indent level as an XML attribute', () => {
    const out = formatXml(result({ blocks: [block([line('entry', 72), line('  subentry', 84, { indent: 1 })])] }));
    expect(out).toContain('indent="1">  subentry</line>');
  });
});
