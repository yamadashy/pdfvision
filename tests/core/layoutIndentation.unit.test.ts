import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../src/core/layout/index.js';
import type { TextSpan } from '../../src/types/index.js';

function span(text: string, x: number, y: number, fontSize = 9, width = text.length * fontSize * 0.5): TextSpan {
  return { text, x, y, width, height: fontSize, fontSize };
}

/** One line per entry, `[indent in pt, text]`, at a 11.2 pt leading. */
function stacked(entries: [number, string][], x = 36, top = 70, fontSize = 9): TextSpan[] {
  return entries.map(([indent, text], index) => span(text, x + indent, top + index * 11.2, fontSize));
}

function bodyText(spans: TextSpan[]): string {
  return buildLayout(spans, 396, 612)
    .blocks.map((block) => block.text)
    .join('\n\n');
}

describe('indentation depth', () => {
  it('keeps the levels of an index, a turnover line deeper than any subentry', () => {
    const spans = stacked([
      [0, 'carbon border adjustment, 214–219, 215,'],
      [30, '233t'],
      [10, 'and export rebates, 217'],
      [0, 'carbon pricing, 12, 40–58'],
      [10, 'distributional effects of, 51–54'],
      [20, 'on low-income households, 52, 53t'],
      [20, 'regional, 54'],
      [10, 'hybrid schemes, 47'],
      [0, 'coal phase-out, 88–93'],
      [10, 'compensation for workers, 91'],
    ]);
    expect(bodyText(spans)).toBe(
      [
        'carbon border adjustment, 214–219, 215,',
        '      233t',
        '  and export rebates, 217',
        'carbon pricing, 12, 40–58',
        '  distributional effects of, 51–54',
        '    on low-income households, 52, 53t',
        '    regional, 54',
        '  hybrid schemes, 47',
        'coal phase-out, 88–93',
        '  compensation for workers, 91',
      ].join('\n'),
    );
    const lines = buildLayout(spans, 396, 612).blocks.flatMap((block) => block.lines);
    expect(lines.find((line) => line.text.includes('regional'))?.indent).toBe(2);
    expect(lines.find((line) => line.text.startsWith('coal'))?.indent).toBeUndefined();
  });

  it('keeps one level of subentries when they follow each other', () => {
    const spans = stacked([
      [0, 'emissions trading (continued)'],
      [10, 'free allocation, 63–65, 202'],
      [10, 'offsets in, 72–73'],
      [0, 'energy efficiency, 113–128'],
      [10, 'appliance standards, 117–119'],
      [10, 'rebound effect, 121'],
      [0, 'externalities, 9, 10–14'],
    ]);
    expect(bodyText(spans)).toContain('energy efficiency, 113–128\n  appliance standards, 117–119');
  });

  it('nests bullets set one per block', () => {
    const spans = [
      span('‣ Pick the agent by the size of the task', 59, 135, 21),
      span('‣ Small tasks', 81, 178, 21),
      span('‣ Challenging tasks', 81, 222, 21),
      span('‣ Large tasks', 81, 265, 21),
    ];
    expect(bodyText(spans)).toBe(
      '‣ Pick the agent by the size of the task\n\n  ‣ Small tasks\n\n  ‣ Challenging tasks\n\n  ‣ Large tasks',
    );
  });

  it('nests bullets inside one block, wrapped lines with their item', () => {
    const spans = stacked([
      [0, '• Training data'],
      [18, '– crawled pages filtered by a'],
      [26, 'quality classifier'],
      [18, '– licensed books'],
      [0, '• Evaluation'],
    ]);
    expect(bodyText(spans)).toBe(
      '• Training data\n  – crawled pages filtered by a\n  quality classifier\n  – licensed books\n• Evaluation',
    );
  });

  it('leaves paragraphs with first-line indents alone', () => {
    const line = 'justified prose that fills the whole measure of the column';
    const spans = stacked([
      [12, line],
      [0, line],
      [0, line],
      [12, line],
      [0, line],
      [0, 'short last line.'],
      [12, line],
      [0, line],
    ]);
    expect(bodyText(spans)).not.toMatch(/^ /mu);
  });

  it('leaves a quotation set inside a paragraph alone', () => {
    const spans = stacked([
      [0, 'the author then quotes the report at some length, saying'],
      [24, 'that the harbor had been surveyed twice and found'],
      [24, 'wanting on both occasions by the inspectors'],
      [36, 'who were sent from the capital'],
      [0, 'before turning to the question of the moorings themselves.'],
    ]);
    expect(bodyText(spans)).not.toMatch(/^ /mu);
  });

  it('leaves a flat list with hanging indents alone', () => {
    const spans = stacked([
      [0, 'Our contributions are as follows:'],
      [10, '• a pruning rule that needs only a probe vector and a'],
      [18, 'threshold per document;'],
      [10, '• an analysis of which tokens are pruned, showing that'],
      [18, 'function words and boilerplate dominate;'],
    ]);
    expect(bodyText(spans)).not.toMatch(/^ /mu);
  });

  it('leaves numbered paragraphs that run in with prose alone', () => {
    const spans = stacked([
      [0, 'I. Background'],
      [8, '1. Maximum length. Many commenters'],
      [0, 'objected that a separate limit for each'],
      [8, '2. Inspection interval. The insurer and'],
      [0, 'harbor committees urged annual inspection.'],
    ]);
    expect(bodyText(spans)).not.toMatch(/^ /mu);
  });

  it('does not open a list at an inner level', () => {
    const spans = [
      span('(1) Corvane Analytics Ltd., 40 Wharf Road (“Provider”);', 60, 100, 10),
      span('(2) Blue Fern Retail, Inc., 1180 Mercer Street (“Client”);', 60, 112, 10),
      span('1. Definitions', 40, 140, 10),
      span('2. Services', 40, 170, 10),
    ];
    expect(bodyText(spans)).not.toMatch(/^ /mu);
  });

  it('leaves footnotes with first-line indents alone, however short', () => {
    const spans = stacked([
      [8, '^77 https://www.nhtsa.gov/book/'],
      [0, 'countermeasures/strategies-'],
      [0, 'reduce-impaired-driving.'],
      [8, '^78 Id.'],
      [8, '^79 49 U.S.C. 30111(a).'],
      [8, '^80 49 U.S.C. 30102(a)(9).'],
      [0, 'see also the earlier notice.'],
    ]);
    expect(bodyText(spans)).not.toMatch(/^ /mu);
  });

  it('leaves a column of centred marks under a heading alone', () => {
    const spans = stacked([
      [0, 'IMPLEMENTED BY'],
      [26, 'O'],
      [26, 'O'],
      [24, 'O/S'],
      [28, 'S'],
      [26, 'O'],
    ]);
    expect(bodyText(spans)).not.toMatch(/^ /mu);
  });

  it('leaves right-aligned figures and centred lines alone', () => {
    const figures = ['412,580', '88,140', '(810)', '3,120', '860', '0.01'].map((text, index) =>
      span(text, 300 - text.length * 4.5, 100 + index * 11.2),
    );
    expect(bodyText(figures)).not.toMatch(/^ /mu);
    const centred = ['A Title Page', 'set in centred lines', 'of differing width', 'by the author', 'and a date'].map(
      (text, index) => span(text, 198 - text.length * 2.25, 300 + index * 11.2),
    );
    expect(bodyText(centred)).not.toMatch(/^ /mu);
  });
});
