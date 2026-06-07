import type {
  FormField,
  ImageBox,
  PageLayout,
  VectorBox,
  VisualRegion,
  VisualRegionAssociatedText,
  VisualRegionKind,
  VisualRegionSource,
} from '../types/index.js';

interface BoxLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Candidate extends BoxLike {
  kind: VisualRegionKind;
  priority: number;
  reason: string;
  sources: VisualRegionSource[];
  associatedText?: VisualRegionAssociatedText[];
}

interface BuildVisualRegionsInput {
  pageWidth: number;
  pageHeight: number;
  imageBoxes: readonly ImageBox[];
  vectorBoxes?: readonly VectorBox[];
  layout?: PageLayout;
  formFields?: readonly FormField[];
}

const REGION_PADDING_PT = 8;
const CLUSTER_GAP_PT = 10;
const MAX_REGIONS = 12;
const MAX_SOURCE_REFS = 16;
const MIN_REGION_DIMENSION_PT = 18;
const MIN_IMAGE_AREA_RATIO = 0.015;
const MIN_VECTOR_CLUSTER_SOURCES = 6;
const MIN_VECTOR_CLUSTER_AREA_RATIO = 0.01;
const BACKGROUND_BOX_AREA_RATIO = 0.9;
const BACKGROUND_BOX_SPAN_RATIO = 0.95;
const CAPTION_MAX_GAP_PT = 54;
const CAPTION_MIN_HORIZONTAL_OVERLAP_RATIO = 0.2;
const MAX_ASSOCIATED_TEXT = 3;
const CAPTION_PATTERN = /^\s*(?:fig(?:ure)?\.?|table|図|表)\s*[\w\d０-９一二三四五六七八九十ivxlcdm]+[\s.:：．、-]/iu;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function area(box: BoxLike): number {
  return Math.max(0, box.width) * Math.max(0, box.height);
}

function pageArea(input: { pageWidth: number; pageHeight: number }): number {
  return Math.max(0, input.pageWidth) * Math.max(0, input.pageHeight);
}

function areaRatio(box: BoxLike, totalArea: number): number {
  return totalArea > 0 ? area(box) / totalArea : 0;
}

function isUsableBox(box: BoxLike): boolean {
  return (
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    Number.isFinite(box.width) &&
    Number.isFinite(box.height) &&
    box.width >= MIN_REGION_DIMENSION_PT &&
    box.height >= MIN_REGION_DIMENSION_PT
  );
}

function isFinitePositiveBox(box: BoxLike): boolean {
  return (
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    Number.isFinite(box.width) &&
    Number.isFinite(box.height) &&
    box.width > 0 &&
    box.height > 0
  );
}

function unionBox(a: BoxLike, b: BoxLike): BoxLike {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function padAndClamp(box: BoxLike, pageWidth: number, pageHeight: number): BoxLike {
  const left = Math.max(0, box.x - REGION_PADDING_PT);
  const top = Math.max(0, box.y - REGION_PADDING_PT);
  const right = Math.min(pageWidth, box.x + box.width + REGION_PADDING_PT);
  const bottom = Math.min(pageHeight, box.y + box.height + REGION_PADDING_PT);
  return {
    x: round2(left),
    y: round2(top),
    width: round2(Math.max(0, right - left)),
    height: round2(Math.max(0, bottom - top)),
  };
}

function expand(box: BoxLike, amount: number): BoxLike {
  return {
    x: box.x - amount,
    y: box.y - amount,
    width: box.width + amount * 2,
    height: box.height + amount * 2,
  };
}

function overlapArea(a: BoxLike, b: BoxLike): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function touches(a: BoxLike, b: BoxLike, gap: number): boolean {
  return overlapArea(expand(a, gap), b) > 0;
}

function overlapOfSmaller(a: BoxLike, b: BoxLike): number {
  const smaller = Math.min(area(a), area(b));
  return smaller > 0 ? overlapArea(a, b) / smaller : 0;
}

function isNearFullPageBox(box: BoxLike, pageWidth: number, pageHeight: number): boolean {
  const totalArea = pageWidth * pageHeight;
  return (
    areaRatio(box, totalArea) >= BACKGROUND_BOX_AREA_RATIO ||
    (box.width >= pageWidth * BACKGROUND_BOX_SPAN_RATIO && box.height >= pageHeight * BACKGROUND_BOX_SPAN_RATIO)
  );
}

function hasNonBackgroundBox(boxes: readonly BoxLike[], pageWidth: number, pageHeight: number): boolean {
  return boxes.some((box) => isUsableBox(box) && !isNearFullPageBox(box, pageWidth, pageHeight));
}

function sourceKey(source: VisualRegionSource): string {
  return `${source.type}:${source.index}`;
}

function mergeSources(sources: readonly VisualRegionSource[]): VisualRegionSource[] {
  const seen = new Set<string>();
  const merged: VisualRegionSource[] = [];
  for (const source of sources) {
    const key = sourceKey(source);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(source);
  }
  return merged.sort((a, b) => (a.type === b.type ? a.index - b.index : a.type.localeCompare(b.type)));
}

function mergeCandidates(a: Candidate, b: Candidate): Candidate {
  const box = unionBox(a, b);
  const sources = mergeSources([...a.sources, ...b.sources]);
  const associatedText = mergeAssociatedText([...(a.associatedText ?? []), ...(b.associatedText ?? [])]);
  return {
    ...box,
    kind: a.kind === b.kind ? a.kind : 'mixed',
    priority: Math.max(a.priority, b.priority),
    reason: a.reason === b.reason ? a.reason : `${a.reason}; ${b.reason}`,
    sources,
    ...(associatedText.length > 0 && { associatedText }),
  };
}

function visualScore(candidate: Candidate, totalArea: number): number {
  const ratio = totalArea > 0 ? area(candidate) / totalArea : 0;
  return candidate.priority * 100 + ratio * 20 + Math.min(candidate.sources.length, 50);
}

function finalizeCandidate(candidate: Candidate, pageWidth: number, pageHeight: number): VisualRegion {
  const box = padAndClamp(candidate, pageWidth, pageHeight);
  const totalArea = pageWidth * pageHeight;
  const sources = mergeSources(candidate.sources);
  const associatedText = mergeAssociatedText(candidate.associatedText ?? []);
  return {
    kind: candidate.kind,
    ...box,
    areaRatio: totalArea > 0 ? round3(area(box) / totalArea) : 0,
    sourceCount: sources.length,
    sources: sources.slice(0, MAX_SOURCE_REFS),
    reason: candidate.reason,
    ...(associatedText.length > 0 && { associatedText: associatedText.slice(0, MAX_ASSOCIATED_TEXT) }),
  };
}

function addRasterCandidates(input: BuildVisualRegionsInput, candidates: Candidate[]): void {
  const totalArea = pageArea(input);
  const hasForegroundRaster = hasNonBackgroundBox(input.imageBoxes, input.pageWidth, input.pageHeight);
  for (const [index, box] of input.imageBoxes.entries()) {
    if (!isUsableBox(box)) continue;
    const ratio = areaRatio(box, totalArea);
    if (hasForegroundRaster && isNearFullPageBox(box, input.pageWidth, input.pageHeight)) continue;
    const spansWidePage = box.width >= input.pageWidth * 0.3 || box.height >= input.pageHeight * 0.3;
    if (ratio < MIN_IMAGE_AREA_RATIO && !spansWidePage) continue;
    candidates.push({
      ...box,
      kind: 'raster',
      priority: 4,
      reason: `raster image covers ${(ratio * 100).toFixed(1)}% of the page`,
      sources: [{ type: 'imageBox', index }],
    });
  }
}

function clusterVectorBoxes(
  vectorBoxes: readonly VectorBox[],
  pageWidth: number,
  pageHeight: number,
  skipBackgroundBoxes: boolean,
): Candidate[] {
  const clusters: Candidate[] = [];
  for (const [index, box] of vectorBoxes.entries()) {
    if (!isUsableBox(box)) continue;
    if (skipBackgroundBoxes && isNearFullPageBox(box, pageWidth, pageHeight)) continue;
    const matches: number[] = [];
    for (let i = 0; i < clusters.length; i++) {
      if (touches(clusters[i], box, CLUSTER_GAP_PT)) matches.push(i);
    }
    const next: Candidate = {
      ...box,
      kind: 'vector',
      priority: 2,
      reason: 'cluster of vector drawing operations',
      sources: [{ type: 'vectorBox', index }],
    };
    if (matches.length === 0) {
      clusters.push(next);
      continue;
    }
    let merged = mergeCandidates(clusters[matches[0]], next);
    for (let i = matches.length - 1; i >= 1; i--) {
      merged = mergeCandidates(merged, clusters[matches[i]]);
      clusters.splice(matches[i], 1);
    }
    clusters[matches[0]] = merged;
  }
  return clusters;
}

function addVectorCandidates(input: BuildVisualRegionsInput, candidates: Candidate[]): void {
  if (!input.vectorBoxes || input.vectorBoxes.length === 0) return;
  const totalArea = pageArea(input);
  const skipBackgroundBoxes = hasNonBackgroundBox(input.vectorBoxes, input.pageWidth, input.pageHeight);
  for (const cluster of clusterVectorBoxes(input.vectorBoxes, input.pageWidth, input.pageHeight, skipBackgroundBoxes)) {
    const ratio = areaRatio(cluster, totalArea);
    if (cluster.sources.length < MIN_VECTOR_CLUSTER_SOURCES && ratio < MIN_VECTOR_CLUSTER_AREA_RATIO) continue;
    candidates.push({
      ...cluster,
      reason: `${cluster.sources.length} nearby vector drawing operations`,
    });
  }
}

function addTableCandidates(layout: PageLayout | undefined, candidates: Candidate[]): void {
  for (const [index, table] of (layout?.tables ?? []).entries()) {
    if (!isUsableBox(table)) continue;
    candidates.push({
      x: table.x,
      y: table.y,
      width: table.width,
      height: table.height,
      kind: 'table',
      priority: 3,
      reason: `layout table hint with ${table.rowCount} rows and ${table.columnCount} columns`,
      sources: [{ type: 'layoutTable', index }],
    });
  }
}

function addFormCandidate(formFields: readonly FormField[] | undefined, candidates: Candidate[]): void {
  if (!formFields || formFields.length === 0) return;
  const usableFields = formFields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => isFinitePositiveBox(field));
  if (usableFields.length === 0) return;
  const associatedText = usableFields.flatMap(({ field, index }) =>
    field.label
      ? [
          {
            text: field.label.text,
            relation: 'label' as const,
            x: field.label.x,
            y: field.label.y,
            width: field.label.width,
            height: field.label.height,
            fieldIndex: index,
          },
        ]
      : [],
  );
  const boxes = [
    ...usableFields.map(({ field }) => field),
    ...associatedText.map((label) => ({
      x: label.x,
      y: label.y,
      width: label.width,
      height: label.height,
    })),
  ];
  const box = boxes.slice(1).reduce<BoxLike>((acc, item) => unionBox(acc, item), boxes[0]);
  candidates.push({
    ...box,
    kind: 'form',
    priority: 3,
    reason: `${usableFields.length} interactive form fields in one page region`,
    sources: usableFields.map(({ index }) => ({ type: 'formField', index })),
    ...(associatedText.length > 0 && { associatedText }),
  });
}

function associatedTextKey(text: VisualRegionAssociatedText): string {
  return `${text.relation}:${text.x}:${text.y}:${text.width}:${text.height}:${text.text}`;
}

function mergeAssociatedText(items: readonly VisualRegionAssociatedText[]): VisualRegionAssociatedText[] {
  const seen = new Set<string>();
  const merged: VisualRegionAssociatedText[] = [];
  for (const item of items) {
    const key = associatedTextKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged.sort((a, b) => a.y - b.y || a.x - b.x);
}

function normalizeAssociatedText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function horizontalOverlapRatio(a: BoxLike, b: BoxLike): number {
  const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  return Math.max(0, overlap) / Math.max(1, Math.min(a.width, b.width));
}

function captionScore(candidate: Candidate, textBox: BoxLike): number | undefined {
  const captionBottom = textBox.y + textBox.height;
  const regionBottom = candidate.y + candidate.height;
  const belowGap = textBox.y - regionBottom;
  const aboveGap = candidate.y - captionBottom;
  const overlapsVertically = overlapArea(candidate, textBox) > 0;
  const gap = overlapsVertically ? 0 : belowGap >= 0 ? belowGap : aboveGap >= 0 ? aboveGap : Number.POSITIVE_INFINITY;
  if (gap > CAPTION_MAX_GAP_PT) return undefined;

  const overlap = horizontalOverlapRatio(candidate, textBox);
  if (overlap < CAPTION_MIN_HORIZONTAL_OVERLAP_RATIO) return undefined;
  const belowBonus = belowGap >= -4 ? 0 : 12;
  return gap + (1 - overlap) * 30 + belowBonus;
}

function attachCaptionText(candidates: Candidate[], layout: PageLayout | undefined): Candidate[] {
  const blocks = layout?.blocks ?? [];
  if (blocks.length === 0) return candidates;
  return candidates.map((candidate) => {
    const captions = blocks
      .map((block, index) => ({ block, index, text: normalizeAssociatedText(block.text) }))
      .filter(({ block, text }) => !block.repeated && CAPTION_PATTERN.test(text))
      .map(({ block, index, text }) => {
        const associatedText: VisualRegionAssociatedText = {
          text,
          relation: 'caption' as const,
          x: block.x,
          y: block.y,
          width: block.width,
          height: block.height,
          blockIndex: index,
        };
        return {
          text: associatedText,
          score: captionScore(candidate, block),
        };
      })
      .filter((item): item is { text: VisualRegionAssociatedText; score: number } => item.score !== undefined)
      .sort((a, b) => a.score - b.score)
      .slice(0, MAX_ASSOCIATED_TEXT);
    if (captions.length === 0) return candidate;

    const associatedText = mergeAssociatedText([
      ...(candidate.associatedText ?? []),
      ...captions.map((caption) => caption.text),
    ]);
    const box = captions.reduce<BoxLike>((acc, caption) => unionBox(acc, caption.text), candidate);
    return { ...candidate, ...box, associatedText };
  });
}

function dedupeCandidates(candidates: Candidate[]): Candidate[] {
  const deduped: Candidate[] = [];
  for (const candidate of candidates) {
    const index = deduped.findIndex((existing) => overlapOfSmaller(existing, candidate) >= 0.75);
    if (index === -1) deduped.push(candidate);
    else deduped[index] = mergeCandidates(deduped[index], candidate);
  }
  return deduped;
}

export function buildVisualRegions(input: BuildVisualRegionsInput): VisualRegion[] {
  if (input.pageWidth <= 0 || input.pageHeight <= 0) return [];

  const candidates: Candidate[] = [];
  addRasterCandidates(input, candidates);
  addVectorCandidates(input, candidates);
  addTableCandidates(input.layout, candidates);
  addFormCandidate(input.formFields, candidates);

  const totalArea = pageArea(input);
  return attachCaptionText(dedupeCandidates(candidates), input.layout)
    .filter((candidate) => isUsableBox(candidate))
    .sort((a, b) => visualScore(b, totalArea) - visualScore(a, totalArea))
    .slice(0, MAX_REGIONS)
    .map((candidate) => finalizeCandidate(candidate, input.pageWidth, input.pageHeight))
    .sort((a, b) => (Math.abs(a.y - b.y) > 2 ? a.y - b.y : a.x - b.x));
}
