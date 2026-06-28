import type { PageLayout, VisualRegionAssociatedText } from '../../types/index.js';
import { MAX_ASSOCIATED_TEXT, mergeAssociatedText, normalizeAssociatedText } from './associatedText.js';
import { hasSourceType, mergeSources } from './candidateMerge.js';
import { captionTextsFromBlock } from './captions/extraction.js';
import { captionKind } from './captions/text.js';
import { areaRatio, horizontalOverlapRatio, pageArea, unionBox, visiblePageBox } from './geometry.js';
import type { BoxLike, BuildVisualRegionsInput, Candidate } from './types.js';

const MIN_GROUPED_FRAGMENTS = 2;
const MIN_RASTER_GRID_FRAGMENTS = 6;
const MIN_RASTER_GRID_AXIS_CLUSTERS = 2;
const MIN_GROUPED_SOURCES = 2;
const MIN_FRAGMENT_AREA_RATIO = 0.006;
const MIN_FIGURE_AREA_RATIO = 0.06;
const MAX_FIGURE_AREA_RATIO = 0.75;
const CAPTION_ANCHOR_MAX_GAP_PT = 72;
const FRAGMENT_CHAIN_MAX_GAP_PT = 72;
const AXIS_CLUSTER_TOLERANCE_PT = 32;
const MIN_CAPTION_HORIZONTAL_OVERLAP_RATIO = 0.1;
const MIN_FRAGMENT_HORIZONTAL_OVERLAP_RATIO = 0.05;
const FULL_CAPTION_BLOCK_MAX_CHARS = 1800;
const MULTI_PANEL_CAPTION_PATTERN = /(?:\b[A-Z]\s*,\s*[A-Z](?:\s*,\s*[A-Z])*\s*[:;])|(?:\([A-Z]\).*?\([A-Z]\))/u;

interface CaptionItem {
  text: VisualRegionAssociatedText;
}

export function addCaptionedFigureCandidates(input: BuildVisualRegionsInput, candidates: Candidate[]): Candidate[] {
  const captions = figureCaptions(input.layout);
  if (captions.length === 0) return candidates;
  const additions = captions.flatMap((caption) => [
    ...(isMultiPanelCaption(caption.text.text) ? vectorCandidatesForCaption(input, candidates, caption) : []),
    ...rasterGridCandidatesForCaption(input, candidates, caption),
  ]);
  return additions.length === 0 ? candidates : [...candidates, ...additions];
}

function figureCaptions(layout: PageLayout | undefined): CaptionItem[] {
  return (layout?.blocks ?? []).flatMap((block, blockIndex) =>
    block.repeated
      ? []
      : captionTextsFromBlock(block, blockIndex)
          .filter((text) => captionKind(text.text) === 'figure')
          .map((text) => ({ text: fullCaptionBlockText(block, blockIndex, text) ?? text })),
  );
}

function isMultiPanelCaption(text: string): boolean {
  return MULTI_PANEL_CAPTION_PATTERN.test(text);
}

function fullCaptionBlockText(
  block: NonNullable<PageLayout['blocks']>[number],
  blockIndex: number,
  caption: VisualRegionAssociatedText,
): VisualRegionAssociatedText | undefined {
  const text = normalizeAssociatedText(block.text);
  if (text.length === 0 || text.length > FULL_CAPTION_BLOCK_MAX_CHARS) return undefined;
  if (!text.startsWith(caption.text.slice(0, Math.min(80, caption.text.length)))) return undefined;
  return {
    ...caption,
    text,
    x: block.x,
    y: block.y,
    width: block.width,
    height: block.height,
    blockIndex,
  };
}

function vectorCandidatesForCaption(
  input: BuildVisualRegionsInput,
  candidates: readonly Candidate[],
  caption: CaptionItem,
): Candidate[] {
  const totalArea = pageArea(input);
  const eligible = candidates
    .filter((candidate) => isVectorFigureFragment(candidate, caption.text, totalArea))
    .sort((a, b) => b.y + b.height - (a.y + a.height));
  const fragments = chainedFragmentsAboveCaption(eligible, caption.text);
  if (fragments.length < MIN_GROUPED_FRAGMENTS) return [];

  const sources = mergeSources(fragments.flatMap((fragment) => fragment.sources));
  if (sources.length < MIN_GROUPED_SOURCES) return [];

  const figureBox = visiblePageBox(
    [caption.text, ...fragments].reduce<BoxLike>((box, fragment) => unionBox(box, fragment), fragments[0]),
    input.pageWidth,
    input.pageHeight,
  );
  const figureAreaRatio = areaRatio(figureBox, totalArea);
  if (figureAreaRatio < MIN_FIGURE_AREA_RATIO || figureAreaRatio > MAX_FIGURE_AREA_RATIO) return [];

  const associatedText = mergeAssociatedText([
    ...fragments.flatMap((fragment) => fragment.associatedText ?? []),
    caption.text,
  ]).slice(0, MAX_ASSOCIATED_TEXT);

  return [
    {
      ...figureBox,
      kind: fragments.every((fragment) => fragment.kind === 'vector') ? 'vector' : 'mixed',
      priority: Math.max(3, ...fragments.map((fragment) => fragment.priority)),
      reason: `${fragments.length} vector figure fragments grouped by multi-panel figure caption`,
      sources,
      associatedText,
    },
  ];
}

function rasterGridCandidatesForCaption(
  input: BuildVisualRegionsInput,
  candidates: readonly Candidate[],
  caption: CaptionItem,
): Candidate[] {
  const totalArea = pageArea(input);
  const eligible = candidates
    .filter((candidate) => isRasterFigureFragment(candidate, caption.text, totalArea))
    .sort((a, b) => b.y + b.height - (a.y + a.height));
  const fragments = rasterGridFragmentsAboveCaption(eligible, caption.text);
  if (fragments.length < MIN_RASTER_GRID_FRAGMENTS) return [];
  if (!looksLikeRasterGrid(fragments)) return [];

  const sources = mergeSources(fragments.flatMap((fragment) => fragment.sources));
  if (sources.length < MIN_RASTER_GRID_FRAGMENTS) return [];

  const figureBox = visiblePageBox(
    [caption.text, ...fragments].reduce<BoxLike>((box, fragment) => unionBox(box, fragment), fragments[0]),
    input.pageWidth,
    input.pageHeight,
  );
  const figureAreaRatio = areaRatio(figureBox, totalArea);
  if (figureAreaRatio < MIN_FIGURE_AREA_RATIO || figureAreaRatio > MAX_FIGURE_AREA_RATIO) return [];

  return [
    {
      ...figureBox,
      kind: 'raster',
      priority: Math.max(4, ...fragments.map((fragment) => fragment.priority)),
      reason: `${fragments.length} raster figure panels grouped by figure caption`,
      sources,
      associatedText: [caption.text],
    },
  ];
}

function isVectorFigureFragment(candidate: Candidate, caption: VisualRegionAssociatedText, totalArea: number): boolean {
  if (!hasSourceType(candidate, 'vectorBox')) return false;
  if (hasSourceType(candidate, 'layoutTable') || hasSourceType(candidate, 'formField')) return false;
  if (candidate.kind !== 'vector' && candidate.kind !== 'mixed') return false;
  if (candidate.y >= caption.y + caption.height) return false;
  if (areaRatio(candidate, totalArea) < MIN_FRAGMENT_AREA_RATIO) return false;
  return horizontalOverlapRatio(candidate, caption) >= MIN_CAPTION_HORIZONTAL_OVERLAP_RATIO;
}

function isRasterFigureFragment(candidate: Candidate, caption: VisualRegionAssociatedText, totalArea: number): boolean {
  if (candidate.kind !== 'raster') return false;
  if (!hasSourceType(candidate, 'imageBox')) return false;
  if (hasSourceType(candidate, 'layoutTable') || hasSourceType(candidate, 'formField')) return false;
  if (candidate.y >= caption.y + caption.height) return false;
  if (areaRatio(candidate, totalArea) < MIN_FRAGMENT_AREA_RATIO) return false;
  return horizontalOverlapRatio(candidate, caption) >= MIN_CAPTION_HORIZONTAL_OVERLAP_RATIO;
}

function looksLikeRasterGrid(fragments: readonly Candidate[]): boolean {
  return (
    axisClusterCount(fragments.map((fragment) => fragment.x + fragment.width / 2)) >= MIN_RASTER_GRID_AXIS_CLUSTERS &&
    axisClusterCount(fragments.map((fragment) => fragment.y + fragment.height / 2)) >= MIN_RASTER_GRID_AXIS_CLUSTERS
  );
}

function axisClusterCount(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  let count = 0;
  let previous: number | undefined;
  for (const value of sorted) {
    if (previous === undefined || value - previous > AXIS_CLUSTER_TOLERANCE_PT) count++;
    previous = value;
  }
  return count;
}

function chainedFragmentsAboveCaption(
  candidates: readonly Candidate[],
  caption: VisualRegionAssociatedText,
): Candidate[] {
  let groupBox: BoxLike | undefined;
  const fragments: Candidate[] = [];

  for (const candidate of candidates) {
    if (!groupBox) {
      const gapToCaption = caption.y - (candidate.y + candidate.height);
      if (gapToCaption < -4 || gapToCaption > CAPTION_ANCHOR_MAX_GAP_PT) continue;
      fragments.push(candidate);
      groupBox = candidate;
      continue;
    }

    if (!canJoinFragment(candidate, groupBox)) continue;
    fragments.push(candidate);
    groupBox = unionBox(groupBox, candidate);
  }

  return fragments;
}

function rasterGridFragmentsAboveCaption(
  candidates: readonly Candidate[],
  caption: VisualRegionAssociatedText,
): Candidate[] {
  let groupBox: BoxLike | undefined;
  const fragments: Candidate[] = [];

  for (const candidate of candidates) {
    if (!groupBox) {
      const gapToCaption = caption.y - (candidate.y + candidate.height);
      if (gapToCaption < -4 || gapToCaption > CAPTION_ANCHOR_MAX_GAP_PT) continue;
      fragments.push(candidate);
      groupBox = candidate;
      continue;
    }

    if (!canJoinRasterGridFragment(candidate, groupBox)) continue;
    fragments.push(candidate);
    groupBox = unionBox(groupBox, candidate);
  }

  return fragments;
}

function canJoinFragment(candidate: Candidate, groupBox: BoxLike): boolean {
  const gapToGroup =
    candidate.y + candidate.height < groupBox.y
      ? groupBox.y - (candidate.y + candidate.height)
      : candidate.y > groupBox.y + groupBox.height
        ? candidate.y - (groupBox.y + groupBox.height)
        : 0;
  if (gapToGroup > FRAGMENT_CHAIN_MAX_GAP_PT) return false;
  return horizontalOverlapRatio(candidate, groupBox) >= MIN_FRAGMENT_HORIZONTAL_OVERLAP_RATIO;
}

function canJoinRasterGridFragment(candidate: Candidate, groupBox: BoxLike): boolean {
  const gapToGroup =
    candidate.y + candidate.height < groupBox.y
      ? groupBox.y - (candidate.y + candidate.height)
      : candidate.y > groupBox.y + groupBox.height
        ? candidate.y - (groupBox.y + groupBox.height)
        : 0;
  return gapToGroup <= FRAGMENT_CHAIN_MAX_GAP_PT;
}
