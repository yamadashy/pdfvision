import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PageResult } from '../../types/index.js';
import { markRepeatedBlocks } from '../layout/index.js';
import { runParallel } from '../runtime/parallel.js';
import { type BuildVisualRegionsInput, buildVisualRegions } from '../visualRegions/index.js';

interface ApplyVisualRegionPostProcessingOptions {
  pages: PageResult[];
  layoutEnabled: boolean;
  visualRegionsEnabled: boolean;
  renderVisualRegions: boolean;
  visualRegionInputsByPage: ReadonlyMap<number, BuildVisualRegionsInput>;
  doc: PDFDocumentProxy;
  imagesDir: string | null;
  renderScale?: number;
}

export async function applyVisualRegionPostProcessing({
  pages,
  layoutEnabled,
  visualRegionsEnabled,
  renderVisualRegions,
  visualRegionInputsByPage,
  doc,
  imagesDir,
  renderScale,
}: ApplyVisualRegionPostProcessingOptions): Promise<void> {
  // Repeated-chrome detection has to wait until every selected page is
  // populated, since a single page can't tell its own chrome from its
  // body. Run it on public layout when --layout is on and on the
  // internal layout used by visualRegions otherwise, so
  // caption association can suppress repeated header/footer text
  // without exposing pages[].layout.
  if (layoutEnabled || visualRegionsEnabled) {
    const pagesForRepeated = pages.map((page) => {
      const layout = page.layout ?? visualRegionInputsByPage.get(page.page)?.layout;
      return layout ? { ...page, layout } : page;
    });
    markRepeatedBlocks(pagesForRepeated);
  }

  if (visualRegionsEnabled) {
    for (const page of pages) {
      const input = visualRegionInputsByPage.get(page.page);
      page.visualRegions = input
        ? buildVisualRegions({
            ...input,
            visualStatus: page.quality.visualStatus,
            nativeTextStatus: page.quality.nativeTextStatus,
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
  await runParallel(jobs, async ({ page, region }) => {
    const rendered = await renderPageWithStats(doc, page.page, imagesDir as string, renderScale, region);
    region.image = rendered.path;
    region.renderContentRatio = rendered.contentRatio;
    if (rendered.renderedContentBox) region.renderedContentBox = rendered.renderedContentBox;
  });
}
