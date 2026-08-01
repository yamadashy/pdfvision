import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { processDocument } from '../../src/core/processor.js';
import { compactBody, EMPTY_SECTION_SENTINELS } from '../../src/mcp/compact.js';
import { formatMarkdown } from '../../src/output/markdown.js';

const SAMPLE = join(import.meta.dirname, '..', 'fixtures', 'sample.pdf');

describe('compactBody', () => {
  it('drops an empty section together with its heading', () => {
    const input = ['## Page 1', '', 'body', '', '### Form fields', '', '_No interactive form fields found._', ''].join(
      '\n',
    );
    const output = compactBody(input);
    expect(output).not.toContain('### Form fields');
    expect(output).not.toContain('_No interactive form fields found._');
    expect(output).toContain('body');
  });

  it('keeps a section that actually has content', () => {
    const input = ['### Form fields', '', '| Name | Value |', '| --- | --- |', '| a | b |'].join('\n');
    expect(compactBody(input)).toContain('### Form fields');
  });

  it('drops zero-valued density fragments but keeps non-zero ones', () => {
    const line = '_chars: 15 · images: 0 · formFields: 0 · links: 3 · annotations: 0 · size: 612×792pt_';
    const output = compactBody(line);
    expect(output).toBe('_chars: 15 · images: 0 · links: 3 · size: 612×792pt_');
  });

  it('leaves a body with nothing to strip untouched', () => {
    const input = '## Page 1\n\nHello\n';
    expect(compactBody(input)).toBe(input);
  });

  // Guard: the sentinels are matched as exact strings, so a wording change
  // in the formatter must fail here rather than silently leak three empty
  // sections into every MCP response.
  it('matches the sentences the Markdown formatter actually emits', async () => {
    const result = await processDocument(SAMPLE, {
      formFields: true,
      links: true,
      annotations: true,
      visualRegions: true,
    });
    const markdown = formatMarkdown(result, { layout: true });
    for (const sentinel of EMPTY_SECTION_SENTINELS) {
      expect(markdown).toContain(sentinel);
    }
    const compacted = compactBody(markdown);
    for (const sentinel of EMPTY_SECTION_SENTINELS) {
      expect(compacted).not.toContain(sentinel);
    }
    expect(compacted).toContain('Hello pdfvision');
  });
});
