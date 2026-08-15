import { readFile } from 'node:fs/promises';
import { formatPageRange, parsePageRangeWithSkipped } from '../../core/options/pageRange.js';
import { processDocument } from '../../core/processor.js';
import { formatBox } from '../../output/markdown/helpers.js';
import { formatPhysicalSize } from '../../output/markdown/overview.js';
import type { PageResult, RenderRegion } from '../../types/index.js';
import { MAX_IMAGE_EDGE_PX, MAX_RENDER_PAGES, MAX_TOTAL_IMAGE_BYTES } from '../limits.js';
import { forgetRefs, lookupRef, type RefTarget, regionRef, rememberRef } from '../refs.js';
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
const MAX_SCALE = 4;
/**
 * Below this a full page cannot be rasterised into the image budget at
 * all — 20x reduction already yields nothing a model can read, and the
 * budget is the point: the byte cap runs after the PNG exists, so it
 * cannot prevent the allocation. Such a page is refused with the call
 * that does work instead.
 */
const MIN_SCALE = 0.05;
/**
 * Below this the page is being shrunk so far that the text will not be
 * legible. It is not a floor — a floor would let an oversized page blow
 * the pixel budget, which is the thing the budget exists to prevent —
 * but crossing it is worth saying out loud, because the recovery is a
 * `region` rather than a bigger raster the server will not produce.
 */
const READABLE_MIN_SCALE = 0.5;

/**
 * No `scale` parameter is exposed. Vision models downsample past roughly
 * 1568px on the longest edge, so a bigger raster buys payload rather than
 * detail, and a free scale knob invites 4x full-page renders that blow
 * host image limits. When a render is too small to read, the correct
 * recovery is a smaller `region` — which is also the recovery that
 * produces a genuinely sharper image.
 */
/** Coordinates are quoted back for the caller to paste, so keep them short. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function scaleFor(longestEdgeUnits: number): number {
  if (!Number.isFinite(longestEdgeUnits) || longestEdgeUnits <= 0) return 2;
  return Math.min(MAX_SCALE, MAX_IMAGE_EDGE_PX / longestEdgeUnits);
}

function toRegion(values: readonly number[]): RenderRegion {
  const [x, y, width, height] = values;
  // `region` is typed `number[]`, so a `typeof` test never fires. NaN,
  // Infinity and a zero width do get through, and a zero width sends
  // `scaleFor` down its fallback and fails deep in the rasteriser with a
  // message that says nothing about the argument that caused it.
  if (values.length !== 4 || [x, y, width, height].some((value) => !Number.isFinite(value))) {
    throw new Error('`region` must be [x, y, width, height] — four finite numbers in raw page-view units.');
  }
  const [rx, ry, rw, rh] = values as [number, number, number, number];
  if (rx < 0 || ry < 0 || rw <= 0 || rh <= 0) {
    throw new Error('`region` needs non-negative `x`/`y` and positive `width`/`height`.');
  }
  return { x: rx, y: ry, width: rw, height: rh };
}

interface PendingRef {
  ref: string;
  target: RefTarget;
}

/**
 * Collects rather than files: the ref set for a source is replaced in one
 * step once the whole response is known to be deliverable, so a render
 * that mints nothing cannot retire the handles it was called with.
 */
function appendVisualRegions(lines: string[], page: PageResult, pending: PendingRef[]): void {
  const regions = page.visualRegions ?? [];
  if (regions.length === 0) return;
  lines.push('', `Visual regions on page ${page.page} — pass a ref back to zoom:`);
  for (const [index, region] of regions.entries()) {
    const ref = regionRef(page.page, index);
    const bbox = { x: region.x, y: region.y, width: region.width, height: region.height };
    pending.push({ ref, target: { page: page.page, region: bbox, origin: `${region.kind} region` } });
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
  let refOrigin: string | undefined;

  if (input.ref !== undefined) {
    // A ref already carries a page and a region, so anything alongside it
    // was going to be dropped in silence — and a leftover `ref` in a reused
    // call template then answers for a page the caller never asked about.
    const ignored = [
      ...(input.pages !== undefined ? ['`pages`'] : []),
      ...(input.region !== undefined ? ['`region`'] : []),
    ];
    if (ignored.length > 0) {
      throw new Error(
        `\`ref\` already names its own page and region, so ${ignored.join(' and ')} cannot also apply. Drop ${ignored.join(' and ')} to render the ref, or drop \`ref\` to render ${ignored.join(' and ')} as given.`,
      );
    }
    const target = lookupRef(input.source, input.ref);
    if (!target) {
      throw new Error(
        `Unknown ref "${input.ref}" for this source. Its refs come from the last search_pdf or full-page render_pdf for it, and a later one of those replaces them — re-run that call, or pass \`pages\` and \`region\` directly.`,
      );
    }
    pages = String(target.page);
    region = target.region;
    refOrigin = target.origin;
  } else if (input.region !== undefined) {
    region = toRegion(input.region);
  }

  if (pages === undefined) {
    throw new Error('Pass `pages` (e.g. "3" or "1-4"), or a `ref` from a previous search_pdf / render_pdf response.');
  }

  const probe = await processDocument(resolved.filePath, { ...base, pages: '1' });
  const { pages: selected, skipped, skippedTruncated } = parsePageRangeWithSkipped(pages, probe.totalPages);
  if (selected.length > MAX_RENDER_PAGES) {
    throw new Error(
      `render_pdf renders at most ${MAX_RENDER_PAGES} pages per call (requested ${selected.length}). Split the range, or use search_pdf to find the page that matters.`,
    );
  }
  if (region && selected.length !== 1) {
    throw new Error('A region render is single-page: `pages` must select exactly one page.');
  }

  // Measure before rasterising: the scale that fits the pixel budget
  // depends on the page (or region) size, and pdfvision needs it up
  // front. A region carries its own size but not its page's UserUnit, so
  // the measuring pass runs either way — the extraction is cached, and
  // guessing 1 here is how a `/UserUnit 10` page renders ten times over
  // the budget. Rendered pixels are raw units x UserUnit x scale.
  const sized = await processDocument(resolved.filePath, { ...base, pages });
  // Per page, not the largest raw edge times the largest UserUnit: those
  // two maxima can belong to different pages, and their product is an
  // edge no raster in the request actually has — which would shrink every
  // image in the batch to fit a page that does not exist.
  const effectiveEdge = (page: PageResult): number => Math.max(page.width, page.height) * (page.userUnit ?? 1);
  const widest = sized.pages.reduce((a, b) => (effectiveEdge(a) >= effectiveEdge(b) ? a : b));
  const longestEdge = region
    ? Math.max(region.width, region.height) * (widest.userUnit ?? 1)
    : Math.max(...sized.pages.map(effectiveEdge));

  const scale = scaleFor(longestEdge);
  if (scale < MIN_SCALE) {
    throw new Error(
      `Page ${widest.page} is ${Math.round(longestEdge)} physical points on its longest edge, ${
        region ? 'and even this region cannot' : 'so it cannot'
      } be rasterised inside the image budget. ${
        region ? 'Pass a smaller `region`' : 'Pass a `region`'
      } — coordinates are raw page-view units, and the whole page is [0, 0, ${round2(widest.width)}, ${round2(widest.height)}].`,
    );
  }
  const result = await processDocument(resolved.filePath, {
    ...base,
    pages,
    render: true,
    renderScale: scale,
    renderRegion: region,
    // Only meaningful for a full page: a region render is already the
    // answer to "which part of this page", so re-listing crop targets
    // inside it is noise.
    visualRegions: region === undefined,
  });

  // Report what was rendered, not what was asked for: `pages: "1-2"` on a
  // one-page document silently drops page 2, and echoing the request back
  // would claim an image the response does not carry.
  const lines: string[] = [
    `# ${result.file} — rendered ${region ? `region ${formatBox(region)} of ` : ''}page(s) ${formatPageRange(selected)}`,
  ];
  if (skipped.length > 0) {
    lines.push(
      '',
      `_\`pages\` "${pages}" also named ${formatPageRange(skipped)}${skippedTruncated ? ' and beyond' : ''}, past the end of this ${probe.totalPages}-page document._`,
    );
  }
  if (scale < READABLE_MIN_SCALE) {
    lines.push(
      '',
      `_This page is ${Math.round(longestEdge)} physical points on its longest edge, so fitting the image budget shrank it ${(1 / scale).toFixed(1)}x below normal — text may be unreadable. Render a \`region\` of it instead._`,
    );
  }
  // Refs are renumbered from `p1m1` by every call that files a new set, so
  // one held over from an earlier search can resolve to a later call's
  // result. Naming what it resolved to is what lets the caller notice.
  if (refOrigin) lines.push('', `_Ref \`${input.ref}\` → ${refOrigin}._`);
  const images: ToolBlock[] = [];
  const pending: PendingRef[] = [];
  let bytesUsed = 0;

  // Read every PNG before anything is emitted or any ref is filed: the
  // reads are the last thing that can fail, and a failure after the ref
  // set was replaced would take the previous response's still-valid refs
  // with it while returning nothing in their place.
  const rendered = new Map<number, Buffer>();
  for (const page of result.pages) {
    if (page.image) rendered.set(page.page, await readFile(page.image));
  }

  for (const page of result.pages) {
    lines.push('', `## Page ${page.page}`, '', `_${describePage(page)}_`);
    const data = rendered.get(page.page);
    if (!data) {
      lines.push('', '_Render produced no image for this page._');
      continue;
    }
    if (bytesUsed + data.byteLength > MAX_TOTAL_IMAGE_BYTES) {
      lines.push(
        '',
        `[pdfvision] Image for page ${page.page} omitted at the ${Math.round(MAX_TOTAL_IMAGE_BYTES / 1024 / 1024)} MB response budget. Render it in its own call, or zoom a region.`,
      );
      continue;
    }
    bytesUsed += data.byteLength;
    // Name the page immediately before its image. The text sections and
    // the image blocks travel separately, so positional order was the
    // only thing tying them together — and one image dropped at the byte
    // budget shifts every pairing after it.
    images.push(textBlock(`Page ${page.page}:`), {
      type: 'image',
      mimeType: 'image/png',
      data: data.toString('base64'),
    });
    if (region === undefined) appendVisualRegions(lines, page, pending);
  }

  // A response replaces this source's ref set only when it files a new one.
  // A full-page render mints visual-region refs and genuinely supersedes
  // what came before; a region render mints nothing — and every
  // `ref`-driven render is one, since a ref carries a region — so the set
  // it was drawn from stays live. Otherwise rendering the first of N
  // search hits would destroy the other N-1. Forgetting and remembering
  // together also keeps a full page that happens to have no detected
  // visual region from clearing the set and filing nothing in its place.
  if (pending.length > 0) {
    forgetRefs(input.source);
    for (const { ref, target } of pending) rememberRef(input.source, ref, target);
  }

  return toolResult(lines.join('\n'), images.length > 0 ? [textBlock('Rendered page images follow.'), ...images] : []);
}
