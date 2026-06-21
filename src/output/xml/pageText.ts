import type { PageResult } from '../../types/index.js';
import { appendStructureItem, escapeAttr, escapeText } from './helpers.js';

export function appendPageTextSections(out: string[], page: PageResult): void {
  appendMatches(out, page);
  appendStructure(out, page);
  appendWarnings(out, page);
  appendText(out, page);
  appendOcr(out, page);
}

function appendMatches(out: string[], page: PageResult): void {
  if (!page.matches) return;

  // Search hits. Empty array -> self-closing `<matches/>` so XML
  // consumers can distinguish "search ran, nothing matched" from
  // "search wasn't requested" the same way JSON does (absent
  // field vs present-empty-array). Each match emits its bbox as
  // sibling attributes (renderRegionX-style), plus per-span boxes
  // inside as `<box .../>` children so highlight overlays still
  // work for multi-span matches in the future.
  if (page.matches.length === 0) {
    out.push('<matches/>');
    return;
  }

  out.push('<matches>');
  for (const m of page.matches) {
    const mAttrs = [`page="${m.page}"`, `query="${escapeAttr(m.query)}"`];
    if (m.queryIndex !== undefined) mAttrs.push(`queryIndex="${m.queryIndex}"`);
    mAttrs.push(
      `source="${m.source}"`,
      `x="${m.bbox.x}"`,
      `y="${m.bbox.y}"`,
      `width="${m.bbox.width}"`,
      `height="${m.bbox.height}"`,
    );
    out.push(`<match ${mAttrs.join(' ')}>`);
    out.push(`<text>${escapeText(m.text)}</text>`);
    for (const b of m.boxes) {
      out.push(`<box x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}"/>`);
    }
    if (m.context !== undefined) {
      out.push(`<context>${escapeText(m.context)}</context>`);
    }
    out.push('</match>');
  }
  out.push('</matches>');
}

function appendStructure(out: string[], page: PageResult): void {
  if (page.structure === undefined) return;

  if (page.structure === null) {
    out.push('<structure/>');
    return;
  }

  out.push('<structure>');
  appendStructureItem(out, page.structure);
  out.push('</structure>');
}

function appendWarnings(out: string[], page: PageResult): void {
  if (!page.warnings || page.warnings.length === 0) return;

  // Warnings are only attached when at least one rule fired (the
  // detector returns `[]` on a clean page and processor omits the
  // field), so there is no empty-warnings self-closing form like
  // `<layout/>` to mirror — absence already means "no findings".
  out.push('<warnings>');
  for (const w of page.warnings) {
    const wAttrs = [`code="${w.code}"`, `severity="${w.severity}"`];
    if (w.blockIndex !== undefined) wAttrs.push(`blockIndex="${w.blockIndex}"`);
    if (w.otherBlockIndex !== undefined) wAttrs.push(`otherBlockIndex="${w.otherBlockIndex}"`);
    if (w.imageBoxIndex !== undefined) wAttrs.push(`imageBoxIndex="${w.imageBoxIndex}"`);
    out.push(`<warning ${wAttrs.join(' ')}>${escapeText(w.message)}</warning>`);
  }
  out.push('</warnings>');
}

function appendText(out: string[], page: PageResult): void {
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
}

function appendOcr(out: string[], page: PageResult): void {
  if (!page.ocr) return;

  const ocrAttrs = `lang="${escapeAttr(page.ocr.lang)}" confidence="${page.ocr.confidence}"`;
  if ((page.ocr.words?.length ?? 0) > 0) {
    out.push(`<ocr ${ocrAttrs}>`);
    if (page.ocr.text) {
      out.push(`<text>\n${escapeText(page.ocr.text)}\n</text>`);
    }
    out.push('<words>');
    for (const word of page.ocr.words ?? []) {
      out.push(
        `<word text="${escapeAttr(word.text)}" confidence="${word.confidence}" x="${word.x}" y="${word.y}" width="${word.width}" height="${word.height}"/>`,
      );
    }
    out.push('</words>');
    out.push('</ocr>');
  } else if (page.ocr.text) {
    out.push(`<ocr ${ocrAttrs}>\n${escapeText(page.ocr.text)}\n</ocr>`);
  } else {
    // Self-closing keeps "OCR ran but found nothing" distinct from
    // "OCR was not requested" (the latter omits the tag entirely).
    out.push(`<ocr ${ocrAttrs}/>`);
  }
}
