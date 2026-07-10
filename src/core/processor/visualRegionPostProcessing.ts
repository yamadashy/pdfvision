import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PageResult, RenderedContentBox, VisualRegion } from '../../types/index.js';
import { markPageEdgeChromeBlocks, markRepeatedBlocks } from '../layout/index.js';
import { runParallel } from '../runtime/parallel.js';
import { type BuildVisualRegionsInput, buildVisualRegions } from '../visualRegions/index.js';
import { createFlatRenderPathResolver } from './flatRenderPaths.js';

const BLANK_REGION_RENDER_THRESHOLD = 0.001;
const FULL_PAGE_REGION_AREA_RATIO_THRESHOLD = 0.9;

interface ApplyVisualRegionPostProcessingOptions {
  pages: PageResult[];
  layoutEnabled: boolean;
  visualRegionsEnabled: boolean;
  renderVisualRegions: boolean;
  visualRegionInputsByPage: ReadonlyMap<number, BuildVisualRegionsInput>;
  renderContentBoxesByPage: ReadonlyMap<number, RenderedContentBox>;
  doc: PDFDocumentProxy;
  imagesDir: string | null;
  /** True when `imagesDir` is a user-supplied `--render-output` dir (flat
   *  layout, shared across PDFs) rather than the per-PDF cache hierarchy.
   *  Region crops must then go through the collision-safe path resolver
   *  with disk reuse off — a same-named PNG there may belong to a
   *  different PDF. */
  flatImagesDir: boolean;
  renderScale?: number;
  onWarning?: (message: string) => void;
}

export async function applyVisualRegionPostProcessing({
  pages,
  layoutEnabled,
  visualRegionsEnabled,
  renderVisualRegions,
  visualRegionInputsByPage,
  renderContentBoxesByPage,
  doc,
  imagesDir,
  flatImagesDir,
  renderScale,
  onWarning,
}: ApplyVisualRegionPostProcessingOptions): Promise<void> {
  // Chrome detection has to wait until every selected page is populated,
  // since most chrome needs cross-page evidence. Run it on public layout
  // when --layout is on and on the internal layout used by visualRegions
  // otherwise, so caption association can suppress repeated chrome text
  // without exposing pages[].layout.
  if (layoutEnabled || visualRegionsEnabled) {
    const pagesForRepeated = pages.map((page) => {
      const layout = page.layout ?? visualRegionInputsByPage.get(page.page)?.layout;
      return layout ? { ...page, layout } : page;
    });
    markRepeatedBlocks(pagesForRepeated);
    markPageEdgeChromeBlocks(pagesForRepeated);
  }

  if (visualRegionsEnabled) {
    for (const page of pages) {
      const input = visualRegionInputsByPage.get(page.page);
      page.visualRegions = input
        ? buildVisualRegions({
            ...input,
            visualStatus: page.quality.visualStatus,
            nativeTextStatus: page.quality.nativeTextStatus,
            renderContentRatio: page.renderContentRatio,
            renderedContentBox: renderContentBoxesByPage.get(page.page),
          }).map((region, index) => ({
            ...region,
            id: `p${page.page}-vr${index}`,
          }))
        : [];
    }
  }

  if (!renderVisualRegions) return;
  const jobs = pages.flatMap((page) => (page.visualRegions ?? []).map((region) => ({ page, region })));
  if (jobs.length === 0) return;

  const { renderPageWithStats } = await import('../renderer/index.js');
  // Flat --render-output: pre-resolve collision-safe paths for every crop
  // (sequentially, before the parallel renders race existsSync) and turn
  // off disk reuse. Otherwise a pre-existing PNG with the same
  // page+region name — written by a DIFFERENT PDF into the shared dir —
  // would be handed back as this document's crop.
  const flatOutputPaths = flatImagesDir
    ? (() => {
        const resolvePath = createFlatRenderPathResolver(imagesDir as string, onWarning);
        return jobs.map(({ page, region }) => resolvePath(page.page, region));
      })()
    : undefined;
  await runParallel(jobs, async ({ page, region }, i) => {
    const rendered = await renderPageWithStats(
      doc,
      page.page,
      imagesDir as string,
      renderScale,
      region,
      flatOutputPaths ? { outputPath: flatOutputPaths[i], reuse: false } : undefined,
    );
    region.image = rendered.path;
    region.renderContentRatio = rendered.contentRatio;
    if (rendered.renderedContentBox) region.renderedContentBox = rendered.renderedContentBox;
  });

  applyFullPageBlankRegionEvidence(pages);
}

function applyFullPageBlankRegionEvidence(pages: PageResult[]): void {
  for (const page of pages) {
    if (!page.visualRegions || page.visualRegions.length === 0) continue;
    const blankFullPageRegions = page.visualRegions.filter(isBlankFullPageRenderedRegion);
    if (blankFullPageRegions.length === 0) continue;

    if (page.renderContentRatio === undefined) {
      page.renderContentRatio = Math.max(...blankFullPageRegions.map((region) => region.renderContentRatio ?? 0));
    }
    page.visualRegions = page.visualRegions.filter((region) => !isBlankFullPageRenderedRegion(region));
  }
}

function isBlankFullPageRenderedRegion(region: VisualRegion): boolean {
  if (region.renderContentRatio === undefined) return false;
  return (
    region.areaRatio >= FULL_PAGE_REGION_AREA_RATIO_THRESHOLD &&
    region.renderContentRatio <= BLANK_REGION_RENDER_THRESHOLD
  );
}
