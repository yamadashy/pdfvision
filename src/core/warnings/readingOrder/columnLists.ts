import type { LayoutBlock, PageResult, PageWarning } from '../../../types/index.js';
import { shortTextSample } from '../textSamples.js';

const MIN_COLUMNAR_LIST_BLOCKS = 8;
const MIN_COLUMNAR_LIST_COLUMNS = 3;
const MIN_ITEMS_PER_COLUMN = 2;
const COLUMN_X_THRESHOLD_RATIO = 0.04;
const COLUMN_X_THRESHOLD_MIN = 18;
const SAME_ROW_Y_TOLERANCE = 24;
const GLUED_NUMBERED_ITEM_PATTERN = /(\p{L}[\p{L}'’)-]{2,})(\d{1,2})\.\s+(\p{Lu}[\s\S]{0,60})/gu;

interface NumberedListBlock {
  index: number;
  number: number;
  text: string;
  x: number;
  y: number;
  height: number;
  column: number;
}

interface ColumnCluster {
  x: number;
  items: NumberedListBlock[];
}

interface GluedListSample {
  previousIndex: number;
  text: string;
}

export function detectColumnListReadingOrderDivergence(
  page: PageResult,
  blocks: LayoutBlock[],
  out: PageWarning[],
): boolean {
  if (page.width <= 0 || blocks.length < MIN_COLUMNAR_LIST_BLOCKS) return false;
  const columns = collectNumberedListColumns(blocks, page.width);
  if (columns.filter((column) => column.items.length >= MIN_ITEMS_PER_COLUMN).length < MIN_COLUMNAR_LIST_COLUMNS) {
    return false;
  }

  const items = columns.flatMap((column) => column.items);
  const sample = findGluedColumnarListSample(page.text, items);
  if (!sample) return false;

  out.push({
    code: 'reading_order_divergence',
    severity: 'warning',
    blockIndex: sample.previousIndex,
    message: `native text glues numbered list items from separate visual columns near "${shortTextSample(sample.text)}" — native text order flattens a columnar list; prefer layout.blocks order when sequence matters`,
  });
  return true;
}

function collectNumberedListColumns(blocks: LayoutBlock[], pageWidth: number): ColumnCluster[] {
  const threshold = Math.max(COLUMN_X_THRESHOLD_MIN, pageWidth * COLUMN_X_THRESHOLD_RATIO);
  const items = blocks
    .map((block, index) => toNumberedListBlock(block, index, pageWidth))
    .filter((item): item is NumberedListBlock => item !== undefined)
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const columns: ColumnCluster[] = [];

  for (const item of items) {
    const column = columns.find((candidate) => Math.abs(candidate.x - item.x) <= threshold);
    if (column) {
      item.column = columns.indexOf(column);
      column.items.push(item);
      column.x = (column.x * (column.items.length - 1) + item.x) / column.items.length;
      continue;
    }
    item.column = columns.length;
    columns.push({ x: item.x, items: [item] });
  }

  return columns;
}

function toNumberedListBlock(block: LayoutBlock, index: number, pageWidth: number): NumberedListBlock | undefined {
  if (block.repeated || block.width > pageWidth * 0.5) return undefined;
  const text = collapseWhitespace(block.text);
  const match = /^(\d{1,2})\.\s+\S/u.exec(text);
  if (!match) return undefined;
  return {
    index,
    number: Number(match[1]),
    text,
    x: block.x,
    y: block.y,
    height: block.height,
    column: -1,
  };
}

function findGluedColumnarListSample(text: string, items: readonly NumberedListBlock[]): GluedListSample | undefined {
  if (text.length === 0) return undefined;
  for (const match of text.matchAll(GLUED_NUMBERED_ITEM_PATTERN)) {
    const tailWord = normalizeWord(match[1]);
    const number = Number(match[2]);
    if (tailWord.length < 4 || !Number.isFinite(number)) continue;

    const previousItems = items.filter((item) => itemHasTailWord(item, tailWord));
    const nextItems = items.filter((item) => item.number === number);
    for (const previous of previousItems) {
      for (const next of nextItems) {
        if (previous.column === next.column || !sameVisualRow(previous, next)) continue;
        return {
          previousIndex: previous.index,
          text: `${previous.text}${match[2]}. ${match[3]}`,
        };
      }
    }
  }
  return undefined;
}

function itemHasTailWord(item: NumberedListBlock, tailWord: string): boolean {
  const words = item.text.split(/\s+/u).map(normalizeWord).filter(Boolean);
  return words.slice(-6).includes(tailWord);
}

function sameVisualRow(a: NumberedListBlock, b: NumberedListBlock): boolean {
  return Math.abs(a.y - b.y) <= Math.max(SAME_ROW_Y_TOLERANCE, a.height, b.height);
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

function normalizeWord(word: string): string {
  return word.replace(/[^\p{L}]+/gu, '').toLowerCase();
}
