import type { DocumentResult, PageResult, PageStructureItem, PageStructureNode } from '../types/index.js';

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

/** "595×842" — drops trailing .00 so integer dimensions stay readable. */
function formatSize(page: PageResult): string {
  const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  return `${trim(page.width)}×${trim(page.height)}`;
}

function escapeTableCell(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function escapeInline(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\n', ' ')
    .replaceAll('\r', ' ')
    .replaceAll('`', '\\`')
    .replaceAll('*', '\\*')
    .replaceAll('_', '\\_')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .replaceAll('|', '\\|');
}

function fieldValue(field: NonNullable<PageResult['formFields']>[number]): string {
  if (field.checked !== undefined) return field.checked ? 'checked' : 'unchecked';
  return field.value ?? '';
}

function annotationColor(annotation: NonNullable<PageResult['annotations']>[number]): string {
  return annotation.color ? annotation.color.join(',') : '';
}

function formatBox(box: { x: number; y: number; width: number; height: number }): string {
  return `${box.x},${box.y},${box.width},${box.height}`;
}

function formatBbox(box: number[]): string {
  return box.join(',');
}

function layoutBody(page: PageResult, filterRepeated: boolean): string {
  return (page.layout?.blocks ?? [])
    .filter((b) => !filterRepeated || !b.repeated)
    .map((b) => b.text)
    .join('\n\n');
}

function outlineLabel(item: NonNullable<DocumentResult['outline']>[number]): string {
  const parts: string[] = [];
  if (item.page !== undefined) parts.push(`p. ${item.page}`);
  if (item.type) parts.push(item.type);
  if (item.target) parts.push(item.target);
  return parts.length > 0
    ? `${escapeInline(item.title)} (${escapeInline(parts.join(' · '))})`
    : escapeInline(item.title);
}

function appendOutline(lines: string[], items: NonNullable<DocumentResult['outline']>, depth = 0): void {
  const indent = '  '.repeat(depth);
  for (const item of items) {
    lines.push(`${indent}- ${outlineLabel(item)}`);
    if (item.items) appendOutline(lines, item.items, depth + 1);
  }
}

function formatViewerValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value);
  return JSON.stringify(value);
}

function appendViewer(lines: string[], viewer: NonNullable<DocumentResult['viewer']>): void {
  lines.push('');
  lines.push('## Viewer');
  lines.push('');
  if (Object.keys(viewer).length === 0) {
    lines.push('_No viewer settings found._');
    return;
  }
  if (viewer.pageMode) lines.push(`- **Page mode:** ${escapeInline(viewer.pageMode)}`);
  if (viewer.pageLayout) lines.push(`- **Page layout:** ${escapeInline(viewer.pageLayout)}`);
  if (viewer.openAction) {
    const parts: string[] = [viewer.openAction.type];
    if (viewer.openAction.page !== undefined) parts.push(`p. ${viewer.openAction.page}`);
    if (viewer.openAction.action) parts.push(viewer.openAction.action);
    if (viewer.openAction.target) parts.push(viewer.openAction.target);
    lines.push(`- **Open action:** ${escapeInline(parts.join(' · '))}`);
  }
  if (viewer.permissions) {
    const allowed = viewer.permissions.allowed.length > 0 ? viewer.permissions.allowed.join(', ') : '(none)';
    lines.push(`- **Permissions:** ${escapeInline(allowed)}`);
  }
  if (viewer.markInfo) {
    lines.push(
      `- **Mark info:** marked=${viewer.markInfo.marked}, userProperties=${viewer.markInfo.userProperties}, suspects=${viewer.markInfo.suspects}`,
    );
  }
  if (viewer.viewerPreferences) {
    const prefs = Object.entries(viewer.viewerPreferences)
      .map(([key, value]) => `${key}=${formatViewerValue(value)}`)
      .join('; ');
    lines.push(`- **Preferences:** ${escapeInline(prefs)}`);
  }
}

function appendLayers(lines: string[], layers: NonNullable<DocumentResult['layers']>): void {
  lines.push('');
  lines.push('## Layers');
  lines.push('');
  if (layers.name) lines.push(`- **Config:** ${escapeInline(layers.name)}`);
  if (layers.creator) lines.push(`- **Creator:** ${escapeInline(layers.creator)}`);
  if (layers.order) lines.push(`- **Panel order:** ${escapeInline(JSON.stringify(layers.order))}`);
  if (layers.groups.length === 0) {
    lines.push('_No PDF layers found._');
    return;
  }
  const showRbGroups = layers.groups.some((layer) => layer.rbGroups !== undefined);
  lines.push('');
  lines.push(`| ID | Name | Visible | Intent | View | Print |${showRbGroups ? ' Radio groups |' : ''}`);
  lines.push(`| --- | --- | --- | --- | --- | --- |${showRbGroups ? ' --- |' : ''}`);
  for (const layer of layers.groups) {
    const rbGroupsCell = showRbGroups ? ` ${escapeTableCell(JSON.stringify(layer.rbGroups ?? []))} |` : '';
    lines.push(
      `| ${escapeTableCell(layer.id)} | ${escapeTableCell(layer.name ?? '')} | ${layer.visible ? 'yes' : 'no'} | ${escapeTableCell(layer.intent?.join(', ') ?? '')} | ${escapeTableCell(layer.usage?.viewState ?? '')} | ${escapeTableCell(layer.usage?.printState ?? '')} |${rbGroupsCell}`,
    );
  }
}

function structureNodeCount(structure: PageStructureNode | null | undefined): number {
  if (!structure) return 0;
  return (
    1 +
    structure.children.reduce((sum, child) => {
      return 'role' in child ? sum + structureNodeCount(child) : sum;
    }, 0)
  );
}

function structureLabel(item: PageStructureItem): string {
  if (!('role' in item)) return `${escapeInline(item.type)} ${escapeInline(item.id)}`;
  const parts = [escapeInline(item.role)];
  if (item.lang) parts.push(`lang=${escapeInline(item.lang)}`);
  if (item.bbox) parts.push(`bbox=${formatBbox(item.bbox)}`);
  if (item.alt) parts.push(`alt=${escapeInline(item.alt)}`);
  if (item.mathML) parts.push(`mathML=${escapeInline(item.mathML)}`);
  return parts.join(' · ');
}

function appendStructureItem(lines: string[], item: PageStructureItem, depth = 0): void {
  lines.push(`${'  '.repeat(depth)}- ${structureLabel(item)}`);
  if ('role' in item) {
    for (const child of item.children) appendStructureItem(lines, child, depth + 1);
  }
}

/** Body text for a page: either the pdf.js-derived `page.text` (default),
 *  or a layout-driven rebuild when repeated chrome must be stripped or
 *  when vertical CJK stacks are present. The latter avoids Markdown
 *  showing `縦\n書\nき` even though the layout pass has already recovered
 *  the human-readable `縦書き` block. */
function pageBody(page: PageResult, options: MarkdownOptions): string {
  if (!options.stripRepeated) {
    if (page.layout?.blocks.some((b) => b.writingMode === 'vertical')) return layoutBody(page, false);
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

  // Overview table: density signal aggregation across the selected pages.
  // Lets an agent eyeball outliers (image-flattened slides, blank pages,
  // unusually dense pages) before scrolling through the body. Skipped for
  // single-page outputs where a one-row table is just noise. The Size
  // column carries width×height in PDF points so portrait-vs-landscape and
  // slide-vs-document layouts are obvious from the same glance.
  if (result.pages.length > 1) {
    // The Blocks column appears only when --layout was on (any page carries
    // a `layout` payload). Lets agents see at a glance how the doc breaks
    // down into structural pieces without scrolling into the body.
    const showBlocks = result.pages.some((p) => p.layout !== undefined);
    // The NonPrint column appears only when at least one page has any
    // non-printable code points (count > 0). Reading `count` instead of
    // `ratio` here catches sparse occurrences that would otherwise
    // round to 0% and hide the column for the whole document.
    const showNonPrint = result.pages.some((p) => p.nonPrintableCount > 0);
    // The Render column appears only when at least one page was rasterised
    // (--render or --ocr). Showing it on every doc would clutter the
    // overview with empty cells for the default text-only flow.
    const showRender = result.pages.some((p) => p.renderContentRatio !== undefined);
    const showVectors = result.pages.some((p) => p.vectorCount > 0);
    const showVectorBoxes = result.pages.some((p) => p.vectorBoxes !== undefined);
    const showFormFields = result.pages.some((p) => p.formFields !== undefined);
    const showLinks = result.pages.some((p) => p.links !== undefined);
    const showAnnotations = result.pages.some((p) => p.annotations !== undefined);
    const showStructure = result.pages.some((p) => p.structure !== undefined);
    const showPageLabels = result.pages.some((p) => p.pageLabel !== undefined);
    // The Warnings column appears only when at least one page carries
    // a non-empty `warnings` array. Like NonPrint / Render, the column
    // only shows up when there's actual signal — otherwise the table
    // grows a column of zeroes for the default extraction.
    const showWarnings = result.pages.some((p) => p.warnings && p.warnings.length > 0);
    // The Matches column appears whenever a search was run (any page
    // carries a `matches` field, even an empty one). Present-with-0
    // is meaningful — tells the agent search ran but this page had
    // no hits, vs the column not appearing at all (search wasn't
    // requested).
    const showMatches = result.pages.some((p) => p.matches !== undefined);
    lines.push('');
    lines.push('## Overview');
    lines.push('');
    lines.push(
      `| Page |${showPageLabels ? ' Label |' : ''} Chars | Images | Coverage |${showNonPrint ? ' NonPrint |' : ''}${showRender ? ' Render |' : ''} Size (pt) |${showVectors ? ' Vectors |' : ''}${showVectorBoxes ? ' VectorBoxes |' : ''}${showBlocks ? ' Blocks |' : ''}${showWarnings ? ' Warnings |' : ''}${showMatches ? ' Matches |' : ''}${showFormFields ? ' FormFields |' : ''}${showLinks ? ' Links |' : ''}${showAnnotations ? ' Annotations |' : ''}${showStructure ? ' Structure |' : ''}`,
    );
    lines.push(
      `| ---: |${showPageLabels ? ' --- |' : ''} ---: | ---: | ---: |${showNonPrint ? ' ---: |' : ''}${showRender ? ' ---: |' : ''} ---: |${showVectors ? ' ---: |' : ''}${showVectorBoxes ? ' ---: |' : ''}${showBlocks ? ' ---: |' : ''}${showWarnings ? ' ---: |' : ''}${showMatches ? ' ---: |' : ''}${showFormFields ? ' ---: |' : ''}${showLinks ? ' ---: |' : ''}${showAnnotations ? ' ---: |' : ''}${showStructure ? ' ---: |' : ''}`,
    );
    for (const page of result.pages) {
      const coveragePct = Math.round(page.textCoverage * 100);
      const pageLabelCell = showPageLabels ? ` ${escapeTableCell(page.pageLabel ?? '')} |` : '';
      // Use `<1%` (instead of the rounded `0%`) when the page has *any*
      // non-printable chars — otherwise sparse occurrences like 2 bad
      // codepoints in a 5000-char body page silently render as `0%` and
      // the column-trigger above looks inconsistent.
      const nonPrintPct = Math.round(page.nonPrintableRatio * 100);
      const nonPrintCell = showNonPrint
        ? ` ${nonPrintPct === 0 && page.nonPrintableCount > 0 ? '<1%' : `${nonPrintPct}%`} |`
        : '';
      const renderCell = showRender
        ? // Two decimals as a percent so the agent sees the difference
          // between blank (0.00%) and sparse-marks (0.10%) — three or more
          // would clutter and reading <0.01% as "blank" is the heuristic.
          ` ${page.renderContentRatio !== undefined ? `${(page.renderContentRatio * 100).toFixed(2)}%` : '—'} |`
        : '';
      const vectorsCell = showVectors ? ` ${page.vectorCount} |` : '';
      const vectorBoxesCell = showVectorBoxes ? ` ${page.vectorBoxes?.length ?? 0} |` : '';
      const blocksCell = showBlocks ? ` ${page.layout?.blocks.length ?? 0} |` : '';
      const warningsCell = showWarnings ? ` ${page.warnings?.length ?? 0} |` : '';
      const matchesCell = showMatches ? ` ${page.matches?.length ?? 0} |` : '';
      const formFieldsCell = showFormFields ? ` ${page.formFields?.length ?? 0} |` : '';
      const linksCell = showLinks ? ` ${page.links?.length ?? 0} |` : '';
      const annotationsCell = showAnnotations ? ` ${page.annotations?.length ?? 0} |` : '';
      const structureCell = showStructure ? ` ${structureNodeCount(page.structure)} |` : '';
      lines.push(
        `| ${page.page} |${pageLabelCell} ${page.charCount} | ${page.imageCount} | ${coveragePct}% |${nonPrintCell}${renderCell} ${formatSize(page)} |${vectorsCell}${vectorBoxesCell}${blocksCell}${warningsCell}${matchesCell}${formFieldsCell}${linksCell}${annotationsCell}${structureCell}`,
      );
    }
  }

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
    const formFieldsFragment = page.formFields !== undefined ? ` · formFields: ${page.formFields.length}` : '';
    const linksFragment = page.links !== undefined ? ` · links: ${page.links.length}` : '';
    const annotationsFragment = page.annotations !== undefined ? ` · annotations: ${page.annotations.length}` : '';
    const structureFragment = page.structure !== undefined ? ` · structure: ${structureNodeCount(page.structure)}` : '';
    // Surface the derived quality classification when it's abnormal so
    // the LLM-facing markdown carries the same dispatch signal that
    // JSON / XML expose. `nativeTextStatus === 'ok'` and an `'empty'`
    // page with no visual content are normal flows; the other states
    // are the ones an agent reader needs to react to.
    const showNative = page.quality.nativeTextStatus !== 'ok' && page.quality.nativeTextStatus !== 'empty';
    const nativeFragment = showNative ? ` · native: ${page.quality.nativeTextStatus}` : '';
    const visualFragment = page.quality.visualStatus === 'blank' ? ` · visual: blank` : '';
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
      `_chars: ${page.charCount} · images: ${page.imageCount} · coverage: ${coveragePct}%${pageLabelFragment}${nonPrintFragment}${renderFragment}${vectorsFragment}${vectorBoxesFragment}${formFieldsFragment}${linksFragment}${annotationsFragment}${structureFragment}${nativeFragment}${visualFragment}${warningsFragment}${matchesFragment} · size: ${formatSize(page)}pt_`,
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
    if (page.formFields) {
      lines.push('');
      lines.push('### Form fields');
      if (page.formFields.length === 0) {
        lines.push('');
        lines.push('_No interactive form fields found._');
      } else {
        lines.push('');
        lines.push('| Type | Name | Value | BBox |');
        lines.push('| --- | --- | --- | --- |');
        for (const field of page.formFields) {
          lines.push(
            `| ${field.type} | ${escapeTableCell(field.name)} | ${escapeTableCell(fieldValue(field))} | ${formatBox(field)} |`,
          );
        }
      }
    }
    if (page.links) {
      lines.push('');
      lines.push('### Links');
      if (page.links.length === 0) {
        lines.push('');
        lines.push('_No clickable links found._');
      } else {
        lines.push('');
        lines.push('| Type | Target | BBox |');
        lines.push('| --- | --- | --- |');
        for (const link of page.links) {
          lines.push(`| ${link.type} | ${escapeTableCell(link.target)} | ${formatBox(link)} |`);
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
        lines.push('| Type | Contents | Title | BBox | Color | QuadBoxes |');
        lines.push('| --- | --- | --- | --- | --- | ---: |');
        for (const annotation of page.annotations) {
          lines.push(
            `| ${escapeTableCell(annotation.subtype)} | ${escapeTableCell(annotation.contents ?? '')} | ${escapeTableCell(annotation.title ?? '')} | ${formatBox(annotation)} | ${annotationColor(annotation)} | ${annotation.quadBoxes?.length ?? 0} |`,
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
