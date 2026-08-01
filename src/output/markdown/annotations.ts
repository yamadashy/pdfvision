import type { PageResult } from '../../types/index.js';
import {
  annotationBorder,
  annotationColor,
  annotationFileAttachment,
  annotationFlags,
  annotationShape,
  escapeTableCell,
  formatBox,
} from './helpers.js';

/**
 * `omitEmpty` drops the "the pass ran and found nothing" stanza. The CLI
 * wants it — the user typed a flag and deserves to know the answer was
 * genuinely empty. Callers that request the pass on the user's behalf
 * (the MCP server asks for every page-level pass on every read) would
 * otherwise pay an empty section per page for the privilege.
 */
export function appendAnnotations(lines: string[], page: PageResult, omitEmpty = false): void {
  if (!page.annotations) return;
  if (omitEmpty && page.annotations.length === 0) return;

  lines.push('');
  lines.push('### Annotations');
  if (page.annotations.length === 0) {
    lines.push('');
    lines.push('_No non-link annotations found._');
    return;
  }

  lines.push('');
  lines.push('| Type | Name | Contents | Title | File | Flags | BBox | Color | Border | Shape | QuadBoxes |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: |');
  for (const annotation of page.annotations) {
    lines.push(
      `| ${escapeTableCell(annotation.subtype)} | ${escapeTableCell(annotation.name ?? '')} | ${escapeTableCell(annotation.contents ?? '')} | ${escapeTableCell(annotation.title ?? '')} | ${escapeTableCell(annotationFileAttachment(annotation))} | ${annotationFlags(annotation)} | ${formatBox(annotation)} | ${annotationColor(annotation)} | ${escapeTableCell(annotationBorder(annotation))} | ${escapeTableCell(annotationShape(annotation))} | ${annotation.quadBoxes?.length ?? 0} |`,
    );
  }
}
