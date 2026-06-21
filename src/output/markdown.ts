import type { DocumentResult, PageResult } from '../types/index.js';
import { appendLayers, appendOutline, appendViewer } from './markdown/documentSections.js';
import {
  annotationBorder,
  annotationColor,
  annotationFileAttachment,
  annotationFlags,
  annotationShape,
  escapeInline,
  escapeTableCell,
  fieldActions,
  fieldExportValue,
  fieldFlags,
  fieldLabel,
  fieldOptions,
  fieldResetForm,
  fieldValue,
  formatBox,
  formatJavaScriptActions,
  jsActionCount,
  linkTarget,
  visualRegionAssociatedText,
  visualRegionSources,
} from './markdown/helpers.js';
import { appendOverview, formatSize } from './markdown/overview.js';
import { appendStructureItem, structureNodeCount } from './markdown/structure.js';

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
    const vectorsFragment = page.vectorCount > 0 ? ` · vectors: ${page.vectorCount}` : '';
    const vectorBoxesFragment = page.vectorBoxes !== undefined ? ` · vectorBoxes: ${page.vectorBoxes.length}` : '';
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
      `_chars: ${page.charCount} · images: ${page.imageCount} · coverage: ${coveragePct}%${pageLabelFragment}${nonPrintFragment}${renderFragment}${vectorsFragment}${vectorBoxesFragment}${visualRegionsFragment}${formFieldsFragment}${linksFragment}${annotationsFragment}${structureFragment}${jsActionsFragment}${nativeFragment}${visualFragment}${warningsFragment}${matchesFragment} · size: ${formatSize(page)}pt_`,
    );
    const body = pageBody(page, options);
    if (body) {
      lines.push('');
      lines.push(body);
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
    if (page.visualRegions) {
      lines.push('');
      lines.push('### Visual regions');
      if (page.visualRegions.length === 0) {
        lines.push('');
        lines.push('_No crop-ready visual regions found._');
      } else {
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
          const associatedTextCell = showAssociatedText
            ? ` ${escapeTableCell(visualRegionAssociatedText(region))} |`
            : '';
          lines.push(
            `| ${escapeTableCell(region.id ?? '')} | ${region.kind} | ${formatBox(region)} | ${(region.areaRatio * 100).toFixed(1)}% |${imageCells}${associatedTextCell} ${escapeTableCell(visualRegionSources(region))} | ${escapeTableCell(region.reason)} |`,
          );
        }
      }
    }
    if (page.formFields) {
      lines.push('');
      lines.push('### Form fields');
      if (page.formFields.length === 0) {
        lines.push('');
        lines.push('_No interactive form fields found._');
      } else {
        lines.push('');
        const showFieldActions = page.formFields.some((field) => field.actions !== undefined);
        const showFieldReset = page.formFields.some((field) => field.resetForm !== undefined);
        const showExportValue = page.formFields.some((field) => fieldExportValue(field).length > 0);
        lines.push(
          `| Type | Name | Label | Value |${showExportValue ? ' Export |' : ''} Options |${showFieldReset ? ' Reset |' : ''}${showFieldActions ? ' Actions |' : ''} Flags | BBox |`,
        );
        lines.push(
          `| --- | --- | --- | --- |${showExportValue ? ' --- |' : ''} --- |${showFieldReset ? ' --- |' : ''}${showFieldActions ? ' --- |' : ''} --- | --- |`,
        );
        for (const field of page.formFields) {
          const resetCell = showFieldReset ? ` ${escapeTableCell(fieldResetForm(field))} |` : '';
          const actionsCell = showFieldActions ? ` ${escapeTableCell(fieldActions(field))} |` : '';
          const exportCell = showExportValue ? ` ${escapeTableCell(fieldExportValue(field))} |` : '';
          lines.push(
            `| ${field.type} | ${escapeTableCell(field.name)} | ${escapeTableCell(fieldLabel(field))} | ${escapeTableCell(fieldValue(field))} |${exportCell} ${escapeTableCell(fieldOptions(field))} |${resetCell}${actionsCell} ${escapeTableCell(fieldFlags(field))} | ${formatBox(field)} |`,
          );
        }
      }
    }
    if (page.jsActions) {
      lines.push('');
      lines.push('### JavaScript actions');
      lines.push('');
      lines.push(`- ${escapeInline(formatJavaScriptActions(page.jsActions))}`);
    }
    if (page.links) {
      lines.push('');
      lines.push('### Links');
      if (page.links.length === 0) {
        lines.push('');
        lines.push('_No clickable links found._');
      } else {
        lines.push('');
        lines.push('| Type | Text | Target | TargetPage | BBox |');
        lines.push('| --- | --- | --- | ---: | --- |');
        for (const link of page.links) {
          lines.push(
            `| ${link.type} | ${escapeTableCell(link.text ?? '')} | ${escapeTableCell(linkTarget(link.target))} | ${link.page ?? ''} | ${formatBox(link)} |`,
          );
        }
      }
    }
    if (page.annotations) {
      lines.push('');
      lines.push('### Annotations');
      if (page.annotations.length === 0) {
        lines.push('');
        lines.push('_No non-link annotations found._');
      } else {
        lines.push('');
        lines.push('| Type | Name | Contents | Title | File | Flags | BBox | Color | Border | Shape | QuadBoxes |');
        lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: |');
        for (const annotation of page.annotations) {
          lines.push(
            `| ${escapeTableCell(annotation.subtype)} | ${escapeTableCell(annotation.name ?? '')} | ${escapeTableCell(annotation.contents ?? '')} | ${escapeTableCell(annotation.title ?? '')} | ${escapeTableCell(annotationFileAttachment(annotation))} | ${annotationFlags(annotation)} | ${formatBox(annotation)} | ${annotationColor(annotation)} | ${escapeTableCell(annotationBorder(annotation))} | ${escapeTableCell(annotationShape(annotation))} | ${annotation.quadBoxes?.length ?? 0} |`,
          );
        }
      }
    }
    if (page.warnings && page.warnings.length > 0) {
      // Per-warning blockquote section. Placed after the body so the
      // agent reads the page content first and only sees the anomaly
      // list when it specifically looks for problems. Blockquote `>`
      // is visually distinct from body paragraphs and parses cleanly
      // in both plain Markdown viewers and LLM contexts.
      lines.push('');
      lines.push('### Warnings');
      lines.push('');
      for (const w of page.warnings) {
        // Severity goes first as a bold label so a quick scan
        // separates `error` (likely render-broken / data-integrity)
        // from `warning` (typesetting concern). Code follows in
        // parentheses for the machine-readable handle.
        lines.push(`> **${w.severity}** (${w.code}): ${w.message}`);
      }
    }
    if (page.ocr) {
      // OCR sits below the native text so the agent reads pdfjs first
      // and only consults OCR when text is empty/garbled. The label
      // surfaces lang + confidence so a low-confidence page is obvious
      // without inspecting the JSON form.
      const confPct = Math.round(page.ocr.confidence * 100);
      lines.push('');
      lines.push(`### OCR (${page.ocr.lang}, confidence ${confPct}%)`);
      if (page.ocr.text) {
        lines.push('');
        lines.push(page.ocr.text);
      }
    }
    if (page.image) {
      lines.push('');
      // Use the <...> link destination form so paths with spaces or
      // parentheses (common with `--render-output ./my (drafts)/`) don't
      // break the image link. Filesystem paths effectively never contain
      // `<` or `>`, so no further escaping is needed.
      lines.push(`![Page ${page.page}](<${page.image}>)`);
    }
  }
  return lines.join('\n');
}
