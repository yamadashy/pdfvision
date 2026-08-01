import { describe, expect, it } from 'vitest';
import { PAGE_CHAR_CAP } from '../../src/mcp/limits.js';
import { truncateBody } from '../../src/mcp/truncate.js';

const hint = (from: number, to: number) => `read_pdf(pages: "${from}-${to}")`;

function buildBody(pageCount: number, bodyChars: number): string {
  const header = '# doc.pdf\n\n- **Pages:** 10\n';
  const pages = Array.from(
    { length: pageCount },
    (_unused, index) => `\n---\n\n## Page ${index + 1}\n\n${'x'.repeat(bodyChars)}\n`,
  );
  return header + pages.join('');
}

describe('truncateBody', () => {
  it('passes a body under the cap through unchanged', () => {
    const body = buildBody(3, 100);
    expect(truncateBody(body, { continuationHint: hint })).toBe(body);
  });

  it('clips at a page boundary and names the omitted pages', () => {
    const output = truncateBody(buildBody(10, 400), { continuationHint: hint, charCap: 1000 });
    expect(output).toContain('## Page 1');
    expect(output).not.toContain('## Page 3');
    expect(output).toContain('8 pages omitted (3-10)');
  });

  it('embeds the exact follow-up call rather than a bare marker', () => {
    const output = truncateBody(buildBody(10, 400), { continuationHint: hint, charCap: 1000 });
    expect(output).toContain('Continue with read_pdf(pages: "3-10")');
    expect(output).not.toMatch(/\[truncated]/i);
  });

  it('keeps the first page even when it alone exceeds the cap', () => {
    const output = truncateBody(buildBody(4, 900), { continuationHint: hint, charCap: 100 });
    expect(output).toContain('## Page 1');
    expect(output).toContain('3 pages omitted (2-4)');
  });

  it('clips an oversized single page and points at search instead', () => {
    const output = truncateBody(buildBody(1, PAGE_CHAR_CAP + 5_000), { continuationHint: hint });
    expect(output).toContain('Page 1 clipped at');
    expect(output).toContain('Use search_pdf to locate content');
  });

  it('falls back to a plain clip when there are no page headings', () => {
    const output = truncateBody('y'.repeat(500), { continuationHint: hint, charCap: 100 });
    expect(output).toContain('Output clipped at 100 chars');
  });

  it('reports a single omitted page in the singular', () => {
    const output = truncateBody(buildBody(2, 400), { continuationHint: hint, charCap: 500 });
    expect(output).toContain('1 page omitted (2-2)');
  });
});
