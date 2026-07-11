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
  /** The user's explicit `--layout` choice. Markdown always computes
   *  layout internally (so the default body is reading-order text and
   *  layout warnings surface), but the *structural* sections — the
   *  per-page `### Layout tables` blocks and the Overview `Blocks` /
   *  `Tables` columns — stay gated behind this flag. Defaults to false. */
  layout?: boolean;
}

function layoutBody(page: PageResult, filterRepeated: boolean): string {
  return (page.layout?.blocks ?? [])
    .filter((b) => !filterRepeated || !b.repeated)
    .map((b) => b.text)
    .join('\n\n');
}

/** Body text for a page. Markdown always runs the layout pass, so the
 *  default body is the layout-rebuilt reading-order text: blocks in
 *  visual reading order, lines within a block joined into paragraphs
 *  instead of the old blank-line-per-physical-line rendering. This also
 *  fixes native stream order that diverges from the visual order
 *  (magazine frames, out-of-stream titles) and vertical CJK stacks —
 *  `page.text` would show `縦\n書\nき` while the block already recovered
 *  the human-readable `縦書き`.
 *
 *  Falls back to `page.text` only when there is no usable layout (e.g. a
 *  scanned page with no native text layer), so nothing is ever lost. */
function pageBody(page: PageResult, options: MarkdownOptions): string {
  if (options.stripRepeated) {
    if (!page.layout) {
      // Caller asked to strip repeated chrome but the document carries no
      // layout — `repeated: true` is only set during the cross-page
      // layout pass, so there is no way to filter without it. Fail loud
      // rather than silently emitting the unfiltered text.
      throw new Error('stripRepeated requires layout extraction (pass layout: true to processDocument)');
    }
    // Rebuild from non-repeated blocks. Double-newline separators keep
    // consecutive paragraphs / heading + body from running together.
    return layoutBody(page, true);
  }
  if (page.layout && page.layout.blocks.length > 0) return layoutBody(page, false);
  return page.text;
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
  if (result.attachmentCount !== undefined && result.attachments === undefined) {
    lines.push(
      `- **Attachments:** ${result.attachmentCount} embedded ${result.attachmentCount === 1 ? 'file' : 'files'} (use --attachments)`,
    );
  }
  if (result.outlineCount !== undefined && result.outline === undefined) {
    lines.push(`- **Outline:** ${result.outlineCount} top-level ${result.outlineCount === 1 ? 'entry' : 'entries'}`);
  }

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

  appendOverview(lines, result, { layout: options.layout ?? false });

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
    // Layout tables are structural output: only surfaced when the user
    // explicitly asked for --layout, even though layout is always
    // computed for the default body / warnings.
    const layoutTablesFragment =
      options.layout && (page.layout?.tables?.length ?? 0) > 0 ? ` · tables: ${page.layout?.tables?.length}` : '';
    const visualRegionsFragment =
      page.visualRegions !== undefined ? ` · visualRegions: ${page.visualRegions.length}` : '';
    // Fall back to the detailed-array lengths so library callers that
    // hand-build a DocumentResult (arrays without the scalar counts)
    // still get the fragments, and a flagged run with zero hits keeps
    // its explicit "formFields: 0".
    const formFieldTotal = page.formFieldCount ?? page.formFields?.length;
    const linkTotal = page.linkCount ?? page.links?.length;
    const annotationTotal = page.annotationCount ?? page.annotations?.length;
    const formFieldsFragment = formFieldTotal !== undefined ? ` · formFields: ${formFieldTotal}` : '';
    const linksFragment = linkTotal !== undefined ? ` · links: ${linkTotal}` : '';
    const annotationsFragment = annotationTotal !== undefined ? ` · annotations: ${annotationTotal}` : '';
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
    if (options.layout && page.layout?.tables && page.layout.tables.length > 0) {
      appendLayoutTables(lines, page.layout.tables);
    }
    // Only render the match table for pages that actually matched. A
    // zero-match page under --search used to emit a noisy
    // `### Search matches / _No search matches found._` block on every
    // clean page; the per-page density line already carries `matches: 0`
    // for the "search ran, nothing here" signal.
    if (page.matches && page.matches.length > 0) {
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
