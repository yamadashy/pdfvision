import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../src/core/layout/index.js';
import { assembleDisplayMath } from '../../src/core/layout/math/index.js';
import { detectDisplayMathLayout } from '../../src/core/warnings/displayMath.js';
import type { PageResult, PageWarning, TextSpan, VectorBox } from '../../src/types/index.js';

/** A span whose box runs from its baseline up by its size, as pdf.js places horizontal text. */
function span(text: string, x: number, baseline: number, size = 11, width = text.length * size * 0.5): TextSpan {
  return { text, x, y: baseline - size, width, height: size, fontSize: size };
}

const bar = (x: number, y: number, width: number): VectorBox => ({ x, y, width, height: 0.5 });

function lineTexts(spans: TextSpan[], boxes: VectorBox[] = []): string[] {
  return buildLayout(spans, 612, 792, { vectorBoxes: boxes, imageBoxes: [] }).blocks.flatMap((block) =>
    block.lines.map((line) => line.text),
  );
}

// d_L = (c (1 + z))/H_0 , with the bar on the math axis a quarter em above the baseline of `=`.
const AXIS_BASELINE = 140;
const fractionPage = () => ({
  spans: [
    span('Text before the equation runs the full measure of the column here.', 90, 100),
    span('d =', 236, AXIS_BASELINE, 11, 16),
    span('c (1 + z)', 256, AXIS_BASELINE - 8, 11, 36),
    span('H_0', 266, AXIS_BASELINE + 12, 11, 14),
    span(',', 296, AXIS_BASELINE, 11, 3),
    span('(1)', 509, AXIS_BASELINE, 11, 13),
    span('Text after the equation runs the full measure of the column too.', 90, 180),
  ],
  boxes: [bar(254, AXIS_BASELINE - 3, 40)],
});

describe('display math — fractions', () => {
  it('reads a fraction as one term on its line, with the equation number joined', () => {
    const { spans, boxes } = fractionPage();
    expect(lineTexts(spans, boxes)).toContain('d = (c (1 + z))/H_0, (1)');
  });

  it('reads a nested fraction as one term of the outer one', () => {
    // x = (a/b + 1)/c: the inner bar sits on the outer numerator's axis.
    const spans = [
      span('x =', 200, 140, 11, 16),
      span('a', 223, 117, 11, 5),
      span('b', 223, 135, 11, 5),
      span('+ 1', 232, 128, 11, 14),
      span('c', 231.5, 152, 11, 5),
    ];
    expect(lineTexts(spans, [bar(222, 125, 8), bar(220, 137, 28)])).toEqual(['x = (a/b + 1)/c']);
  });

  it('leaves a rule under a centred heading alone: nothing sits beside it on its axis', () => {
    const spans = [span('Results', 280, 100, 11, 40), span('Summary of the runs', 270, 118, 11, 60)];
    expect(lineTexts(spans, [bar(278, 103, 44)])).toEqual(['Results', 'Summary of the runs']);
  });

  it('leaves table rules drawn cell by cell alone', () => {
    const spans = [span('Label', 60, 140, 8, 30), span('dV/dT', 120, 135, 8, 24), span('PSRR', 122, 146, 8, 20)];
    const boxes = [bar(110, 138, 40), bar(150, 138, 40), { x: 110, y: 130, width: 0.5, height: 20 }];
    const result = assembleDisplayMath(spans, boxes, 612);
    expect(result.spans.map((s) => s.text)).toEqual(['Label', 'dV/dT', 'PSRR']);
  });

  it('leaves stacked index entries over a rule alone when nothing says math', () => {
    const spans = [span('Additions to tax', 40, 140, 8, 60), span('111', 106, 136, 8, 12), span('12', 107, 147, 8, 9)];
    const result = assembleDisplayMath(spans, [bar(104, 137.5, 16)], 612);
    expect(result.spans.map((s) => s.text)).toEqual(['Additions to tax', '111', '12']);
  });

  it('leaves a line of text over a rule alone: the run carries on past the rule', () => {
    const spans = [
      span('x = 1', 60, 140, 11, 24),
      span('signature of the applicant', 100, 132, 11, 120),
      span('date', 150, 152, 11, 20),
    ];
    const result = assembleDisplayMath(spans, [bar(140, 137, 40)], 612);
    expect(result.spans.map((s) => s.text)).toEqual(['x = 1', 'signature of the applicant', 'date']);
  });

  it('reports a fraction with an unplaced piece inside it instead of guessing', () => {
    const spans = [
      span('y =', 200, 140, 11, 16),
      span('a', 228, 132, 11, 5),
      span('∞', 233, 129, 7, 5),
      span('b', 228, 152, 11, 5),
    ];
    const result = assembleDisplayMath(spans, [bar(222, 137, 17)], 612);
    expect(result.unresolved).toHaveLength(1);
    expect(result.spans.map((s) => s.text)).not.toContain('a/b');
    const warnings: PageWarning[] = [];
    detectDisplayMathLayout({ width: 612, height: 792 } as PageResult, spans, [bar(222, 137, 17)], warnings);
    expect(warnings[0]?.code).toBe('display_math_layout');
    expect(warnings[0]?.message).toContain('--render-region');
  });
});

describe('display math — big operators', () => {
  it('puts a sum with limits above and below on its line', () => {
    const spans = [
      span('L =', 200, 140, 11, 16),
      span('∑', 222, 144, 17.6, 14),
      span('N', 226, 120, 7.7, 5),
      span('k', 222, 153, 7.7, 4),
      span('=1', 226, 153, 7.7, 8),
      span('x_k', 240, 140, 11, 12),
    ];
    expect(lineTexts(spans)).toEqual(['L = ∑_{k=1}^N x_k']);
  });

  it('puts back an integral drawn hanging above its line, with its subscript', () => {
    // A math font's integral sign hangs from its origin, so pdf.js boxes it a line too high.
    const spans = [
      span('F =', 266, 164, 12, 18),
      span('∫', 296, 154.5, 12, 6),
      span('M', 301, 168, 8, 8),
      span('(R + 1) dV', 312, 164, 12, 60),
    ];
    expect(lineTexts(spans)).toEqual(['F = ∫_M (R + 1) dV']);
  });

  it('leaves an operator on its own baseline without limits as it is', () => {
    const spans = [span('the sum', 90, 140, 11, 36), span('∑', 130, 140, 11, 8), span('of terms', 141, 140, 11, 40)];
    expect(assembleDisplayMath(spans, [], 612).spans).toEqual(spans);
  });
});

describe('display math — matrices', () => {
  const bracket = (x: number): VectorBox => ({ x, y: 300, width: 3, height: 32 });

  it('reads a matrix between vector brackets row by row', () => {
    const spans = [
      span('Σ =', 230, 320, 11, 18),
      span('0.042', 260, 312, 11, 24),
      span('−0.013', 300, 312, 11, 30),
      span('−0.013', 254, 328, 11, 30),
      span('0.027', 306, 328, 11, 24),
    ];
    expect(lineTexts(spans, [bracket(251), bracket(334)])).toEqual(['Σ = [[0.042, −0.013], [−0.013, 0.027]]']);
  });

  it('reports a matrix whose rows do not split into the same cells', () => {
    const spans = [
      span('Σ =', 230, 320, 11, 18),
      span('0.042', 260, 312, 11, 24),
      span('−0.013', 300, 312, 11, 30),
      span('0.027', 280, 328, 11, 24),
    ];
    const result = assembleDisplayMath(spans, [bracket(251), bracket(334)], 612);
    expect(result.unresolved).toHaveLength(1);
    expect(result.spans).toHaveLength(4);
  });

  it('leaves text between two table rules alone: nothing beside them', () => {
    const spans = [span('Name', 260, 312, 11, 24), span('Alice', 260, 328, 11, 24)];
    const result = assembleDisplayMath(spans, [bracket(251), bracket(334)], 612);
    expect(result.spans.map((s) => s.text)).toEqual(['Name', 'Alice']);
    expect(result.unresolved).toEqual([]);
  });
});

describe('display math — equation numbers', () => {
  it('joins a number to an aligned line of math without a fraction', () => {
    const spans = [
      span('E(z)^2 = Ω_m (1 + z)^3', 206, 400, 11, 120),
      span('(4)', 509, 400, 11, 13),
      span('A body line of prose that runs the whole measure of the column.', 90, 440),
    ];
    expect(lineTexts(spans)).toContain('E(z)^2 = Ω_m (1 + z)^3 (4)');
  });

  it('leaves a number closing an ordinary line where it is', () => {
    const spans = [span('see the note', 90, 400, 11, 60), span('(4)', 509, 400, 11, 13)];
    expect(assembleDisplayMath(spans, [], 612).spans).toEqual(spans);
  });
});
