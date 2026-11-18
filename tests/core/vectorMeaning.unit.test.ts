import { describe, expect, it } from 'vitest';
import { findChartMarks } from '../../src/core/graphics/chartMarks.js';
import { findOutlinedText } from '../../src/core/graphics/outlinedText.js';
import type { VectorShape } from '../../src/core/graphics/vectorShapes.js';
import { buildLayout } from '../../src/core/layout/index.js';
import { formatMarkdown } from '../../src/output/markdown.js';
import type { DocumentResult, TextSpan } from '../../src/types/index.js';
import { circle, filledRect, rectOutline, sector, shape, shapeSet, stroked } from '../helpers/vectorShapes.js';

function span(text: string, x: number, y: number, size = 9, width = text.length * size * 0.55): TextSpan {
  return { text, x, y, width, height: size, fontSize: size };
}

function layoutOf(spans: TextSpan[], shapes: VectorShape[], extra: { truncated?: boolean } = {}) {
  const set = shapeSet(shapes, extra.truncated);
  return buildLayout(spans, 612, 792, {
    vectorBoxes: shapes.map(({ x, y, width, height }) => ({ x, y, width, height })),
    imageBoxes: [],
    vectorShapes: set,
    chartMarks: findChartMarks(set),
  });
}

function tick(x: number, y: number): VectorShape {
  return stroked(
    [
      [x - 1, y + 4],
      [x + 3.5, y + 9.5],
      [x + 12, y - 3],
    ],
    '#1a237e',
    1.6,
  );
}

function markdownOf(layout: ReturnType<typeof buildLayout>): string {
  const result = {
    file: 'x.pdf',
    totalPages: 1,
    metadata: { title: null, author: null, subject: null, creator: null },
    pages: [
      {
        page: 1,
        text: '',
        charCount: 0,
        imageCount: 0,
        vectorCount: 1,
        textCoverage: 0,
        nonPrintableRatio: 0,
        nonPrintableCount: 0,
        quality: { nativeTextStatus: 'empty' },
        width: 612,
        height: 792,
        layout,
      },
    ],
  } as unknown as DocumentResult;
  return formatMarkdown(result, { layout: true });
}

describe('choice marks (#303)', () => {
  const question = (y: number, text: string, chosen: 'yes' | 'no') => {
    const spans = [span(text, 58, y), span('Yes', 343, y), span('No', 391, y)];
    const shapes = [
      rectOutline(330, y + 1, 9, 9),
      rectOutline(378, y + 1, 9, 9),
      tick(chosen === 'yes' ? 330 : 378, y + 1),
    ];
    return { spans, shapes };
  };

  it('reports which drawn box holds a tick, with its label and the question on its row', () => {
    const a = question(180, 'Do you smoke?', 'no');
    const b = question(206, 'Any allergy?', 'yes');
    const layout = layoutOf([...a.spans, ...b.spans], [...a.shapes, ...b.shapes]);
    const marks = (layout.markedText ?? []).map((m) => [m.group, m.text, m.mark]);
    expect(marks).toEqual([
      ['Do you smoke?', 'Yes', 'unchecked'],
      ['Do you smoke?', 'No', 'checked'],
      ['Any allergy?', 'Yes', 'checked'],
      ['Any allergy?', 'No', 'unchecked'],
    ]);
    const md = markdownOf(layout);
    expect(md).toContain('### Choice marks');
    expect(md).toContain('| Do you smoke? | No | Yes |');
  });

  it('reads a filled dot in a ring as selected, and a rating grid by its column headings', () => {
    const heads = ['Never', 'Sometimes', 'Often'];
    const spans = heads.map((text, i) => span(text, 270 + i * 58 - 15, 470, 8, 30));
    const shapes: VectorShape[] = [];
    ['Sleep badly', 'Tired by day'].forEach((row, r) => {
      const cy = 500 + r * 24;
      spans.push(span(row, 58, cy - 4.5));
      heads.forEach((_, i) => {
        shapes.push(circle(270 + i * 58, cy, 4.2, { stroke: '#000000' }));
        if (i === r + 1) shapes.push(circle(270 + i * 58, cy, 2.8, { fill: '#1a237e' }));
      });
    });
    const layout = layoutOf(spans, shapes);
    const selected = (layout.markedText ?? []).filter((m) => m.mark === 'selected').map((m) => [m.group, m.text]);
    expect(selected).toEqual([
      ['Sleep badly', 'Sometimes'],
      ['Tired by day', 'Often'],
    ]);
  });

  it('reports nothing for a blank form, a legend swatch or a random diagonal over a box', () => {
    const blank = layoutOf(
      [span('Yes', 343, 180), span('No', 391, 180)],
      [rectOutline(330, 181, 9, 9), rectOutline(378, 181, 9, 9)],
    );
    expect(blank.markedText).toBeUndefined();
    // An outlined legend square with a fill set inside: a swatch, not an answer.
    const swatch = layoutOf(
      [span('Revenue', 343, 180)],
      [rectOutline(330, 181, 9, 9), filledRect(331, 182, 7, 7, '#c62828')],
    );
    expect(swatch.markedText).toBeUndefined();
    const slash = layoutOf(
      [span('Yes', 343, 180), span('No', 391, 180)],
      [
        rectOutline(330, 181, 9, 9),
        rectOutline(378, 181, 9, 9),
        stroked([
          [328, 192],
          [341, 179],
        ]),
      ],
    );
    expect(slash.markedText).toBeUndefined();
  });

  it('reads two crossing strokes in a box as a cross', () => {
    const layout = layoutOf(
      [span('Agree', 343, 180), span('Disagree', 391, 180)],
      [
        rectOutline(330, 181, 9, 9),
        rectOutline(378, 181, 9, 9),
        shape(
          [
            [
              [379, 182],
              [386, 189],
            ],
            [
              [386, 182],
              [379, 189],
            ],
          ],
          { stroke: '#000000', closed: false },
        ),
      ],
    );
    expect((layout.markedText ?? []).map((m) => [m.text, m.mark])).toEqual([
      ['Agree', 'unchecked'],
      ['Disagree', 'checked'],
    ]);
  });
});

describe('connections (#265)', () => {
  const box = (x: number, y: number, w: number, h: number) =>
    shape(
      [
        [
          [x, y],
          [x + w, y],
          [x + w, y + h],
          [x, y + h],
        ],
      ],
      { fill: '#ffffff', stroke: '#333333' },
    );
  const head = (x: number, y: number, dx: number, dy: number) =>
    shape(
      [
        [
          [x, y],
          [x - 7 * dx - 3 * dy, y - 7 * dy - 3 * dx],
          [x - 7 * dx + 3 * dy, y - 7 * dy + 3 * dx],
        ],
      ],
      { fill: '#333333' },
    );

  it('reports an arrow whose ends touch two boxes of text, directed by its head, with the label beside it', () => {
    const spans = [span('Receipt attached?', 200, 228), span('Email the customer', 420, 228), span('No', 330, 222, 8)];
    const shapes = [
      box(190, 220, 110, 26),
      box(410, 220, 110, 26),
      stroked([
        [300, 233],
        [410, 233],
      ]),
      head(410, 233, 1, 0),
    ];
    const layout = layoutOf(spans, shapes);
    expect(layout.connections?.map((c) => [c.from, c.to, c.label])).toEqual([
      ['Receipt attached?', 'Email the customer', 'No'],
    ]);
    expect(markdownOf(layout)).toContain('- Receipt attached? → Email the customer (No)');
  });

  it('follows an elbow drawn as separate segments back to an earlier box', () => {
    const spans = [span('Log request', 200, 128), span('Ask again', 420, 228)];
    const shapes = [
      box(190, 120, 110, 26),
      box(410, 220, 110, 26),
      stroked([
        [465, 220],
        [465, 133],
      ]),
      stroked([
        [465, 133],
        [300, 133],
      ]),
      head(300, 133, -1, 0),
    ];
    expect(layoutOf(spans, shapes).connections?.map((c) => [c.from, c.to])).toEqual([['Ask again', 'Log request']]);
  });

  it('ignores a line with no arrowhead, an arrow pointing into empty space, and a page whose shapes ran out', () => {
    const spans = [span('Step one', 200, 228), span('Step two', 420, 228)];
    const plain = [
      box(190, 220, 110, 26),
      box(410, 220, 110, 26),
      stroked([
        [300, 233],
        [410, 233],
      ]),
    ];
    expect(layoutOf(spans, plain).connections).toBeUndefined();
    const nowhere = [
      box(190, 220, 110, 26),
      stroked([
        [300, 233],
        [380, 233],
      ]),
      head(380, 233, 1, 0),
    ];
    expect(layoutOf(spans, nowhere).connections).toBeUndefined();
    const full = [...plain, head(410, 233, 1, 0)];
    expect(layoutOf(spans, full, { truncated: true }).connections).toBeUndefined();
  });

  it('does not read a table rule ending in a small serif as an arrow', () => {
    const spans = [span('Name', 200, 228), span('Value', 420, 228)];
    const shapes = [
      box(190, 220, 110, 26),
      box(410, 220, 110, 26),
      stroked([
        [300, 233],
        [410, 233],
      ]),
      // A tick mark across the rule's end, not along it.
      filledRect(408, 230, 2, 6, '#000000'),
    ];
    expect(layoutOf(spans, shapes).connections).toBeUndefined();
  });
});

describe('chart values (#302)', () => {
  const legend = (items: Array<[string, string]>, x: number, y: number) => {
    const spans: TextSpan[] = [];
    const shapes: VectorShape[] = [];
    items.forEach(([name, colour], i) => {
      shapes.push(filledRect(x, y + i * 18, 9, 9, colour));
      spans.push(span(name, x + 16, y + i * 18, 8.5));
    });
    return { spans, shapes };
  };

  it('pairs a donut slice label with the legend name of the slice colour', () => {
    const slices: Array<[string, string, number]> = [
      ['Card', '#37474f', 0.5],
      ['App', '#00897b', 0.3],
      ['Cash', '#8e24aa', 0.2],
    ];
    const shapes: VectorShape[] = [];
    const spans: TextSpan[] = [];
    let a = 0;
    for (const [, colour, share] of slices) {
      const span0 = a;
      a += share * Math.PI * 2;
      shapes.push(sector(150, 400, 70, span0, a, colour));
      const mid = (span0 + a) / 2;
      spans.push(
        span(`${Math.round(share * 100)}%`, 150 + 45 * Math.sin(mid) - 6, 400 - 45 * Math.cos(mid) - 4, 8, 12),
      );
    }
    const key = legend(
      slices.map(([name, colour]) => [name, colour]),
      270,
      360,
    );
    const layout = layoutOf([...spans, ...key.spans], [...shapes, ...key.shapes]);
    expect(layout.charts?.[0].kind).toBe('pie');
    expect(layout.charts?.[0].values.map((v) => [v.series, v.value])).toEqual([
      ['Card', '50%'],
      ['App', '30%'],
      ['Cash', '20%'],
    ]);
  });

  it('pairs line labels with their series by text colour and gives each its axis category', () => {
    const years = ['2021', '2022', '2023'];
    const red = [
      [100, 150],
      [200, 140],
      [300, 120],
    ] as const;
    const blue = [
      [100, 180],
      [200, 145],
      [300, 110],
    ] as const;
    const shapes = [
      stroked(red, '#c62828', 1.6),
      stroked(blue, '#1565c0', 1.6),
      stroked(
        [
          [100, 60],
          [118, 60],
        ],
        '#c62828',
        1.6,
      ),
      stroked(
        [
          [200, 60],
          [218, 60],
        ],
        '#1565c0',
        1.6,
      ),
    ];
    const spans = [span('Red', 122, 56, 8), span('Blue', 222, 56, 8)];
    const textColours: Array<{ x: number; y: number; width: number; height: number; colour: string }> = [];
    const label = (value: string, x: number, y: number, colour: string) => {
      const s = span(value, x - 7, y, 7, 14);
      spans.push(s);
      textColours.push({ x: s.x, y: s.y, width: s.width, height: s.height, colour });
    };
    // Blue's 2022 label sits nearer Red's point than its own; its colour settles it.
    red.forEach(([x, y], i) => {
      label(['41.2', '46.8', '49.5'][i], x, y - 12, '#c62828');
    });
    blue.forEach(([x, y], i) => {
      label(['35.0', '42.1', '51.7'][i], x, i === 1 ? y - 9 : y + 4, '#1565c0');
    });
    years.forEach((year, i) => {
      spans.push(span(year, 100 + i * 100 - 8, 200, 7.5, 16));
    });
    const set = shapeSet(shapes);
    const layout = buildLayout(spans, 612, 792, {
      vectorBoxes: shapes.map(({ x, y, width, height }) => ({ x, y, width, height })),
      vectorShapes: set,
      chartMarks: findChartMarks(set),
      textColours,
    });
    const chart = layout.charts?.find((c) => c.kind === 'line');
    expect(chart?.values.map((v) => `${v.series} ${v.category} ${v.value}`)).toEqual([
      'Red 2021 41.2',
      'Red 2022 46.8',
      'Red 2023 49.5',
      'Blue 2021 35.0',
      'Blue 2022 42.1',
      'Blue 2023 51.7',
    ]);
    const md = markdownOf(layout);
    expect(md).toContain('| Series | 2021 | 2022 | 2023 |');
    expect(md).toContain('| Blue | 35.0 | 42.1 | 51.7 |');
  });

  it('leaves a black label between two series unpaired rather than guess', () => {
    const shapes = [
      stroked(
        [
          [100, 150],
          [200, 140],
          [300, 120],
        ],
        '#c62828',
      ),
      stroked(
        [
          [100, 160],
          [200, 150],
          [300, 130],
        ],
        '#1565c0',
      ),
      stroked(
        [
          [100, 60],
          [118, 60],
        ],
        '#c62828',
      ),
      stroked(
        [
          [200, 60],
          [218, 60],
        ],
        '#1565c0',
      ),
    ];
    const spans = [span('Red', 122, 56, 8), span('Blue', 222, 56, 8)];
    for (const x of [100, 200, 300]) spans.push(span('9.9', x - 6, x === 300 ? 122 : x === 200 ? 142 : 152, 7, 12));
    const layout = layoutOf(spans, shapes);
    expect(layout.charts).toBeUndefined();
  });

  it('drops a stacked bar legend row from a layout table instead of making it the header', () => {
    const key: Array<[string, string]> = [
      ['Work', '#283593'],
      ['School', '#00838f'],
      ['Other', '#757575'],
    ];
    const spans: TextSpan[] = [];
    const shapes: VectorShape[] = [];
    let lx = 96;
    for (const [name, colour] of key) {
      shapes.push(filledRect(lx, 100, 8, 8, colour));
      spans.push(span(name, lx + 12, 100, 8, 30));
      lx += 100;
    }
    const rows = [
      ['2023', [46, 33, 21]],
      ['2024', [43, 36, 21]],
      ['2025', [39, 38, 23]],
    ] as const;
    rows.forEach(([year, shares], r) => {
      const top = 120 + r * 26;
      spans.push(span(year, 70, top + 5, 8.5, 18));
      let cursor = 96;
      shares.forEach((share, i) => {
        const width = share * 3;
        shapes.push(filledRect(cursor, top, width, 18, key[i][1]));
        spans.push(span(`${share}%`, cursor + width / 2 - 6, top + 5, 8, 12));
        cursor += width;
      });
    });
    const layout = layoutOf(spans, shapes);
    for (const table of layout.tables ?? []) {
      expect(table.rows[0].cells.map((cell) => cell.text).join(' ')).not.toContain('Work');
    }
    const bar = layout.charts?.find((c) => c.kind === 'bar');
    expect(bar?.values.filter((v) => v.category === '2024').map((v) => `${v.series} ${v.value}`)).toEqual([
      'Work 43%',
      'School 36%',
      'Other 21%',
    ]);
  });
});

describe('outlined text (#296)', () => {
  /** A glyph-sized filled outline with curves, as text converted to paths is drawn. */
  const glyph = (x: number, y: number, width = 4.2, size = 7) =>
    shape(
      [
        [
          [x, y + size],
          [x + width / 2, y],
          [x + width, y + size],
        ],
      ],
      { fill: '#000000', curves: 2 },
    );
  /** A word: letters of varied widths set close on one baseline. */
  const word = (x: number, y: number, letters: number, widths = [4.2, 2, 5.6, 3.8]) => {
    const out = [];
    let cursor = x;
    for (let i = 0; i < letters; i++) {
      const width = widths[i % widths.length];
      out.push(glyph(cursor, y, width));
      cursor += width + 0.6;
    }
    return out;
  };
  const drawing = () => [...word(100, 400, 5), ...word(100, 430, 4), ...word(180, 415, 6), ...word(180, 445, 4)];

  it('finds rows of letter-shaped outlines with no text behind them', () => {
    const regions = findOutlinedText(shapeSet(drawing()), [], { width: 612, height: 792 });
    expect(regions).toHaveLength(1);
    expect(regions[0].runs).toBe(4);
    expect(regions[0].glyphs).toBe(19);
  });

  it('ignores a logo of three rows, outlines under real text, rows of identical shapes, and dots', () => {
    expect(findOutlinedText(shapeSet([...word(100, 400, 8), ...word(100, 410, 9), ...word(100, 420, 7)]), [])).toEqual(
      [],
    );
    const covering = [
      span('ABCDE', 100, 400, 7, 25),
      span('ABCD', 100, 430, 7, 20),
      span('ABCDEF', 180, 415, 7, 30),
      span('ABCD', 180, 445, 7, 20),
    ];
    expect(findOutlinedText(shapeSet(drawing()), covering)).toEqual([]);
    // A breadboard: rows of identical rounded holes.
    const holes = [0, 1, 2, 3, 4].flatMap((row) => word(100, 400 + row * 9, 10, [4]));
    expect(findOutlinedText(shapeSet(holes), [])).toEqual([]);
    const dots = [0, 1, 2, 3].flatMap((row) =>
      Array.from({ length: 6 }, (_, i) => circle(100 + i * 9, 400 + row * 20, 3, { fill: '#000000' })),
    );
    expect(findOutlinedText(shapeSet(dots), [])).toEqual([]);
  });

  it('ignores outlines painted off the page', () => {
    expect(findOutlinedText(shapeSet(drawing()), [], { width: 90, height: 792 })).toEqual([]);
  });
});
