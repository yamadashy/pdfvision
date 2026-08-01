import { describe, expect, it } from 'vitest';
import { renderSummary } from '../../src/mcp/summary.js';
import type { DocumentResult, PageQuality, PageResult, PageWarning } from '../../src/types/index.js';

function page(number: number, quality: PageQuality, warnings: PageWarning[] = []): PageResult {
  return {
    page: number,
    text: 'x',
    charCount: 1,
    imageCount: 0,
    vectorCount: 0,
    textCoverage: 0.1,
    nonPrintableRatio: 0,
    nonPrintableCount: 0,
    width: 612,
    height: 792,
    quality,
    warnings,
  };
}

function document(pages: PageResult[], extra: Partial<DocumentResult> = {}): DocumentResult {
  return {
    file: 'report.pdf',
    totalPages: pages.length,
    metadata: { title: 'Annual Report', author: 'Acme', subject: null, creator: null },
    pages,
    ...extra,
  };
}

const ok: PageQuality = { nativeTextStatus: 'ok' };
const scanned: PageQuality = { nativeTextStatus: 'empty_but_visual_content' };

describe('renderSummary', () => {
  it('groups quality statuses into page ranges instead of listing every page', () => {
    const pages = [
      ...Array.from({ length: 11 }, (_unused, index) => page(index + 1, ok)),
      ...Array.from({ length: 22 }, (_unused, index) => page(index + 12, scanned)),
    ];
    const output = renderSummary(document(pages));
    expect(output).toContain('| `ok` | 11 | 1-11 |');
    expect(output).toContain('| `empty_but_visual_content` | 22 | 12-33 |');
    expect(output).not.toContain('## Page 12');
  });

  it('carries the document metadata and page count', () => {
    const output = renderSummary(document([page(1, ok)]));
    expect(output).toContain('- **Pages:** 1');
    expect(output).toContain('- **Title:** Annual Report');
    expect(output).toContain('- **Author:** Acme');
  });

  it('groups warning codes by page range', () => {
    const warning: PageWarning = {
      code: 'raster_backed_text_layer',
      severity: 'warning',
      message: 'text layer over a scan',
    };
    const pages = [page(1, ok), page(2, scanned, [warning]), page(3, scanned, [warning])];
    const output = renderSummary(document(pages));
    expect(output).toContain('| `raster_backed_text_layer` | 2 | 2-3 |');
  });

  it('suggests OCR and a render when pages have no usable native text', () => {
    const output = renderSummary(document([page(1, ok), page(2, scanned)]));
    expect(output).toContain('ocr: "eng"');
    expect(output).toContain('render_pdf(pages: "2")');
  });

  it('omits the OCR suggestion when every page reads cleanly', () => {
    const output = renderSummary(document([page(1, ok), page(2, ok)]));
    expect(output).not.toContain('ocr:');
    expect(output).toContain('read_pdf(pages: "1-2")');
  });

  it('flags an XFA form loudly', () => {
    const output = renderSummary(document([page(1, ok)], { xfa: true }));
    expect(output).toContain('XFA (LiveCycle) form');
    expect(output).toContain('Adobe Acrobat/Reader');
  });

  it('renders a two-level outline and drops deeper nesting', () => {
    const output = renderSummary(
      document([page(1, ok)], {
        outlineCount: 1,
        outline: [
          {
            title: 'Chapter 1',
            page: 3,
            items: [{ title: 'Section 1.1', page: 4, items: [{ title: 'Too deep', page: 5 }] }],
          },
        ],
      }),
    );
    expect(output).toContain('- Chapter 1 — p.3');
    expect(output).toContain('  - Section 1.1 — p.4');
    expect(output).not.toContain('Too deep');
  });

  it('escapes pipes so a title cannot break the tables', () => {
    const output = renderSummary(document([page(1, ok)], { outlineCount: 1, outline: [{ title: 'A | B', page: 1 }] }));
    expect(output).toContain('A \\| B');
  });
});
