import type { PageResult } from '../../types/index.js';
import {
  escapeTableCell,
  fieldActions,
  fieldExportValue,
  fieldFlags,
  fieldLabel,
  fieldOptions,
  fieldResetForm,
  fieldValue,
  formatBox,
} from './helpers.js';

/**
 * `omitEmpty` drops the "the pass ran and found nothing" stanza. The CLI
 * wants it — the user typed a flag and deserves to know the answer was
 * genuinely empty. Callers that request the pass on the user's behalf
 * (the MCP server asks for every page-level pass on every read) would
 * otherwise pay an empty section per page for the privilege.
 */
export function appendFormFields(lines: string[], page: PageResult, omitEmpty = false): void {
  if (!page.formFields) return;
  if (omitEmpty && page.formFields.length === 0) return;

  lines.push('');
  lines.push('### Form fields');
  if (page.formFields.length === 0) {
    lines.push('');
    lines.push('_No interactive form fields found._');
    return;
  }

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
