/**
 * pdf.js exposes AcroForm values, flags, and actions, but currently does
 * not surface push-button captions from Widget appearance characteristics
 * (`/MK << /CA (...) >>`). This best-effort scanner covers the common
 * uncompressed indirect-object case without trying to become a full PDF
 * parser. It covers plain indirect objects and object streams compressed
 * with FlateDecode, which is common for optimized forms. When it cannot
 * prove a caption, callers simply omit it.
 */

import { extractObjectStreamBodies } from './widgetAppearance/objectStreams.js';
import { parsePdfStringToken } from './widgetAppearance/pdfStrings.js';

const MAX_WIDGET_CAPTION_CHARS = 500;

export function extractWidgetAppearanceCaptions(pdfBytes: Uint8Array): Map<string, string> {
  const text = Buffer.from(pdfBytes).toString('latin1');
  const captions = new Map<string, string>();
  const objectPattern = /(?:^|[\r\n])\s*(\d+)\s+(\d+)\s+obj\b/g;
  let match = objectPattern.exec(text);
  while (match !== null) {
    const objectNumber = match[1];
    const bodyStart = objectPattern.lastIndex;
    const endIndex = text.indexOf('endobj', bodyStart);
    if (endIndex < 0) break;
    objectPattern.lastIndex = endIndex + 'endobj'.length;
    const body = text.slice(bodyStart, endIndex);
    collectWidgetCaption(captions, objectNumber, body);
    for (const embedded of extractObjectStreamBodies(body)) {
      collectWidgetCaption(captions, embedded.objectNumber, embedded.body);
    }
    match = objectPattern.exec(text);
  }
  return captions;
}

function collectWidgetCaption(captions: Map<string, string>, objectNumber: string, body: string): void {
  if (!looksLikePushButtonWidget(body)) return;
  const caption = extractMarkerCaption(body);
  if (caption) captions.set(`${objectNumber}R`, caption);
}

function looksLikePushButtonWidget(body: string): boolean {
  if (!body.includes('/Subtype') || !body.includes('/Widget')) return false;
  if (!body.includes('/FT') || !body.includes('/Btn')) return false;
  if (!body.includes('/MK') || !body.includes('/CA')) return false;
  return true;
}

function extractMarkerCaption(body: string): string | undefined {
  const markerIndex = body.indexOf('/MK');
  if (markerIndex < 0) return undefined;
  const dictStart = body.indexOf('<<', markerIndex);
  if (dictStart < 0) return undefined;
  const dictEnd = findBalancedDictionaryEnd(body, dictStart);
  if (dictEnd < 0) return undefined;
  const markerDictionary = body.slice(dictStart, dictEnd);
  const captionIndex = markerDictionary.indexOf('/CA');
  if (captionIndex < 0) return undefined;
  const parsed = parsePdfStringToken(markerDictionary, captionIndex + 3);
  if (!parsed) return undefined;
  const caption = parsed.trim().replace(/\s+/gu, ' ');
  if (caption.length === 0 || caption.length > MAX_WIDGET_CAPTION_CHARS) return undefined;
  return caption;
}

function findBalancedDictionaryEnd(input: string, start: number): number {
  let depth = 0;
  for (let index = start; index < input.length - 1; index++) {
    const pair = input.slice(index, index + 2);
    if (pair === '<<') {
      depth++;
      index++;
      continue;
    }
    if (pair === '>>') {
      depth--;
      index++;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}
