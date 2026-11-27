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

  it('pairs nothing when another series in the plot is drawn as separate dashes', () => {
    const red = [
      [100, 150],
      [200, 140],
      [300, 120],
    ] as const;
    const blue = [
      [100, 180],
      [200, 170],
      [300, 160],
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
    red.forEach(([x, y], i) => {
      spans.push(span(['41.2', '46.8', '49.5'][i], x - 7, y - 12, 7, 14));
    });
    blue.forEach(([x, y], i) => {
      spans.push(span(['35.0', '37.1', '39.7'][i], x - 7, y + 4, 7, 14));
    });
    ['2021', '2022', '2023'].forEach((year, i) => {
      spans.push(span(year, 100 + i * 100 - 8, 200, 7.5, 16));
    });
    expect(layoutOf(spans, shapes).charts?.some((c) => c.kind === 'line')).toBe(true);
    // A coloured frame round the plot is not a series.
    const framed = [...shapes, rectOutline(80, 40, 260, 180, '#2e7d32')];
    expect(layoutOf(spans, framed).charts?.some((c) => c.kind === 'line')).toBe(true);
    // A third, unnamed series between them, each dash its own stroke.
    const dashes = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
      stroked(
        [
          [100 + i * 25, 165 - i * 2],
          [110 + i * 25, 164 - i * 2],
        ],
        '#f4b183',
        1.6,
      ),
    );
    expect(layoutOf(spans, [...shapes, ...dashes]).charts?.some((c) => c.kind === 'line')).toBeFalsy();
    // The same series with its dashes filled as one path of small quads.
    const filledDashes = shape(
      [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [
        [100 + i * 25, 164 - i * 2],
        [110 + i * 25, 164 - i * 2],
        [110 + i * 25, 166 - i * 2],
        [100 + i * 25, 166 - i * 2],
      ]),
      { fill: '#f4b183' },
    );
    expect(layoutOf(spans, [...shapes, filledDashes]).charts?.some((c) => c.kind === 'line')).toBeFalsy();
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

describe('charts set side by side in panels (#302)', () => {
  /** A framed panel holding a 100% stacked bar chart: legend on top, one row per category. */
  const stackedPanel = (
    x: number,
    key: ReadonlyArray<readonly [string, string]>,
    rows: ReadonlyArray<readonly [string, readonly number[]]>,
    joined?: number,
  ) => {
    const spans: TextSpan[] = [];
    const shapes: VectorShape[] = [rectOutline(x, 80, 250, 200, '#b5bdc8')];
    key.forEach(([name, colour], i) => {
      shapes.push(filledRect(x + 60 + i * 60, 96, 8, 8, colour));
      spans.push(span(name, x + 72, 96, 8, 30));
      spans[spans.length - 1].x = x + 72 + i * 60;
    });
    rows.forEach(([label, shares], r) => {
      const top = 130 + r * 34;
      spans.push(span(label, x + 10, top + 5, 8, 40));
      let cursor = x + 60;
      const texts: TextSpan[] = [];
      shares.forEach((share, i) => {
        const width = share * 1.8;
        shapes.push(filledRect(cursor, top, width, 18, key[i][1]));
        texts.push(span(`${share}%`, cursor + width / 2 - 6, top + 5, 8, 12));
        cursor += width;
      });
      // Two neighbouring labels drawn as one text item.
      if (r === joined) {
        const [a, b, ...rest] = texts;
        spans.push({ ...a, text: `${a.text} ${b.text}`, width: b.x + b.width - a.x }, ...rest);
      } else {
        spans.push(...texts);
      }
    });
    return { spans, shapes };
  };

  const left = () =>
    stackedPanel(
      40,
      [
        ['Done', '#283593'],
        ['Planned', '#00838f'],
        ['None', '#9e9e9e'],
      ],
      [
        ['Large', [62, 28, 10]],
        ['Medium', [41, 33, 26]],
        ['Small', [22, 30, 48]],
        ['Micro', [9, 21, 70]],
      ],
    );

  it('reads the labels of charts in neighbouring panels apart, never as one table row', () => {
    const a = left();
    const b = stackedPanel(
      320,
      [
        ['Yes', '#6a1b9a'],
        ['Maybe', '#ef6c00'],
        ['No', '#5d4037'],
      ],
      [
        ['North', [50, 30, 20]],
        ['South', [45, 35, 20]],
        ['East', [40, 25, 35]],
        ['West', [35, 40, 25]],
      ],
    );
    const layout = layoutOf([...a.spans, ...b.spans], [...a.shapes, ...b.shapes]);
    for (const table of layout.tables ?? []) {
      expect(table.x + table.width <= 290 || table.x >= 320).toBe(true);
    }
    expect(layout.charts?.flatMap((c) => c.values.filter((v) => v.category === 'East').map((v) => v.value))).toEqual([
      '40%',
      '25%',
      '35%',
    ]);
  });

  it('keeps a real table in the panel beside a chart, read on its own', () => {
    const a = left();
    const spans = [...a.spans];
    const shapes = [...a.shapes, rectOutline(320, 80, 250, 200, '#b5bdc8')];
    const head = ['Region', '2023', '2024'];
    head.forEach((text, c) => {
      spans.push(span(text, 340 + c * 80, 96, 8, text.length * 4.4));
    });
    [
      ['North', '12.5', '13.1'],
      ['South', '9.8', '10.4'],
      ['East', '7.2', '7.9'],
      ['West', '11.0', '11.6'],
    ].forEach((row, r) => {
      row.forEach((text, c) => {
        spans.push(span(text, 340 + c * 80, 135 + r * 34, 8, text.length * 4.4));
      });
    });
    const layout = layoutOf(spans, shapes);
    const tables = layout.tables ?? [];
    expect(tables.every((table) => table.x + table.width <= 290 || table.x >= 320)).toBe(true);
    const real = tables.find((table) => table.x >= 320);
    expect(real?.rows.map((row) => row.cells.map((cell) => cell.text).join(' | '))).toEqual([
      'Region | 2023 | 2024',
      'North | 12.5 | 13.1',
      'South | 9.8 | 10.4',
      'East | 7.2 | 7.9',
      'West | 11.0 | 11.6',
    ]);
  });

  it('reads a table drawn as a grid of cell boxes beside a chart panel whole', () => {
    const a = left();
    const spans = [...a.spans];
    const shapes = [...a.shapes];
    const grid = [
      ['Metric', 'Q3', 'Y/Y'],
      ['Revenue', '35,082', '+94%'],
      ['Margin', '74.6%', '+0.6'],
      ['Income', '21,869', '+110%'],
      ['EPS', '0.78', '+111%'],
    ];
    grid.forEach((row, r) => {
      row.forEach((text, c) => {
        shapes.push(rectOutline(320 + c * 80, 88 + r * 34, 80, 34, '#555555'));
        spans.push(span(text, 326 + c * 80, 101 + r * 34, 8, text.length * 4.4));
      });
    });
    const layout = layoutOf(spans, shapes);
    const tables = layout.tables ?? [];
    expect(tables.every((table) => table.x + table.width <= 290 || table.x >= 320)).toBe(true);
    const real = tables.find((table) => table.x >= 320);
    expect(real?.rows.map((row) => row.cells.map((cell) => cell.text).join(' | '))).toEqual(
      grid.map((row) => row.join(' | ')),
    );
  });

  it('does not take a frame drawn tight round a legend for a chart panel', () => {
    // A plot's boxed legend on the left, a table on the right sharing its baselines.
    const spans: TextSpan[] = [];
    const shapes: VectorShape[] = [];
    [
      ['plain-20', '#283593'],
      ['ResNet-20', '#c62828'],
    ].forEach(([name, colour], i) => {
      shapes.push(filledRect(60, 104 + i * 14, 8, 8, colour));
      spans.push(span(name, 72, 104 + i * 14, 8, 36));
    });
    const legendBox = rectOutline(54, 98, 60, 32);
    ['metric', 'mAP@.5', 'mAP@[.5,.95]'].forEach((text, c) => {
      spans.push(span(text, 300 + c * 80, 104, 8));
    });
    [
      ['VGG-16', '41.5', '21.2'],
      ['ResNet-101', '48.4', '27.2'],
      ['ResNet-152', '49.1', '27.9'],
    ].forEach((row, r) => {
      row.forEach((text, c) => {
        spans.push(span(text, 300 + c * 80, 118 + r * 14, 8));
      });
    });
    ['0', '20', '40'].forEach((text, i) => {
      spans.push(span(text, 60 + i * 20, 160, 7, 6));
    });
    const withBox = layoutOf(spans, [...shapes, legendBox]);
    const withoutBox = layoutOf(spans, shapes);
    const cells = withoutBox.tables?.flatMap((t) => t.rows.flatMap((r) => r.cells.map((c) => c.text)));
    expect(cells).toEqual(expect.arrayContaining(['ResNet-20', 'VGG-16']));
    expect(withBox.tables).toEqual(withoutBox.tables);
  });

  it('pairs a label only with the bars of its own panel', () => {
    const spans: TextSpan[] = [];
    // Upper panel: horizontal bars, labels inside; its last row ends just above the lower panel.
    const shapes: VectorShape[] = [rectOutline(40, 60, 300, 124, '#b5bdc8'), rectOutline(40, 186, 300, 140, '#b5bdc8')];
    shapes.push(filledRect(60, 66, 8, 8, '#283593'), filledRect(140, 66, 8, 8, '#00838f'));
    spans.push(span('Done', 72, 66, 8, 20), span('Planned', 152, 66, 8, 30));
    ['North', 'South', 'East'].forEach((name, r) => {
      const top = 110 + r * 26;
      spans.push(span(name, 72, top + 6, 8, 24));
      shapes.push(filledRect(100, top, 90, 18, '#283593'), filledRect(190, top, 60, 18, '#00838f'));
      spans.push(span(`${40 + r}%`, 138, top + 8, 9, 14), span(`${20 + r}%`, 213, top + 8, 9, 14));
    });
    // Lower panel: column bars in its own legend colours, the first standing right under the upper `42%`.
    [0, 1, 2].forEach((i) => {
      const x = 130 + i * 50;
      shapes.push(filledRect(x, 188 + i * 10, 20, 102 - i * 10, '#6a1b9a'));
      spans.push(span(`${7 + i}`, x + 7, 240, 9, 6), span(`Q${i + 1}`, x + 4, 294, 8, 10));
    });
    shapes.push(filledRect(60, 310, 8, 8, '#6a1b9a'), filledRect(140, 310, 8, 8, '#ef6c00'));
    spans.push(span('Yes', 72, 310, 8, 14), span('No', 152, 310, 8, 10));
    const layout = layoutOf(spans, shapes);
    const placed = (layout.charts ?? []).flatMap((c) => c.values.filter((v) => v.value === '42%'));
    expect(placed.map((v) => `${v.series} ${v.category}`)).toEqual(['Done East']);
  });

  it('counts value labels that came as one text item as unpaired', () => {
    const a = stackedPanel(
      40,
      [
        ['Done', '#283593'],
        ['Planned', '#00838f'],
        ['None', '#9e9e9e'],
      ],
      [
        ['Large', [62, 28, 10]],
        ['Medium', [41, 33, 26]],
        ['Small', [22, 30, 48]],
        ['Micro', [19, 21, 60]],
      ],
      3,
    );
    const layout = layoutOf(a.spans, a.shapes);
    const bar = layout.charts?.find((c) => c.kind === 'bar');
    expect(bar?.unpaired).toBe(2);
    expect(bar?.values.filter((v) => v.category === 'Micro').map((v) => `${v.series} ${v.value}`)).toEqual([
      'None 60%',
    ]);
    expect(markdownOf(layout)).toContain('_2 more value labels on this chart could not be paired');
    // A space before each percent sign still makes two labels.
    const spaced = a.spans.map((s) => (s.text === '19% 21%' ? { ...s, text: '19 % 21 %' } : s));
    expect(layoutOf(spaced, a.shapes).charts?.find((c) => c.kind === 'bar')?.unpaired).toBe(2);
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
