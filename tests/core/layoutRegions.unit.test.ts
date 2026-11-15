import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../src/core/layout/index.js';
import { detectLayoutRegions } from '../../src/core/layout/regions.js';
import type { LayoutBlock, TextSpan } from '../../src/types/index.js';

function span(text: string, x: number, y: number, fontSize: number, width = text.length * fontSize * 0.5): TextSpan {
  return { text, x, y, width, height: fontSize, fontSize };
}

function texts(blocks: readonly LayoutBlock[]): string[] {
  return blocks.map((block) => block.text);
}

function indexOfText(blocks: readonly LayoutBlock[], needle: string): number {
  return blocks.findIndex((block) => block.text.includes(needle));
}

/** A rule is a zero-height vector box, as pdf.js reports a stroked line. */
function rule(x: number, y: number, width: number) {
  return { x, y, width, height: 0 };
}

describe('buildLayout — framed boxes (#263)', () => {
  // The manual-quick-start shape: a framed warning whose heading and body
  // sit indented inside the frame, with multilingual lines and a footer
  // below it at the page's left edge.
  const spans: TextSpan[] = [
    span('Before first use, boil a full kettle and pour the water away and repeat once more.', 100, 640, 9, 418),
    span('WARNING — Risk of scalding', 102, 688, 10, 154),
    span('Never open the lid while the water is boiling or lift the kettle off the base.', 102, 707, 9, 319),
    span('Do not fill above MAX: boiling water may be ejected from the spout.', 102, 719, 9, 300),
    span('EN Unplug the base before cleaning and never immerse it in water.', 46, 755, 9, 275),
    span('FR Débranchez le socle avant le nettoyage et ne le plongez jamais.', 46, 773, 9, 300),
    span('Brightwell Home Appliances Ltd. · support.example', 40, 817, 7, 228),
    span('QSG-KT17 Rev. B 09/2026', 461, 817, 7, 93),
  ];
  const frame = { vectorBoxes: [{ x: 40, y: 682, width: 515, height: 62 }] };

  it('reads the framed body right after its heading', () => {
    const layout = buildLayout(spans, 595, 842, frame);
    const heading = indexOfText(layout.blocks, 'WARNING');
    expect(layout.blocks[heading + 1].text).toContain('Never open the lid');
    expect(indexOfText(layout.blocks, 'Do not fill')).toBeLessThan(indexOfText(layout.blocks, 'EN Unplug'));
    expect(indexOfText(layout.blocks, 'Do not fill')).toBeLessThan(indexOfText(layout.blocks, 'Brightwell'));
  });

  it('ignores a page-sized background and a highlight that cuts through prose', () => {
    const background = { vectorBoxes: [{ x: 0, y: 0, width: 595, height: 842 }] };
    expect(texts(buildLayout(spans, 595, 842, background).blocks)).toEqual(texts(buildLayout(spans, 595, 842).blocks));
    const highlight = { vectorBoxes: [{ x: 90, y: 700, width: 200, height: 30 }] };
    expect(texts(buildLayout(spans, 595, 842, highlight).blocks)).toEqual(texts(buildLayout(spans, 595, 842).blocks));
  });
});

describe('buildLayout — rule bands and bottom notes (#257)', () => {
  // math-superscripts: a booktabs table whose first column cluster shares
  // its left edge with the footnote at the foot of the page.
  const spans: TextSpan[] = [
    span('3.2 Training cost', 90, 86, 12, 88),
    span('The big model was trained for about seven times the compute of the base model.', 90, 110, 10, 368),
    span('Model', 90, 176, 9, 27),
    span('Train steps', 275, 176, 9, 50),
    span('FLOPs', 365, 176, 9, 30),
    span('base', 90, 193, 9, 20),
    span('1.0e5', 275, 193, 9, 30),
    span('3.3e18', 365, 193, 9, 30),
    span('big', 90, 205, 9, 15),
    span('3.0e5', 275, 205, 9, 30),
    span('2.3e19', 365, 205, 9, 30),
    span('1 Measured on eight P100 GPUs.', 90, 694, 8, 118),
  ];
  const rules = { vectorBoxes: [rule(90, 174, 390), rule(90, 191, 390), rule(90, 224, 390), rule(90, 689, 120)] };

  it('reads a ruled table row by row and keeps the footnote last', () => {
    const blocks = buildLayout(spans, 612, 792, rules).blocks;
    const order = texts(blocks).flatMap((text) => text.split('\n'));
    expect(order.at(-1)).toBe('1 Measured on eight P100 GPUs.');
    expect(order.slice(order.indexOf('Model'), order.indexOf('Model') + 9)).toEqual([
      'Model',
      'Train steps',
      'FLOPs',
      'base',
      '1.0e5',
      '3.3e18',
      'big',
      '3.0e5',
      '2.3e19',
    ]);
  });

  it('does not join rules of different widths into a band', () => {
    const offset = { vectorBoxes: [rule(90, 174, 390), rule(60, 224, 200)] };
    expect(detectLayoutRegions(buildLayout(spans, 612, 792).blocks, offset, 612, 792)).toEqual([]);
  });
});

describe('buildLayout — chart labels (#256)', () => {
  // paper-two-column's bar chart in the right column: legend above the
  // plot, values over the bars, categories under them, body text below.
  const spans: TextSpan[] = [
    span('Our experiments follow prior late-interaction work on long documents.', 315, 220, 9, 243),
    span('Full attention', 362, 267, 7, 42),
    span('ATP (ours)', 429, 267, 7, 35),
    span('182', 363, 309, 7, 10),
    span('88', 387, 356, 7, 7),
    span('156', 434, 322, 7, 10),
    span('79', 458, 360, 7, 7),
    span('LongDocQA', 359, 413, 7, 41),
    span('MultiNews-R', 429, 413, 7, 43),
    span('Figure 1: Median query latency per benchmark for both systems.', 315, 433, 9, 215),
    span('Static truncation is the usual answer to document length here.', 315, 470, 9, 243),
  ];
  const chart = {
    vectorBoxes: [
      { x: 351, y: 271, width: 8, height: 8 },
      { x: 418, y: 271, width: 8, height: 8 },
      { x: 345, y: 286, width: 213, height: 126 },
      { x: 358, y: 320, width: 20, height: 91 },
      { x: 380, y: 367, width: 20, height: 44 },
      { x: 429, y: 333, width: 20, height: 78 },
      { x: 451, y: 372, width: 20, height: 39 },
    ],
  };

  it('keeps the labels together, bar by bar, before the caption', () => {
    const order = texts(buildLayout(spans, 612, 792, chart).blocks);
    const first = order.indexOf('Full attention');
    expect(order.slice(first, first + 8)).toEqual([
      'Full attention',
      '182',
      '88',
      'LongDocQA',
      'ATP (ours)',
      '156',
      '79',
      'MultiNews-R',
    ]);
    expect(order.indexOf('MultiNews-R')).toBeLessThan(
      indexOfText(buildLayout(spans, 612, 792, chart).blocks, 'Figure 1'),
    );
  });

  it('marks the figure as a chart with vertical marks', () => {
    const layout = buildLayout(spans, 612, 792);
    const figure = detectLayoutRegions(layout.blocks, chart, 612, 792).find(
      (region) => region.kind === 'figure' && region.marks > 0,
    );
    expect(figure?.verticalMarks).toBe(true);
    expect(figure?.blocks.map((block) => block.text)).toContain('LongDocQA');
    expect(figure?.blocks.map((block) => block.text)).not.toContain(expect.stringContaining('Figure 1'));
  });
});

describe('buildLayout — regions on other page shapes', () => {
  it('leaves single-column prose with a decorative rule untouched', () => {
    const spans = [
      span('A plain paragraph of body text that runs across the page width.', 72, 100, 11, 468),
      span('It continues on the next line with more words to read in order.', 72, 114, 11, 468),
      span('A second paragraph starts after a gap and keeps going as well.', 72, 150, 11, 468),
    ];
    const graphics = { vectorBoxes: [rule(72, 130, 468)] };
    expect(texts(buildLayout(spans, 612, 792, graphics).blocks)).toEqual(texts(buildLayout(spans, 612, 792).blocks));
  });

  it('reads a slide card as one unit beside a bullet list', () => {
    const spans = [
      span('Quarterly review', 56, 36, 28, 300),
      span('• Revenue grew for a third quarter', 64, 126, 18, 380),
      span('• Churn held at four percent of revenue', 64, 166, 18, 380),
      span('Key risk', 600, 130, 16, 80),
      span('Supplier delays may push the launch', 600, 160, 14, 280),
      span('into the next quarter.', 600, 178, 14, 160),
      span('• Renewals closed ahead of plan', 64, 206, 18, 380),
    ];
    const card = { vectorBoxes: [{ x: 590, y: 120, width: 300, height: 90 }] };
    const order = texts(buildLayout(spans, 960, 540, card).blocks);
    const risk = order.findIndex((text) => text.startsWith('Key risk'));
    expect(order[risk + 1] ?? order[risk]).toMatch(/Supplier delays/);
    expect(order.findIndex((text) => text.includes('Renewals'))).toBeLessThan(risk);
  });

  it('keeps CJK body text and vertical writing out of regions', () => {
    const spans = [
      span('地域図書館の振興に関する法律施行規則', 80, 100, 12, 220),
      span('この省令において次の各号に掲げる用語', 80, 116, 12, 220),
      { text: '縦', x: 500, y: 100, width: 12, height: 12, fontSize: 12 },
      { text: '書', x: 500, y: 112, width: 12, height: 12, fontSize: 12 },
      { text: 'き', x: 500, y: 124, width: 12, height: 12, fontSize: 12 },
    ];
    const box = { vectorBoxes: [{ x: 70, y: 90, width: 460, height: 60 }] };
    const layout = buildLayout(spans, 595, 842, box);
    expect(layout.blocks.map((block) => block.text).join('|')).toContain('地域図書館');
    const regions = detectLayoutRegions(layout.blocks, box, 595, 842);
    expect(regions.every((region) => region.blocks.every((block) => block.writingMode !== 'vertical'))).toBe(true);
  });
});
