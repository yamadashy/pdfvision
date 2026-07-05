import { describe, expect, it } from 'vitest';
import { detectPageWarnings } from '../../../src/core/warnings/index.js';
import type { LayoutLine } from '../../../src/types/index.js';
import { block, line, page } from './helpers.js';

describe('detectPageWarnings', () => {
  it('flags dense aligned numeric tables that native text can flatten', () => {
    // Apple 10-K gross-margin-page-shaped case: the text is native and
    // readable, but multiple right-aligned numeric columns are visually
    // a table whose row/column relationships matter.
    const out = detectPageWarnings(
      page([
        block(40, 80, 200, 120, {
          text: 'labels',
          lines: [
            line('Gross margin', 40, 80, 120),
            line('Products', 70, 100, 60),
            line('Services', 70, 112, 60),
            line('Total gross margin', 70, 124, 120),
            line('Products', 70, 148, 60),
            line('Services', 70, 160, 60),
            line('Total gross margin percentage', 70, 172, 160),
          ],
        }),
        block(300, 80, 50, 120, {
          text: '2023\n108,803\n60,345\n169,148\n36.5 %\n70.8 %\n44.1 %',
          lines: [
            line('2023', 318, 80, 20),
            line('108,803', 300, 100, 38),
            line('60,345', 307, 112, 31),
            line('169,148', 300, 124, 38),
            line('36.5 %', 306, 148, 32),
            line('70.8 %', 306, 160, 32),
            line('44.1 %', 306, 172, 32),
          ],
        }),
        block(390, 80, 50, 120, {
          text: '2022\n114,728\n56,054\n170,782\n36.3 %\n71.7 %\n43.3 %',
          lines: [
            line('2022', 408, 80, 20),
            line('114,728', 390, 100, 38),
            line('56,054', 397, 112, 31),
            line('170,782', 390, 124, 38),
            line('36.3 %', 396, 148, 32),
            line('71.7 %', 396, 160, 32),
            line('43.3 %', 396, 172, 32),
          ],
        }),
      ]),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'tabular_numeric_layout', severity: 'warning' });
    expect(out[0].message).toContain('aligned columns');
  });

  it('does not flag a single aligned numeric list as a table', () => {
    const out = detectPageWarnings(
      page([
        block(300, 80, 50, 180, {
          text: 'numeric list',
          lines: Array.from({ length: 12 }, (_, i) => line(`${2020 + i}`, 300, 80 + i * 12, 24)),
        }),
      ]),
    );
    expect(out.filter((w) => w.code === 'tabular_numeric_layout')).toEqual([]);
  });

  it('flags standalone dotted leader lines that were separated from table-of-contents labels', () => {
    const dotLines = Array.from({ length: 9 }, (_, i) => line('. . . . . . . . . . . .', 120, 120 + i * 12, 220));
    const out = detectPageWarnings(
      page([
        block(50, 100, 500, 160, {
          text: 'Table of Contents',
          lines: [line('Item 1. Business Description K-1', 50, 100, 180), ...dotLines],
        }),
      ]),
    );

    expect(out).toEqual([
      expect.objectContaining({
        code: 'dot_leader_noise',
        severity: 'warning',
      }),
    ]);
    expect(out[0].message).toContain('standalone dotted leader/noise lines');
  });

  it('does not flag ordinary ellipsis prose as dotted leader noise', () => {
    const out = detectPageWarnings(
      page([
        block(50, 100, 500, 80, {
          text: 'prose',
          lines: [
            line('The discussion pauses ... then continues.', 50, 100, 180),
            line('Another sentence with ... an ellipsis.', 50, 112, 170),
          ],
        }),
      ]),
    );

    expect(out.filter((w) => w.code === 'dot_leader_noise')).toEqual([]);
  });

  it('does not flag chart-axis labels without shared numeric rows', () => {
    const out = detectPageWarnings(
      page([
        block(80, 100, 24, 220, {
          text: 'y axis',
          lines: Array.from({ length: 8 }, (_, i) => line(`${70 - i * 10}.0%`, 80, 100 + i * 30, 24)),
        }),
        block(250, 115, 30, 220, {
          text: 'data labels',
          lines: [line('64.7%', 250, 115, 30), line('56.8%', 250, 245, 30), line('31.2%', 250, 325, 30)],
        }),
        block(120, 360, 250, 8, {
          text: 'x axis',
          lines: Array.from({ length: 6 }, (_, i) => line(`${70 + i * 5}.0%`, 120 + i * 45, 360, 30)),
        }),
      ]),
    );
    expect(out.filter((w) => w.code === 'tabular_numeric_layout')).toEqual([]);
  });

  it('does not flag chart data labels whose shared numeric rows have irregular cadence', () => {
    const ys = [328, 348, 371, 376, 504, 521, 526, 532, 540, 549, 560, 573];
    const out = detectPageWarnings(
      page([
        block(90, 320, 260, 260, {
          text: 'chart labels',
          lines: ys.flatMap((y, index) => [
            line(`${80 - index}.0`, 100, y, 20),
            line(`${70 - index}.0`, 180, y + (index % 3 === 0 ? 0 : 1.2), 20),
            line(`${30 + index}.0`, 260, y, 20),
          ]),
        }),
      ]),
    );
    expect(out.filter((w) => w.code === 'tabular_numeric_layout')).toEqual([]);
  });

  it('does not flag sparse map legend tick rows as flattened tables', () => {
    const legendLines: LayoutLine[] = [
      ...Array.from({ length: 8 }, (_, index) => ({
        text: String(index),
        x: 96.54 + index * 13.8,
        y: 221.35,
        width: 3.2,
        height: 6.66,
        fontSize: 6.66,
      })),
      { text: '-1.5 -1.0 -0.5', x: 90.64, y: 333.72, width: 44.79, height: 6.66, fontSize: 6.66 },
      { text: '0', x: 145.03, y: 333.72, width: 3.2, height: 6.66, fontSize: 6.66 },
      { text: '0.5', x: 157.93, y: 333.72, width: 7.8, height: 6.66, fontSize: 6.66 },
      { text: '1.0', x: 175.43, y: 333.72, width: 7.8, height: 6.66, fontSize: 6.66 },
      { text: '1.5', x: 192.93, y: 333.72, width: 7.8, height: 6.66, fontSize: 6.66 },
      { text: '-40 -30 -20 -10', x: 92.21, y: 446.48, width: 45.07, height: 6.66, fontSize: 6.66 },
      { text: '0', x: 145.52, y: 446.48, width: 3.16, height: 6.66, fontSize: 6.66 },
      { text: '10', x: 154.69, y: 446.48, width: 6.17, height: 6.66, fontSize: 6.66 },
      { text: '20', x: 166.87, y: 446.48, width: 6.35, height: 6.66, fontSize: 6.66 },
      { text: '30 40', x: 179.23, y: 446.48, width: 19.03, height: 6.66, fontSize: 6.66 },
    ];

    const out = detectPageWarnings(
      page([
        block(90, 221, 120, 232, {
          text: legendLines.map((item) => item.text).join('\n'),
          lines: legendLines,
        }),
      ]),
    );

    expect(out.filter((w) => w.code === 'tabular_numeric_layout')).toEqual([]);
  });

  it('does not flag dense tiny numeric vector diagrams as flattened tables', () => {
    const vectorLines = Array.from({ length: 8 }, (_, rowIndex) =>
      Array.from({ length: 8 }, (_, columnIndex): LayoutLine => {
        const text = rowIndex % 3 === 0 ? '-0.4' : `0.${(rowIndex + columnIndex) % 8}`;
        return {
          text,
          x: 120 + columnIndex * 34,
          y: 180 + rowIndex * 6.5,
          width: text.startsWith('-') ? 8.5 : 6.9,
          height: 5.04,
          fontSize: 5.04,
        };
      }),
    ).flat();

    const out = detectPageWarnings(
      page([
        block(100, 160, 340, 90, {
          text: vectorLines.map((item) => item.text).join('\n'),
          lines: vectorLines,
        }),
      ]),
    );

    expect(out.filter((w) => w.code === 'tabular_numeric_layout')).toEqual([]);
  });

  it('does not flag dense tiny multi-value chart labels as flattened tables', () => {
    const chartLines = Array.from({ length: 6 }, (_, rowIndex) =>
      Array.from({ length: 8 }, (_, columnIndex): LayoutLine => {
        const first = `${12 + rowIndex},${String(columnIndex).padStart(3, '0')}`;
        const second = `${13 + rowIndex},${String(columnIndex).padStart(3, '0')}`;
        const text =
          columnIndex % 3 === 0 ? `${first} ${second}` : `${(rowIndex + 1) * (columnIndex + 2)}.${columnIndex}`;
        return {
          text,
          x: 80 + columnIndex * 42,
          y: 340 + rowIndex * 13,
          width: text.length * 2.4,
          height: 3.2,
          fontSize: 3.2,
        };
      }),
    ).flat();

    const out = detectPageWarnings(
      page([
        block(80, 340, 340, 80, {
          text: chartLines.map((item) => item.text).join('\n'),
          lines: chartLines,
        }),
      ]),
    );

    expect(out.filter((w) => w.code === 'tabular_numeric_layout')).toEqual([]);
  });

  it('does not flag mirrored chart axis labels as flattened tables', () => {
    const axisTicks = ['8', '6', '4', '2', '0', '2', '4', '6', '8'];
    const ageLabels = ['85~89', '80~84', '75~79', '70~74', '65~69', '60~64', '55~59', '50~54'];
    const chartLines: LayoutLine[] = [
      ...ageLabels.flatMap((label, index) => [
        line(label, 110, 120 + index * 12, 24),
        line(label, 330, 120 + index * 12, 24),
      ]),
      ...axisTicks.map((tick, index) => line(tick, 95 + index * 25, 230, 8)),
      ...axisTicks.map((tick, index) => line(tick, 320 + index * 25, 230, 8)),
    ];

    const out = detectPageWarnings(
      page([
        block(90, 110, 460, 140, {
          text: chartLines.map((item) => item.text).join('\n'),
          lines: chartLines,
        }),
      ]),
    );

    expect(out.filter((w) => w.code === 'tabular_numeric_layout')).toEqual([]);
  });

  it('flags irregular financial tables when numeric columns recur across rows', () => {
    const ys = [100, 126, 151, 177, 228, 241, 255, 270];
    const out = detectPageWarnings(
      page([
        block(50, 90, 500, 200, {
          text: 'financial table',
          lines: ys.flatMap((y, index) => [
            line(index === 2 ? 'methods' : `Financial row ${index + 1}`, 50, y, 140),
            line(`(${index + 1}.0)`, 260, y + 1.2, 20),
            line(`(${index + 2}.0)`, 315, y + 1.2, 20),
            line(`(${index + 3}.0)`, 370, y + 1.2, 20),
            line(index % 3 === 0 ? '-' : `(${index + 4}.0)`, 425, y + 1.2, 20),
            line(`(${index + 5}.0)`, 480, y + 1.2, 20),
          ]),
        }),
      ]),
    );
    expect(out.some((w) => w.code === 'tabular_numeric_layout')).toBe(true);
  });

  it('does not flag ordinary prose with occasional numeric-only lines', () => {
    const out = detectPageWarnings(
      page([
        block(40, 80, 500, 300, {
          text: 'body',
          lines: [
            line('The study covers the 2023 reporting period.', 40, 80, 220),
            line('It compares earlier reports from 2022 and 2021.', 40, 94, 260),
            line('2023', 40, 120, 20),
            line('2022', 40, 134, 20),
            line('2021', 40, 148, 20),
            line('The rest of the page is prose, not a numeric table.', 40, 176, 280),
            line('A figure caption mentions 95 % agreement inline.', 40, 190, 250),
          ],
        }),
      ]),
    );
    expect(out.filter((w) => w.code === 'tabular_numeric_layout')).toEqual([]);
  });
});
