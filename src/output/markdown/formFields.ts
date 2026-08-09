import { isSelectedButtonValue } from '../../core/formFields/index.js';
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
 * Flags that are honesty signals rather than form data. A widget that
 * exists but cannot be seen or edited is exactly the kind of thing this
 * tool exists to surface, and "read-only and empty" is a different fact
 * from "empty" — a computed or protected field is not one the reader
 * failed to fill.
 */
const NOTEWORTHY_FLAGS = new Set(['hidden', 'noView', 'locked', 'readOnly']);

/**
 * Whether a field carries something a reader can act on: a value, a
 * checked box, the option set behind a choice, a widget-level action, or
 * a flag saying the widget is not what it appears to be.
 *
 * Everything else is an empty row — an internal AcroForm name, a label
 * already printed verbatim in the page body a few lines above, and blank
 * `Value` / `Export` / `Options` cells.
 */
function isNoteworthy(field: FormField): boolean {
  // pdf.js reports no field value for a signature widget whether or not
  // the document is signed, so pdfvision cannot claim a signature is
  // unfilled. Say where it is and let the reader look.
  if (field.type === 'signature') return true;
  if (field.checked === true) return true;
  // The extractor puts a button group's selected value on every widget in
  // the group, so an unchecked sibling still says the group was answered
  // — including when the checked widget sits on another page and this
  // page's rows are all the reader gets.
  if (field.checked === false) return isSelectedButtonValue(field.value);
  // `fieldValue` renders an unchecked box as the literal "unchecked", so
  // only consult it for the field types that carry a value.
  if (fieldValue(field) !== '') return true;
  // An unselected dropdown still carries its permitted values and their
  // export/display mapping, which no count can replace and which the page
  // body cannot show — a closed list is invisible until it is opened.
  // Deliberately not extended to unselected checkboxes and radios: their
  // `exportValue` is machine plumbing (`1`, `Off`), and the option text a
  // human reads is printed next to the widget, already in the page body.
  if (fieldOptions(field) !== '') return true;
  if (field.actions || field.resetForm) return true;
  if (field.required || field.readOnly) return true;
  return (field.flags ?? []).some((flag) => NOTEWORTHY_FLAGS.has(flag));
}

/**
 * Identity of the logical field a widget belongs to. Keyed by type as
 * well as name: a well-formed AcroForm gives one field one type, so the
 * type only matters for a malformed one, where merging a checkbox into a
 * same-named radio group would be wrong in both directions — it would
 * keep a row on someone else's evidence and undercount the remainder.
 */
function groupKey(field: FormField): string {
  return `${field.type}\u0000${field.name}`;
}

/**
 * Groups that must be shown, expanded from the noteworthy widgets to
 * every widget of the same logical field.
 *
 * A radio group is one field spread over several widgets: the extractor
 * puts the group's value on all of them and the per-option `exportValue`
 * on each. Keeping only the checked widget would drop the choice set —
 * the reader would see that "Banane" was picked without seeing that
 * "ringo" and "Cherry" were the alternatives.
 */
function shownGroups(fields: readonly FormField[]): Set<string> {
  const keys = new Set<string>();
  for (const field of fields) {
    if (field.name !== '' && isNoteworthy(field)) keys.add(groupKey(field));
  }
  return keys;
}

function keepsRow(field: FormField, keys: Set<string>): boolean {
  return field.name !== '' ? keys.has(groupKey(field)) : isNoteworthy(field);
}

/**
 * One entry per *field*, not per widget. A radio group is three widgets
 * and one thing to fill in; counting widgets would report "3 fillable
 * fields" for a single question. Widgets with no name cannot be grouped,
 * so each stands alone.
 */
function logicalFields(fields: readonly FormField[]): FormField[] {
  const seen = new Set<string>();
  const out: FormField[] = [];
  for (const field of fields) {
    const key = groupKey(field);
    if (field.name !== '' && seen.has(key)) continue;
    if (field.name !== '') seen.add(key);
    out.push(field);
  }
  return out;
}

function typeBreakdown(fields: readonly FormField[]): string {
  const counts = new Map<string, number>();
  for (const field of fields) counts.set(field.type, (counts.get(field.type) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en-US'))
    .map(([type, count]) => `${count} ${type}`)
    .join(', ');
}

function unfilledSummary(omittedWidgets: readonly FormField[], anyShown: boolean): string {
  const omitted = logicalFields(omittedWidgets);
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

  const keys = omitEmpty ? shownGroups(page.formFields) : new Set<string>();
  const shown = omitEmpty ? page.formFields.filter((field) => keepsRow(field, keys)) : page.formFields;
  const omitted = omitEmpty ? page.formFields.filter((field) => !keepsRow(field, keys)) : [];

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
