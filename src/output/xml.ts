import type { DocumentResult } from '../types/index.js';
import { appendDocumentSections } from './xml/documentSections.js';
import { escapeAttr } from './xml/helpers.js';
import { appendPage } from './xml/page.js';

/**
 * XML-flavoured output. Not strictly conformant XML — there's no `<?xml`
 * declaration and no namespace — but a tag-shaped, near-JSON-parity form
 * that LLMs parse very reliably (tags act as obvious section markers, so
 * "find the page-3 text" is easier than counting commas in a JSON dump).
 *
 * The shape mirrors the `DocumentResult` schema:
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
  out.push(`<document file="${escapeAttr(result.file)}" totalPages="${result.totalPages}">`);
  appendDocumentSections(out, result);
  out.push('<pages>');
  for (const page of result.pages) appendPage(out, page);
  out.push('</pages>');
  out.push('</document>');
  return out.join('\n');
}
