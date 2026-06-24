import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { RenderRegion } from '../../types/index.js';
import { DEFAULT_RENDER_SCALE } from './renderOptions.js';

/** Inputs that determine which cached entry a request maps to. */
export interface CacheKeyInput {
  pages?: string;
  password?: string;
  render?: boolean;
  renderOutput?: string;
  renderScale?: number;
  renderRegion?: RenderRegion;
  renderVisualRegions?: boolean;
  normalize?: boolean;
  geometry?: boolean;
  layout?: boolean;
  imageBoxes?: boolean;
  vectorBoxes?: boolean;
  visualRegions?: boolean;
  formFields?: boolean;
  links?: boolean;
  annotations?: boolean;
  structure?: boolean;
  pageLabels?: boolean;
  attachments?: boolean;
  attachmentOutput?: string;
  outline?: boolean;
  viewer?: boolean;
  layers?: boolean;
  ocr?: boolean;
  ocrLang?: string;
  search?: string | string[];
  searchRegex?: boolean;
  searchCaseSensitive?: boolean;
}

/**
 * Build a deterministic, hashed cache key for the given options.
 *
 * The hash hides the raw `pages` string so user-controlled input cannot
 * traverse outside the cache directory when the key is used as a file
 * name. Format is intentionally a constant ("structured") so text-only
 * vs json-only callers reuse the same cached payload.
 */
export function buildCacheKey(input: CacheKeyInput): string {
  const rasterizes = !!input.render || !!input.ocr || !!input.renderVisualRegions;
  const payload = JSON.stringify({
    pages: input.pages ?? 'all',
    // Bump when the on-disk DocumentResult shape changes so older entries
    // (missing newly-added page fields) are not handed out as fresh results.
    format: 'structured-v130',
    passwordHash:
      input.password !== undefined ? createHash('sha256').update(input.password).digest('hex').slice(0, 16) : null,
    render: !!input.render,
    // Including the resolved render-output dir keeps two invocations with
    // different `--render-output` targets from sharing image paths.
    renderOutput: input.renderOutput ? resolve(input.renderOutput) : null,
    // Different `renderScale` values change `pages[].image` content and
    // `renderContentRatio` (anti-aliasing shifts the histogram); key
    // separately so a 1.5× run doesn't return a cached 2.0× payload.
    // `null` for the off path so non-render extractions still hit a
    // shared slot regardless of the value the caller passed.
    renderScale: rasterizes ? (input.renderScale ?? DEFAULT_RENDER_SCALE) : null,
    // `renderRegion` changes both the PNG content and `renderContentRatio`
    // (cropped pixels → different histogram). Key on the xywh tuple so
    // two regions on the same page get distinct cache entries.
    renderRegion:
      (input.render || input.ocr) && input.renderRegion
        ? `${input.renderRegion.x},${input.renderRegion.y},${input.renderRegion.width},${input.renderRegion.height}`
        : null,
    // Normalized vs raw text are different payloads; key them separately so
    // toggling the flag doesn't return stale text.
    normalize: input.normalize !== false,
    geometry: !!input.geometry,
    layout: !!input.layout,
    imageBoxes: !!input.imageBoxes,
    vectorBoxes: !!input.vectorBoxes,
    visualRegions: !!input.visualRegions || !!input.renderVisualRegions,
    renderVisualRegions: !!input.renderVisualRegions,
    formFields: !!input.formFields,
    links: !!input.links,
    annotations: !!input.annotations,
    structure: !!input.structure,
    pageLabels: !!input.pageLabels,
    attachments: !!input.attachments,
    attachmentOutput: input.attachmentOutput ? resolve(input.attachmentOutput) : null,
    outline: !!input.outline,
    viewer: !!input.viewer,
    layers: !!input.layers,
    // OCR is expensive (tens of seconds for a multi-page scan); always cache
    // it. The lang string is part of the key (whitespace-normalised, order
    // preserved — tesseract treats the first language as primary) so that
    // `eng` and `eng+jpn` don't share a slot, but ` eng + jpn ` and
    // `eng+jpn` do.
    ocr: !!input.ocr,
    ocrLang: input.ocr ? canonicalOcrLang(input.ocrLang) : null,
    // Search results change the structured payload (pages[].matches),
    // so the query list and flags are part of the key. Multi-query
    // order matters (queryIndex on each match is index-stable), so we
    // preserve array order in the key.
    search: input.search !== undefined ? (Array.isArray(input.search) ? input.search : [input.search]) : null,
    searchRegex: !!input.searchRegex,
    searchCaseSensitive: !!input.searchCaseSensitive,
  });
  const hash = createHash('sha256').update(payload).digest('hex').slice(0, 16);
  return `result_${hash}.json`;
}

function canonicalOcrLang(lang: string | undefined): string {
  if (!lang) return 'eng';
  const tokens = lang
    .split('+')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return tokens.length > 0 ? tokens.join('+') : 'eng';
}
