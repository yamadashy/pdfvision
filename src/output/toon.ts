import { encode } from '@toon-format/toon';
import type { DocumentResult } from '../types/index.js';

const PROPERTY_KEY_PREVIEW_CODE_UNITS = 80;

interface UnpairedSurrogate {
  codeUnit: number;
  index: number;
  key?: string;
  location: 'key' | 'value';
  path: string;
}

function propertyKeyPreview(key: string): string {
  const truncated = key.length > PROPERTY_KEY_PREVIEW_CODE_UNITS;
  const preview = truncated ? key.slice(0, PROPERTY_KEY_PREVIEW_CODE_UNITS) : key;
  return `${JSON.stringify(preview)}${truncated ? '…' : ''}`;
}

function propertyPath(parent: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) && key.length <= PROPERTY_KEY_PREVIEW_CODE_UNITS
    ? `${parent}.${key}`
    : `${parent}[${propertyKeyPreview(key)}]`;
}

function findUnpairedSurrogate(value: unknown): UnpairedSurrogate | undefined {
  const pending: { key?: string; location: 'key' | 'value'; path: string; value: unknown }[] = [
    { location: 'value', path: '$', value },
  ];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;

    if (typeof current.value === 'string') {
      for (let index = 0; index < current.value.length; index += 1) {
        const codeUnit = current.value.charCodeAt(index);
        if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
          const next = current.value.charCodeAt(index + 1);
          if (next >= 0xdc00 && next <= 0xdfff) {
            index += 1;
            continue;
          }
          return { codeUnit, index, key: current.key, location: current.location, path: current.path };
        }
        if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
          return { codeUnit, index, key: current.key, location: current.location, path: current.path };
        }
      }
      continue;
    }

    if (Array.isArray(current.value)) {
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        pending.push({ location: 'value', path: `${current.path}[${index}]`, value: current.value[index] });
      }
      continue;
    }

    if (current.value !== null && typeof current.value === 'object') {
      const entries = Object.entries(current.value);
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const [key, child] = entries[index];
        pending.push({ location: 'value', path: propertyPath(current.path, key), value: child });
        pending.push({ key, location: 'key', path: current.path, value: key });
      }
    }
  }

  return undefined;
}

/**
 * TOON (Token-Oriented Object Notation) output. Decoding exactly matches
 * the parsed JSON formatter output, but the wire representation is
 * tuned for LLM token budgets: arrays whose entries all have the same
 * fields can collapse into a CSV-like tabular form that declares field names
 * once instead of repeating every key on every row. A uniformly-shaped nested
 * object folds into that header (normal `overview[]` tabularizes with
 * `quality{nativeTextStatus}` since TOON v4). Arrays stay in list form when
 * entries have differing optional fields (as `spans[]` or lines can),
 * array-valued fields, or nested objects whose shapes differ between entries.
 * This can reduce repeated-key overhead when eligible arrays dominate the
 * output; consumers should compare formats on their own documents.
 *
 * The encoding round-trips back to the JSON data model via `decode`, with
 * unset `undefined` fields absent just as they are after `JSON.parse`. TOON's
 * string grammar cannot represent an unpaired UTF-16 surrogate losslessly:
 * the decoder rejects a `\uD800` escape, while a raw surrogate is replaced by
 * U+FFFD at the UTF-8 output boundary. We therefore reject such input and
 * direct callers to JSON, which preserves lone surrogates as escapes. Valid
 * surrogate pairs and literal backslash-u text remain ordinary TOON strings.
 *
 * We encode the JSON-normalized form (`JSON.parse(JSON.stringify(...))`)
 * rather than the raw result: the TOON encoder renders an object property
 * whose value is `undefined` as an explicit `null`, whereas `JSON.stringify`
 * drops it. Optional fields like `image` / `ocr` / `layout` are `undefined`
 * on a fresh extraction but absent after a cache round-trip (disk JSON
 * strips them), so encoding the raw object would make `-f toon` emit
 * spurious `field: null` lines that (a) disagree with `-f json` and
 * (b) flip depending on cache state. Normalizing first keeps TOON output
 * field-isomorphic with the JSON output and stable across cache hits.
 */
export function encodeJsonModelAsToon(value: unknown): string {
  const jsonModel: unknown = JSON.parse(JSON.stringify(value));
  const unpaired = findUnpairedSurrogate(jsonModel);
  if (unpaired) {
    const codeUnit = unpaired.codeUnit.toString(16).toUpperCase().padStart(4, '0');
    const location =
      unpaired.location === 'key'
        ? `${unpaired.path} (property key ${propertyKeyPreview(unpaired.key ?? '')}, code-unit index ${unpaired.index})`
        : `${unpaired.path}[${unpaired.index}]`;
    throw new Error(
      `TOON cannot losslessly encode unpaired UTF-16 surrogate U+${codeUnit} at ${location}; use JSON output to preserve this string across UTF-8`,
    );
  }
  return encode(jsonModel);
}

export function formatToon(result: DocumentResult): string {
  return encodeJsonModelAsToon(result);
}
