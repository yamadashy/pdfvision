export function parsePdfStringToken(input: string, start: number): string | undefined {
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
