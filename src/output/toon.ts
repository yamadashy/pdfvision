import { encode } from '@toon-format/toon';
import type { DocumentResult } from '../types/index.js';

/**
 * TOON (Token-Oriented Object Notation) output. A lossless, schema-aware
 * encoding of the same `DocumentResult` the JSON formatter emits, but
 * tuned for LLM token budgets: arrays whose entries all have the same scalar
 * fields can collapse into a CSV-like tabular form that declares field names
 * once instead of repeating every key on every row. Arrays with nested values
 * (including normal `overview[]`, whose entries contain `quality`) stay in list
 * form, as can `spans[]` or lines whose entries have differing optional fields.
 * This can reduce repeated-key overhead when eligible arrays dominate the
 * output; consumers should compare formats on their own documents.
 *
 * The encoding round-trips back to the JSON data model via `decode`, so
 * programmatic consumers lose nothing relative to `-f json`.
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
export function formatToon(result: DocumentResult): string {
  return encode(JSON.parse(JSON.stringify(result)));
}
