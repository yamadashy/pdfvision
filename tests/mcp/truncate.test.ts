import { describe, expect, it } from 'vitest';
import { PAGE_CHAR_CAP } from '../../src/mcp/limits.js';
import { truncateBody } from '../../src/mcp/truncate.js';
import type { MarkdownPageSection } from '../../src/output/markdown.js';

const hint = (from: number, to: number) => `read_pdf(pages: "${from}-${to}")`;
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
    expect(output).toContain('1 page omitted (2-2)');
  });

  it('returns just the header for a document with no pages', () => {
    expect(truncateBody(HEADER, [], { continuationHint: hint })).toBe(HEADER);
  });

  it('numbers omitted pages from the section, not the array index', () => {
    const sections = buildSections(4, 400).map((section, index) => ({ ...section, page: index + 41 }));
    const output = truncateBody(HEADER, sections, { continuationHint: hint, charCap: 500 });
    expect(output).toContain('showing pages 41-41');
    expect(output).toContain('omitted (42-44)');
  });
});
