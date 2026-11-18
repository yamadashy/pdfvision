import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../src/core/layout/index.js';
import type { TextSpan } from '../../src/types/index.js';

function span(text: string, x: number, y: number, fontSize: number, width = text.length * fontSize * 0.5): TextSpan {
  return { text, x, y, width, height: fontSize, fontSize };
}

function lineOrder(spans: TextSpan[], width = 612, height = 792): string[] {
  return buildLayout(spans, width, height).blocks.flatMap((block) => block.text.split('\n'));
}

/** `count` lines of one column, `leading` apart, each `width` wide. */
function column(prefix: string, x: number, top: number, count: number, width = 164, leading = 12): TextSpan[] {
  return Array.from({ length: count }, (_, i) =>
    span(`${prefix} line ${i + 1} of the column text`, x, top + i * leading, 9.5, width),
  );
}

describe('reorderForColumns — interrupted columns (#274)', () => {
  it('reads a column narrowed around an inset photo in its place, not after the column', () => {
    // magazine-feature: column 2 runs above the photo at x=224, beside it
    // at x=302 (the runaround), and below it at x=224 again.
    const spans = [
      ...column('c1a', 40, 210, 14),
      ...column('c1b', 40, 400, 14),
      ...column('c2 top', 224, 210, 5),
      ...column('c2 mid', 224, 290, 5),
      ...column('c2 beside', 302, 474, 4, 86),
      ...column('c2 beside more', 302, 540, 4, 86),
      ...column('c2 below', 224, 654, 6),
      ...column('c3a', 408, 210, 14),
      ...column('c3b', 408, 400, 14),
    ];
    const order = lineOrder(spans);
    const at = (text: string) => order.indexOf(text);
    expect(at('c1b line 14 of the column text')).toBeLessThan(at('c2 top line 1 of the column text'));
    expect(at('c2 mid line 5 of the column text')).toBeLessThan(at('c2 beside line 1 of the column text'));
    expect(at('c2 beside more line 4 of the column text')).toBeLessThan(at('c2 below line 1 of the column text'));
    expect(at('c2 below line 6 of the column text')).toBeLessThan(at('c3a line 1 of the column text'));
  });

  it('keeps a stray word inside a column from ending the column run', () => {
    // A right-aligned jump line inside column 3 used to read as a
    // separator, so every column was read in two segments around it.
    const spans = [
      ...column('c1', 40, 210, 20),
      ...column('c2', 224, 210, 20),
      ...column('c3', 408, 210, 8),
      span('Continued on page 48 ›', 483, 320, 7, 88),
      ...column('c3 rest', 408, 340, 10),
    ];
    const order = lineOrder(spans);
    expect(order.indexOf('c1 line 20 of the column text')).toBeLessThan(order.indexOf('c2 line 1 of the column text'));
    expect(order.indexOf('c2 line 20 of the column text')).toBeLessThan(order.indexOf('c3 line 1 of the column text'));
  });

  it('puts a justified word cut off its line back on that line', () => {
    // magazine-feature: `The counting` is set with a word space wide
    // enough to split the line in two.
    const spans = [
      ...column('c1', 42, 70, 20, 168, 9.6),
      span('The', 42, 262, 9.5, 16),
      span('counting', 94, 262, 9.5, 34),
      ...column('c1 after', 42, 290, 10, 168, 9.6),
      ...column('c2', 222, 70, 15, 168, 9.6),
      ...column('c2 after', 222, 230, 15, 168, 9.6),
    ];
    const order = lineOrder(spans);
    expect(order).toContain('The counting');
    expect(order).not.toContain('counting');
  });

  it('does not splice a value onto its label in a table row', () => {
    const spans = [
      ...column('c1', 42, 70, 12, 168, 9.6),
      span('Total', 42, 200, 9.5, 24),
      span('696', 150, 200, 9.5, 15),
      span('Net income', 42, 214, 9.5, 48),
      span('513', 150, 214, 9.5, 15),
      ...column('c1 after', 42, 240, 10, 168, 9.6),
      ...column('c2', 222, 70, 15, 168, 9.6),
      ...column('c2 after', 222, 230, 15, 168, 9.6),
    ];
    const order = lineOrder(spans);
    expect(order).not.toContain('Total 696');
    expect(order).toContain('696');
  });

  it('reads a sidebar beside a full-width abstract after the abstract, not line by line', () => {
    // paper-floats-out-of-order: sidebar lines at x=36 alternate in the
    // stream with abstract lines that span both body columns.
    const spans: TextSpan[] = [span('Abstract', 176, 183, 10, 42)];
    for (let i = 0; i < 6; i++) {
      spans.push(
        span(`Abstract sentence number ${i + 1} continues across the full width here`, 176, 198 + i * 12, 8, 400),
      );
      spans.push(span(`Sidebar entry ${i + 1} with details`, 36, 201 + i * 12, 7, 110));
    }
    spans.push(...column('left body', 176, 300, 12, 192), ...column('right body', 384, 300, 12, 192));
    spans.push(...column('sidebar more', 36, 290, 10, 110));
    const blocks = buildLayout(spans, 612, 792).blocks;
    const abstract = blocks.find((block) => block.text.startsWith('Abstract sentence number 1'));
    expect(abstract?.text.split('\n')).toHaveLength(6);
    const order = blocks.flatMap((block) => block.text.split('\n'));
    expect(order.indexOf('Sidebar entry 1 with details')).toBeGreaterThan(
      order.indexOf('Abstract sentence number 6 continues across the full width here'),
    );
  });
  it('reads a section heading in the left column before the right column beside it', () => {
    // math-cat: \`I. INTRODUCTION\` is centred over the left column at the
    // height where the right column (one long block) starts.
    const spans = [
      span('I. INTRODUCTION', 124, 335, 9.5, 104),
      ...column('left', 54, 360, 26, 245),
      ...column('right', 317, 334, 30, 245),
    ];
    const order = lineOrder(spans);
    expect(order.indexOf('I. INTRODUCTION')).toBe(0);
    expect(order.indexOf('left line 26 of the column text')).toBeLessThan(
      order.indexOf('right line 1 of the column text'),
    );
  });

  it('does not read the left column after a stray fragment at the foot of the right one', () => {
    // survey-llm: a subscript cut off a formula at the bottom of the right
    // column, beside the left column's last paragraph.
    const spans = [
      ...column('left', 48, 41, 30, 252),
      ...column('left end', 48, 420, 25, 252),
      ...column('right', 312, 42, 50, 252),
      span('D', 499, 742, 7, 7),
    ];
    const order = lineOrder(spans);
    expect(order.indexOf('left end line 25 of the column text')).toBeLessThan(
      order.indexOf('right line 1 of the column text'),
    );
  });
});

describe('reorderForColumns — shapes that must not change', () => {
  it('reads a plain two-column page column by column', () => {
    const order = lineOrder([...column('left', 54, 100, 20, 243), ...column('right', 315, 100, 20, 243)]);
    expect(order.indexOf('left line 20 of the column text')).toBe(19);
    expect(order.indexOf('right line 1 of the column text')).toBe(20);
  });

  it('keeps a clause number with its own clause instead of weaving clauses together', () => {
    // contract-redacted: `1.2` on the baseline of the next clause.
    const spans = [
      span('“Services” means the data-engineering and analytics services described.', 102, 203, 9, 367),
      span('1.2', 72, 222, 9, 13),
      span('“Deliverables” means all reports, dashboards and code that Provider delivers', 102, 222, 9, 424),
      span('to Client in performing the Services under this agreement.', 102, 234, 9, 300),
    ];
    const blocks = buildLayout(spans, 612, 792).blocks;
    expect(blocks.some((block) => block.text.includes('described.\n“Deliverables”'))).toBe(false);
  });

  it('leaves a key-value form read label by label', () => {
    const spans: TextSpan[] = [];
    ['Name', 'Address', 'Phone', 'Email'].forEach((label, i) => {
      spans.push(span(`${label}:`, 60, 100 + i * 20, 10, 50));
      spans.push(span(`value of ${label.toLowerCase()}`, 200, 100 + i * 20, 10, 120));
    });
    const before = lineOrder(spans);
    expect(before).toHaveLength(8);
    expect(new Set(before).size).toBe(8);
  });

  it('keeps vertical CJK writing out of the column pass', () => {
    const spans: TextSpan[] = ['縦', '書', 'き', '本', '文'].map((ch, i) => ({
      text: ch,
      x: 500,
      y: 100 + i * 12,
      width: 12,
      height: 12,
      fontSize: 12,
    }));
    spans.push(...column('left', 54, 100, 10, 243), ...column('mid', 315, 100, 10, 150));
    const blocks = buildLayout(spans, 612, 792).blocks;
    expect(blocks.some((block) => block.writingMode === 'vertical')).toBe(true);
    const order = blocks.flatMap((block) => block.text.split('\n'));
    expect(order.indexOf('left line 10 of the column text')).toBeLessThan(
      order.indexOf('mid line 1 of the column text'),
    );
  });
});
