import { describe, expect, it } from 'vitest';
import { detectPageWarnings } from '../../../src/core/warnings/index.js';
import type { LayoutLine, VectorBox } from '../../../src/types/index.js';
import { block, line, page } from './helpers.js';

const ROW_PITCH = 18;

/** Task rows under a timescale header: a label at the left margin, an end date, and a bar in the timeline area. */
function scheduleRows(spans: Array<[start: number, width: number]>, barHeight = 10, header = true) {
  const lines: LayoutLine[] = header ? [line('9/7 9/14 9/21 9/28 10/5 10/12 10/19 10/26', 200, 80, 320)] : [];
  const bars: VectorBox[] = [];
  spans.forEach(([start, width], index) => {
    const y = 100 + index * ROW_PITCH;
    lines.push(line(`Task ${index + 1}`, 40, y, 60), line('10/30/26', 150, y, 30));
    bars.push({ x: start, y: y + 4 - barHeight / 2, width, height: barHeight });
  });
  return { lines, bars };
}

function warningsFor(lines: LayoutLine[], colouredFills: VectorBox[]) {
  const result = page([block(40, 90, 500, 400, { lines })], 612, 792);
  return detectPageWarnings(result, { colouredFills });
}

const codes = (warnings: { code: string }[]) => warnings.map((warning) => warning.code);

describe('text_row_vector_bars', () => {
  it('flags schedule bars whose start and length vary row by row and names the rows to render', () => {
    const { lines, bars } = scheduleRows([
      [200, 40],
      [230, 60],
      [260, 120],
      [300, 80],
      [380, 30],
    ]);
    const warning = warningsFor(lines, bars).find((item) => item.code === 'text_row_vector_bars');
    expect(warning?.message).toContain('5 filled bars sit in text rows (beside "10/30/26", "10/30/26")');
    // Region spans the label columns, the bars, and the timescale header above them.
    expect(warning?.message).toContain('render that region (--render-region 36,76,488,109)');
  });

  it('flags a bar chart whose bars share a start and differ in length', () => {
    const { lines, bars } = scheduleRows([
      [200, 150],
      [200, 120],
      [200, 90],
      [200, 60],
      [200, 30],
    ]);
    expect(codes(warningsFor(lines, bars))).toContain('text_row_vector_bars');
  });

  it('stays quiet for row shading of one width, fills holding text, and fewer than four rows', () => {
    const striped = scheduleRows([
      [200, 300],
      [200, 300],
      [200, 300],
      [200, 300],
    ]);
    expect(codes(warningsFor(striped.lines, striped.bars))).not.toContain('text_row_vector_bars');

    const labelled = scheduleRows([
      [200, 40],
      [230, 60],
      [260, 120],
      [300, 80],
    ]);
    const valuesInside = labelled.bars.map((bar, index) => line(`${index}`, bar.x + 2, bar.y + 1, bar.width - 4, 8));
    expect(codes(warningsFor([...labelled.lines, ...valuesInside], labelled.bars))).not.toContain(
      'text_row_vector_bars',
    );

    const three = scheduleRows([
      [200, 40],
      [230, 60],
      [260, 120],
    ]);
    expect(codes(warningsFor(three.lines, three.bars))).not.toContain('text_row_vector_bars');
  });

  it('stays quiet for bars of mixed heights, bars spread far apart, and bars past all text', () => {
    const mixed = scheduleRows([
      [200, 40],
      [230, 60],
      [260, 120],
      [300, 80],
    ]);
    mixed.bars.forEach((bar, index) => {
      bar.height = 4 + index * 4;
    });
    expect(codes(warningsFor(mixed.lines, mixed.bars))).not.toContain('text_row_vector_bars');

    // Arrow shafts of a flowchart: one per label, a page apart.
    const spread = [100, 260, 420, 580].map((y, index) => ({
      label: line(`Step ${index}`, 40, y, 60),
      bar: { x: 120 + index * 30, y: y + 2, width: 40 + index * 20, height: 4 },
    }));
    expect(
      codes(
        warningsFor(
          spread.map((item) => item.label),
          spread.map((item) => item.bar),
        ),
      ),
    ).not.toContain('text_row_vector_bars');

    // Decorative stripes in the right margin, beside body lines that end at x=400.
    const decoration = scheduleRows(
      [
        [560, 20],
        [570, 30],
        [580, 25],
        [565, 40],
      ],
      10,
      false,
    );
    expect(codes(warningsFor(decoration.lines, decoration.bars))).not.toContain('text_row_vector_bars');
  });

  it('defers to dense_vector_graphics on pages that already carry it', () => {
    const { lines, bars } = scheduleRows([
      [200, 40],
      [230, 60],
      [260, 120],
      [300, 80],
    ]);
    const out = detectPageWarnings(
      { ...page([block(40, 90, 500, 400, { lines })]), vectorCount: 400, charCount: 10 },
      { colouredFills: bars },
    );
    expect(codes(out)).toContain('dense_vector_graphics');
    expect(codes(out)).not.toContain('text_row_vector_bars');
  });
});
