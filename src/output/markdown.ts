import type { DocumentResult, PageResult } from '../types/index.js';
import { appendAnnotations } from './markdown/annotations.js';
import { appendLayers, appendOutline, appendViewer } from './markdown/documentSections.js';
import { appendFormFields } from './markdown/formFields.js';
import { escapeInline, escapeTableCell, jsActionCount } from './markdown/helpers.js';
import { appendLayoutTables } from './markdown/layoutTables.js';
import { appendLinks } from './markdown/links.js';
import { appendOverview, formatSize } from './markdown/overview.js';
import { appendJavaScriptActions, appendOcr, appendPageImage, appendWarnings } from './markdown/pageArtifacts.js';
import { appendSearchMatches } from './markdown/pageSections.js';
import { appendStructureItem, structureNodeCount } from './markdown/structure.js';
import { appendVisualRegions } from './markdown/visualRegions.js';

/** Options that influence the Markdown rendering without changing the
 *  underlying `DocumentResult`. JSON / XML formatters don't need them
 *  because they already expose the same metadata (e.g. `repeated: true`)
 *  for downstream consumers to filter themselves; Markdown is read by
 *  humans / LLMs that benefit from the filtering being pre-applied. */
export interface MarkdownOptions {
  /** Drop blocks flagged `repeated: true` (running header / footer /
   *  page number, etc.) from the per-page body. Requires the document
   *  to have been extracted with `layout: true`; throws otherwise so
   *  silent no-ops don't mask a misconfigured call. */
  stripRepeated?: boolean;
}

function layoutBody(page: PageResult, filterRepeated: boolean): string {
  return (page.layout?.blocks ?? [])
    .filter((b) => !filterRepeated || !b.repeated)
    .map((b) => b.text)
    .join('\n\n');
}

/** Body text for a page: either the pdf.js-derived `page.text` (default),
 *  or a layout-driven rebuild when repeated chrome must be stripped or
 *  when vertical CJK stacks are present. The latter avoids Markdown
 *  showing `縦\n書\nき` even though the layout pass has already recovered
 *  the human-readable `縦書き` block. */
function pageBody(page: PageResult, options: MarkdownOptions): string {
  if (!options.stripRepeated) {
    if (page.layout?.blocks.some((b) => b.writingMode === 'vertical')) return layoutBody(page, false);
    // When the warning pass established that the native stream order
    // diverges from the visual reading order (magazine-style frames
    // emitted out of order), the layout rebuild is the human-faithful
    // body — raw page.text would bury the page title mid-stream.
    if (page.layout && page.warnings?.some((w) => w.code === 'reading_order_divergence')) {
      return layoutBody(page, false);
    }
    return page.text;
  }
  if (!page.layout) {
    // Caller asked to strip repeated chrome but the document carries no
    // layout — `repeated: true` is only set during the cross-page
    // layout pass, so there is no way to filter without it. Fail loud
    // rather than silently emitting the unfiltered text.
    throw new Error('stripRepeated requires layout extraction (pass layout: true to processDocument)');
  }
  // Rebuild the body from non-repeated blocks. Use double-newline
  // separators so consecutive paragraphs / heading + body don't run
  // together when their original spacing came from layout gaps rather
  // than literal newlines.
  return layoutBody(page, true);
}

/**
 * Markdown variant of the formatter, intended for agents that already speak
 * Markdown (Claude / Cursor / chat UIs). Each page becomes its own `## Page N`
 * heading so callers can jump or chunk by page, and density metadata stays
 * visible as a single italic line to keep the silent-failure signal close to
 * the text.
 */
export function formatMarkdown(result: DocumentResult, options: MarkdownOptions = {}): string {
  const lines: string[] = [];
  lines.push(`# ${result.file}`);
  lines.push('');
  lines.push(`- **Pages:** ${result.totalPages}`);
  if (result.metadata.title) lines.push(`- **Title:** ${result.metadata.title}`);
  if (result.metadata.author) lines.push(`- **Author:** ${result.metadata.author}`);
  if (result.metadata.subject) lines.push(`- **Subject:** ${result.metadata.subject}`);
  if (result.metadata.creator) lines.push(`- **Creator:** ${result.metadata.creator}`);

  if (result.pageLabels && result.pageLabels.length === 0) {
    lines.push('');
    lines.push('## Page Labels');
    lines.push('');
    lines.push('_No custom page labels found._');
  }

  if (result.viewer) {
    appendViewer(lines, result.viewer);
  }

  if (result.layers) {
    appendLayers(lines, result.layers);
  }

  if (result.attachments) {
    lines.push('');
    lines.push('## Attachments');
    if (result.attachments.length === 0) {
      lines.push('');
      lines.push('_No embedded file attachments found._');
    } else {
      const showPaths = result.attachments.some((attachment) => attachment.path !== undefined);
      lines.push('');
      lines.push(`| Name | Description | Size (bytes) |${showPaths ? ' Path |' : ''}`);
      lines.push(`| --- | --- | ---: |${showPaths ? ' --- |' : ''}`);
      for (const attachment of result.attachments) {
        const pathCell = showPaths ? ` ${escapeTableCell(attachment.path ?? '')} |` : '';
        lines.push(
          `| ${escapeTableCell(attachment.name)} | ${escapeTableCell(attachment.description ?? '')} | ${attachment.size} |${pathCell}`,
        );
      }
    }
  }

  if (result.outline) {
    lines.push('');
    lines.push('## Outline');
    lines.push('');
    if (result.outline.length === 0) {
      lines.push('_No document outline found._');
    } else {
      appendOutline(lines, result.outline);
    }
  }

  appendOverview(lines, result);

  for (const page of result.pages) {
    const coveragePct = Math.round(page.textCoverage * 100);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(`## Page ${page.page}${page.pageLabel !== undefined ? ` (${escapeInline(page.pageLabel)})` : ''}`);
    lines.push('');
    // Inline the nonPrint signal only when the page actually has any
    // non-printable code points (count > 0). Renders the rounded
    // percent, except <1% when sparse so the agent can tell "0 bad
    // chars" from "a few bad chars that round to 0%". Append the raw
    // count in parentheses — for glyph-index PDFs the absolute count
    // (e.g. "1706") is more actionable than the rounded percentage.
    const npPct = Math.round(page.nonPrintableRatio * 100);
    const nonPrintFragment =
      page.nonPrintableCount > 0 ? ` · nonPrint: ${npPct === 0 ? '<1%' : `${npPct}%`} (${page.nonPrintableCount})` : '';
    const pageLabelFragment = page.pageLabel !== undefined ? ` · label: ${escapeInline(page.pageLabel)}` : '';
    // Inline the render-content ratio (when rasterised) so a single-page
    // run still surfaces it without the overview table. Two decimal
    // places match the column format above.
    const renderFragment =
      page.renderContentRatio !== undefined ? ` · render: ${(page.renderContentRatio * 100).toFixed(2)}%` : '';
    const rotationFragment = page.rotation !== undefined ? ` · rotation: ${page.rotation}°` : '';
    const vectorsFragment = page.vectorCount > 0 ? ` · vectors: ${page.vectorCount}` : '';
    const vectorBoxesFragment = page.vectorBoxes !== undefined ? ` · vectorBoxes: ${page.vectorBoxes.length}` : '';
    const layoutTablesFragment =
      (page.layout?.tables?.length ?? 0) > 0 ? ` · tables: ${page.layout?.tables?.length}` : '';
    const visualRegionsFragment =
      page.visualRegions !== undefined ? ` · visualRegions: ${page.visualRegions.length}` : '';
    const formFieldsFragment = page.formFields !== undefined ? ` · formFields: ${page.formFields.length}` : '';
    const linksFragment = page.links !== undefined ? ` · links: ${page.links.length}` : '';
    const annotationsFragment = page.annotations !== undefined ? ` · annotations: ${page.annotations.length}` : '';
    const structureFragment = page.structure !== undefined ? ` · structure: ${structureNodeCount(page.structure)}` : '';
    const jsActionsFragment = page.jsActions !== undefined ? ` · jsActions: ${jsActionCount(page.jsActions)}` : '';
    // Surface the derived quality classification when it's abnormal so
    // the LLM-facing markdown carries the same dispatch signal that
    // JSON / XML expose. `nativeTextStatus === 'ok'` and an `'empty'`
    // page with no visual content are normal flows; the other states
    // are the ones an agent reader needs to react to.
    const showNative = page.quality.nativeTextStatus !== 'ok' && page.quality.nativeTextStatus !== 'empty';
    const nativeFragment = showNative ? ` · native: ${page.quality.nativeTextStatus}` : '';
    const visualFragment =
      page.quality.visualStatus === 'blank' || page.quality.visualStatus === 'sparse'
        ? ` · visual: ${page.quality.visualStatus}`
        : '';
    // Inline the warnings count when the page has any. Mirrors the
    // nonPrint / render fragments — the per-page density line is the
    // first thing an agent sees inside a `## Page N` section, so
    // surfacing the count there gives them an immediate "this page
    // had anomalies" signal before they read the body.
    const warningCount = page.warnings?.length ?? 0;
    const warningsFragment = warningCount > 0 ? ` · warnings: ${warningCount}` : '';
    // Inline the search-hits count when `--search` was on. Present-
    // with-`0` is meaningful here too — the agent knows the page was
    // searched and came back clean, vs the fragment being absent
    // because no search ran. Mirrors the overview Matches column.
    const matchesFragment = page.matches !== undefined ? ` · matches: ${page.matches.length}` : '';
    lines.push(
      `_chars: ${page.charCount} · images: ${page.imageCount} · coverage: ${coveragePct}%${pageLabelFragment}${nonPrintFragment}${renderFragment}${rotationFragment}${vectorsFragment}${vectorBoxesFragment}${layoutTablesFragment}${visualRegionsFragment}${formFieldsFragment}${linksFragment}${annotationsFragment}${structureFragment}${jsActionsFragment}${nativeFragment}${visualFragment}${warningsFragment}${matchesFragment} · size: ${formatSize(page)}pt_`,
    );
    const body = pageBody(page, options);
    if (body) {
      lines.push('');
      lines.push(body);
    }
    if (page.layout?.tables && page.layout.tables.length > 0) {
      appendLayoutTables(lines, page.layout.tables);
    }
    if (page.matches) {
      appendSearchMatches(lines, page.matches);
    }
    if (page.structure !== undefined) {
      lines.push('');
      lines.push('### Structure');
      lines.push('');
      if (page.structure === null) {
        lines.push('_No tagged PDF structure tree found._');
      } else {
        appendStructureItem(lines, page.structure);
      }
    }
    appendVisualRegions(lines, page);
    appendFormFields(lines, page);
    appendJavaScriptActions(lines, page);
    appendLinks(lines, page);
    appendAnnotations(lines, page);
    appendWarnings(lines, page);
    appendOcr(lines, page);
    appendPageImage(lines, page);
  }
  return lines.join('\n');
}
