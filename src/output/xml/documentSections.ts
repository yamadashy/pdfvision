import type { DocumentResult } from '../../types/index.js';
import { appendJavaScriptActions, appendOutline, escapeAttr, escapeText, viewerValue } from './helpers.js';

export function appendDocumentSections(out: string[], result: DocumentResult): void {
  appendMetadata(out, result);
  appendPageLabels(out, result);
  appendViewer(out, result);
  appendLayers(out, result);
  appendAttachments(out, result);
  appendOutlineSection(out, result);
  appendOverview(out, result);
}

function appendMetadata(out: string[], result: DocumentResult): void {
  const meta = result.metadata;
  if (!meta.title && !meta.author && !meta.subject && !meta.creator) return;

  out.push('<metadata>');
  if (meta.title) out.push(`<title>${escapeText(meta.title)}</title>`);
  if (meta.author) out.push(`<author>${escapeText(meta.author)}</author>`);
  if (meta.subject) out.push(`<subject>${escapeText(meta.subject)}</subject>`);
  if (meta.creator) out.push(`<creator>${escapeText(meta.creator)}</creator>`);
  out.push('</metadata>');
}

function appendPageLabels(out: string[], result: DocumentResult): void {
  if (!result.pageLabels) return;

  if (result.pageLabels.length === 0) {
    out.push('<pageLabels/>');
    return;
  }

  out.push('<pageLabels>');
  result.pageLabels.forEach((label, index) => {
    out.push(`<pageLabel page="${index + 1}" label="${escapeAttr(label)}"/>`);
  });
  out.push('</pageLabels>');
}

function appendViewer(out: string[], result: DocumentResult): void {
  if (!result.viewer) return;

  const attrs: string[] = [];
  if (result.viewer.pageMode !== undefined) attrs.push(`pageMode="${escapeAttr(result.viewer.pageMode)}"`);
  if (result.viewer.pageLayout !== undefined) attrs.push(`pageLayout="${escapeAttr(result.viewer.pageLayout)}"`);
  if (attrs.length === 0 && Object.keys(result.viewer).length === 0) {
    out.push('<viewer/>');
    return;
  }

  out.push(`<viewer${attrs.length > 0 ? ` ${attrs.join(' ')}` : ''}>`);
  if (result.viewer.openAction) {
    const actionAttrs = [`type="${result.viewer.openAction.type}"`];
    if (result.viewer.openAction.page !== undefined) actionAttrs.push(`page="${result.viewer.openAction.page}"`);
    if (result.viewer.openAction.action !== undefined) {
      actionAttrs.push(`action="${escapeAttr(result.viewer.openAction.action)}"`);
    }
    if (result.viewer.openAction.target !== undefined) {
      actionAttrs.push(`target="${escapeAttr(result.viewer.openAction.target)}"`);
    }
    out.push(`<openAction ${actionAttrs.join(' ')}/>`);
  }
  if (result.viewer.jsActions) appendJavaScriptActions(out, result.viewer.jsActions);
  if (result.viewer.permissions) {
    out.push(
      `<permissions flags="${escapeAttr(result.viewer.permissions.flags.join(','))}" allowed="${escapeAttr(result.viewer.permissions.allowed.join(','))}"/>`,
    );
  }
  if (result.viewer.markInfo) {
    out.push(
      `<markInfo marked="${result.viewer.markInfo.marked}" userProperties="${result.viewer.markInfo.userProperties}" suspects="${result.viewer.markInfo.suspects}"/>`,
    );
  }
  if (result.viewer.viewerPreferences) {
    out.push('<viewerPreferences>');
    for (const [key, value] of Object.entries(result.viewer.viewerPreferences)) {
      out.push(`<preference name="${escapeAttr(key)}" value="${escapeAttr(viewerValue(value))}"/>`);
    }
    out.push('</viewerPreferences>');
  }
  out.push('</viewer>');
}

function appendLayers(out: string[], result: DocumentResult): void {
  if (!result.layers) return;

  const attrs: string[] = [];
  if (result.layers.name !== undefined) attrs.push(`name="${escapeAttr(result.layers.name)}"`);
  if (result.layers.creator !== undefined) attrs.push(`creator="${escapeAttr(result.layers.creator)}"`);
  if (result.layers.order !== undefined) attrs.push(`order="${escapeAttr(JSON.stringify(result.layers.order))}"`);
  if (result.layers.groups.length === 0) {
    out.push(`<layers${attrs.length > 0 ? ` ${attrs.join(' ')}` : ''}/>`);
    return;
  }

  out.push(`<layers${attrs.length > 0 ? ` ${attrs.join(' ')}` : ''}>`);
  for (const layer of result.layers.groups) {
    const layerAttrs = [`id="${escapeAttr(layer.id)}"`, `visible="${layer.visible}"`];
    if (layer.name !== undefined) layerAttrs.push(`name="${escapeAttr(layer.name)}"`);
    if (layer.intent !== undefined) layerAttrs.push(`intent="${escapeAttr(layer.intent.join(','))}"`);
    if (layer.usage?.viewState !== undefined) layerAttrs.push(`viewState="${layer.usage.viewState}"`);
    if (layer.usage?.printState !== undefined) layerAttrs.push(`printState="${layer.usage.printState}"`);
    if (layer.rbGroups !== undefined) layerAttrs.push(`rbGroups="${escapeAttr(JSON.stringify(layer.rbGroups))}"`);
    out.push(`<layer ${layerAttrs.join(' ')}/>`);
  }
  out.push('</layers>');
}

function appendAttachments(out: string[], result: DocumentResult): void {
  if (!result.attachments) return;

  if (result.attachments.length === 0) {
    out.push('<attachments/>');
    return;
  }

  out.push('<attachments>');
  for (const attachment of result.attachments) {
    const attrs = [`name="${escapeAttr(attachment.name)}"`, `size="${attachment.size}"`];
    if (attachment.rawName !== undefined) attrs.push(`rawName="${escapeAttr(attachment.rawName)}"`);
    if (attachment.description !== undefined) attrs.push(`description="${escapeAttr(attachment.description)}"`);
    if (attachment.path !== undefined) attrs.push(`path="${escapeAttr(attachment.path)}"`);
    out.push(`<attachment ${attrs.join(' ')}/>`);
  }
  out.push('</attachments>');
}

function appendOutlineSection(out: string[], result: DocumentResult): void {
  if (!result.outline) return;

  if (result.outline.length === 0) {
    out.push('<outline/>');
    return;
  }

  out.push('<outline>');
  appendOutline(out, result.outline);
  out.push('</outline>');
}

function appendOverview(out: string[], result: DocumentResult): void {
  if (!result.overview) return;

  out.push('<overview>');
  for (const p of result.overview) {
    const ovAttrs = [
      `no="${p.page}"`,
      `charCount="${p.charCount}"`,
      `imageCount="${p.imageCount}"`,
      `vectorCount="${p.vectorCount}"`,
      `textCoverage="${p.textCoverage}"`,
      `nonPrintableRatio="${p.nonPrintableRatio}"`,
      `nonPrintableCount="${p.nonPrintableCount}"`,
    ];
    if (p.pageLabel !== undefined) ovAttrs.push(`label="${escapeAttr(p.pageLabel)}"`);
    if (p.renderContentRatio !== undefined) ovAttrs.push(`renderContentRatio="${p.renderContentRatio}"`);
    ovAttrs.push(`nativeTextStatus="${p.quality.nativeTextStatus}"`);
    if (p.quality.visualStatus !== undefined) ovAttrs.push(`visualStatus="${p.quality.visualStatus}"`);
    if (p.warningCount !== undefined) ovAttrs.push(`warningCount="${p.warningCount}"`);
    if (p.matchCount !== undefined) ovAttrs.push(`matchCount="${p.matchCount}"`);
    if (p.vectorBoxCount !== undefined) ovAttrs.push(`vectorBoxCount="${p.vectorBoxCount}"`);
    if (p.visualRegionCount !== undefined) ovAttrs.push(`visualRegionCount="${p.visualRegionCount}"`);
    if (p.formFieldCount !== undefined) ovAttrs.push(`formFieldCount="${p.formFieldCount}"`);
    if (p.linkCount !== undefined) ovAttrs.push(`linkCount="${p.linkCount}"`);
    if (p.annotationCount !== undefined) ovAttrs.push(`annotationCount="${p.annotationCount}"`);
    if (p.structureNodeCount !== undefined) ovAttrs.push(`structureNodeCount="${p.structureNodeCount}"`);
    ovAttrs.push(`width="${p.width}"`, `height="${p.height}"`);
    out.push(`<page ${ovAttrs.join(' ')}/>`);
  }
  out.push('</overview>');
}
