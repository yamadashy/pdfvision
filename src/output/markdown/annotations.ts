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

export function appendAnnotations(lines: string[], page: PageResult): void {
  if (!page.annotations) return;

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
