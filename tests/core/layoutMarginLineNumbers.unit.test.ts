import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../src/core/layout/index.js';
import type { TextSpan } from '../../src/types/index.js';

function span(text: string, x: number, y: number, fontSize = 12): TextSpan {
  return { text, x, y, width: text.length * fontSize * 0.5, height: fontSize, fontSize };
}

const PITCH = 24;
const TOP = 72;
const lineY = (n: number) => TOP + (n - 1) * PITCH;

/** Pleading paper: 1–28 right-aligned at x 60, text set on some of the numbered lines. */
function pleading(textLines: Record<number, string>, between: Record<number, string> = {}): TextSpan[] {
  const numbers = Array.from({ length: 28 }, (_, index) => {
    const text = String(index + 1);
    return span(text, 60 - text.length * 6, lineY(index + 1));
  });
  const text = Object.entries(textLines).map(([n, line]) => span(line, 90, lineY(Number(n)) + 2));
  const half = Object.entries(between).map(([n, line]) => span(line, 90, lineY(Number(n)) + PITCH / 2));
  return [...numbers, ...text, ...half];
}

describe('margin line numbers', () => {
  it('leaves the number column out of the text and sets each number on its line', () => {
    const layout = buildLayout(
      pleading(
        {
          15: 'TO DEFENDANT AND ITS ATTORNEYS OF RECORD:',
          16: 'PLEASE TAKE NOTICE that on January 14, 2027, at 9:00 a.m., or as soon',
          17: 'thereafter as the matter may be heard, in Department 12 of the above',
          25: 'sanctions of $4,850 against Defendant and its counsel, jointly and severally.',
        },
        { 1: 'lokafor@okaforvance.example' },
      ),
      612,
      792,
    );
    expect(layout.lineNumbers).toEqual({ first: 1, last: 28 });
    const lines = layout.blocks.flatMap((block) => block.lines);
    expect(lines.every((line) => !/^\d+$/u.test(line.text))).toBe(true);
    const numberOf = (start: string) => lines.find((line) => line.text.startsWith(start))?.lineNumber;
    expect(numberOf('TO DEFENDANT')).toBe(15);
    expect(numberOf('PLEASE TAKE')).toBe(16);
    expect(numberOf('thereafter')).toBe(17);
    expect(numberOf('sanctions')).toBe(25);
    // Single-spaced text between two numbered lines gets no number.
    expect(numberOf('lokafor')).toBeUndefined();
  });

  it('ignores a ranked list whose numbers do not reach down the page', () => {
    const ranks = Array.from({ length: 12 }, (_, index) => [
      span(String(index + 1), 72, 100 + index * 14, 10),
      span(`Entrant number ${index + 1} with a score`, 100, 100 + index * 14, 10),
    ]).flat();
    const layout = buildLayout(ranks, 612, 792);
    expect(layout.lineNumbers).toBeUndefined();
    const texts = layout.blocks.flatMap((block) => block.lines).map((line) => line.text);
    expect(texts.filter((text) => /^\d+\b/u.test(text))).toHaveLength(12);
  });

  it('ignores a column of consecutive numbers with text on both sides of it', () => {
    const spans = Array.from({ length: 28 }, (_, index) => [
      span(`Item ${index}`, 40, lineY(index + 1), 10),
      span(String(index + 1), 200, lineY(index + 1), 10),
      span('a description of the item', 240, lineY(index + 1), 10),
    ]).flat();
    expect(buildLayout(spans, 612, 792).lineNumbers).toBeUndefined();
  });

  it("ignores a table's year column beside figures, with its era label in the same strip", () => {
    // 財政金融統計月報-shaped: 平成元 over 2 … 30, values to the right.
    const spans = [
      span('平成元', 38, lineY(1) - 13, 8),
      ...Array.from({ length: 29 }, (_, index) => [
        span(String(index + 2), 62 - String(index + 2).length * 4, lineY(1) + index * 12.8, 8),
        span(`${600 + index * 7}, ${142 + index}`, 97, lineY(1) + index * 12.8 + 0.6, 7),
      ]).flat(),
      span('令和元', 38, lineY(1) + 29 * 12.8, 8),
    ];
    const layout = buildLayout(spans, 595, 842);
    expect(layout.lineNumbers).toBeUndefined();
  });

  it('ignores a run of numbers beside figures only', () => {
    const spans = Array.from({ length: 28 }, (_, index) => [
      span(String(index + 1), 40, lineY(index + 1), 10),
      span(`${(index + 1) * 1234}`, 120, lineY(index + 1), 10),
      span(`${(index + 1) * 17}.5`, 220, lineY(index + 1), 10),
    ]).flat();
    expect(buildLayout(spans, 612, 792).lineNumbers).toBeUndefined();
  });

  it('ignores numbers that are not consecutive', () => {
    const spans = Array.from({ length: 28 }, (_, index) => [
      span(String((index + 1) * 2), 40, lineY(index + 1), 10),
      span('text on the line beside the number', 90, lineY(index + 1), 10),
    ]).flat();
    expect(buildLayout(spans, 612, 792).lineNumbers).toBeUndefined();
  });
});
