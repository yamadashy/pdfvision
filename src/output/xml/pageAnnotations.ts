import type { PageResult } from '../../types/index.js';
import { escapeAttr, linkTarget } from './helpers.js';

export function appendPageLinks(out: string[], page: PageResult): void {
  if (!page.links) return;

  if (page.links.length === 0) {
    out.push('<links/>');
    return;
  }

  out.push('<links>');
  for (const link of page.links) {
    const pageAttr = link.page !== undefined ? ` page="${link.page}"` : '';
    const textAttr = link.text !== undefined ? ` text="${escapeAttr(link.text)}"` : '';
    out.push(
      `<link type="${link.type}" target="${escapeAttr(linkTarget(link.target))}"${pageAttr}${textAttr} x="${link.x}" y="${link.y}" width="${link.width}" height="${link.height}"/>`,
    );
  }
  out.push('</links>');
}

export function appendPageAnnotations(out: string[], page: PageResult): void {
  if (!page.annotations) return;

  if (page.annotations.length === 0) {
    out.push('<annotations/>');
    return;
  }

  out.push('<annotations>');
  for (const annotation of page.annotations) {
    appendAnnotation(out, annotation);
  }
  out.push('</annotations>');
}

function appendAnnotation(out: string[], annotation: NonNullable<PageResult['annotations']>[number]): void {
  const annotationAttrs = [
    `subtype="${escapeAttr(annotation.subtype)}"`,
    `x="${annotation.x}"`,
    `y="${annotation.y}"`,
    `width="${annotation.width}"`,
    `height="${annotation.height}"`,
  ];
  if (annotation.name !== undefined) annotationAttrs.push(`name="${escapeAttr(annotation.name)}"`);
  if (annotation.contents !== undefined) annotationAttrs.push(`contents="${escapeAttr(annotation.contents)}"`);
  if (annotation.title !== undefined) annotationAttrs.push(`title="${escapeAttr(annotation.title)}"`);
  if (annotation.color !== undefined) annotationAttrs.push(`color="${annotation.color.join(',')}"`);
  if (annotation.modified !== undefined) annotationAttrs.push(`modified="${escapeAttr(annotation.modified)}"`);
  if (annotation.hasAppearance !== undefined) annotationAttrs.push(`hasAppearance="${annotation.hasAppearance}"`);
  if (annotation.flags !== undefined && annotation.flags.length > 0) {
    annotationAttrs.push(`flags="${annotation.flags.join(',')}"`);
  }
  if (!hasAnnotationChildren(annotation)) {
    out.push(`<annotation ${annotationAttrs.join(' ')}/>`);
    return;
  }

  out.push(`<annotation ${annotationAttrs.join(' ')}>`);
  appendFileAttachment(out, annotation);
  appendBorder(out, annotation);
  appendLine(out, annotation);
  appendPoints(out, 'vertices', annotation.vertices);
  appendInkPaths(out, annotation);
  for (const box of annotation.quadBoxes ?? []) {
    out.push(`<quadBox x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"/>`);
  }
  out.push('</annotation>');
}

function hasAnnotationChildren(annotation: NonNullable<PageResult['annotations']>[number]): boolean {
  return (
    annotation.fileAttachment !== undefined ||
    annotation.border !== undefined ||
    annotation.line !== undefined ||
    (annotation.vertices !== undefined && annotation.vertices.length > 0) ||
    (annotation.inkPaths !== undefined && annotation.inkPaths.length > 0) ||
    (annotation.quadBoxes !== undefined && annotation.quadBoxes.length > 0)
  );
}

function appendFileAttachment(out: string[], annotation: NonNullable<PageResult['annotations']>[number]): void {
  if (annotation.fileAttachment === undefined) return;

  const fileAttrs = [
    `name="${escapeAttr(annotation.fileAttachment.name)}"`,
    `size="${annotation.fileAttachment.size}"`,
  ];
  if (annotation.fileAttachment.description !== undefined) {
    fileAttrs.push(`description="${escapeAttr(annotation.fileAttachment.description)}"`);
  }
  out.push(`<fileAttachment ${fileAttrs.join(' ')}/>`);
}

function appendBorder(out: string[], annotation: NonNullable<PageResult['annotations']>[number]): void {
  if (annotation.border === undefined) return;

  const borderAttrs: string[] = [];
  if (annotation.border.width !== undefined) borderAttrs.push(`width="${annotation.border.width}"`);
  if (annotation.border.style !== undefined) borderAttrs.push(`style="${escapeAttr(annotation.border.style)}"`);
  if (annotation.border.dashArray !== undefined && annotation.border.dashArray.length > 0) {
    borderAttrs.push(`dashArray="${annotation.border.dashArray.join(',')}"`);
  }
  out.push(`<border ${borderAttrs.join(' ')}/>`);
}

function appendLine(out: string[], annotation: NonNullable<PageResult['annotations']>[number]): void {
  if (annotation.line === undefined) return;

  const lineAttrs = [
    `fromX="${annotation.line.from.x}"`,
    `fromY="${annotation.line.from.y}"`,
    `toX="${annotation.line.to.x}"`,
    `toY="${annotation.line.to.y}"`,
  ];
  if (annotation.line.endings !== undefined) {
    lineAttrs.push(`endings="${annotation.line.endings.map(escapeAttr).join(',')}"`);
  }
  out.push(`<line ${lineAttrs.join(' ')}/>`);
}

function appendPoints(
  out: string[],
  tagName: 'vertices',
  points: NonNullable<NonNullable<PageResult['annotations']>[number]['vertices']> | undefined,
): void {
  if (points === undefined || points.length === 0) return;

  out.push(`<${tagName}>`);
  for (const point of points) {
    out.push(`<point x="${point.x}" y="${point.y}"/>`);
  }
  out.push(`</${tagName}>`);
}

function appendInkPaths(out: string[], annotation: NonNullable<PageResult['annotations']>[number]): void {
  if (annotation.inkPaths === undefined || annotation.inkPaths.length === 0) return;

  out.push('<inkPaths>');
  for (const path of annotation.inkPaths) {
    out.push('<path>');
    for (const point of path) {
      out.push(`<point x="${point.x}" y="${point.y}"/>`);
    }
    out.push('</path>');
  }
  out.push('</inkPaths>');
}
