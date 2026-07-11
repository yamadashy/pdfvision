import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { processDocument } from '../../../src/core/processor.js';
import { truncatedPageEdge } from '../../../src/core/warnings/edge/pageEdgeTextTruncated.js';
import { detectPageWarnings } from '../../../src/core/warnings/index.js';
import { formatJson } from '../../../src/output/json.js';
import { formatMarkdown } from '../../../src/output/markdown.js';
import { formatToon } from '../../../src/output/toon.js';
import { formatXml } from '../../../src/output/xml.js';
import type { TextSpan } from '../../../src/types/index.js';
import { block, page } from './helpers.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SAMPLE_TRUNCATED_LINE_PDF = resolve(__dirname, '../../fixtures/sample-truncated-line.pdf');

function span(overrides: Partial<TextSpan> = {}): TextSpan {
  return {
    text: 'A'.repeat(92),
    x: 2,
    y: 382,
    width: 613.64,
    height: 10,
    fontSize: 10,
    ...overrides,
  };
}

describe('truncatedPageEdge', () => {
  it('detects a text run whose final advance crosses the page boundary', () => {
    expect(truncatedPageEdge(span(), 612, 792)).toBe('right');
  });

  it('does not detect an ordinary text run with normal margins', () => {
    expect(truncatedPageEdge(span({ x: 50, width: 300 }), 612, 792)).toBeUndefined();
  });

  it('does not detect a text run that approaches but does not cross the edge', () => {
    expect(truncatedPageEdge(span({ x: 2, width: 609.9 }), 612, 792)).toBeUndefined();
  });

  it('detects the same signature at the other edges and for vertical text', () => {
    expect(truncatedPageEdge(span({ x: -2, width: 300 }), 612, 792)).toBe('left');
    expect(truncatedPageEdge(span({ x: 200, y: -2, width: 10, height: 300 }), 612, 792)).toBe('top');
    expect(truncatedPageEdge(span({ x: 200, y: 490, width: 10, height: 303 }), 612, 792)).toBe('bottom');
  });

  it('suppresses a natural punctuation ending at the boundary', () => {
    expect(
      truncatedPageEdge(
        span({ text: '日本における生成AI利用経験は上昇。', x: 32.4, width: 812.95, fontSize: 17.28 }),
        841.92,
        595.32,
      ),
    ).toBeUndefined();
  });

  it('replaces off_page with the specific content-loss warning for the same block', () => {
    const out = detectPageWarnings(page([block(10, 32, 606.97, 10, { text: 'A'.repeat(91) })]), {
      spans: [span({ text: 'A'.repeat(91), x: 10, y: 32, width: 606.97 })],
    });

    expect(out).toContainEqual(
      expect.objectContaining({ code: 'page_edge_text_truncated', severity: 'error', blockIndex: 0 }),
    );
    expect(out.filter((warning) => warning.code === 'off_page')).toEqual([]);
  });
});

describe('page_edge_text_truncated integration', () => {
  it('surfaces the always-on warning from the generated PDF in every output format', async () => {
    const result = await processDocument(SAMPLE_TRUNCATED_LINE_PDF, { noCache: true });
    const warning = result.pages[0].warnings?.find((item) => item.code === 'page_edge_text_truncated');

    expect(warning).toMatchObject({ severity: 'error' });
    expect(warning?.message).toContain('glyphs beyond the page box are not extractable because pdf.js drops them');
    for (const output of [formatJson(result), formatXml(result), formatToon(result), formatMarkdown(result)]) {
      expect(output).toContain('page_edge_text_truncated');
    }
  });
});
