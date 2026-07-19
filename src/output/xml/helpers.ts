import type { DocumentResult, PageStructureItem } from '../../types/index.js';

const XML_FORBIDDEN_MARKER_PREFIX = '[[pdfvision:';

/**
 * XML 1.0 cannot carry most C0 controls, U+FFFE/U+FFFF, or unpaired UTF-16
 * surrogates, even as numeric character references. Keep the presentation
 * well-formed by rendering each forbidden code unit as an explicit marker.
 * Literal strings beginning with the marker prefix are escaped with
 * `[[pdfvision:literal:` so they cannot collide with generated markers.
 */
function representXmlForbiddenCharacters(value: string): string {
  let out = '';
  for (let index = 0; index < value.length; index += 1) {
    if (value.startsWith(XML_FORBIDDEN_MARKER_PREFIX, index)) {
      out += `${XML_FORBIDDEN_MARKER_PREFIX}literal:`;
      index += XML_FORBIDDEN_MARKER_PREFIX.length - 1;
      continue;
    }

    const codeUnit = value.charCodeAt(index);
    const isForbiddenC0 = codeUnit < 0x20 && codeUnit !== 0x09 && codeUnit !== 0x0a && codeUnit !== 0x0d;
    const isLoneHighSurrogate =
      codeUnit >= 0xd800 &&
      codeUnit <= 0xdbff &&
      !(value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff);
    const isLoneLowSurrogate =
      codeUnit >= 0xdc00 &&
      codeUnit <= 0xdfff &&
      !(value.charCodeAt(index - 1) >= 0xd800 && value.charCodeAt(index - 1) <= 0xdbff);
    if (isForbiddenC0 || isLoneHighSurrogate || isLoneLowSurrogate || codeUnit === 0xfffe || codeUnit === 0xffff) {
      out += `${XML_FORBIDDEN_MARKER_PREFIX}U+${codeUnit.toString(16).toUpperCase().padStart(4, '0')}]]`;
      continue;
    }
    out += value[index];
  }
  return out;
}

export function escapeAttr(value: string): string {
  // Order matters: `&` first so the replacement entities themselves
  // don't get re-escaped. `\n` / `\r` get numeric entities so a title
  // with a stray newline doesn't break the attribute boundary.
  return representXmlForbiddenCharacters(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\n', '&#10;')
    .replaceAll('\r', '&#13;');
}

export function escapeText(value: string): string {
  return representXmlForbiddenCharacters(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
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
