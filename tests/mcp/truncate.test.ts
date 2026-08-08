import { describe, expect, it } from 'vitest';
import { formatPageRange } from '../../src/core/options/pageRange.js';
import { BODY_CHAR_CAP, PAGE_CHAR_CAP } from '../../src/mcp/limits.js';
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
    expect(output).not.toContain('## Page 2');
    expect(output).toContain('9 pages omitted (2-10)');
  });

  it('embeds the exact follow-up call rather than a bare marker', () => {
    const output = truncateBody(HEADER, buildSections(10, 400), { continuationHint: hint, charCap: 1000 });
    expect(output).toContain('Continue with read_pdf(pages: "2-10")');
    expect(output).not.toMatch(/\[truncated]/i);
  });

  it('shows the start of the first page even when it alone exceeds the cap', () => {
    // Nothing fits whole, so page 1 is counted as omitted too — the
    // caller has to ask again to get the rest of it.
    const output = truncateBody(HEADER, buildSections(4, 900), { continuationHint: hint, charCap: 100 });
    expect(output).toContain('## Page 1');
    expect(output).toContain('no page fits it whole');
    expect(output).toContain('4 pages omitted (1-4)');
  });

  it('clips an oversized single page and points at search instead', () => {
    const output = truncateBody(HEADER, buildSections(1, PAGE_CHAR_CAP + 5_000), { continuationHint: hint });
    expect(output).toContain('Page 1 clipped at');
    expect(output).toContain('Use search_pdf to locate content');
  });

  it('reports a single omitted page in the singular', () => {
    const output = truncateBody(HEADER, buildSections(2, 900), { continuationHint: hint, charCap: 1400 });
    expect(output).toContain('showing pages 1');
    expect(output).toContain('1 page omitted (2)');
  });

  it('returns just the header for a document with no pages', () => {
    expect(truncateBody(HEADER, [], { continuationHint: hint })).toBe(HEADER);
  });

  it('numbers omitted pages from the section, not the array index', () => {
    const sections = buildSections(4, 400).map((section, index) => ({ ...section, page: index + 41 }));
    const output = truncateBody(HEADER, sections, { continuationHint: hint, charCap: 1000 });
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
    expect(output).toContain('omitted (100, 200, 300)');
    expect(output).toContain('Continue with read_pdf(pages: "100, 200, 300")');
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

  it('never reports a page the clamp cut away', () => {
    // A header just over the budget used to leave the reader with no page
    // body at all while the notice still said "showing pages 1" — and the
    // follow-up call it suggested omitted page 1, so that page was
    // unreachable from the response.
    const hugeHeader = `# doc.pdf\n${'| 1 | 0 | 0 | 0% |\n'.repeat(70)}`;
    const output = truncateBody(hugeHeader, buildSections(2, 100), { continuationHint: hint, charCap: 1_000 });
    expect(output).not.toContain('## Page 1');
    expect(output).not.toContain('showing pages');
    expect(output).toContain('no page fits it whole');
    expect(output).toContain('2 pages omitted (1-2)');
    expect(output).toContain('Continue with read_pdf(pages: "1-2")');
  });

  it('claims no page when the budget leaves room for none, however small the cap', () => {
    const output = truncateBody('', buildSections(2, 100), { continuationHint: hint, charCap: 10 });
    expect(output).not.toContain('showing pages');
    expect(output).toContain('2 pages omitted (1-2)');
  });

  it('keeps every page it claims to be showing intact', () => {
    const sections = buildSections(10, 400);
    const output = truncateBody(HEADER, sections, { continuationHint: hint, charCap: 4_000 });
    const shown = /showing pages 1-(\d+)/.exec(output);
    expect(shown).not.toBeNull();
    for (let page = 1; page <= Number(shown?.[1]); page += 1) {
      expect(output).toContain(sections[page - 1]?.text);
    }
    expect(output).not.toContain('Response clipped at');
  });

  it('stays inside the budget at the cap the server actually uses', () => {
    // The notice is appended on top of the content allowance, so a cap
    // smaller than the notice itself cannot be honoured. What has to
    // hold is the real budget: at BODY_CHAR_CAP the reserve covers the
    // notice and the whole response fits.
    const sections = buildSections(200, 400);
    const output = truncateBody(HEADER, sections, { continuationHint: hint });
    expect(output.length).toBeLessThanOrEqual(BODY_CHAR_CAP);
    expect(output).toContain('omitted');
  });

  it('leaves a response that fits well alone', () => {
    const sections = buildSections(2, 100);
    const output = truncateBody(HEADER, sections, { continuationHint: hint });
    expect(output).not.toContain('Response clipped at');
  });
});
