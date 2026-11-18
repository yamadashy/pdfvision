import { describe, expect, it } from 'vitest';
import { detectPageWarnings } from '../../../src/core/warnings/index.js';
import { block, line, page } from './helpers.js';

const region = { x: 118, y: 455, width: 430, height: 142, glyphs: 119, runs: 14 };
const body = [block(40, 100, 300, 10, { text: 'Package Outline', lines: [line('Package Outline', 40, 100, 300, 10)] })];

describe('vector_outlined_text', () => {
  it('names the region of glyph outlines on a page that has text elsewhere', () => {
    const result = { ...page(body), charCount: 400 };
    const out = detectPageWarnings(result, {
      vectorFigures: { seriesLines: [], pies: [], outlinedText: [region] },
    });
    const warning = out.find((w) => w.code === 'vector_outlined_text');
    expect(warning?.message).toContain('--render-region 118,455,430,142');
    expect(warning?.message).toContain('119 letter-shaped outlines in 14 rows');
  });

  it('leaves a page with no text to vector_graphics_no_native_text', () => {
    const out = detectPageWarnings(page(body), {
      vectorFigures: { seriesLines: [], pies: [], outlinedText: [region] },
    });
    expect(out.some((w) => w.code === 'vector_outlined_text')).toBe(false);
  });
});
