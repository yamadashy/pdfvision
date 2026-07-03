import type { PageResult } from '../../types/index.js';
import { escapeTableCell, formatBox, linkAttachment, linkSafety, linkTarget } from './helpers.js';

export function appendLinks(lines: string[], page: PageResult): void {
  if (!page.links) return;

  lines.push('');
  lines.push('### Links');
  if (page.links.length === 0) {
    lines.push('');
    lines.push('_No clickable links found._');
    return;
  }

  lines.push('');
  const showLinkSafety = page.links.some((link) => link.unsafe === true || link.newWindow !== undefined);
  const showLinkAttachment = page.links.some((link) => link.attachment !== undefined);
  const safetyHeader = showLinkSafety ? ' Safety |' : '';
  const attachmentHeader = showLinkAttachment ? ' Attachment |' : '';
  lines.push(`| Type | Text | Target | TargetPage |${safetyHeader}${attachmentHeader} BBox |`);
  lines.push(`| --- | --- | --- | ---: |${showLinkSafety ? ' --- |' : ''}${showLinkAttachment ? ' --- |' : ''} --- |`);
  for (const link of page.links) {
    const safetyCell = showLinkSafety ? ` ${escapeTableCell(linkSafety(link))} |` : '';
    const attachmentCell = showLinkAttachment ? ` ${escapeTableCell(linkAttachment(link))} |` : '';
    lines.push(
      `| ${link.type} | ${escapeTableCell(link.text ?? '')} | ${escapeTableCell(linkTarget(link.target))} | ${link.page ?? ''} |${safetyCell}${attachmentCell} ${formatBox(link)} |`,
    );
  }
}
