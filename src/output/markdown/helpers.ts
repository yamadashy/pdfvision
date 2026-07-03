import type { PageResult } from '../../types/index.js';

const MARKDOWN_JS_ACTIONS_MAX_CHARS = 500;

export function escapeTableCell(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replaceAll('\r\n', ' ')
    .replaceAll('\n', ' ')
    .replaceAll('\r', ' ');
}

export function escapeInline(value: string): string {
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

export function fieldValue(field: NonNullable<PageResult['formFields']>[number]): string {
  if (field.checked !== undefined) return field.checked ? 'checked' : 'unchecked';
  if (field.type === 'button' && field.caption) return field.caption;
  if (field.type === 'choice' && field.displayValue) return field.displayValue;
  return field.value ?? '';
}

export function fieldLabel(field: NonNullable<PageResult['formFields']>[number]): string {
  return field.label ? `${field.label.text} (${field.label.relation})` : '';
}

export function fieldOptions(field: NonNullable<PageResult['formFields']>[number]): string {
  return (
    field.options
      ?.map((option) =>
        option.displayValue === option.exportValue
          ? option.displayValue
          : `${option.displayValue}=${option.exportValue}`,
      )
      .join(', ') ?? ''
  );
}

export function fieldExportValue(field: NonNullable<PageResult['formFields']>[number]): string {
  if (field.type === 'choice' && field.displayValue && field.value && field.displayValue !== field.value) {
    return field.value;
  }
  return field.exportValue ?? '';
}

export function fieldFlags(field: NonNullable<PageResult['formFields']>[number]): string {
  const flags = new Set<string>(field.flags ?? []);
  if (field.readOnly) flags.add('readOnly');
  if (field.required) flags.add('required');
  if (field.multiline) flags.add('multiline');
  if (field.combo !== undefined) flags.add(field.combo ? 'combo' : 'list');
  if (field.multiSelect) flags.add('multiSelect');
  return Array.from(flags).join(', ');
}

export function fieldActions(field: NonNullable<PageResult['formFields']>[number]): string {
  return field.actions ? formatJavaScriptActions(field.actions) : '';
}

export function fieldResetForm(field: NonNullable<PageResult['formFields']>[number]): string {
  if (!field.resetForm) return '';
  const fields = field.resetForm.fields.join(', ');
  if (field.resetForm.include) return fields.length > 0 ? `reset only ${fields}` : 'reset only listed fields';
  return fields.length > 0 ? `reset all except ${fields}` : 'reset all fields';
}

export function annotationColor(annotation: NonNullable<PageResult['annotations']>[number]): string {
  return annotation.color ? annotation.color.join(',') : '';
}

export function annotationFileAttachment(annotation: NonNullable<PageResult['annotations']>[number]): string {
  const file = annotation.fileAttachment;
  if (!file) return '';
  const parts = [file.name, `${file.size} bytes`];
  if (file.description) parts.push(file.description);
  return parts.join(' · ');
}

export function annotationFlags(annotation: NonNullable<PageResult['annotations']>[number]): string {
  return annotation.flags?.join(',') ?? '';
}

export function annotationBorder(annotation: NonNullable<PageResult['annotations']>[number]): string {
  const border = annotation.border;
  if (!border) return '';
  const parts: string[] = [];
  if (border.width !== undefined) parts.push(`width=${border.width}`);
  if (border.style !== undefined) parts.push(border.style);
  if (border.dashArray !== undefined && border.dashArray.length > 0) parts.push(`dash=${border.dashArray.join(',')}`);
  return parts.join(' ');
}

export function annotationShape(annotation: NonNullable<PageResult['annotations']>[number]): string {
  const parts: string[] = [];
  if (annotation.line) {
    const { from, to, endings } = annotation.line;
    const endingText = endings ? ` endings=${endings.join(',')}` : '';
    parts.push(`line ${from.x},${from.y}->${to.x},${to.y}${endingText}`);
  }
  if (annotation.vertices) {
    parts.push(`vertices=${annotation.vertices.length}`);
  }
  if (annotation.inkPaths) {
    const pointCount = annotation.inkPaths.reduce((total, path) => total + path.length, 0);
    parts.push(`inkPaths=${annotation.inkPaths.length}/${pointCount}pts`);
  }
  return parts.join('; ');
}

export function visualRegionSources(region: NonNullable<PageResult['visualRegions']>[number]): string {
  const refs = region.sources.map((source) => `${source.type}[${source.index}]`);
  const hiddenCount = region.sourceCount - region.sources.length;
  if (hiddenCount > 0) refs.push(`+${hiddenCount} more`);
  return refs.join(', ');
}

export function visualRegionAssociatedText(region: NonNullable<PageResult['visualRegions']>[number]): string {
  return (region.associatedText ?? []).map((item) => `${item.relation}: ${item.text}`).join('; ');
}

export function linkTarget(value: NonNullable<PageResult['links']>[number]['target']): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function linkSafety(link: NonNullable<PageResult['links']>[number]): string {
  const flags: string[] = [];
  if (link.unsafe === true) flags.push('unsafe');
  if (link.newWindow !== undefined) flags.push(`newWindow=${link.newWindow}`);
  return flags.join(', ');
}

export function linkAttachment(link: NonNullable<PageResult['links']>[number]): string {
  if (!link.attachment) return '';
  const parts = [link.attachment.name];
  if (link.attachment.destination !== undefined) parts.push(`dest=${linkTarget(link.attachment.destination)}`);
  if (link.attachment.size !== undefined) parts.push(`${link.attachment.size} bytes`);
  return parts.join('; ');
}

export function formatBox(box: { x: number; y: number; width: number; height: number }): string {
  return `${box.x},${box.y},${box.width},${box.height}`;
}

export function formatBbox(box: number[]): string {
  return box.join(',');
}

export function formatViewerValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value);
  return JSON.stringify(value);
}

export function jsActionCount(actions: Record<string, string[]> | undefined): number {
  return Object.values(actions ?? {}).reduce((sum, scripts) => sum + scripts.length, 0);
}

export function formatJavaScriptActions(actions: Record<string, string[]>): string {
  const text = Object.entries(actions)
    .map(([name, scripts]) => `${name}=${scripts.join(' || ')}`)
    .join(' | ');
  return truncateForMarkdown(text, MARKDOWN_JS_ACTIONS_MAX_CHARS);
}

function truncateForMarkdown(text: string, maxChars: number): string {
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  return `${chars.slice(0, maxChars - 3).join('')}...`;
}
