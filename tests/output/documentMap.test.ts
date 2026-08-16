import { describe, expect, it } from 'vitest';
import { formatDocumentMap } from '../../src/output/documentMap.js';
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

describe('formatDocumentMap', () => {
  it('groups quality statuses into page ranges instead of listing every page', () => {
    const pages = [
      ...Array.from({ length: 11 }, (_unused, index) => page(index + 1, ok)),
      ...Array.from({ length: 22 }, (_unused, index) => page(index + 12, scanned)),
    ];
    const output = formatDocumentMap(document(pages));
    expect(output).toContain('| `ok` | 11 | 1-11 |');
    expect(output).toContain('| `empty_but_visual_content` | 22 | 12-33 |');
    expect(output).not.toContain('## Page 12');
  });

  it('stays small on a long document', () => {
    const pages = Array.from({ length: 2_000 }, (_unused, index) => page(index + 1, ok));
    expect(formatDocumentMap(document(pages)).length).toBeLessThan(2_000);
  });

  it('carries the document metadata and page count', () => {
    const output = formatDocumentMap(document([page(1, ok)]));
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
    expect(formatDocumentMap(document(pages))).toContain('| `raster_backed_text_layer` | 2 | 2-3 |');
  });

  it('counts pages, not warnings, when one page raises a code twice', () => {
    // `text_overlap` is emitted once per overlapping block pair, so a
    // single page routinely carries several. Counting them made the
    // Pages column disagree with the range beside it.
    const overlap = (message: string): PageWarning => ({ code: 'text_overlap', severity: 'warning', message });
    const pages = [page(1, ok, [overlap('a'), overlap('b'), overlap('c')]), page(2, ok, [overlap('d')])];
    expect(formatDocumentMap(document(pages))).toContain('| `text_overlap` | 2 | 1-2 |');
  });

  it('names a way to open the attachments it reports', () => {
    // A count with no call to act on it was the one dead end the map
    // created for a caller with no shell.
    const output = formatDocumentMap(document([page(1, ok)], { attachmentCount: 2 }));
    expect(output).toContain('2 embedded file(s)');
    expect(output).toContain('read_pdf(attachment:');
  });

  it('flags a placeholder-only XFA form loudly', () => {
    const placeholder: PageWarning = { code: 'xfa_form', severity: 'error', message: 'placeholder only' };
    const output = formatDocumentMap(document([page(1, ok, [placeholder])], { xfa: true }));
    expect(output).toContain('Dynamic XFA (LiveCycle) form');
    expect(output).toContain('Do not answer from it');
    expect(output).toContain('Adobe Acrobat/Reader');
  });

  it('does not tell the reader to distrust an XFA form whose static content is real', () => {
    const softened: PageWarning = {
      code: 'xfa_static_content',
      severity: 'warning',
      message: 'static content is real',
    };
    const output = formatDocumentMap(document([page(1, ok, [softened])], { xfa: true }));
    expect(output).toContain('XFA (LiveCycle) form with real static content');
    expect(output).toContain("the document's own content");
    expect(output).not.toContain('Do not answer from it');
  });

  it('names the field layer as the evidence when the pages carry none', () => {
    const fieldsOnly: PageWarning = { code: 'xfa_fields_only', severity: 'warning', message: 'fields are real' };
    const output = formatDocumentMap(document([page(1, ok, [fieldsOnly])], { xfa: true }));
    expect(output).toContain('XFA (LiveCycle) form, fields only');
    // The map itself shows no field values, so the banner must route to
    // a call that does rather than say "answer from the fields below".
    expect(output).toContain('This map does not show field values');
    expect(output).toContain('read the fields');
    expect(output).not.toContain('read them as usual');
    expect(output).not.toContain('Do not answer from it');
  });

  it('does not guarantee the static content when no page was classified', () => {
    const output = formatDocumentMap(document([], { xfa: true, totalPages: 7 }));
    expect(output).toContain('unconfirmed static layer');
    expect(output).not.toContain('read them as usual');
    expect(output).not.toContain('Do not answer from it');
  });

  it('hedges instead of guaranteeing when the static layer could not be confirmed', () => {
    const unconfirmed: PageWarning = { code: 'xfa_form', severity: 'warning', message: 'cannot confirm' };
    const output = formatDocumentMap(document([page(1, ok, [unconfirmed])], { xfa: true }));
    expect(output).toContain('unconfirmed static layer');
    expect(output).toContain('render or OCR them');
    expect(output).not.toContain('Do not answer from it');
    expect(output).not.toContain('read them as usual');
  });

  it('renders a two-level outline and drops deeper nesting', () => {
    const output = formatDocumentMap(
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

  it('counts the omitted outline entries against every rendered row', () => {
    // The budget covers children too, so measuring the shortfall against
    // the top-level count alone reported a negative number and could drop
    // children with no notice at all.
    const output = formatDocumentMap(
      document([page(1, ok)], {
        outlineCount: 2,
        outline: [
          {
            title: 'Chapter 1',
            page: 1,
            items: Array.from({ length: 39 }, (_unused, index) => ({ title: `Section ${index}`, page: index + 2 })),
          },
          { title: 'Chapter 2', page: 50 },
        ],
      }),
    );
    expect(output).toContain('1 further outline entry omitted');
    expect(output).not.toMatch(/-\d+ further/);
  });

  it('never silently drops children past the row budget', () => {
    const output = formatDocumentMap(
      document([page(1, ok)], {
        outlineCount: 1,
        outline: [
          {
            title: 'Only chapter',
            page: 1,
            items: Array.from({ length: 60 }, (_unused, index) => ({ title: `Section ${index}`, page: index + 2 })),
          },
        ],
      }),
    );
    expect(output).toContain('21 further outline entries omitted');
  });

  it('escapes pipes so a title cannot break the tables', () => {
    const output = formatDocumentMap(
      document([page(1, ok)], { outlineCount: 1, outline: [{ title: 'A | B', page: 1 }] }),
    );
    expect(output).toContain('A \\| B');
  });

  it('leaves the next call to the caller', () => {
    // Suggestions name a specific surface's commands, so they belong to
    // whoever is serving the map, not to the formatter.
    expect(formatDocumentMap(document([page(1, scanned)]))).not.toContain('Next step');
  });
});
