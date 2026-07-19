import type { DocumentResult } from '../types/index.js';
import { appendDocumentSections } from './xml/documentSections.js';
import { escapeAttr } from './xml/helpers.js';
import { appendPage } from './xml/page.js';

/**
 * XML-flavoured output. It omits the optional `<?xml` declaration and a
 * namespace, and is a tag-shaped, near-JSON-parity projection
 * that LLMs parse very reliably (tags act as obvious section markers, so
 * "find the page-3 text" is easier than counting commas in a JSON dump).
 *
 * It is not a reversible `DocumentResult` serialization. In particular,
 * `page` becomes `no`, `pageLabel` becomes `label`, `quality` fields are
 * flattened into page attributes, overview rotation is currently omitted,
 * and empty-field presence differs from JSON. Page-result rotation remains
 * a `<page rotation="...">` attribute. XML-1.0-forbidden code units are
 * represented as `[[pdfvision:U+XXXX]]`; literal `[[pdfvision:` prefixes are
 * escaped as `[[pdfvision:literal:` so the representation is unambiguous.
 *
 * Representative shape:
 *   <document file=".." totalPages="N">
 *     <metadata><title/><author/>...</metadata>
 *     <overview><page no=".." charCount=".." .../></overview>   (multi-page)
 *     <pages>
 *       <page no=".." charCount=".." ...>
 *         <spans><span text=".." x=".." .../></spans>            (--geometry)
 *         <text>...</text>
 *         <rawText>...</rawText>                                  (when present)
 *       </page>
 *     </pages>
 *   </document>
 */
export function formatXml(result: DocumentResult): string {
  const out: string[] = [];
  const attachmentCount = result.attachmentCount !== undefined ? ` attachmentCount="${result.attachmentCount}"` : '';
  const javascriptActionCount =
    result.javascriptActionCount !== undefined ? ` javascriptActionCount="${result.javascriptActionCount}"` : '';
  const outlineCount = result.outlineCount !== undefined ? ` outlineCount="${result.outlineCount}"` : '';
  const xfa = result.xfa ? ' xfa="true"' : '';
  out.push(
    `<document file="${escapeAttr(result.file)}" totalPages="${result.totalPages}"${attachmentCount}${javascriptActionCount}${outlineCount}${xfa}>`,
  );
  appendDocumentSections(out, result);
  out.push('<pages>');
  for (const page of result.pages) appendPage(out, page);
  out.push('</pages>');
  out.push('</document>');
  return out.join('\n');
}
