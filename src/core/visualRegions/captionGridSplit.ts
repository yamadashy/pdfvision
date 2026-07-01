import type { PageLayout, VectorBox, VisualRegionAssociatedText } from '../../types/index.js';
import { mergeSources } from './candidateMerge.js';
import { captionGridAnchors } from './captions/gridAnchors.js';
import { captionScore } from './captions/scoring.js';
import { areaRatio, round2, unionBox } from './geometry.js';
import type { BoxLike, Candidate } from './types.js';

const BROAD_CAPTION_GRID_MIN_WIDTH_RATIO = 0.6;
const BROAD_CAPTION_GRID_MIN_HEIGHT_RATIO = 0.12;
const CAPTION_GRID_ANCHOR_MAX_Y_RATIO = 0.35;
const CAPTION_GRID_ROW_TOP_PADDING_PT = 8;
const CAPTION_GRID_ROW_BOTTOM_GAP_PT = 2;
const CAPTION_ROW_TOLERANCE_PT = 36;
const MIN_SPLIT_VECTOR_SOURCES = 6;
const MIN_SPLIT_AREA_RATIO = 0.01;

type CaptionAnchor = VisualRegionAssociatedText;

interface CaptionRow {
  centerY: number;
  captions: CaptionAnchor[];
}

interface CaptionCell {
  caption: CaptionAnchor;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface VectorSourceItem {
  box: VectorBox;
  source: Candidate['sources'][number];
}

export function splitBroadVectorCaptionGrids(
  candidates: readonly Candidate[],
  layout: PageLayout | undefined,
  vectorBoxes: readonly VectorBox[] | undefined,
  pageWidth: number,
  pageHeight: number,
): Candidate[] {
  if (!layout || !vectorBoxes || vectorBoxes.length === 0) return [...candidates];
  const captions = captionGridAnchors(layout);
  if (captions.length < 2) return [...candidates];

  return candidates.flatMap((candidate) => {
    const splits = splitCandidateByCaptionGrid(candidate, captions, vectorBoxes, pageWidth, pageHeight);
    return splits.length >= 2 ? splits : [candidate];
  });
}

function splitCandidateByCaptionGrid(
  candidate: Candidate,
  captions: readonly CaptionAnchor[],
  vectorBoxes: readonly VectorBox[],
  pageWidth: number,
  pageHeight: number,
): Candidate[] {
  if (candidate.kind !== 'vector' && candidate.kind !== 'mixed') return [];
  if (pageWidth <= 0 || pageHeight <= 0) return [];
  if (candidate.width < pageWidth * BROAD_CAPTION_GRID_MIN_WIDTH_RATIO) return [];
  if (candidate.height < pageHeight * BROAD_CAPTION_GRID_MIN_HEIGHT_RATIO) return [];

  const candidateCaptions = captions.filter((caption) => captionScore(candidate, caption) !== undefined);
  const captionAnchorLimit = candidate.y + candidate.height * CAPTION_GRID_ANCHOR_MAX_Y_RATIO;
  const anchorCaptionKeys = new Set(
    candidateCaptions.filter((caption) => caption.y <= captionAnchorLimit).map(captionKey),
  );
  if (anchorCaptionKeys.size < 2) return [];

  const sourceItems = candidateVectorSources(candidate, vectorBoxes);
  if (sourceItems.length < MIN_SPLIT_VECTOR_SOURCES * 2) return [];

  const rows = captionRows(candidateCaptions);
  if (rows.every((row) => row.captions.length < 2)) return [];

  const cells = captionCells(candidate, rows).filter((cell) => anchorCaptionKeys.has(captionKey(cell.caption)));
  const totalArea = pageWidth * pageHeight;
  const splits: Candidate[] = [];
  for (const cell of cells) {
    const items = sourceItems.filter((item) => pointInsideCell(centerX(item.box), centerY(item.box), cell));
    if (items.length < MIN_SPLIT_VECTOR_SOURCES) continue;
    const sourceBox = items.reduce<BoxLike>((box, item) => unionBox(box, item.box), items[0].box);
    const box = unionBox(sourceBox, cell.caption);
    if (areaRatio(box, totalArea) < MIN_SPLIT_AREA_RATIO) continue;
    splits.push({
      x: round2(box.x),
      y: round2(box.y),
      width: round2(box.width),
      height: round2(box.height),
      kind: candidate.kind,
      priority: candidate.priority,
      reason: `${candidate.reason}; split by figure caption grid`,
      sources: mergeSources(items.map((item) => item.source)),
      associatedText: [cell.caption],
    });
  }

  return splits;
}

function candidateVectorSources(candidate: Candidate, vectorBoxes: readonly VectorBox[]): VectorSourceItem[] {
  return candidate.sources.flatMap((source) => {
    if (source.type !== 'vectorBox') return [];
    const box = vectorBoxes[source.index];
    return box ? [{ box, source }] : [];
  });
}

function captionRows(captions: readonly CaptionAnchor[]): CaptionRow[] {
  const rows: CaptionRow[] = [];
  for (const caption of [...captions].sort((a, b) => centerY(a) - centerY(b) || centerX(a) - centerX(b))) {
    const row = rows.find((candidate) => Math.abs(candidate.centerY - centerY(caption)) <= CAPTION_ROW_TOLERANCE_PT);
    if (row) {
      row.captions.push(caption);
      row.centerY = row.captions.reduce((sum, item) => sum + centerY(item), 0) / row.captions.length;
    } else {
      rows.push({ centerY: centerY(caption), captions: [caption] });
    }
  }
  for (const row of rows) row.captions.sort((a, b) => centerX(a) - centerX(b));
  return rows;
}

function captionCells(candidate: Candidate, rows: readonly CaptionRow[]): CaptionCell[] {
  const sortedRows = [...rows].sort((a, b) => a.centerY - b.centerY);
  return sortedRows.flatMap((row, rowIndex) => {
    const rowTop = Math.max(candidate.y, minCaptionY(row) - CAPTION_GRID_ROW_TOP_PADDING_PT);
    const rowBottom =
      rowIndex === sortedRows.length - 1
        ? candidate.y + candidate.height
        : Math.min(
            candidate.y + candidate.height,
            minCaptionY(sortedRows[rowIndex + 1]) - CAPTION_GRID_ROW_BOTTOM_GAP_PT,
          );
    return row.captions.map((caption, captionIndex) => ({
      caption,
      left:
        captionIndex === 0
          ? candidate.x
          : midpoint(centerX(row.captions[captionIndex - 1]), centerX(row.captions[captionIndex])),
      right:
        captionIndex === row.captions.length - 1
          ? candidate.x + candidate.width
          : midpoint(centerX(row.captions[captionIndex]), centerX(row.captions[captionIndex + 1])),
      top: rowTop,
      bottom: rowBottom,
    }));
  });
}

function captionKey(caption: CaptionAnchor): string {
  return `${caption.blockIndex ?? ''}:${caption.x}:${caption.y}:${caption.text}`;
}

function minCaptionY(row: CaptionRow): number {
  return Math.min(...row.captions.map((caption) => caption.y));
}

function pointInsideCell(x: number, y: number, cell: CaptionCell): boolean {
  return x >= cell.left && x < cell.right && y >= cell.top && y < cell.bottom;
}

function midpoint(a: number, b: number): number {
  return (a + b) / 2;
}

function centerX(box: BoxLike): number {
  return box.x + box.width / 2;
}

function centerY(box: BoxLike): number {
  return box.y + box.height / 2;
}
