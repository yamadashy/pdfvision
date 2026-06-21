import type { DocumentResult, PageStructureItem } from '../../types/index.js';

export function escapeAttr(value: string): string {
  // Order matters: `&` first so the replacement entities themselves
  // don't get re-escaped. `\n` / `\r` get numeric entities so a title
  // with a stray newline doesn't break the attribute boundary.
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\n', '&#10;')
    .replaceAll('\r', '&#13;');
}

export function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function viewerValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value);
  return JSON.stringify(value);
}

export function appendJavaScriptActions(out: string[], actions: Record<string, string[]>): void {
  out.push('<jsActions>');
  for (const [name, scripts] of Object.entries(actions)) {
    out.push(`<action name="${escapeAttr(name)}">`);
    for (const script of scripts) out.push(`<script>${escapeText(script)}</script>`);
    out.push('</action>');
  }
  out.push('</jsActions>');
}

export function linkTarget(value: NonNullable<DocumentResult['pages'][number]['links']>[number]['target']): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function appendStructureItem(out: string[], item: PageStructureItem): void {
  if (!('role' in item)) {
    out.push(`<content type="${escapeAttr(item.type)}" id="${escapeAttr(item.id)}"/>`);
    return;
  }
  const attrs = [`role="${escapeAttr(item.role)}"`];
  if (item.alt !== undefined) attrs.push(`alt="${escapeAttr(item.alt)}"`);
  if (item.mathML !== undefined) attrs.push(`mathML="${escapeAttr(item.mathML)}"`);
  if (item.lang !== undefined) attrs.push(`lang="${escapeAttr(item.lang)}"`);
  if (item.bbox !== undefined) attrs.push(`bbox="${escapeAttr(item.bbox.join(','))}"`);
  if (item.children.length === 0) {
    out.push(`<node ${attrs.join(' ')}/>`);
    return;
  }
  out.push(`<node ${attrs.join(' ')}>`);
  for (const child of item.children) appendStructureItem(out, child);
  out.push('</node>');
}

export function appendOutline(out: string[], items: NonNullable<DocumentResult['outline']>): void {
  for (const item of items) {
    const attrs = [`title="${escapeAttr(item.title)}"`];
    if (item.type) attrs.push(`type="${item.type}"`);
    if (item.target) attrs.push(`target="${escapeAttr(item.target)}"`);
    if (item.page !== undefined) attrs.push(`page="${item.page}"`);
    if (item.items && item.items.length > 0) {
      out.push(`<item ${attrs.join(' ')}>`);
      appendOutline(out, item.items);
      out.push('</item>');
    } else {
      out.push(`<item ${attrs.join(' ')}/>`);
    }
  }
}
