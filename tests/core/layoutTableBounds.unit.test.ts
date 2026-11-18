import { describe, expect, it } from 'vitest';
import type { BBox } from '../../src/core/layout/geometry.js';
import { buildLayout } from '../../src/core/layout/index.js';
import { recordLineParts } from '../../src/core/layout/lineSegments.js';
import { splitJoinedHeaderCells } from '../../src/core/layout/tableHeaderCells.js';
import type { LayoutTable, TextSpan } from '../../src/types/index.js';

function span(
  text: string,
  x: number,
  y: number,
  width = text.length * 4.4,
  fontSize = 9,
  height = fontSize,
): TextSpan {
  return { text, x, y, width, height, fontSize };
}

function grid(table: LayoutTable | undefined): string[][] | undefined {
  return table?.rows.map((row) => row.cells.map((cell) => `${cell.column}:${cell.text}`));
}

const rule = (x1: number, y: number, x2: number): BBox => ({ x: x1, y: y - 0.25, width: x2 - x1, height: 0.5 });

// Left text column 54–294, right column 315–558; a booktabs table in the left column.
const RESULTS = [
  ['Full attention', '41.2', '58.7', '182'],
  ['Static pruning (k = 512)', '38.9', '55.1', '97'],
  ['ATP (ours)', '40.8', '58.3', '88'],
  ['Random pruning', '35.0', '50.2', '96'],
];

function resultsTable(): { spans: TextSpan[]; boxes: BBox[] } {
  const spans: TextSpan[] = [
    span('Method', 58, 636),
    span('nDCG@10', 153, 636, 36),
    span('R@100', 196, 636, 28),
    span('Latency (ms)', 240, 636, 52),
    ...RESULTS.flatMap(([method, ndcg, recall, latency], index) => {
      const y = 653 + index * 12;
      return [
        span(method, 58, y, method.length * 3.8),
        span(ndcg, 189 - ndcg.length * 4.4, y),
        span(recall, 224 - recall.length * 4.4, y),
        span(latency, 292 - latency.length * 4.4, y),
      ];
    }),
    // A section heading in the right column, level with the second row.
    span('4 Related Work', 315, 665, 79, 11),
  ];
  return { spans, boxes: [rule(54, 632, 294), rule(54, 648, 294), rule(54, 702, 294)] };
}

describe('tables fitted to their rules (#252)', () => {
  it('drops text beside a booktabs table and takes the header between its top rules', () => {
    const { spans, boxes } = resultsTable();
    const [table] = buildLayout(spans, 612, 792, { vectorBoxes: boxes }).tables ?? [];
    expect(grid(table)).toEqual([
      ['0:Method', '1:nDCG@10', '2:R@100', '3:Latency (ms)'],
      ['0:Full attention', '1:41.2', '2:58.7', '3:182'],
      ['0:Static pruning (k = 512)', '1:38.9', '2:55.1', '3:97'],
      ['0:ATP (ours)', '1:40.8', '2:58.3', '3:88'],
      ['0:Random pruning', '1:35.0', '2:50.2', '3:96'],
    ]);
  });

  it('keeps the table as found when nothing is drawn around it', () => {
    const { spans } = resultsTable();
    const tables = buildLayout(spans, 612, 792).tables ?? [];
    expect(tables.flatMap((table) => table.rows.flatMap((row) => row.cells.map((cell) => cell.text)))).toContain(
      '4 Related Work',
    );
  });
});

describe('header cells joined across a narrow gap (#253)', () => {
  it('splits a header line at the body columns under it', () => {
    const rows = [
      ['1.1', 'Interviews', '9/7/26', '9/18/26'],
      ['1.2', 'Audit', '9/14/26', '9/25/26'],
      ['1.3', 'Sign-off', '9/25/26', '9/25/26'],
      ['2.1', 'Wireframes', '9/21/26', '10/9/26'],
      ['2.2', 'Design system', '9/28/26', '10/23/26'],
    ];
    const spans: TextSpan[] = [
      span('ID', 30, 86),
      span('Task', 60, 86),
      // Two header runs 6pt apart: one line, over two date columns.
      span('Plan start', 200, 86, 40),
      span('Plan end', 246, 86, 34),
      ...rows.flatMap(([id, task, start, end], index) => {
        const y = 104 + index * 18;
        return [span(id, 30, y), span(task, 60, y), span(start, 200, y, 30), span(end, 246, y, 34)];
      }),
    ];
    const [table] = buildLayout(spans, 792, 612).tables ?? [];
    expect(grid(table)?.[0]).toEqual(['0:ID', '1:Task', '2:Plan start', '3:Plan end']);
  });

  it('keeps a group header whose words are separate runs over its columns', () => {
    const line = (text: string, x: number, y: number, width: number) => ({ text, x, y, width, height: 9, fontSize: 9 });
    const header = line('Three Months Ended', 200, 70, 84);
    // Word runs one space apart, the first over the 2025 column, the rest over 2024.
    recordLineParts(header, [line('Three', 200, 70, 24), line('Months Ended', 226.4, 70, 57.6)]);
    const cell = (text: string, x: number, y: number, width: number, column: number, columnSpan?: number) => ({
      ...line(text, x, y, width),
      column,
      ...(columnSpan && { columnSpan }),
    });
    const table: LayoutTable = {
      x: 40,
      y: 70,
      width: 244,
      height: 50,
      rowCount: 3,
      columnCount: 3,
      rows: [
        { y: 70, height: 9, cells: [cell('Three Months Ended', 200, 70, 84, 1, 2)] },
        {
          y: 90,
          height: 9,
          cells: [cell('Revenue', 40, 90, 30, 0), cell('100,000', 200, 90, 28, 1), cell('90,500', 256, 90, 28, 2)],
        },
        {
          y: 105,
          height: 9,
          cells: [cell('Cost', 40, 105, 20, 0), cell('60,000', 204, 105, 24, 1), cell('50,500', 256, 105, 28, 2)],
        },
      ],
    };
    expect(splitJoinedHeaderCells(table, [header]).rows[0]?.cells).toHaveLength(1);
  });
});

describe('prose read across columns (#242)', () => {
  it('drops a table of two prose columns with one boundary that is not a gutter', () => {
    const left = (i: number) => `the left column runs on in sentences ${i} with words`;
    const right = (i: number) => `while the right column also runs on ${i} with words`;
    const spans = Array.from({ length: 10 }, (_, i) => {
      const y = 100 + i * 12;
      return [
        span(left(i), 54, y, 240),
        span(right(i), 315, y, 200),
        // A figure's value labels at the right edge of the right column.
        ...(i % 3 === 0 ? [span(`${i * 10}`, 530, y, 10), span(`${i * 5}`, 545, y, 10)] : []),
      ];
    }).flat();
    expect(buildLayout(spans, 612, 792).tables ?? []).toEqual([]);
  });

  it('keeps text rotated up the margin out of every table row', () => {
    const spans: TextSpan[] = [
      // An arXiv stamp: one tall line beside the page.
      span('arXiv:2611.04217v1 [cs.IR] 12 Nov 2026', 10, 240, 18, 18, 310),
      ...['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'].flatMap((name, index) => {
        const y = 260 + index * 14;
        return [span(name, 60, y), span(`${index + 1}2.5`, 200, y, 20), span(`${index + 3}7.1`, 260, y, 20)];
      }),
    ];
    const [table] = buildLayout(spans, 612, 792).tables ?? [];
    expect(table?.rowCount).toBe(5);
    expect(table?.rows.flatMap((row) => row.cells.map((cell) => cell.text))).not.toContain(
      'arXiv:2611.04217v1 [cs.IR] 12 Nov 2026',
    );
  });
});

describe('group headings above a table row', () => {
  // A regression table: panel headings above repeated row labels.
  function panels(): TextSpan[] {
    const spans: TextSpan[] = [];
    let y = 140;
    for (const panel of ['Panel A. All counties', 'Panel B. Contiguous border-county pairs']) {
      spans.push(span(panel, 72, y, panel.length * 4));
      y += 15;
      for (const label of ['Log minimum wage', 'Log county population', 'Observations']) {
        spans.push(span(label, 72, y, label.length * 4.6));
        for (let column = 0; column < 4; column++)
          spans.push(span(`0.${column + 1}${y % 10}`, 250 + column * 60, y, 22));
        y += 12.5;
      }
      y += 10;
    }
    spans.push(span('Census-division × period FE', 72, y, 125));
    for (let column = 0; column < 4; column++) spans.push(span('12,5', 250 + column * 60, y, 22));
    return spans;
  }

  it('keeps a panel heading a row of its own instead of the first label’s first line', () => {
    const [table] = buildLayout(panels(), 612, 792).tables ?? [];
    const labels = table?.rows.map((row) => row.cells[0]?.text);
    expect(labels).toContain('Panel B. Contiguous border-county pairs');
    expect(labels?.filter((label) => label === 'Log minimum wage')).toHaveLength(2);
    expect(labels?.some((label) => label?.startsWith('Panel') && label.endsWith('Log minimum wage'))).toBe(false);
  });
});
