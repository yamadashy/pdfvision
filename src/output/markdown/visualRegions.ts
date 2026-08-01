import type { PageResult } from '../../types/index.js';
import { escapeTableCell, formatBox, visualRegionAssociatedText, visualRegionSources } from './helpers.js';

/**
 * `omitEmpty` drops the "the pass ran and found nothing" stanza. The CLI
 * wants it — the user typed a flag and deserves to know the answer was
 * genuinely empty. Callers that request the pass on the user's behalf
 * (the MCP server asks for every page-level pass on every read) would
 * otherwise pay an empty section per page for the privilege.
 */
export function appendVisualRegions(lines: string[], page: PageResult, omitEmpty = false): void {
  if (!page.visualRegions) return;
  if (omitEmpty && page.visualRegions.length === 0) return;

  lines.push('');
  lines.push('### Visual regions');
  if (page.visualRegions.length === 0) {
    lines.push('');
    lines.push('_No crop-ready visual regions found._');
    return;
  }

  lines.push('');
  const showRegionImages = page.visualRegions.some((region) => region.image !== undefined);
  const showAssociatedText = page.visualRegions.some((region) => (region.associatedText?.length ?? 0) > 0);
  const imageHeader = showRegionImages ? ' Image | Render |' : '';
  const imageSep = showRegionImages ? ' --- | ---: |' : '';
  const associatedTextHeader = showAssociatedText ? ' Text |' : '';
  const associatedTextSep = showAssociatedText ? ' --- |' : '';
  lines.push(`| ID | Kind | BBox | Area |${imageHeader}${associatedTextHeader} Sources | Reason |`);
  lines.push(`| --- | --- | --- | ---: |${imageSep}${associatedTextSep} --- | --- |`);
  for (const region of page.visualRegions) {
    const imageCells = showRegionImages
      ? ` ${escapeTableCell(region.image ?? '')} | ${
          region.renderContentRatio !== undefined ? `${(region.renderContentRatio * 100).toFixed(2)}%` : ''
        } |`
      : '';
    const associatedTextCell = showAssociatedText ? ` ${escapeTableCell(visualRegionAssociatedText(region))} |` : '';
    lines.push(
      `| ${escapeTableCell(region.id ?? '')} | ${region.kind} | ${formatBox(region)} | ${(region.areaRatio * 100).toFixed(1)}% |${imageCells}${associatedTextCell} ${escapeTableCell(visualRegionSources(region))} | ${escapeTableCell(region.reason)} |`,
    );
  }
}
