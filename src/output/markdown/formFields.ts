import type { FormField, PageResult } from '../../types/index.js';
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
 * Flags that are honesty signals rather than form data. A hidden or
 * locked widget is worth a row even with nothing in it — that a field
 * exists but cannot be seen or edited is exactly the kind of thing this
 * tool exists to surface.
 */
const NOTEWORTHY_FLAGS = new Set(['hidden', 'noView', 'locked']);

/**
 * Whether a field carries something a reader can act on: a value, a
 * checked box, a widget-level action, or a flag saying the widget is not
 * what it appears to be.
 *
 * Everything else is an empty row — an internal AcroForm name, a label
 * already printed verbatim in the page body a few lines above, and blank
 * `Value` / `Export` / `Options` cells.
 */
function isNoteworthy(field: FormField): boolean {
  if (field.checked === true) return true;
  // `fieldValue` renders an unchecked box as the literal "unchecked", so
  // only consult it for the field types that carry a value.
  if (field.checked === undefined && fieldValue(field) !== '') return true;
  if (field.actions || field.resetForm) return true;
  return (field.flags ?? []).some((flag) => NOTEWORTHY_FLAGS.has(flag));
}

function typeBreakdown(fields: readonly FormField[]): string {
  const counts = new Map<string, number>();
  for (const field of fields) counts.set(field.type, (counts.get(field.type) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en-US'))
    .map(([type, count]) => `${count} ${type}`)
    .join(', ');
}

function unfilledSummary(omitted: readonly FormField[], anyShown: boolean): string {
  const noun = omitted.length === 1 ? 'field' : 'fields';
  const lead = anyShown ? `${omitted.length} further ${noun}` : `${omitted.length} fillable ${noun} on this page`;
  return `_${lead}, none filled (${typeBreakdown(omitted)})._`;
}

/**
 * `omitEmpty` drops the "the pass ran and found nothing" stanza. The CLI
 * wants it — the user typed a flag and deserves to know the answer was
 * genuinely empty. Callers that request the pass on the user's behalf
 * (the MCP server asks for every page-level pass on every read) would
 * otherwise pay an empty section per page for the privilege.
 *
 * The same reasoning covers a *blank* form, which the empty-section rule
 * misses: the pass found 23 widgets, so it charges full price, and every
 * row carries zero information about the document's content. On the IRS
 * W-9 that was 37% of the page, spent while the response budget pushed
 * pages 4-6 out entirely. So under `omitEmpty` the unfilled rows collapse
 * to a count and a type breakdown, and only fields carrying something
 * actionable keep a row. Filled fields are the opposite case — that is
 * the payload, and stays verbose. Extraction is unchanged; this is
 * emission only.
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

  const shown = omitEmpty ? page.formFields.filter(isNoteworthy) : page.formFields;
  const omitted = omitEmpty ? page.formFields.filter((field) => !isNoteworthy(field)) : [];

  lines.push('');
  if (shown.length === 0) {
    lines.push(unfilledSummary(omitted, false));
    return;
  }

  const showFieldActions = shown.some((field) => field.actions !== undefined);
  const showFieldReset = shown.some((field) => field.resetForm !== undefined);
  const showExportValue = shown.some((field) => fieldExportValue(field).length > 0);
  lines.push(
    `| Type | Name | Label | Value |${showExportValue ? ' Export |' : ''} Options |${showFieldReset ? ' Reset |' : ''}${showFieldActions ? ' Actions |' : ''} Flags | BBox |`,
  );
  lines.push(
    `| --- | --- | --- | --- |${showExportValue ? ' --- |' : ''} --- |${showFieldReset ? ' --- |' : ''}${showFieldActions ? ' --- |' : ''} --- | --- |`,
  );
  for (const field of shown) {
    const resetCell = showFieldReset ? ` ${escapeTableCell(fieldResetForm(field))} |` : '';
    const actionsCell = showFieldActions ? ` ${escapeTableCell(fieldActions(field))} |` : '';
    const exportCell = showExportValue ? ` ${escapeTableCell(fieldExportValue(field))} |` : '';
    lines.push(
      `| ${field.type} | ${escapeTableCell(field.name)} | ${escapeTableCell(fieldLabel(field))} | ${escapeTableCell(fieldValue(field))} |${exportCell} ${escapeTableCell(fieldOptions(field))} |${resetCell}${actionsCell} ${escapeTableCell(fieldFlags(field))} | ${formatBox(field)} |`,
    );
  }

  if (omitted.length > 0) {
    lines.push('');
    lines.push(unfilledSummary(omitted, true));
  }
}
