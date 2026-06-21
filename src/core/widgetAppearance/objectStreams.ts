import { inflateSync } from 'node:zlib';

export function extractObjectStreamBodies(body: string): { objectNumber: string; body: string }[] {
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
