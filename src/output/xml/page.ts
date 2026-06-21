import type { PageResult } from '../../types/index.js';
import { appendJavaScriptActions, escapeAttr } from './helpers.js';
import { appendPageAnnotations, appendPageLinks } from './pageAnnotations.js';
import { appendPageLayoutSections } from './pageLayout.js';
import { appendPageTextSections } from './pageText.js';
import { appendPageVisualSections } from './pageVisual.js';

export function appendPage(out: string[], page: PageResult): void {
  out.push(`<page ${pageAttributes(page).join(' ')}>`);
  appendPageLayoutSections(out, page);
  appendPageVisualSections(out, page);
  if (page.jsActions) appendJavaScriptActions(out, page.jsActions);
  appendPageLinks(out, page);
  appendPageAnnotations(out, page);
  appendPageTextSections(out, page);
  out.push('</page>');
}

function pageAttributes(page: PageResult): string[] {
  const attrs = [
    `no="${page.page}"`,
    `charCount="${page.charCount}"`,
    `imageCount="${page.imageCount}"`,
    `vectorCount="${page.vectorCount}"`,
    `textCoverage="${page.textCoverage}"`,
    `nonPrintableRatio="${page.nonPrintableRatio}"`,
    `nonPrintableCount="${page.nonPrintableCount}"`,
  ];
  if (page.pageLabel !== undefined) attrs.push(`label="${escapeAttr(page.pageLabel)}"`);
  if (page.renderContentRatio !== undefined) attrs.push(`renderContentRatio="${page.renderContentRatio}"`);
  if (page.rotation !== undefined) attrs.push(`rotation="${page.rotation}"`);
  attrs.push(`nativeTextStatus="${page.quality.nativeTextStatus}"`);
  if (page.quality.visualStatus !== undefined) attrs.push(`visualStatus="${page.quality.visualStatus}"`);
  attrs.push(`width="${page.width}"`, `height="${page.height}"`);
  if (page.image) attrs.push(`image="${escapeAttr(page.image)}"`);
  // Echo the requested render region so XML consumers can tell
  // crop-vs-full output the same way JSON consumers do. Encoded as
  // four sibling attributes (matching the bbox shape we already use
  // for <span>, <block>, <imageBox>) so the parser surface stays
  // homogeneous.
  if (page.renderRegion) {
    attrs.push(
      `renderRegionX="${page.renderRegion.x}"`,
      `renderRegionY="${page.renderRegion.y}"`,
      `renderRegionWidth="${page.renderRegion.width}"`,
      `renderRegionHeight="${page.renderRegion.height}"`,
    );
  }
  return attrs;
}
