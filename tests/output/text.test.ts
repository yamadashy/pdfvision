import { describe, expect, it } from 'vitest';
import { formatText } from '../../src/output/text.js';
import type { DocumentResult } from '../../src/types/index.js';

function makeResult(overrides: Partial<DocumentResult> = {}): DocumentResult {
  return {
    file: '/tmp/x.pdf',
    totalPages: 1,
    metadata: { title: null, author: null, subject: null, creator: null },
    pages: [{ page: 1, text: 'hi', charCount: 2, imageCount: 0, textCoverage: 0.1 }],
    ...overrides,
  };
}

describe('formatText', () => {
  it('omits Title / Author lines when both are absent', () => {
    const out = formatText(makeResult());
    expect(out).not.toMatch(/Title:/);
    expect(out).not.toMatch(/Author:/);
  });

  it('includes Title and Author when both are present', () => {
    const out = formatText(
      makeResult({
        metadata: { title: 'My Doc', author: 'Alice', subject: null, creator: null },
      }),
    );
    expect(out).toMatch(/Title: My Doc/);
    expect(out).toMatch(/Author: Alice/);
  });

  it('appends Image: line when render output is present', () => {
    const out = formatText(
      makeResult({
        pages: [{ page: 1, text: 't', charCount: 1, imageCount: 0, textCoverage: 0, image: '/tmp/p.png' }],
      }),
    );
    expect(out).toMatch(/Image: \/tmp\/p\.png/);
  });
});
