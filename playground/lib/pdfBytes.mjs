// Byte-level edits for cases about PDF internals (a font whose ToUnicode
// lies, a font with none). A case's `postprocess(bytes)` runs after pdfkit and
// before case.pdf is written; these helpers do the edit and rewrite the file
// with fresh offsets, `/Length`s, xref table and `startxref`.
//
// Scope is pdfkit's own output: one revision, a classic xref table, no object
// streams. Objects are located through the xref table rather than by scanning
// for `endobj`, so binary stream data (embedded font programs) cannot confuse
// the parser. Streams compressed with FlateDecode are inflated on read; a
// stream written back is stored uncompressed, which keeps the output
// deterministic and readable. Set `meta.compress: false` when the case also
// wants its content streams readable in the file.

import { inflateSync } from 'node:zlib';

function fail(message) {
  throw new Error(`pdfBytes: ${message}`);
}

/**
 * Parse pdfkit output into `{ header, objects: Map<num, string>, trailer }`.
 * Each object is the latin1 text of `N 0 obj … endobj` (latin1 maps bytes
 * 1:1, so binary stream data survives the round trip).
 */
export function parsePdf(bytes) {
  const src = Buffer.from(bytes).toString('latin1');
  const startMatch = /startxref\s+(\d+)\s+%%EOF\s*$/u.exec(src);
  if (!startMatch) fail('no startxref at the end of the file');
  const xrefAt = Number(startMatch[1]);
  if (!src.startsWith('xref', xrefAt)) fail('startxref does not point at a classic xref table');
  const trailerAt = src.indexOf('trailer', xrefAt);
  const rows = src
    .slice(xrefAt + 4, trailerAt)
    .trim()
    .split(/\r?\n/u);
  const [first, count] = rows.shift().trim().split(/\s+/u).map(Number);
  if (first !== 0 || count !== rows.length) fail('expected a single xref subsection starting at object 0');

  const used = [];
  rows.forEach((row, num) => {
    const [offset, , kind] = row.trim().split(/\s+/u);
    if (kind === 'n') used.push({ num, offset: Number(offset) });
  });
  const sorted = [...used].sort((a, b) => a.offset - b.offset);
  const objects = new Map();
  sorted.forEach(({ num, offset }, i) => {
    const end = i + 1 < sorted.length ? sorted[i + 1].offset : xrefAt;
    const text = src.slice(offset, end);
    if (!text.startsWith(`${num} 0 obj`)) fail(`xref entry for object ${num} does not point at its header`);
    objects.set(num, text.replace(/\s+$/u, '\n'));
  });
  const trailer = src.slice(trailerAt + 'trailer'.length, src.indexOf('startxref', trailerAt)).trim();
  return { header: src.slice(0, sorted[0].offset), objects, size: count, trailer };
}

/** Serialise a parsed PDF, regenerating the xref table (with a free list) and startxref. */
export function serializePdf({ header, objects, size, trailer }) {
  let out = header;
  const offsets = new Map();
  for (const num of [...objects.keys()].sort((a, b) => a - b)) {
    offsets.set(num, out.length);
    out += objects.get(num);
  }
  const xrefAt = out.length;
  const free = [];
  for (let num = 1; num < size; num += 1) if (!offsets.has(num)) free.push(num);
  const nextFree = (num) => free.find((candidate) => candidate > num) ?? 0;
  const pad = (value, width) => String(value).padStart(width, '0');
  const rows = [`${pad(nextFree(0), 10)} 65535 f `];
  for (let num = 1; num < size; num += 1) {
    rows.push(offsets.has(num) ? `${pad(offsets.get(num), 10)} 00000 n ` : `${pad(nextFree(num), 10)} 00001 f `);
  }
  out += `xref\n0 ${size}\n${rows.join('\n')}\ntrailer\n${trailer}\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** The dictionary text of an object (between `obj` and `stream`/`endobj`). */
export function objectDict(objectText) {
  const body = objectText.slice(objectText.indexOf('obj') + 3);
  const streamAt = body.search(/\bstream\r?\n/u);
  return (streamAt >= 0 ? body.slice(0, streamAt) : body.slice(0, body.lastIndexOf('endobj'))).trim();
}

/** The decoded stream data of an object (latin1 string), inflating FlateDecode. */
export function objectStream(objectText) {
  const match = /\bstream\r?\n/u.exec(objectText);
  if (!match) fail('object has no stream');
  const length = Number(/\/Length\s+(\d+)/u.exec(objectDict(objectText))?.[1]);
  if (!Number.isFinite(length)) fail('stream /Length is missing or indirect');
  const raw = Buffer.from(objectText.slice(match.index + match[0].length).slice(0, length), 'latin1');
  return (/\/Filter\s*\/FlateDecode/u.test(objectDict(objectText)) ? inflateSync(raw) : raw).toString('latin1');
}

/** Object text for `num` with `dict` and, optionally, an uncompressed stream whose /Length is set here. */
export function makeObject(num, dict, stream) {
  if (stream === undefined) return `${num} 0 obj\n${dict}\nendobj\n`;
  const data = Buffer.from(stream, 'latin1');
  const bare = dict.replace(/\/Length\s+\d+(\s+\d+\s+R)?/u, '').replace(/\/Filter\s*\/\w+/u, '');
  const withLength = bare.replace(/^<<\s*/u, `<<\n/Length ${data.length}\n`);
  return `${num} 0 obj\n${withLength}\nstream\n${data.toString('latin1')}\nendstream\nendobj\n`;
}

/**
 * Run `edit(pdf)` on parsed bytes and return the re-serialised file. `pdf`
 * carries `objects` (Map num → text) plus `get`, `set(num, dict, stream?)`,
 * `remove(num)` and `ref(dict, key)` (the object number a key points to).
 */
export function editPdf(bytes, edit) {
  const pdf = parsePdf(bytes);
  const api = {
    ...pdf,
    get(num) {
      const text = pdf.objects.get(num);
      if (text === undefined) fail(`no object ${num}`);
      return text;
    },
    set(num, dict, stream) {
      pdf.objects.set(num, makeObject(num, dict, stream));
    },
    remove(num) {
      pdf.objects.delete(num);
    },
    ref(dict, key) {
      const match = new RegExp(`/${key}\\s+(\\d+)\\s+0\\s+R`, 'u').exec(dict);
      return match ? Number(match[1]) : undefined;
    },
  };
  edit(api);
  return serializePdf(pdf);
}

/**
 * The one Type0 font object whose /BaseFont contains `name` (pdfkit names an
 * embedded subset `ABCDEF+<PostScriptName>`, e.g. `NotoSansJP-Regular`).
 */
export function findFont(pdf, name) {
  const matches = [...pdf.objects].filter(([, text]) => {
    const dict = objectDict(text);
    return /\/Type\s*\/Font\b/u.test(dict) && /\/Subtype\s*\/Type0\b/u.test(dict) && dict.includes(name);
  });
  if (matches.length !== 1) fail(`expected one Type0 font matching ${name}, found ${matches.length}`);
  return matches[0][0];
}

const hexToText = (hex) => {
  const units = [];
  for (let i = 0; i < hex.length; i += 4) units.push(Number.parseInt(hex.slice(i, i + 4), 16));
  return String.fromCharCode(...units);
};
const textToHex = (text) =>
  [...text]
    .flatMap((ch) => {
      const units = [];
      for (let i = 0; i < ch.length; i += 1) units.push(ch.charCodeAt(i).toString(16).padStart(4, '0'));
      return units;
    })
    .join('');

/** Parse a ToUnicode CMap's bfchar and bfrange entries into Map<code hex, text>. */
export function parseToUnicode(cmap) {
  const map = new Map();
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/gu)) {
    for (const [, code, text] of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/gu)) {
      map.set(code.toLowerCase(), hexToText(text));
    }
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/gu)) {
    const entry = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]*>)/gu;
    for (const [, lo, hi, target] of block[1].matchAll(entry)) {
      const width = lo.length;
      const start = Number.parseInt(lo, 16);
      const end = Number.parseInt(hi, 16);
      const list = target.startsWith('[') ? [...target.matchAll(/<([0-9a-fA-F]*)>/gu)].map((m) => m[1]) : null;
      for (let code = start; code <= end; code += 1) {
        const key = code.toString(16).padStart(width, '0');
        if (list) map.set(key, hexToText(list[code - start] ?? ''));
        else {
          const base = Number.parseInt(target.slice(1, -1), 16) + (code - start);
          map.set(key, String.fromCharCode(base));
        }
      }
    }
  }
  return map;
}

/** A ToUnicode CMap (2-byte codespace, bfchar entries only) for Map<code hex, text>. */
export function buildToUnicode(map) {
  const entries = [...map].sort(([a], [b]) => a.localeCompare(b));
  const chunks = [];
  for (let i = 0; i < entries.length; i += 100) {
    const chunk = entries.slice(i, i + 100);
    chunks.push(
      `${chunk.length} beginbfchar\n${chunk.map(([code, text]) => `<${code}> <${textToHex(text)}>`).join('\n')}\nendbfchar`,
    );
  }
  return [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <ffff>',
    'endcodespacerange',
    ...chunks,
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end',
  ].join('\n');
}

/**
 * Rewrite the ToUnicode CMap of the font matching `font` so that every glyph
 * whose text is a key of `replace` extracts as the value instead — the glyph
 * itself, and so the rendered page, is untouched. Throws if a key is not in
 * the font (the case would silently stop testing anything).
 */
export function rewriteToUnicode(bytes, { font, replace }) {
  return editPdf(bytes, (pdf) => {
    const fontNum = findFont(pdf, font);
    const cmapNum = pdf.ref(objectDict(pdf.get(fontNum)), 'ToUnicode');
    if (cmapNum === undefined) fail(`${font} has no ToUnicode to rewrite`);
    const map = parseToUnicode(objectStream(pdf.get(cmapNum)));
    const seen = new Set();
    for (const [code, text] of map) {
      if (Object.hasOwn(replace, text)) {
        map.set(code, replace[text]);
        seen.add(text);
      }
    }
    const absent = Object.keys(replace).filter((text) => !seen.has(text));
    if (absent.length > 0) fail(`${font} draws no glyph for ${absent.map((t) => JSON.stringify(t)).join(', ')}`);
    pdf.set(cmapNum, '<<\n>>', buildToUnicode(map));
  });
}

/** Drop the ToUnicode CMap of the font matching `font` (dictionary entry and stream object). */
export function removeToUnicode(bytes, { font }) {
  return editPdf(bytes, (pdf) => {
    const fontNum = findFont(pdf, font);
    const dict = objectDict(pdf.get(fontNum));
    const cmapNum = pdf.ref(dict, 'ToUnicode');
    if (cmapNum === undefined) fail(`${font} has no ToUnicode to remove`);
    pdf.set(fontNum, dict.replace(/\s*\/ToUnicode\s+\d+\s+0\s+R/u, ''));
    pdf.remove(cmapNum);
  });
}
