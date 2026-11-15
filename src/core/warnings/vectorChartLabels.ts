import type { ImageBox, LayoutBlock, PageResult, PageWarning, VectorBox } from '../../types/index.js';
import type { BBox } from '../layout/geometry.js';
import { detectLayoutRegions, type LayoutRegion } from '../layout/regions.js';
import { shortTextSample } from './textSamples.js';

const MIN_LABELS = 4;
const MIN_NUMERIC_LABELS = 2;
/** Painted marks that carry no text — bars, plot markers. */
const MIN_MARKS = 3;
const TABLE_COVER_RATIO = 0.5;
const NUMERIC_LABEL = /^[-+−–]?\d[\d.,]*\s*[%‰]?$/u;
/** Chart text is mostly short labels and a good share of numbers; a form,
 *  a table of contents or a score carries longer words around its digits. */
const MIN_NUMERIC_SHARE = 0.3;
const MAX_MEAN_LABEL_CHARS = 12;

/**
 * A vector chart whose text labels the layout pass kept together. The
 * labels are read row by row inside the chart, which keeps them away from
 * the prose; but a value is tied to its bar, series or category only by
 * where it is drawn, so the text alone cannot say which value is whose.
 * The warning names the region so the reader can render it.
 *
 * A figure counts as a chart when it holds several numeric labels and at
 * least one word, and has bars: text-free marks of one width (or height)
 * standing side by side on one baseline, with different lengths; a ruled or
 * gridded table has its numbers inside text-bearing cells, and a layout
 * table already reconstructed over the region is left to `tables`.
 */
export function detectVectorChartLabels(
  page: PageResult,
  blocks: readonly LayoutBlock[],
  vectorBoxes: readonly VectorBox[] | undefined,
  imageBoxes: readonly ImageBox[] | undefined,
  out: PageWarning[],
): void {
  if (!vectorBoxes || vectorBoxes.length === 0) return;
  const regions = detectLayoutRegions(blocks, { vectorBoxes, imageBoxes }, page.width, page.height);
  const tables = page.layout?.tables ?? [];
  const reported: LayoutRegion[] = [];
  for (const region of regions) {
    if (region.kind !== 'figure' || region.marks < MIN_MARKS || !region.bars) continue;
    if (reported.some((other) => overlaps(other, region))) continue;
    const labels = region.blocks.map((block) => block.text.replace(/\s+/gu, ' ').trim());
    const numeric = labels.filter((text) => NUMERIC_LABEL.test(text));
    if (labels.length < MIN_LABELS || numeric.length < MIN_NUMERIC_LABELS) continue;
    if (numeric.length < labels.length * MIN_NUMERIC_SHARE) continue;
    const meanChars = labels.reduce((sum, text) => sum + text.length, 0) / labels.length;
    if (meanChars > MAX_MEAN_LABEL_CHARS) continue;
    if (!labels.some((text) => /\p{L}/u.test(text))) continue;
    if (tables.some((table) => isTableOfRegion(region, table))) continue;
    reported.push(region);
    const box = [region.x, region.y, region.width, region.height].map((n) => Math.round(n)).join(',');
    const word = labels.find((text) => /\p{L}/u.test(text)) ?? '';
    out.push({
      code: 'vector_chart_labels',
      severity: 'warning',
      blockIndex: blocks.indexOf(region.blocks[0]),
      message: `vector chart at ${box} has ${labels.length} text labels (values such as "${shortTextSample(numeric[0])}", labels such as "${shortTextSample(word)}"), read together ${region.verticalMarks ? 'bar by bar' : 'row by row'} — which value belongs to which bar, series or category is shown only by the drawing; render the region (--render-region ${box}) before pairing or quoting values`,
    });
  }
}

function overlaps(a: BBox, b: BBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** A layout table that covers most of the region and lies mostly inside
 *  it is the region read as a table; one that spans far beyond it is
 *  about something else. */
function isTableOfRegion(region: BBox, table: BBox): boolean {
  const w = Math.min(region.x + region.width, table.x + table.width) - Math.max(region.x, table.x);
  const h = Math.min(region.y + region.height, table.y + table.height) - Math.max(region.y, table.y);
  if (w <= 0 || h <= 0) return false;
  const overlap = w * h;
  return (
    overlap >= region.width * region.height * TABLE_COVER_RATIO &&
    overlap >= table.width * table.height * TABLE_COVER_RATIO
  );
}
