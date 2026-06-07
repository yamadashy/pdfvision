import type {
  FormField,
  ImageBox,
  PageLayout,
  VectorBox,
  VisualRegion,
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
  return {
    ...box,
    kind: a.kind === b.kind ? a.kind : 'mixed',
    priority: Math.max(a.priority, b.priority),
    reason: a.reason === b.reason ? a.reason : `${a.reason}; ${b.reason}`,
    sources,
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
  return {
    kind: candidate.kind,
    ...box,
    areaRatio: totalArea > 0 ? round3(area(box) / totalArea) : 0,
    sourceCount: sources.length,
    sources: sources.slice(0, MAX_SOURCE_REFS),
    reason: candidate.reason,
  };
}

function addRasterCandidates(input: BuildVisualRegionsInput, candidates: Candidate[]): void {
  const totalArea = pageArea(input);
  for (const [index, box] of input.imageBoxes.entries()) {
    if (!isUsableBox(box)) continue;
    const ratio = totalArea > 0 ? area(box) / totalArea : 0;
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

function clusterVectorBoxes(vectorBoxes: readonly VectorBox[]): Candidate[] {
  const clusters: Candidate[] = [];
  for (const [index, box] of vectorBoxes.entries()) {
    if (!isUsableBox(box)) continue;
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
  for (const cluster of clusterVectorBoxes(input.vectorBoxes)) {
    const ratio = totalArea > 0 ? area(cluster) / totalArea : 0;
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
  const box = usableFields.slice(1).reduce<BoxLike>((acc, { field }) => unionBox(acc, field), usableFields[0].field);
  candidates.push({
    ...box,
    kind: 'form',
    priority: 3,
    reason: `${usableFields.length} interactive form fields in one page region`,
    sources: usableFields.map(({ index }) => ({ type: 'formField', index })),
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
  return dedupeCandidates(candidates)
    .filter((candidate) => isUsableBox(candidate))
    .sort((a, b) => visualScore(b, totalArea) - visualScore(a, totalArea))
    .slice(0, MAX_REGIONS)
    .map((candidate) => finalizeCandidate(candidate, input.pageWidth, input.pageHeight))
    .sort((a, b) => (Math.abs(a.y - b.y) > 2 ? a.y - b.y : a.x - b.x));
}
