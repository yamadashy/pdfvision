import type { DocumentResult } from '../../types/index.js';
import { escapeInline, escapeTableCell, formatJavaScriptActions, formatViewerValue } from './helpers.js';

function outlineLabel(item: NonNullable<DocumentResult['outline']>[number]): string {
  const parts: string[] = [];
  if (item.page !== undefined) parts.push(`p. ${item.page}`);
  if (item.type) parts.push(item.type);
  if (item.target) parts.push(item.target);
  return parts.length > 0
    ? `${escapeInline(item.title)} (${escapeInline(parts.join(' · '))})`
    : escapeInline(item.title);
}

export function appendOutline(lines: string[], items: NonNullable<DocumentResult['outline']>, depth = 0): void {
  const indent = '  '.repeat(depth);
  for (const item of items) {
    lines.push(`${indent}- ${outlineLabel(item)}`);
    if (item.items) appendOutline(lines, item.items, depth + 1);
  }
}

export function appendViewer(lines: string[], viewer: NonNullable<DocumentResult['viewer']>): void {
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
  if (viewer.jsActions) {
    lines.push(`- **JavaScript actions:** ${escapeInline(formatJavaScriptActions(viewer.jsActions))}`);
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

export function appendLayers(lines: string[], layers: NonNullable<DocumentResult['layers']>): void {
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
