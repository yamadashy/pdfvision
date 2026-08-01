import { describe, expect, it } from 'vitest';
import { formatPageRange } from '../../src/core/options/pageRange.js';
import { PAGE_CHAR_CAP } from '../../src/mcp/limits.js';
import { truncateBody } from '../../src/mcp/truncate.js';
import type { MarkdownPageSection } from '../../src/output/markdown.js';

const hint = (dropped: readonly number[]) => `read_pdf(pages: "${formatPageRange(dropped)}")`;
const HEADER = '# doc.pdf\n\n- **Pages:** 10\n';

function buildSections(pageCount: number, bodyChars: number): MarkdownPageSection[] {
  return Array.from({ length: pageCount }, (_unused, index) => ({
    page: index + 1,
    text: `\n\n---\n\n## Page ${index + 1}\n\n${'x'.repeat(bodyChars)}\n`,
  }));
}

describe('truncateBody', () => {
  it('passes a body under the cap through unchanged', () => {
    const sections = buildSections(3, 100);
    expect(truncateBody(HEADER, sections, { continuationHint: hint })).toBe(
      HEADER + sections.map((section) => section.text).join(''),
    );
  });

  it('clips at a page boundary and names the omitted pages', () => {
    const output = truncateBody(HEADER, buildSections(10, 400), { continuationHint: hint, charCap: 1000 });
    expect(output).toContain('## Page 1');
    expect(output).not.toContain('## Page 3');
    expect(output).toContain('8 pages omitted (3-10)');
  });

  it('embeds the exact follow-up call rather than a bare marker', () => {
    const output = truncateBody(HEADER, buildSections(10, 400), { continuationHint: hint, charCap: 1000 });
    expect(output).toContain('Continue with read_pdf(pages: "3-10")');
    expect(output).not.toMatch(/\[truncated]/i);
  });

  it('keeps the first page even when it alone exceeds the cap', () => {
    const output = truncateBody(HEADER, buildSections(4, 900), { continuationHint: hint, charCap: 100 });
    expect(output).toContain('## Page 1');
    expect(output).toContain('3 pages omitted (2-4)');
  });

  it('clips an oversized single page and points at search instead', () => {
    const output = truncateBody(HEADER, buildSections(1, PAGE_CHAR_CAP + 5_000), { continuationHint: hint });
    expect(output).toContain('Page 1 clipped at');
    expect(output).toContain('Use search_pdf to locate content');
  });

  it('reports a single omitted page in the singular', () => {
    const output = truncateBody(HEADER, buildSections(2, 400), { continuationHint: hint, charCap: 500 });
    expect(output).toContain('1 page omitted (2)');
  });

  it('returns just the header for a document with no pages', () => {
    expect(truncateBody(HEADER, [], { continuationHint: hint })).toBe(HEADER);
  });

  it('numbers omitted pages from the section, not the array index', () => {
    const sections = buildSections(4, 400).map((section, index) => ({ ...section, page: index + 41 }));
    const output = truncateBody(HEADER, sections, { continuationHint: hint, charCap: 500 });
    expect(output).toContain('showing pages 41');
    expect(output).toContain('omitted (42-44)');
  });

  it('asks only for the pages it dropped, not the span between them', () => {
    // A `1,100,200,300` selector drops non-adjacent pages; suggesting
    // "200-300" would re-extract a hundred pages nobody requested.
    const sections = [1, 100, 200, 300].map((page) => ({
      page,
      text: `\n\n---\n\n## Page ${page}\n\n${'x'.repeat(400)}\n`,
    }));
    const output = truncateBody(HEADER, sections, { continuationHint: hint, charCap: 900 });
    expect(output).toContain('omitted (200, 300)');
    expect(output).toContain('Continue with read_pdf(pages: "200, 300")');
    expect(output).not.toContain('200-300');
  });

  it('clips the whole response when the header alone blows the budget', () => {
    // `pages: "1-500"` puts an Overview row per page in the header, which
    // page-boundary truncation cannot reach.
    const hugeHeader = `# doc.pdf\n${'| 1 | 0 | 0 | 0% |\n'.repeat(400)}`;
    const output = truncateBody(hugeHeader, buildSections(2, 100), { continuationHint: hint, charCap: 1_000 });
    expect(output.length).toBeLessThan(1_200);
    expect(output).toContain('Response clipped at');
  });

  it('leaves a response that fits well alone', () => {
    const sections = buildSections(2, 100);
    const output = truncateBody(HEADER, sections, { continuationHint: hint });
    expect(output).not.toContain('Response clipped at');
  });
});
