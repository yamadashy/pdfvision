import { describe, expect, it } from 'vitest';
import { joinBaselineRuns } from '../../src/core/text/baselineRuns.js';
import { textRunGeometryFromTransform } from '../../src/core/text/geometry.js';
import type { RawTextItem } from '../../src/core/text/textItems.js';

const SIZE = 10;
const ADVANCE = 0.55 * SIZE;

function rotated(str: string, x: number, y: number, angleDeg: number, width = ADVANCE * [...str].length, font = 'f1') {
  const r = (angleDeg * Math.PI) / 180;
  const c = Math.cos(r) * SIZE;
  const s = Math.sin(r) * SIZE;
  return { str, width, height: SIZE, transform: [c, s, -s, c, x, y], fontName: font, hasEOL: false };
}

/** One glyph per item along a straight line at `angleDeg`, `gap` points apart. */
function straightGlyphs(text: string, x: number, y: number, angleDeg: number, gap = 0.5) {
  const r = (angleDeg * Math.PI) / 180;
  let along = 0;
  return [...text].map((ch) => {
    const item = rotated(ch, x + Math.cos(r) * along, y + Math.sin(r) * along, angleDeg, ch === ' ' ? 2.8 : ADVANCE);
    along += (ch === ' ' ? 2.8 : ADVANCE) + gap;
    return item;
  });
}

/** One glyph per item along a circular arc (centre cx, cy; radius r), each turned to the tangent. */
function arcGlyphs(text: string, cx: number, cy: number, radius: number, startDeg: number, gap = 1) {
  let theta = (startDeg * Math.PI) / 180;
  return [...text].map((ch) => {
    const x = cx + radius * Math.cos(theta);
    const y = cy + radius * Math.sin(theta);
    // Clockwise along the top of the circle: the tangent points 90° clockwise from the radius.
    const tangent = (theta * 180) / Math.PI - 90;
    const width = ch === ' ' ? 2.8 : ADVANCE;
    const item = rotated(ch, x, y, tangent, width);
    theta -= (width + gap) / radius;
    return item;
  });
}

const texts = (items: unknown[]) => (items as RawTextItem[]).map((entry) => entry.str);

describe('joinBaselineRuns', () => {
  it('joins glyphs set along a curve into one run in curve order', () => {
    const out = joinBaselineRuns(arcGlyphs('QUAYSIDE WALK', 300, 300, 120, 140));
    expect(texts(out)).toEqual(['QUAYSIDE WALK']);
  });

  it('keeps a bbox that covers every glyph of a curved run', () => {
    const glyphs = arcGlyphs('River Wend', 300, 300, 80, 150);
    const [merged] = joinBaselineRuns(glyphs) as RawTextItem[];
    const box = (item: RawTextItem) =>
      textRunGeometryFromTransform({
        transform: item.transform as number[],
        width: item.width as number,
        height: item.height as number,
        pageHeight: 792,
        viewMinX: 0,
        viewMinY: 0,
      });
    const outer = box(merged);
    for (const glyph of glyphs) {
      if (glyph.str === ' ') continue;
      const inner = box(glyph as RawTextItem);
      expect(inner.x).toBeGreaterThanOrEqual(outer.x - 0.02);
      expect(inner.y).toBeGreaterThanOrEqual(outer.y - 0.02);
      expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 0.02);
      expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 0.02);
    }
    // Sound, but not the whole page: the chord frame stays close to the glyphs.
    expect(outer.width).toBeLessThan(120);
  });

  it('inserts a word space where a letter-spaced curved run has a wider gap', () => {
    const items = [
      ...arcGlyphs('River', 300, 300, 120, 140, 3),
      // Continue the same arc after a word gap with no space item between.
    ];
    const last = items.at(-1) as ReturnType<typeof rotated>;
    const [lx, ly] = [last.transform[4], last.transform[5]];
    const theta = Math.atan2(ly - 300, lx - 300) - (ADVANCE + 10) / 120;
    const rest = arcGlyphs('Wend', 300, 300, 120, (theta * 180) / Math.PI, 3);
    expect(texts(joinBaselineRuns([...items, ...rest]))).toEqual(['River Wend']);
  });

  it('joins a straight label drawn one glyph per item at 45° and at 30°', () => {
    expect(texts(joinBaselineRuns(straightGlyphs('Harbour Road', 100, 300, 45)))).toEqual(['Harbour Road']);
    expect(texts(joinBaselineRuns(straightGlyphs('Mill Lane', 100, 300, -30)))).toEqual(['Mill Lane']);
  });

  it('joins a rotated label drawn one word per item, keeping the first word’s direction', () => {
    const r = (60 * Math.PI) / 180;
    const first = rotated('Station', 100, 100, 60);
    const step = first.width + 0.28 * SIZE;
    const second = rotated('Avenue', 100 + Math.cos(r) * step, 100 + Math.sin(r) * step, 60);
    const [merged] = joinBaselineRuns([first, second]) as RawTextItem[];
    expect(merged.str).toBe('Station Avenue');
    expect(merged.transform).toEqual(first.transform);
    expect(merged.width).toBeCloseTo(first.width + 0.28 * SIZE + second.width, 5);
  });

  it('joins a sideways label drawn one glyph per item', () => {
    expect(texts(joinBaselineRuns(straightGlyphs('Revenue', 60, 300, 90)))).toEqual(['Revenue']);
  });

  it('leaves upright single glyphs alone: form digit cells and vertical CJK stacks', () => {
    const cells = [...'123456'].map((d, i) => rotated(d, 100 + i * 14, 500, 0));
    expect(texts(joinBaselineRuns(cells))).toEqual([...'123456']);
    const stack = [...'縦書きの本文'].map((ch, i) => rotated(ch, 400, 700 - i * SIZE, 0, SIZE));
    expect(texts(joinBaselineRuns(stack))).toEqual([...'縦書きの本文']);
  });

  it('does not join rotated glyphs that do not continue each other’s advance', () => {
    // Scatter-plot markers drawn as turned glyphs at arbitrary spots.
    const markers = [rotated('×', 100, 100, 45), rotated('×', 130, 112, 45), rotated('×', 150, 90, 45)];
    expect(texts(joinBaselineRuns(markers))).toEqual(['×', '×', '×']);
  });

  it('does not join stacked rotated lines or neighbouring rotated column headers', () => {
    // Two lines of a paragraph turned 90°: the second starts a line pitch across, not where the first ends.
    const lines = [rotated('first line of a note', 100, 100, 90), rotated('second line', 112, 100, 90)];
    expect(texts(joinBaselineRuns(lines))).toEqual(['first line of a note', 'second line']);
    // Header cells of an upright table, turned 90° and set side by side.
    const headers = ['Revenue', 'Margin', 'Growth'].map((h, i) => rotated(h, 200 + i * 40, 600, 90));
    expect(texts(joinBaselineRuns(headers))).toEqual(['Revenue', 'Margin', 'Growth']);
  });

  it('does not join glyphs in different fonts or sizes', () => {
    const a = straightGlyphs('ab', 100, 100, 30);
    const b = straightGlyphs('cd', 100 + Math.cos(Math.PI / 6) * 12, 100 + Math.sin(Math.PI / 6) * 12, 30).map(
      (item) => ({ ...item, fontName: 'f2' }),
    );
    expect(texts(joinBaselineRuns([...a, ...b]))).toEqual(['ab', 'cd']);
  });

  it('leaves upright text untouched', () => {
    const items = [rotated('Hello', 100, 700, 0), rotated('world', 130, 700, 0)];
    expect(joinBaselineRuns(items)).toEqual(items);
  });
});
