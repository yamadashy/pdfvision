import { readFile } from 'node:fs/promises';
import { parsePageRange } from '../../core/options/pageRange.js';
import { processDocument } from '../../core/processor.js';
import { formatBox } from '../../output/markdown/helpers.js';
import { formatPhysicalSize } from '../../output/markdown/overview.js';
import type { PageResult, RenderRegion } from '../../types/index.js';
import { MAX_IMAGE_EDGE_PX, MAX_RENDER_PAGES, MAX_TOTAL_IMAGE_BYTES } from '../limits.js';
import { lookupRef, regionRef, rememberRef } from '../refs.js';
import { type ToolBlock, type ToolResult, textBlock, toolResult } from '../result.js';
import { resolveSource } from '../source.js';

export interface RenderPdfInput {
  source: string;
  pages?: string;
  ref?: string;
  region?: number[];
  password?: string;
}

/** pdfvision rejects a scale outside (0, 4]; 4x is its soft OOM ceiling. */
const MIN_SCALE = 0.5;
const MAX_SCALE = 4;

/**
 * No `scale` parameter is exposed. Vision models downsample past roughly
 * 1568px on the longest edge, so a bigger raster buys payload rather than
 * detail, and a free scale knob invites 4x full-page renders that blow
 * host image limits. When a render is too small to read, the correct
 * recovery is a smaller `region` — which is also the recovery that
 * produces a genuinely sharper image.
 */
function scaleFor(longestEdgeUnits: number): number {
  if (!Number.isFinite(longestEdgeUnits) || longestEdgeUnits <= 0) return 2;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, MAX_IMAGE_EDGE_PX / longestEdgeUnits));
}

function toRegion(values: readonly number[]): RenderRegion {
  const [x, y, width, height] = values;
  if (values.length !== 4 || [x, y, width, height].some((value) => typeof value !== 'number')) {
    throw new Error('`region` must be [x, y, width, height] in raw page-view units (top-left origin).');
  }
  return { x: x as number, y: y as number, width: width as number, height: height as number };
}

function appendVisualRegions(lines: string[], page: PageResult, source: string): void {
  const regions = page.visualRegions ?? [];
  if (regions.length === 0) return;
  lines.push('', `Visual regions on page ${page.page} — pass a ref back to zoom:`);
  for (const [index, region] of regions.entries()) {
    const ref = regionRef(page.page, index);
    const bbox = { x: region.x, y: region.y, width: region.width, height: region.height };
    rememberRef(source, ref, { page: page.page, region: bbox, origin: `${region.kind} region` });
    const caption = region.associatedText?.[0]?.text;
    lines.push(
      `- \`${ref}\` ${region.kind}${caption ? ` — "${caption.replace(/\s+/g, ' ').trim().slice(0, 100)}"` : ''} · region ${formatBox(bbox)}`,
    );
  }
}

/**
 * The same density vocabulary the Markdown body uses, trimmed to what
 * matters next to a picture, plus the warning codes themselves — on a
 * render the codes are the reason the caller is looking at all.
 */
function describePage(page: PageResult): string {
  const parts = [
    `chars: ${page.charCount}`,
    `images: ${page.imageCount}`,
    `coverage: ${Math.round(page.textCoverage * 100)}%`,
    `size: ${formatPhysicalSize(page)}`,
  ];
  if (page.quality.nativeTextStatus !== 'ok') parts.push(`native: ${page.quality.nativeTextStatus}`);
  if (page.quality.visualStatus && page.quality.visualStatus !== 'ok') {
    parts.push(`visual: ${page.quality.visualStatus}`);
  }
  const warnings = page.warnings ?? [];
  if (warnings.length > 0) parts.push(`warnings: ${warnings.map((warning) => warning.code).join(', ')}`);
  return parts.join(' · ');
}

export async function renderPdf(input: RenderPdfInput): Promise<ToolResult> {
  const resolved = await resolveSource(input.source);
  const base = { sourceData: resolved.sourceData, password: input.password };

  let pages = input.pages;
  let region: RenderRegion | undefined;

  if (input.ref !== undefined) {
    const target = lookupRef(input.source, input.ref);
    if (!target) {
      throw new Error(
        `Unknown ref "${input.ref}" for this source. Refs come from the most recent search_pdf / render_pdf response in this session — re-run that call, or pass \`pages\` and \`region\` directly.`,
      );
    }
    pages = String(target.page);
    region = target.region;
  } else if (input.region !== undefined) {
    region = toRegion(input.region);
  }

  if (pages === undefined) {
    throw new Error('Pass `pages` (e.g. "3" or "1-4"), or a `ref` from a previous search_pdf / render_pdf response.');
  }

  const probe = await processDocument(resolved.filePath, { ...base, pages: '1' });
  const selected = parsePageRange(pages, probe.totalPages);
  if (selected.length === 0) throw new Error(`\`pages\` "${pages}" selects no page of ${probe.totalPages}.`);
  if (selected.length > MAX_RENDER_PAGES) {
    throw new Error(
      `render_pdf renders at most ${MAX_RENDER_PAGES} pages per call (requested ${selected.length}). Split the range, or use search_pdf to find the page that matters.`,
    );
  }
  if (region && selected.length !== 1) {
    throw new Error('A region render is single-page: `pages` must select exactly one page.');
  }

  // Measure before rasterising: the scale that fits the pixel budget
  // depends on the page (or region) size, and pdfvision needs it up front.
  const sized = await processDocument(resolved.filePath, { ...base, pages });
  const longestEdge = region
    ? Math.max(region.width, region.height)
    : Math.max(...sized.pages.map((page) => Math.max(page.width, page.height)));

  const result = await processDocument(resolved.filePath, {
    ...base,
    pages,
    render: true,
    renderScale: scaleFor(longestEdge),
    renderRegion: region,
    // Only meaningful for a full page: a region render is already the
    // answer to "which part of this page", so re-listing crop targets
    // inside it is noise.
    visualRegions: region === undefined,
  });

  const lines: string[] = [
    `# ${result.file} — rendered ${region ? `region ${formatBox(region)} of ` : ''}page(s) ${pages}`,
  ];
  const images: ToolBlock[] = [];
  let bytesUsed = 0;

  for (const page of result.pages) {
    lines.push('', `## Page ${page.page}`, '', `_${describePage(page)}_`);
    if (!page.image) {
      lines.push('', '_Render produced no image for this page._');
      continue;
    }
    const data = await readFile(page.image);
    if (bytesUsed + data.byteLength > MAX_TOTAL_IMAGE_BYTES) {
      lines.push(
        '',
        `[pdfvision] Image for page ${page.page} omitted at the ${Math.round(MAX_TOTAL_IMAGE_BYTES / 1024 / 1024)} MB response budget. Render it in its own call, or zoom a region.`,
      );
      continue;
    }
    bytesUsed += data.byteLength;
    images.push({ type: 'image', mimeType: 'image/png', data: data.toString('base64') });
    if (region === undefined) appendVisualRegions(lines, page, input.source);
  }

  return toolResult(lines.join('\n'), images.length > 0 ? [textBlock('Rendered page images follow.'), ...images] : []);
}
