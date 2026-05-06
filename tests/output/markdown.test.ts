import { describe, expect, it } from 'vitest';
import { formatMarkdown } from '../../src/output/markdown.js';
import type { DocumentResult } from '../../src/types/index.js';

function makeResult(overrides: Partial<DocumentResult> = {}): DocumentResult {
  return {
    file: '/tmp/x.pdf',
    totalPages: 1,
    metadata: { title: null, author: null, subject: null, creator: null },
    pages: [{ page: 1, text: 'hello world', charCount: 11, imageCount: 0, textCoverage: 0.123 }],
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
    expect(out).toMatch(/_chars: 11 · images: 0 · coverage: 12%_/);
    expect(out).toMatch(/\nhello world$/);
  });

  it('emits a Markdown image link when the page has a rendered PNG path', () => {
    const out = formatMarkdown(
      makeResult({
        pages: [{ page: 1, text: 't', charCount: 1, imageCount: 0, textCoverage: 0, image: '/tmp/p.png' }],
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
          {
            page: 1,
            text: 't',
            charCount: 1,
            imageCount: 0,
            textCoverage: 0,
            image: '/tmp/my (drafts)/page 1.png',
          },
        ],
      }),
    );
    expect(out).toContain('![Page 1](</tmp/my (drafts)/page 1.png>)');
  });

  it('separates pages with --- so multi-page docs stay readable', () => {
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pages: [
          { page: 1, text: 'one', charCount: 3, imageCount: 0, textCoverage: 0 },
          { page: 2, text: 'two', charCount: 3, imageCount: 0, textCoverage: 0 },
        ],
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
          { page: 1, text: 'aa', charCount: 2, imageCount: 0, textCoverage: 0.4 },
          { page: 2, text: '', charCount: 0, imageCount: 5, textCoverage: 0.02 },
          { page: 3, text: 'b'.repeat(100), charCount: 100, imageCount: 1, textCoverage: 0.7 },
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

  it('skips the text body for pages that had no extractable text', () => {
    // Image-only pages should still render the heading + density line so the
    // agent can see "this page had 0 chars and 3 images" instead of a silent gap.
    const out = formatMarkdown(
      makeResult({
        pages: [{ page: 1, text: '', charCount: 0, imageCount: 3, textCoverage: 0 }],
      }),
    );
    expect(out).toMatch(/## Page 1/);
    expect(out).toMatch(/images: 3/);
  });
});
