import { describe, expect, it } from 'vitest';
import { formatMarkdown } from '../../src/output/markdown.js';
import type { DocumentResult, PageResult } from '../../src/types/index.js';

// US Letter dimensions in PDF points; the formatter doesn't read width/height
// but the type now requires them, so the helper supplies a realistic default.
function makePage(overrides: Partial<PageResult> & Pick<PageResult, 'page'>): PageResult {
  return {
    text: '',
    charCount: 0,
    imageCount: 0,
    textCoverage: 0,
    nonPrintableRatio: 0,
    nonPrintableCount: 0,
    quality: { nativeTextStatus: 'empty' },
    width: 612,
    height: 792,
    ...overrides,
  };
}

function makeResult(overrides: Partial<DocumentResult> = {}): DocumentResult {
  return {
    file: '/tmp/x.pdf',
    totalPages: 1,
    metadata: { title: null, author: null, subject: null, creator: null },
    pages: [makePage({ page: 1, text: 'hello world', charCount: 11, textCoverage: 0.123 })],
    ...overrides,
  };
}

describe('formatMarkdown', () => {
  it('renders a top-level heading with the file path and a Pages bullet', () => {
    const out = formatMarkdown(makeResult());
    expect(out).toMatch(/^# \/tmp\/x\.pdf\n/);
    expect(out).toMatch(/- \*\*Pages:\*\* 1/);
  });

  it('omits Title and Author bullets when both are absent', () => {
    const out = formatMarkdown(makeResult());
    expect(out).not.toMatch(/\*\*Title:\*\*/);
    expect(out).not.toMatch(/\*\*Author:\*\*/);
  });

  it('includes every metadata bullet that is present', () => {
    // Markdown is targeted at agent context where more metadata = more
    // grounding, so all four DocumentMetadata fields surface as bullets.
    const out = formatMarkdown(
      makeResult({
        metadata: { title: 'My Doc', author: 'Alice', subject: 'Quarterly review', creator: 'LaTeX' },
      }),
    );
    expect(out).toMatch(/- \*\*Title:\*\* My Doc/);
    expect(out).toMatch(/- \*\*Author:\*\* Alice/);
    expect(out).toMatch(/- \*\*Subject:\*\* Quarterly review/);
    expect(out).toMatch(/- \*\*Creator:\*\* LaTeX/);
  });

  it('renders each page as ## Page N with a density signal line and the text body', () => {
    const out = formatMarkdown(makeResult());
    expect(out).toMatch(/## Page 1/);
    // Coverage 0.123 → 12% (rounded). Density line uses italic + middle dot
    // so agents can pattern-match without colliding with normal page text.
    expect(out).toMatch(/_chars: 11 · images: 0 · coverage: 12% · size: 612×792pt_/);
    expect(out).toMatch(/\nhello world$/);
  });

  it('emits a Markdown image link when the page has a rendered PNG path', () => {
    const out = formatMarkdown(
      makeResult({
        pages: [makePage({ page: 1, text: 't', charCount: 1, image: '/tmp/p.png' })],
      }),
    );
    expect(out).toMatch(/!\[Page 1\]\(<\/tmp\/p\.png>\)/);
  });

  it('keeps image links intact when the path contains spaces or parentheses', () => {
    // --render-output may point at a directory like "./my (drafts)/", and
    // the unescaped `(` inside `![...](...)` would otherwise terminate the
    // link destination early. The angle-bracket form must survive that.
    const out = formatMarkdown(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: 't',
            charCount: 1,
            image: '/tmp/my (drafts)/page 1.png',
          }),
        ],
      }),
    );
    expect(out).toContain('![Page 1](</tmp/my (drafts)/page 1.png>)');
  });

  it('separates pages with --- so multi-page docs stay readable', () => {
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pages: [makePage({ page: 1, text: 'one', charCount: 3 }), makePage({ page: 2, text: 'two', charCount: 3 })],
      }),
    );
    // Two page sections separated by a horizontal rule.
    expect(out.match(/^---$/gm)?.length).toBe(2);
    expect(out.indexOf('## Page 1')).toBeLessThan(out.indexOf('## Page 2'));
  });

  it('emits an Overview density table for multi-page docs so agents can spot outliers', () => {
    // The overview is just an aggregation of the per-page density signals
    // already on every page section — no judgment ("needsVision",
    // "riskLevel", ...). The agent reads it and decides themselves.
    const out = formatMarkdown(
      makeResult({
        totalPages: 3,
        pages: [
          makePage({ page: 1, text: 'aa', charCount: 2, textCoverage: 0.4 }),
          makePage({ page: 2, text: '', charCount: 0, imageCount: 5, textCoverage: 0.02 }),
          makePage({ page: 3, text: 'b'.repeat(100), charCount: 100, imageCount: 1, textCoverage: 0.7 }),
        ],
      }),
    );
    expect(out).toMatch(/## Overview/);
    expect(out).toMatch(/\| Page \| Chars \| Images \| Coverage \|/);
    // Row for the image-flattened page surfaces zero chars, 5 images,
    // 2% coverage so the reader can recognise a likely-rasterised page.
    expect(out).toMatch(/\| 2 \| 0 \| 5 \| 2% \|/);
    // Overview comes before the per-page sections.
    expect(out.indexOf('## Overview')).toBeLessThan(out.indexOf('## Page 1'));
  });

  it('omits the Overview table when only one page was selected', () => {
    // A one-row table is just noise. With --pages 3 the section header
    // already names the page so the table adds no information.
    const out = formatMarkdown(makeResult());
    expect(out).not.toMatch(/## Overview/);
  });

  it('omits the Blocks column when no page carries a layout payload', () => {
    // Default extraction (no --layout) should not pollute the overview
    // table with an empty Blocks column.
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pages: [makePage({ page: 1, text: 'a', charCount: 1 }), makePage({ page: 2, text: 'b', charCount: 1 })],
      }),
    );
    expect(out).not.toMatch(/Blocks/);
  });

  it('adds a Blocks column to the Overview table when --layout populated pages[].layout', () => {
    // With layout on, agents can scan the Blocks count alongside the
    // density signals to spot pages that decompose differently — a
    // 1-block page is usually a single image / quote / heading, while
    // many small blocks suggest a list or a dense slide.
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pages: [
          makePage({
            page: 1,
            text: 'a',
            charCount: 1,
            layout: {
              blocks: [
                {
                  text: 'a',
                  x: 0,
                  y: 0,
                  width: 10,
                  height: 10,
                  lines: [{ text: 'a', x: 0, y: 0, width: 10, height: 10, fontSize: 10 }],
                },
              ],
            },
          }),
          makePage({
            page: 2,
            text: 'b\nc\nd',
            charCount: 5,
            layout: {
              blocks: [
                {
                  text: 'b',
                  x: 0,
                  y: 0,
                  width: 10,
                  height: 10,
                  lines: [{ text: 'b', x: 0, y: 0, width: 10, height: 10, fontSize: 10 }],
                },
                {
                  text: 'c',
                  x: 0,
                  y: 30,
                  width: 10,
                  height: 10,
                  lines: [{ text: 'c', x: 0, y: 30, width: 10, height: 10, fontSize: 10 }],
                },
                {
                  text: 'd',
                  x: 0,
                  y: 60,
                  width: 10,
                  height: 10,
                  lines: [{ text: 'd', x: 0, y: 60, width: 10, height: 10, fontSize: 10 }],
                },
              ],
            },
          }),
        ],
      }),
    );
    expect(out).toMatch(/Blocks \|/);
    expect(out).toMatch(/\| 1 \| 1 \| 0 \| 0% \| 612×792 \| 1 \|/);
    expect(out).toMatch(/\| 2 \| 5 \| 0 \| 0% \| 612×792 \| 3 \|/);
  });

  it('adds a NonPrint column to the Overview table when at least one page has nonPrintableRatio > 0', () => {
    // The column exists to call out CMap-garbage pages alongside the
    // density signals. Showing it on a doc where no page is affected is
    // pure noise, so the formatter gates it on "any page > 0".
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pages: [
          makePage({ page: 1, text: 'clean', charCount: 5, nonPrintableRatio: 0, nonPrintableCount: 0 }),
          makePage({
            page: 2,
            text: '\x00\x01bad',
            charCount: 3,
            nonPrintableRatio: 0.667,
            nonPrintableCount: 2,
          }),
        ],
      }),
    );
    expect(out).toMatch(/\| Page \| Chars \| Images \| Coverage \| NonPrint \| Size \(pt\) \|/);
    expect(out).toMatch(/\| 1 \| 5 \| 0 \| 0% \| 0% \| 612×792 \|/);
    expect(out).toMatch(/\| 2 \| 3 \| 0 \| 0% \| 67% \| 612×792 \|/);
  });

  it('shows `<1%` instead of `0%` when nonPrintableCount > 0 but the ratio rounds to 0', () => {
    // Sparse occurrences (a couple of control bytes in a multi-thousand-char
    // body page) round to 0% but are still worth surfacing so the agent can
    // filter on "is there ANY garbage?".
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pages: [
          makePage({ page: 1, text: 'a'.repeat(1000), charCount: 1000, nonPrintableRatio: 0, nonPrintableCount: 0 }),
          makePage({ page: 2, text: 'b'.repeat(1000), charCount: 1000, nonPrintableRatio: 0, nonPrintableCount: 2 }),
        ],
      }),
    );
    expect(out).toMatch(/NonPrint/);
    expect(out).toMatch(/\| 2 \| 1000 \| 0 \| 0% \| <1% \| 612×792 \|/);
  });

  it('omits the NonPrint column when every page has nonPrintableRatio = 0', () => {
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pages: [
          makePage({ page: 1, text: 'clean', charCount: 5, nonPrintableRatio: 0 }),
          makePage({ page: 2, text: 'also clean', charCount: 10, nonPrintableRatio: 0 }),
        ],
      }),
    );
    expect(out).not.toMatch(/NonPrint/);
  });

  it('appends a nonPrint fragment to the page density line when nonPrintableRatio > 0', () => {
    const out = formatMarkdown(
      makeResult({
        pages: [makePage({ page: 1, text: '\x00', charCount: 1, nonPrintableRatio: 1, nonPrintableCount: 1 })],
      }),
    );
    expect(out).toMatch(/_chars: 1 · images: 0 · coverage: 0% · nonPrint: 100% · size: 612×792pt_/);
  });

  it('omits the nonPrint fragment from the page density line when nonPrintableRatio = 0', () => {
    const out = formatMarkdown(makeResult());
    expect(out).not.toMatch(/nonPrint/);
  });

  it('renders an OCR section with lang and confidence percent below the native text', () => {
    // Native text comes first; OCR sits underneath as a separate ### block
    // so an agent reads pdfjs first and only consults OCR when needed.
    const out = formatMarkdown(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: 'Hello',
            charCount: 5,
            ocr: { text: 'Hello world', confidence: 0.91, lang: 'eng' },
          }),
        ],
      }),
    );
    expect(out).toMatch(/### OCR \(eng, confidence 91%\)/);
    expect(out).toMatch(/Hello world/);
    // Native text appears before OCR section.
    expect(out.indexOf('\nHello\n')).toBeLessThan(out.indexOf('### OCR'));
  });

  it('skips the text body for pages that had no extractable text', () => {
    // Image-only pages should still render the heading + density line so the
    // agent can see "this page had 0 chars and 3 images" instead of a silent gap.
    const out = formatMarkdown(
      makeResult({
        pages: [makePage({ page: 1, imageCount: 3 })],
      }),
    );
    expect(out).toMatch(/## Page 1/);
    expect(out).toMatch(/images: 3/);
  });
});
