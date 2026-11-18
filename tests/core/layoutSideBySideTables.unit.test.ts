import { describe, expect, it } from 'vitest';
import type { BBox } from '../../src/core/layout/geometry.js';
import { buildLayout } from '../../src/core/layout/index.js';
import { isTableValueCell } from '../../src/core/layout/tableCells.js';
import type { LayoutTable, TextSpan } from '../../src/types/index.js';

const DIGIT_W = 4.45;

function span(text: string, x: number, y: number, width = text.length * DIGIT_W, fontSize = 8): TextSpan {
  return { text, x, y, width, height: fontSize, fontSize };
}

function grid(table: LayoutTable | undefined): string[][] | undefined {
  return table?.rows.map((row) => row.cells.map((cell) => `${cell.column}:${cell.text}`));
}

const STOPS = ['Harbour Station', 'Customs House', 'Mill Street', 'Quarry Road', 'Linden Park', 'Ashgrove Shops'];

/** A timetable grid at `left`: stop names with dot leaders, then one 29pt column per trip (times centred). */
function timetable(left: number, departures: number[]): TextSpan[] {
  const timesX = left + 130;
  return STOPS.flatMap((stop, row) => {
    const y = 180 + row * 17;
    const name = span(stop, left + 4, y, stop.length * 4);
    // The leader fills the space from the name to the first time.
    const leaderX = left + 4 + stop.length * 4 + 2;
    const leader = span('.'.repeat(Math.floor((timesX - 4 - leaderX) / 2.2)), leaderX, y, timesX - 4 - leaderX);
    const times = departures.map((depart, column) => {
      const minutes = depart + row * 4;
      const text = `${((Math.floor(minutes / 60) + 11) % 12) + 1}:${String(minutes % 60).padStart(2, '0')}`;
      const width = text.length * DIGIT_W - 2.2;
      return span(text, timesX + column * 29 + 14.5 - width / 2, y, width);
    });
    return [name, leader, ...times];
  });
}

const WEEKDAY = [365, 395, 425, 440, 462, 725, 925];
const WEEKEND = [495, 592, 615, 735, 855];

describe('clock times and dot leaders in layout tables', () => {
  it('reads a clock time as a table value', () => {
    expect(isTableValueCell('6:05')).toBe(true);
    expect(isTableValueCell('12:30 pm')).toBe(true);
    expect(isTableValueCell('7:05§')).toBe(true);
    expect(isTableValueCell('6:05 6:35')).toBe(false);
    expect(isTableValueCell('Ratio 3:1')).toBe(false);
  });

  it('gives every trip its own column even where times sit closer than a word gutter (#276)', () => {
    const [table] = buildLayout(timetable(28, WEEKDAY), 792, 612).tables ?? [];
    expect(table?.columnCount).toBe(1 + WEEKDAY.length);
    expect(grid(table)?.[0]?.[0]).toMatch(/^0:Harbour Station \.+$/);
    expect(grid(table)?.[0]?.slice(1)).toEqual([
      '1:6:05',
      '2:6:35',
      '3:7:05',
      '4:7:20',
      '5:7:42',
      '6:12:05',
      '7:3:25',
    ]);
  });

  it('keeps the dot leader with its label in the page text', () => {
    const lines = buildLayout(timetable(28, WEEKDAY), 792, 612).blocks.flatMap((block) => block.lines);
    expect(lines.some((line) => /^Harbour Station \.+ 6:05$/.test(line.text))).toBe(true);
  });
});

describe('side-by-side layout tables (#276)', () => {
  it('splits two grids whose row bands are drawn apart', () => {
    const spans = [...timetable(28, WEEKDAY), ...timetable(412, WEEKEND)];
    const band = (x: number, width: number, y: number): BBox => ({ x, y, width, height: 17 });
    const boxes = STOPS.flatMap((_, row) =>
      row % 2 === 1
        ? [band(28, 130 + WEEKDAY.length * 29, 176 + row * 17), band(412, 130 + WEEKEND.length * 29, 176 + row * 17)]
        : [],
    );
    const tables = buildLayout(spans, 792, 612, { vectorBoxes: boxes }).tables ?? [];
    expect(tables).toHaveLength(2);
    expect(tables[0]?.columnCount).toBe(1 + WEEKDAY.length);
    expect(tables[1]?.columnCount).toBe(1 + WEEKEND.length);
    expect(grid(tables[1])?.[0]?.[1]).toBe('1:8:15');
  });

  it('splits two grids at a second label column with its own values, nothing drawn', () => {
    const spans = [...timetable(28, WEEKDAY), ...timetable(412, WEEKEND)];
    const tables = buildLayout(spans, 792, 612).tables ?? [];
    expect(tables.map((table) => table.columnCount)).toEqual([1 + WEEKDAY.length, 1 + WEEKEND.length]);
  });

  it('keeps one grid whose rules run across the gap', () => {
    const spans = [...timetable(28, WEEKDAY), ...timetable(412, WEEKEND)];
    const rules: BBox[] = STOPS.map((_, row) => ({ x: 28, y: 177 + row * 17, width: 730, height: 0.5 }));
    const tables = buildLayout(spans, 792, 612, { vectorBoxes: rules }).tables ?? [];
    expect(tables).toHaveLength(1);
  });

  it('does not split off a trailing text column after the values', () => {
    const rows = [
      ['Alpha', '120', '135', 'Up on new orders'],
      ['Beta', '98', '91', 'Down on pricing'],
      ['Gamma', '45', '52', 'Up on volume'],
      ['Delta', '77', '80', 'Flat'],
      ['Epsilon', '63', '70', 'Up on mix'],
    ];
    const spans = rows.flatMap(([label, a, b, note], index) => {
      const y = 120 + index * 15;
      return [
        span(label, 60, y),
        span(a, 240 - a.length * DIGIT_W, y),
        span(b, 300 - b.length * DIGIT_W, y),
        span(note, 360, y),
      ];
    });
    const tables = buildLayout(spans, 612, 792).tables ?? [];
    expect(tables).toHaveLength(1);
    expect(tables[0]?.columnCount).toBe(4);
  });
});
