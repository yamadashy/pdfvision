import { describe, expect, it } from 'vitest';
import { extractCodeBlocks } from '../../src/core/layout/codeBlocks.js';
import { buildLayout } from '../../src/core/layout/index.js';
import { fencedCode } from '../../src/output/markdown/codeBlocks.js';
import type { TextSpan } from '../../src/types/index.js';

const MONO = new Set(['font3']);
const SIZE = 8.6;
const ADVANCE = SIZE * 0.6;
const ORIGIN = 106;
const PITCH = 11.6;

function mono(text: string, column: number, row: number, x0 = ORIGIN): TextSpan {
  return {
    text,
    x: x0 + column * ADVANCE,
    y: 300 + row * PITCH,
    width: text.length * ADVANCE,
    height: SIZE,
    fontSize: SIZE,
    fontName: 'font3',
  };
}

function prose(text: string, x: number, y: number, width = text.length * 5): TextSpan {
  return { text, x, y, width, height: 10, fontSize: 10, fontName: 'font1' };
}

/** `code` lines with leading spaces, as a highlighter places them: one span per token. */
function codeSpans(lines: string[], gutter = false): TextSpan[] {
  const spans: TextSpan[] = [];
  lines.forEach((line, row) => {
    if (gutter) {
      const number = String(row + 1);
      spans.push({ ...mono(number, 0, row, 92 - number.length * ADVANCE) });
    }
    for (const match of line.matchAll(/\S+/gu)) spans.push(mono(match[0], match.index ?? 0, row));
  });
  return spans;
}

const PROSE = [
  prose('A pipeline is declared in tidepool.yaml at the root of your project.', 72, 200, 400),
  prose('Each entry under stages runs one container image, in order.', 72, 214, 380),
];

const YAML = ['pipeline:', '  stages:', '    - name: extract', '      retries: 3', '  notify:', '    on_failure: x'];

describe('code blocks (#269)', () => {
  it('keeps indentation from the character grid and drops a line-number gutter', () => {
    const { blocks } = extractCodeBlocks([...PROSE, ...codeSpans(YAML, true)], MONO);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].role).toBe('code');
    expect(blocks[0].text).toBe(YAML.join('\n'));
    expect(blocks[0].codeLineNumbers).toEqual({ first: 1, last: 6 });
  });

  it('keeps blank lines inside a block', () => {
    const lines = ['def run(rows):', '    seen = set()', '', '    return seen'];
    const spans = codeSpans(lines, true);
    const withoutBlankRow = spans.filter((span) => span.text !== '3');
    expect(extractCodeBlocks([...PROSE, ...spans], MONO).blocks[0].text).toBe(lines.join('\n'));
    // A blank row whose gutter number is missing is still a row at the block's pitch.
    expect(extractCodeBlocks([...PROSE, ...withoutBlankRow], MONO).blocks[0].text).toBe(lines.join('\n'));
  });

  it('reads code blocks in the page flow and fences them in Markdown', () => {
    const layout = buildLayout([...PROSE, ...codeSpans(YAML, true)], 612, 792, undefined, MONO);
    const code = layout.blocks.find((block) => block.role === 'code');
    expect(code?.text).toBe(YAML.join('\n'));
    expect(layout.blocks.indexOf(code as never)).toBe(layout.blocks.length - 1);
    expect(fencedCode(code as never)).toBe(
      `_Lines 1–6 (line numbers left out of the code):_\n\`\`\`\n${YAML.join('\n')}\n\`\`\``,
    );
  });

  it('uses a fence longer than any backtick run in the code', () => {
    const fenced = fencedCode({ text: 'echo ```x```', x: 0, y: 0, width: 1, height: 1, lines: [], role: 'code' });
    expect(fenced).toBe('````\necho ```x```\n````');
  });

  it('leaves inline code in a sentence alone', () => {
    const spans = [0, 1, 2, 3].flatMap((row) => [
      prose('A custom stage is a subclass of', 72, 300 + row * 14, 140),
      { ...mono('Stage', 0, 0, 216), y: 300 + row * 14 },
      prose('registered under a name.', 250, 300 + row * 14, 120),
    ]);
    expect(extractCodeBlocks(spans, MONO).blocks).toEqual([]);
  });

  it('leaves a page set entirely in a monospaced face alone', () => {
    expect(extractCodeBlocks(codeSpans(YAML), MONO).blocks).toEqual([]);
  });

  it('does not take a table whose first columns are monospaced for code', () => {
    const rows = ['name', 'image', 'retries', 'timeout'].flatMap((option, row) => [
      mono(option, 0, row),
      mono('string', 12, row),
      { ...prose('Unique stage name; used in logs.', 300, 0, 160), y: 300 + row * PITCH - 0.7 },
    ]);
    expect(extractCodeBlocks([...PROSE, ...rows], MONO).blocks).toEqual([]);
  });

  it('needs a fixed-pitch font and a character grid', () => {
    const proportionalFont = codeSpans(YAML).map((span) => ({ ...span, fontName: 'font1' }));
    expect(extractCodeBlocks([...PROSE, ...proportionalFont], MONO).blocks).toEqual([]);
    // Spans claimed fixed-pitch but with widths at no common advance.
    const offGrid = codeSpans(YAML).map((span, index) => ({ ...span, width: span.width * (1 + (index % 3) * 0.2) }));
    expect(extractCodeBlocks([...PROSE, ...offGrid], MONO).blocks).toEqual([]);
  });

  it('needs at least three rows of code', () => {
    expect(extractCodeBlocks([...PROSE, ...codeSpans(YAML.slice(0, 2))], MONO).blocks).toEqual([]);
  });
});
