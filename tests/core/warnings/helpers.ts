import type { LayoutBlock, LayoutLine, PageResult, VectorBox } from '../../../src/types/index.js';

/** Build a layout block with sensible defaults the rules don't read.
 *  All four numeric coordinates are required because the rules
 *  inspect bbox geometry. */
function block(x: number, y: number, width: number, height: number, extras: Partial<LayoutBlock> = {}): LayoutBlock {
  return {
    text: extras.text ?? 'body',
    x,
    y,
    width,
    height,
    lines: extras.lines ?? [],
    ...extras,
  };
}

function line(text: string, x: number, y: number, width = 30, height = 8): LayoutLine {
  return { text, x, y, width, height, fontSize: 8 };
}

/** Build a PageResult shaped for the detector — only `layout`,
 *  `width`, `height` are read; the density / quality fields are
 *  required by the type but inert here. */
function page(blocks: LayoutBlock[], width = 612, height = 792): PageResult {
  return {
    page: 1,
    text: '',
    charCount: 0,
    imageCount: 0,
    vectorCount: 0,
    textCoverage: 0,
    nonPrintableRatio: 0,
    nonPrintableCount: 0,
    width,
    height,
    layout: { blocks },
    quality: { nativeTextStatus: 'ok' },
  };
}

function scatteredSmallVectorBoxes(count = 260): VectorBox[] {
  return Array.from({ length: count }, (_, index) => ({
    x: 40 + (index % 26) * 20,
    y: 90 + Math.floor(index / 26) * 55,
    width: 7.68,
    height: 7.68,
  }));
}

function clusteredChartVectorBoxes(count = 260): VectorBox[] {
  return Array.from({ length: count }, (_, index) => ({
    x: 120 + (index % 20) * 14,
    y: 150 + Math.floor(index / 20) * 14,
    width: 6,
    height: 6,
  }));
}

export { block, clusteredChartVectorBoxes, line, page, scatteredSmallVectorBoxes };
