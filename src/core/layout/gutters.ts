import type { TextSpan } from '../../types/index.js';
import { type BBox, unionBox } from './geometry.js';
import { isTableNumericCell } from './tables.js';

const FONT_SIZE_FALLBACK_PT = 12;

const RECURRING_GUTTER_GAP_RATIO = 1.05;
const RECURRING_GUTTER_MIN_GAP_PT = 9;
const RECURRING_GUTTER_WIDE_ROW_RATIO = 0.6;
const RECURRING_GUTTER_SIDE_MIN_RATIO = 0.25;
const RECURRING_GUTTER_BIN_PT = 5;
const RECURRING_GUTTER_MIN_ROWS = 3;
const RECURRING_SIDE_PANEL_START_RATIO = 0.58;
const RECURRING_SIDE_PANEL_ROW_MIN_WIDTH_RATIO = 0.6;
const RECURRING_SIDE_PANEL_LEFT_MIN_RATIO = 0.4;
const RECURRING_SIDE_PANEL_GAP_RATIO = 0.9;
const RECURRING_SIDE_PANEL_MIN_GAP_PT = 9;
const RECURRING_SIDE_PANEL_MIN_ROWS = 2;
const RECURRING_TABLE_GUTTER_MIN_ROWS = 4;
const RECURRING_TABLE_GUTTER_MIN_NUMERIC_SPANS = 3;
const RECURRING_TABLE_GUTTER_MIN_WIDTH_PT = 96;

function gutterBin(prev: BBox, cur: BBox): number {
  const gap = cur.x - (prev.x + prev.width);
  const center = prev.x + prev.width + gap / 2;
  return Math.round(center / RECURRING_GUTTER_BIN_PT) * RECURRING_GUTTER_BIN_PT;
}

function isRecurringGutterCandidate(
  groupBox: BBox,
  prev: TextSpan,
  cur: TextSpan,
  gap: number,
  fontSize: number,
  pageWidth: number,
): boolean {
  if (pageWidth <= 0) return false;
  if (groupBox.width < pageWidth * RECURRING_GUTTER_WIDE_ROW_RATIO) return false;
  if (gap < Math.max(fontSize * RECURRING_GUTTER_GAP_RATIO, RECURRING_GUTTER_MIN_GAP_PT)) return false;

  const leftWidth = prev.x + prev.width - groupBox.x;
  const rightWidth = groupBox.x + groupBox.width - cur.x;
  return (
    leftWidth >= pageWidth * RECURRING_GUTTER_SIDE_MIN_RATIO &&
    rightWidth >= pageWidth * RECURRING_GUTTER_SIDE_MIN_RATIO
  );
}

export function isRecurringGutterSplitCandidate(
  groupBox: BBox,
  prev: TextSpan,
  cur: TextSpan,
  gap: number,
  fontSize: number,
  pageWidth: number,
): boolean {
  if (pageWidth <= 0) return false;
  if (groupBox.width < pageWidth * 0.4) return false;
  if (gap < Math.max(fontSize * RECURRING_GUTTER_GAP_RATIO, RECURRING_GUTTER_MIN_GAP_PT)) return false;

  const leftWidth = prev.x + prev.width - groupBox.x;
  const rightWidth = groupBox.x + groupBox.width - cur.x;
  return (
    leftWidth >= pageWidth * RECURRING_GUTTER_SIDE_MIN_RATIO ||
    rightWidth >= pageWidth * RECURRING_GUTTER_SIDE_MIN_RATIO
  );
}

export function detectRecurringGutterBins(lineGroups: TextSpan[][], pageWidth: number): Set<number> {
  if (pageWidth <= 0) return new Set();

  const counts = new Map<number, number>();
  for (const group of lineGroups) {
    if (group.length < 2) continue;
    const xSorted = [...group].sort((a, b) => a.x - b.x);
    const groupBox = unionBox(xSorted);
    const binsInRow = new Set<number>();
    for (let i = 1; i < xSorted.length; i++) {
      const prev = xSorted[i - 1];
      const cur = xSorted[i];
      const gap = cur.x - (prev.x + prev.width);
      const prevFontSize = prev.fontSize || FONT_SIZE_FALLBACK_PT;
      const curFontSize = cur.fontSize || FONT_SIZE_FALLBACK_PT;
      const fontSize = Math.min(prevFontSize, curFontSize);
      if (isRecurringGutterCandidate(groupBox, prev, cur, gap, fontSize, pageWidth)) {
        binsInRow.add(gutterBin(prev, cur));
      }
    }
    for (const bin of binsInRow) counts.set(bin, (counts.get(bin) ?? 0) + 1);
  }

  const recurring = new Set<number>();
  for (const [bin, count] of counts) {
    if (count >= RECURRING_GUTTER_MIN_ROWS) recurring.add(bin);
  }
  return recurring;
}

export function detectRecurringSidePanelStartBins(lineGroups: TextSpan[][], pageWidth: number): Set<number> {
  if (pageWidth <= 0) return new Set();

  const counts = new Map<number, number>();
  for (const group of lineGroups) {
    if (group.length < 2) continue;
    const xSorted = [...group].sort((a, b) => a.x - b.x);
    const groupBox = unionBox(xSorted);
    const binsInRow = new Set<number>();
    for (let i = 1; i < xSorted.length; i++) {
      const prev = xSorted[i - 1];
      const cur = xSorted[i];
      const gap = cur.x - (prev.x + prev.width);
      const prevFontSize = prev.fontSize || FONT_SIZE_FALLBACK_PT;
      const curFontSize = cur.fontSize || FONT_SIZE_FALLBACK_PT;
      const fontSize = Math.min(prevFontSize, curFontSize);
      if (isRecurringSidePanelStartCandidate(groupBox, prev, cur, gap, fontSize, pageWidth)) {
        binsInRow.add(Math.round(cur.x / RECURRING_GUTTER_BIN_PT) * RECURRING_GUTTER_BIN_PT);
      }
    }
    for (const bin of binsInRow) counts.set(bin, (counts.get(bin) ?? 0) + 1);
  }

  const recurring = new Set<number>();
  for (const [bin, count] of counts) {
    if (count >= RECURRING_SIDE_PANEL_MIN_ROWS) recurring.add(bin);
  }
  return recurring;
}

export function detectRecurringTableGutterBins(lineGroups: TextSpan[][], pageWidth: number): Set<number> {
  if (pageWidth <= 0) return new Set();

  const counts = new Map<number, number>();
  for (const group of lineGroups) {
    const numericSpans = group.filter(isTableGutterNumericSpan);
    if (numericSpans.length < RECURRING_TABLE_GUTTER_MIN_NUMERIC_SPANS) continue;

    const xSorted = [...group].sort((a, b) => a.x - b.x);
    const groupBox = unionBox(xSorted);
    const binsInRow = new Set<number>();
    for (let i = 1; i < xSorted.length; i++) {
      const prev = xSorted[i - 1];
      const cur = xSorted[i];
      if (!isTableGutterNumericSpan(prev) || !isTableGutterNumericSpan(cur)) continue;
      const gap = cur.x - (prev.x + prev.width);
      const prevFontSize = prev.fontSize || FONT_SIZE_FALLBACK_PT;
      const curFontSize = cur.fontSize || FONT_SIZE_FALLBACK_PT;
      const fontSize = Math.min(prevFontSize, curFontSize);
      if (isRecurringTableGutterCandidate(groupBox, gap, fontSize, pageWidth)) {
        binsInRow.add(gutterBin(prev, cur));
      }
    }
    for (const bin of binsInRow) counts.set(bin, (counts.get(bin) ?? 0) + 1);
  }

  const recurring = new Set<number>();
  for (const [bin, count] of counts) {
    if (count >= RECURRING_TABLE_GUTTER_MIN_ROWS) recurring.add(bin);
  }
  return recurring;
}

export function hasRecurringGutter(recurringGutterBins: Set<number>, prev: TextSpan, cur: TextSpan): boolean {
  if (recurringGutterBins.size === 0) return false;
  const bin = gutterBin(prev, cur);
  for (const recurringBin of recurringGutterBins) {
    if (Math.abs(recurringBin - bin) <= RECURRING_GUTTER_BIN_PT) return true;
  }
  return false;
}

export function hasRecurringSidePanelStart(recurringSidePanelStartBins: Set<number>, cur: TextSpan): boolean {
  if (recurringSidePanelStartBins.size === 0) return false;
  const bin = Math.round(cur.x / RECURRING_GUTTER_BIN_PT) * RECURRING_GUTTER_BIN_PT;
  for (const recurringBin of recurringSidePanelStartBins) {
    if (Math.abs(recurringBin - bin) <= RECURRING_GUTTER_BIN_PT) return true;
  }
  return false;
}

export function isRecurringSidePanelStartCandidate(
  groupBox: BBox,
  prev: TextSpan,
  cur: TextSpan,
  gap: number,
  fontSize: number,
  pageWidth: number,
): boolean {
  if (pageWidth <= 0) return false;
  if (groupBox.width < pageWidth * RECURRING_SIDE_PANEL_ROW_MIN_WIDTH_RATIO) return false;
  if (cur.x < pageWidth * RECURRING_SIDE_PANEL_START_RATIO) return false;
  if (gap < Math.max(fontSize * RECURRING_SIDE_PANEL_GAP_RATIO, RECURRING_SIDE_PANEL_MIN_GAP_PT)) return false;

  const leftWidth = prev.x + prev.width - groupBox.x;
  return leftWidth >= pageWidth * RECURRING_SIDE_PANEL_LEFT_MIN_RATIO;
}

export function isRecurringTableGutterCandidate(
  groupBox: BBox,
  gap: number,
  fontSize: number,
  pageWidth: number,
): boolean {
  if (groupBox.width < Math.min(pageWidth * 0.4, RECURRING_TABLE_GUTTER_MIN_WIDTH_PT)) return false;
  return gap >= Math.max(fontSize * RECURRING_GUTTER_GAP_RATIO, RECURRING_GUTTER_MIN_GAP_PT);
}

export function isTableGutterNumericSpan(span: TextSpan): boolean {
  const text = span.text.trim();
  return text === '-' || isTableNumericCell(text);
}
