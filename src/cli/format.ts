import type { OutputFormat } from '../types/index.js';
import { exitWithError } from './errors.js';
import type { ParsedCliValues } from './types.js';

const VALID_FORMATS: readonly OutputFormat[] = ['markdown', 'json', 'xml', 'toon'];

export function resolveOutputFormat(values: ParsedCliValues): OutputFormat {
  // Resolve the output format from the canonical `-f / --format` flag
  // plus the `--markdown` / `--json` / `--xml` shortcut aliases. The
  // canonical form is kept for completeness (future formats like html,
  // jsonl can ride on it without inventing yet another shortcut) but
  // the aliases are what most callers will reach for.
  const aliasFormats: OutputFormat[] = [];
  if (values.markdown) aliasFormats.push('markdown');
  if (values.json) aliasFormats.push('json');
  if (values.xml) aliasFormats.push('xml');
  if (values.toon) aliasFormats.push('toon');
  if (aliasFormats.length > 1) {
    // Different aliases at once means the user typed two contradicting
    // requests — silently picking last-wins would hide the intent
    // mismatch. Fail loudly.
    exitWithError(`Output format specified multiple times: ${aliasFormats.map((a) => `--${a}`).join(', ')}`);
  }
  const explicitFormat = values.format as string | undefined;
  if (aliasFormats.length === 1 && explicitFormat !== undefined && explicitFormat !== aliasFormats[0]) {
    // Alias and `-f` disagree (e.g. `--json -f xml`) — also a clear
    // intent conflict.
    exitWithError(`Output format conflict: --${aliasFormats[0]} vs --format ${explicitFormat}`);
  }
  // Pick alias if present, otherwise the explicit `-f` value, otherwise
  // default to markdown. Same-value duplicates (`--json -f json`) are
  // allowed and idempotent so a script that composes flags from
  // multiple sources doesn't blow up on accidental redundancy.
  const format = aliasFormats[0] ?? explicitFormat ?? 'markdown';
  if (!isValidFormat(format)) {
    exitWithError(`Invalid --format "${format}". Expected one of: ${VALID_FORMATS.join(', ')}`);
  }
  return format;
}

function isValidFormat(value: string): value is OutputFormat {
  return (VALID_FORMATS as readonly string[]).includes(value);
}
