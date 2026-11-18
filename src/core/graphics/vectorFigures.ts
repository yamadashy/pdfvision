import type { ChartMarks } from './chartMarks.js';
import type { OutlinedTextRegion } from './outlinedText.js';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * What the figure warnings need from the path shapes, reduced to boxes
 * so a page's shapes are not kept past extraction.
 */
export interface VectorFigureEvidence {
  /** Bounding boxes of line-chart series lines. */
  seriesLines: Box[];
  /** Bounding boxes of pies and donuts. */
  pies: Box[];
  /** Regions of text drawn as glyph outlines. */
  outlinedText: OutlinedTextRegion[];
}

export function vectorFigureEvidence(
  marks: ChartMarks,
  outlinedText: OutlinedTextRegion[],
): VectorFigureEvidence | undefined {
  if (marks.lines.length === 0 && marks.pies.length === 0 && outlinedText.length === 0) return undefined;
  const box = ({ x, y, width, height }: Box): Box => ({ x, y, width, height });
  return { seriesLines: marks.lines.map(box), pies: marks.pies.map(box), outlinedText };
}

export function scaleVectorFigureEvidence(evidence: VectorFigureEvidence, factor: number): VectorFigureEvidence {
  const scale = <T extends Box>(box: T): T => ({
    ...box,
    x: box.x * factor,
    y: box.y * factor,
    width: box.width * factor,
    height: box.height * factor,
  });
  return {
    seriesLines: evidence.seriesLines.map(scale),
    pies: evidence.pies.map(scale),
    outlinedText: evidence.outlinedText.map(scale),
  };
}
