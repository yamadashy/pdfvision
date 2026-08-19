import type { parseArgs } from 'node:util';

/**
 * The `parseArgs` option spec, lifted out of `run()` so it is one exported
 * list rather than a literal buried in a function. `tests/cli/help.test.ts`
 * walks it to prove every option is documented somewhere an agent can reach
 * — the check that keeps a shrunken `--help` honest.
 */
export const CLI_PARSE_OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  pages: { type: 'string', short: 'p' },
  // Canonical format flag — `default` is intentionally NOT set
  // here so we can tell "user typed -f X" apart from "no -f at
  // all"; that distinction is needed when reconciling against
  // the `--markdown` / `--json` / `--xml` shortcut flags below.
  format: { type: 'string', short: 'f' },
  markdown: { type: 'boolean' },
  json: { type: 'boolean' },
  xml: { type: 'boolean' },
  toon: { type: 'boolean' },
  render: { type: 'boolean', short: 'r' },
  'render-output': { type: 'string' },
  'render-scale': { type: 'string' },
  'render-region': { type: 'string' },
  'no-cache': { type: 'boolean' },
  'no-normalize': { type: 'boolean' },
  password: { type: 'string' },
  'password-stdin': { type: 'boolean' },
  geometry: { type: 'boolean' },
  layout: { type: 'boolean' },
  'image-boxes': { type: 'boolean' },
  'vector-boxes': { type: 'boolean' },
  'visual-regions': { type: 'boolean' },
  'render-visual-regions': { type: 'boolean' },
  'form-fields': { type: 'boolean' },
  links: { type: 'boolean' },
  annotations: { type: 'boolean' },
  structure: { type: 'boolean' },
  'page-labels': { type: 'boolean' },
  attachments: { type: 'boolean' },
  'attachment-output': { type: 'string' },
  outline: { type: 'boolean' },
  viewer: { type: 'boolean' },
  layers: { type: 'boolean' },
  'strip-repeated': { type: 'boolean' },
  map: { type: 'boolean' },
  remote: { type: 'string' },
  'clear-cache': { type: 'boolean' },
  ocr: { type: 'boolean' },
  // `default` is intentionally NOT set here either — the default lives at the
  // use site so that `--ocr-lang` without `--ocr` is detectable and can be
  // rejected instead of silently doing nothing.
  'ocr-lang': { type: 'string' },
  // --search is repeatable so `--search A --search B` works
  // (multi-query AND-merge into pages[].matches[]). The bool
  // companions modify ALL queries — case sensitivity / regex
  // semantics per-query would invite confusion.
  search: { type: 'string', multiple: true },
  'search-regex': { type: 'boolean' },
  'search-case-sensitive': { type: 'boolean' },
  'matches-only': { type: 'boolean' },
} satisfies NonNullable<Parameters<typeof parseArgs>[0]>['options'];
