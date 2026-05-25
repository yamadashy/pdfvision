import { encode } from '@toon-format/toon';
import type { DocumentResult } from '../types/index.js';

/**
 * TOON (Token-Oriented Object Notation) output. A lossless, schema-aware
 * encoding of the same `DocumentResult` the JSON formatter emits, but
 * tuned for LLM token budgets: uniform object arrays (`overview`, `spans`,
 * `imageBoxes`, `layout.blocks[].lines`, ...) collapse into a CSV-like
 * tabular form that declares field names once instead of repeating every
 * key on every row. On geometry / layout-heavy output — where spans can
 * outnumber the textual length 5–10× — this is ~40% fewer tokens than the
 * pretty-printed JSON. On plain text-body extraction the win is smaller,
 * because free text doesn't compress.
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
