import type { DocumentResult } from '../types/index.js';

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

function escapeAttr(value: string): string {
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

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function formatXml(result: DocumentResult): string {
  const out: string[] = [];
  out.push(`<document file="${escapeAttr(result.file)}" totalPages="${result.totalPages}">`);

  const meta = result.metadata;
  if (meta.title || meta.author || meta.subject || meta.creator) {
    out.push('<metadata>');
    if (meta.title) out.push(`<title>${escapeText(meta.title)}</title>`);
    if (meta.author) out.push(`<author>${escapeText(meta.author)}</author>`);
    if (meta.subject) out.push(`<subject>${escapeText(meta.subject)}</subject>`);
    if (meta.creator) out.push(`<creator>${escapeText(meta.creator)}</creator>`);
    out.push('</metadata>');
  }

  if (result.overview) {
    out.push('<overview>');
    for (const p of result.overview) {
      out.push(
        `<page no="${p.page}" charCount="${p.charCount}" imageCount="${p.imageCount}" textCoverage="${p.textCoverage}" nonPrintableRatio="${p.nonPrintableRatio}" width="${p.width}" height="${p.height}"/>`,
      );
    }
    out.push('</overview>');
  }

  out.push('<pages>');
  for (const page of result.pages) {
    const attrs = [
      `no="${page.page}"`,
      `charCount="${page.charCount}"`,
      `imageCount="${page.imageCount}"`,
      `textCoverage="${page.textCoverage}"`,
      `nonPrintableRatio="${page.nonPrintableRatio}"`,
      `width="${page.width}"`,
      `height="${page.height}"`,
    ];
    if (page.image) attrs.push(`image="${escapeAttr(page.image)}"`);
    out.push(`<page ${attrs.join(' ')}>`);

    if (page.spans && page.spans.length > 0) {
      out.push('<spans>');
      for (const span of page.spans) {
        const spanAttrs = [
          `text="${escapeAttr(span.text)}"`,
          `x="${span.x}"`,
          `y="${span.y}"`,
          `width="${span.width}"`,
          `height="${span.height}"`,
          `fontSize="${span.fontSize}"`,
        ];
        if (span.fontName) spanAttrs.push(`fontName="${escapeAttr(span.fontName)}"`);
        out.push(`<span ${spanAttrs.join(' ')}/>`);
      }
      out.push('</spans>');
    }

    if (page.layout) {
      if (page.layout.blocks.length === 0) {
        // Mirror the <imageBoxes/> pattern: a self-closing tag tells
        // downstream agents "we ran the layout pass and found nothing"
        // rather than "layout was not requested".
        out.push('<layout/>');
      } else {
        out.push('<layout>');
        for (const block of page.layout.blocks) {
          const blockAttrs = [`x="${block.x}"`, `y="${block.y}"`, `width="${block.width}"`, `height="${block.height}"`];
          if (block.role) blockAttrs.push(`role="${block.role}"`);
          if (block.repeated) blockAttrs.push('repeated="true"');
          out.push(`<block ${blockAttrs.join(' ')}>`);
          for (const line of block.lines) {
            out.push(
              `<line x="${line.x}" y="${line.y}" width="${line.width}" height="${line.height}" fontSize="${line.fontSize}">${escapeText(line.text)}</line>`,
            );
          }
          out.push('</block>');
        }
        out.push('</layout>');
      }
    }

    if (page.imageBoxes) {
      if (page.imageBoxes.length === 0) {
        out.push('<imageBoxes/>');
      } else {
        out.push('<imageBoxes>');
        for (const box of page.imageBoxes) {
          out.push(`<imageBox x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"/>`);
        }
        out.push('</imageBoxes>');
      }
    }

    if (page.text) {
      // Newlines top and bottom keep the text body visually distinct from
      // the surrounding tags — matters for LLM comprehension. The leading
      // and trailing \n become part of <text>'s character data, which is
      // intentional and documented.
      out.push(`<text>\n${escapeText(page.text)}\n</text>`);
    }
    if (page.rawText) {
      out.push(`<rawText>\n${escapeText(page.rawText)}\n</rawText>`);
    }
    if (page.ocr) {
      const ocrAttrs = `lang="${escapeAttr(page.ocr.lang)}" confidence="${page.ocr.confidence}"`;
      if (page.ocr.text) {
        out.push(`<ocr ${ocrAttrs}>\n${escapeText(page.ocr.text)}\n</ocr>`);
      } else {
        // Self-closing keeps "OCR ran but found nothing" distinct from
        // "OCR was not requested" (the latter omits the tag entirely).
        out.push(`<ocr ${ocrAttrs}/>`);
      }
    }
    out.push('</page>');
  }
  out.push('</pages>');
  out.push('</document>');

  return out.join('\n');
}
