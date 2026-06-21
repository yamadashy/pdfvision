import type { DocumentResult, PageResult } from '../../types/index.js';
import { escapeTableCell, jsActionCount } from './helpers.js';
import { structureNodeCount } from './structure.js';

/** "595×842" — drops trailing .00 so integer dimensions stay readable. */
export function formatSize(page: PageResult): string {
  const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  return `${trim(page.width)}×${trim(page.height)}`;
}

export function appendOverview(lines: string[], result: DocumentResult): void {
  if (result.pages.length <= 1) return;

  const showBlocks = result.pages.some((p) => p.layout !== undefined);
  const showNonPrint = result.pages.some((p) => p.nonPrintableCount > 0);
  const showRender = result.pages.some((p) => p.renderContentRatio !== undefined);
  const showRotation = result.pages.some((p) => p.rotation !== undefined);
  const showVectors = result.pages.some((p) => p.vectorCount > 0);
  const showVectorBoxes = result.pages.some((p) => p.vectorBoxes !== undefined);
  const showFormFields = result.pages.some((p) => p.formFields !== undefined);
  const showLinks = result.pages.some((p) => p.links !== undefined);
  const showAnnotations = result.pages.some((p) => p.annotations !== undefined);
  const showStructure = result.pages.some((p) => p.structure !== undefined);
  const showPageJsActions = result.pages.some((p) => p.jsActions !== undefined);
  const showVisualRegions = result.pages.some((p) => p.visualRegions !== undefined);
  const showPageLabels = result.pages.some((p) => p.pageLabel !== undefined);
  const showWarnings = result.pages.some((p) => p.warnings && p.warnings.length > 0);
  const showMatches = result.pages.some((p) => p.matches !== undefined);

  lines.push('');
  lines.push('## Overview');
  lines.push('');
  lines.push(
    `| Page |${showPageLabels ? ' Label |' : ''} Chars | Images | Coverage |${showNonPrint ? ' NonPrint |' : ''}${showRender ? ' Render |' : ''} Size (pt) |${showRotation ? ' Rotation |' : ''}${showVectors ? ' Vectors |' : ''}${showVectorBoxes ? ' VectorBoxes |' : ''}${showVisualRegions ? ' VisualRegions |' : ''}${showBlocks ? ' Blocks |' : ''}${showWarnings ? ' Warnings |' : ''}${showMatches ? ' Matches |' : ''}${showFormFields ? ' FormFields |' : ''}${showLinks ? ' Links |' : ''}${showAnnotations ? ' Annotations |' : ''}${showStructure ? ' Structure |' : ''}${showPageJsActions ? ' JS Actions |' : ''}`,
  );
  lines.push(
    `| ---: |${showPageLabels ? ' --- |' : ''} ---: | ---: | ---: |${showNonPrint ? ' ---: |' : ''}${showRender ? ' ---: |' : ''} ---: |${showRotation ? ' ---: |' : ''}${showVectors ? ' ---: |' : ''}${showVectorBoxes ? ' ---: |' : ''}${showVisualRegions ? ' ---: |' : ''}${showBlocks ? ' ---: |' : ''}${showWarnings ? ' ---: |' : ''}${showMatches ? ' ---: |' : ''}${showFormFields ? ' ---: |' : ''}${showLinks ? ' ---: |' : ''}${showAnnotations ? ' ---: |' : ''}${showStructure ? ' ---: |' : ''}${showPageJsActions ? ' ---: |' : ''}`,
  );
  for (const page of result.pages) {
    appendOverviewRow(lines, page, {
      showPageLabels,
      showNonPrint,
      showRender,
      showRotation,
      showVectors,
      showVectorBoxes,
      showVisualRegions,
      showBlocks,
      showWarnings,
      showMatches,
      showFormFields,
      showLinks,
      showAnnotations,
      showStructure,
      showPageJsActions,
    });
  }
}

interface OverviewColumns {
  showPageLabels: boolean;
  showNonPrint: boolean;
  showRender: boolean;
  showRotation: boolean;
  showVectors: boolean;
  showVectorBoxes: boolean;
  showVisualRegions: boolean;
  showBlocks: boolean;
  showWarnings: boolean;
  showMatches: boolean;
  showFormFields: boolean;
  showLinks: boolean;
  showAnnotations: boolean;
  showStructure: boolean;
  showPageJsActions: boolean;
}

function appendOverviewRow(lines: string[], page: PageResult, columns: OverviewColumns): void {
  const coveragePct = Math.round(page.textCoverage * 100);
  const pageLabelCell = columns.showPageLabels ? ` ${escapeTableCell(page.pageLabel ?? '')} |` : '';
  const nonPrintPct = Math.round(page.nonPrintableRatio * 100);
  const nonPrintCell = columns.showNonPrint
    ? ` ${nonPrintPct === 0 && page.nonPrintableCount > 0 ? '<1%' : `${nonPrintPct}%`} |`
    : '';
  const renderCell = columns.showRender
    ? ` ${page.renderContentRatio !== undefined ? `${(page.renderContentRatio * 100).toFixed(2)}%` : '—'} |`
    : '';
  const rotationCell = columns.showRotation ? ` ${page.rotation !== undefined ? `${page.rotation}°` : '—'} |` : '';
  const vectorsCell = columns.showVectors ? ` ${page.vectorCount} |` : '';
  const vectorBoxesCell = columns.showVectorBoxes ? ` ${page.vectorBoxes?.length ?? 0} |` : '';
  const visualRegionsCell = columns.showVisualRegions ? ` ${page.visualRegions?.length ?? 0} |` : '';
  const blocksCell = columns.showBlocks ? ` ${page.layout?.blocks.length ?? 0} |` : '';
  const warningsCell = columns.showWarnings ? ` ${page.warnings?.length ?? 0} |` : '';
  const matchesCell = columns.showMatches ? ` ${page.matches?.length ?? 0} |` : '';
  const formFieldsCell = columns.showFormFields ? ` ${page.formFields?.length ?? 0} |` : '';
  const linksCell = columns.showLinks ? ` ${page.links?.length ?? 0} |` : '';
  const annotationsCell = columns.showAnnotations ? ` ${page.annotations?.length ?? 0} |` : '';
  const structureCell = columns.showStructure ? ` ${structureNodeCount(page.structure)} |` : '';
  const jsActionsCell = columns.showPageJsActions ? ` ${jsActionCount(page.jsActions)} |` : '';
  lines.push(
    `| ${page.page} |${pageLabelCell} ${page.charCount} | ${page.imageCount} | ${coveragePct}% |${nonPrintCell}${renderCell} ${formatSize(page)} |${rotationCell}${vectorsCell}${vectorBoxesCell}${visualRegionsCell}${blocksCell}${warningsCell}${matchesCell}${formFieldsCell}${linksCell}${annotationsCell}${structureCell}${jsActionsCell}`,
  );
}
