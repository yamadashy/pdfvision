/**
 * pdf.js exposes AcroForm values, flags, and actions, but currently does
 * not surface push-button captions from Widget appearance characteristics
 * (`/MK << /CA (...) >>`). This best-effort scanner covers the common
 * uncompressed indirect-object case without trying to become a full PDF
 * parser. It covers plain indirect objects and object streams compressed
 * with FlateDecode, which is common for optimized forms. When it cannot
 * prove a caption, callers simply omit it.
 */

import { inflateSync } from 'node:zlib';

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

function extractObjectStreamBodies(body: string): { objectNumber: string; body: string }[] {
  if (!body.includes('/ObjStm')) return [];
  const objectCount = pdfNumberAfterName(body, 'N');
  const firstObjectOffset = pdfNumberAfterName(body, 'First');
  if (objectCount === undefined || firstObjectOffset === undefined) return [];
  const rawStream = extractRawStream(body);
  const stream = rawStream ? decodeObjectStream(body, rawStream) : undefined;
  if (!stream || firstObjectOffset < 0 || firstObjectOffset >= stream.length) return [];
  const header = stream
    .slice(0, firstObjectOffset)
    .trim()
    .split(/\s+/u)
    .map((part) => Number.parseInt(part, 10));
  if (header.length < objectCount * 2 || header.some((value) => !Number.isFinite(value))) return [];

  const embedded: { objectNumber: string; offset: number }[] = [];
  for (let index = 0; index < objectCount * 2; index += 2) {
    embedded.push({ objectNumber: String(header[index]), offset: header[index + 1] });
  }

  return embedded.flatMap((item, index) => {
    const start = firstObjectOffset + item.offset;
    const end = firstObjectOffset + (embedded[index + 1]?.offset ?? stream.length - firstObjectOffset);
    if (start < firstObjectOffset || start >= stream.length || end <= start) return [];
    return [{ objectNumber: item.objectNumber, body: stream.slice(start, Math.min(end, stream.length)) }];
  });
}

function decodeObjectStream(body: string, stream: string): string | undefined {
  const dictionary = dictionaryBeforeStream(body);
  const filters = pdfFilterNames(dictionary);
  if (filters.length === 0) return stream;
  if (filters.length !== 1 || !isFlateDecodeFilter(filters[0])) return undefined;
  try {
    return inflateSync(Buffer.from(stream, 'latin1')).toString('latin1');
  } catch {
    return undefined;
  }
}

function dictionaryBeforeStream(body: string): string {
  const streamIndex = body.indexOf('stream');
  return streamIndex < 0 ? body : body.slice(0, streamIndex);
}

function pdfFilterNames(dictionary: string): string[] {
  const match = /\/Filter\s*(\[[^\]]+\]|\/[A-Za-z0-9]+)/u.exec(dictionary);
  if (!match) return [];
  return Array.from(match[1].matchAll(/\/([A-Za-z0-9]+)/gu), (filterMatch) => filterMatch[1]);
}

function isFlateDecodeFilter(name: string): boolean {
  return name === 'FlateDecode' || name === 'Fl';
}

function pdfNumberAfterName(body: string, name: string): number | undefined {
  const match = new RegExp(`/${name}\\s+(\\d+)`, 'u').exec(body);
  if (!match) return undefined;
  return Number.parseInt(match[1], 10);
}

function extractRawStream(body: string): string | undefined {
  const streamIndex = body.indexOf('stream');
  if (streamIndex < 0) return undefined;
  let start = streamIndex + 'stream'.length;
  if (body[start] === '\r' && body[start + 1] === '\n') start += 2;
  else if (body[start] === '\r' || body[start] === '\n') start += 1;
  const end = body.lastIndexOf('endstream');
  if (end <= start) return undefined;
  return body.slice(start, end);
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

function parsePdfStringToken(input: string, start: number): string | undefined {
  let index = skipPdfWhitespace(input, start);
  if (input[index] === '(') {
    const parsed = parseLiteralString(input, index);
    return parsed ? decodePdfStringBytes(parsed) : undefined;
  }
  if (input[index] === '<' && input[index + 1] !== '<') {
    index++;
    const end = input.indexOf('>', index);
    if (end < 0) return undefined;
    const hex = input.slice(index, end).replace(/\s+/gu, '');
    if (!/^[0-9A-Fa-f]*$/u.test(hex)) return undefined;
    const padded = hex.length % 2 === 0 ? hex : `${hex}0`;
    const bytes = Uint8Array.from(padded.match(/.{2}/gu)?.map((pair) => Number.parseInt(pair, 16)) ?? []);
    return decodePdfStringBytes(bytes);
  }
  return undefined;
}

function skipPdfWhitespace(input: string, start: number): number {
  let index = start;
  while (index < input.length && isPdfWhitespace(input.charCodeAt(index))) index++;
  return index;
}

function isPdfWhitespace(code: number): boolean {
  return code === 0x00 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d || code === 0x20;
}

function parseLiteralString(input: string, start: number): Uint8Array | undefined {
  const bytes: number[] = [];
  let depth = 0;
  for (let index = start; index < input.length; index++) {
    const char = input[index];
    if (char === '(') {
      if (depth > 0) bytes.push(char.charCodeAt(0));
      depth++;
      continue;
    }
    if (char === ')') {
      depth--;
      if (depth === 0) return Uint8Array.from(bytes);
      bytes.push(char.charCodeAt(0));
      continue;
    }
    if (char !== '\\') {
      bytes.push(char.charCodeAt(0) & 0xff);
      continue;
    }
    index++;
    if (index >= input.length) break;
    const escaped = input[index];
    switch (escaped) {
      case 'n':
        bytes.push(0x0a);
        break;
      case 'r':
        bytes.push(0x0d);
        break;
      case 't':
        bytes.push(0x09);
        break;
      case 'b':
        bytes.push(0x08);
        break;
      case 'f':
        bytes.push(0x0c);
        break;
      case '\r':
        if (input[index + 1] === '\n') index++;
        break;
      case '\n':
        break;
      default: {
        if (/[0-7]/u.test(escaped)) {
          let octal = escaped;
          for (let count = 0; count < 2 && /[0-7]/u.test(input[index + 1] ?? ''); count++) {
            index++;
            octal += input[index];
          }
          bytes.push(Number.parseInt(octal, 8) & 0xff);
        } else {
          bytes.push(escaped.charCodeAt(0) & 0xff);
        }
      }
    }
  }
  return undefined;
}

function decodePdfStringBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return decodeUtf16(bytes.subarray(2), false);
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return decodeUtf16(bytes.subarray(2), true);
  }
  const utf8 = Buffer.from(bytes).toString('utf8');
  if (!utf8.includes('\ufffd')) return utf8;
  return Buffer.from(bytes).toString('latin1');
}

function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  const chars: string[] = [];
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    const code = littleEndian ? bytes[index] | (bytes[index + 1] << 8) : (bytes[index] << 8) | bytes[index + 1];
    chars.push(String.fromCharCode(code));
  }
  return chars.join('');
}
