import { accessSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { OutputFormat } from '../types/index.js';
import { HELP_TEXT } from './help.js';
import { getVersion } from './version.js';

const VALID_FORMATS: readonly OutputFormat[] = ['markdown', 'json'];

function isValidFormat(value: string): value is OutputFormat {
  return (VALID_FORMATS as readonly string[]).includes(value);
}

function exitWithError(message: string): never {
  console.error(`Error: ${message}`);
  console.error('Run "pdfvision --help" for usage.');
  process.exit(1);
}

export async function run(argv: string[] = process.argv.slice(2)): Promise<void> {
  let values: Record<string, string | boolean | undefined>;
  let positionals: string[];
  try {
    // parseArgs throws on unknown options or missing required values.
    // Catch here so the user gets a clean message instead of the
    // bin/pdfvision.ts top-level "Fatal Error: ..." stack-trace prefix.
    const parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        pages: { type: 'string', short: 'p' },
        format: { type: 'string', short: 'f', default: 'markdown' },
        render: { type: 'boolean', short: 'r' },
        'render-output': { type: 'string' },
        'no-cache': { type: 'boolean' },
        'no-normalize': { type: 'boolean' },
        geometry: { type: 'boolean' },
      },
    });
    values = parsed.values as Record<string, string | boolean | undefined>;
    positionals = parsed.positionals;
  } catch (error) {
    exitWithError(error instanceof Error ? error.message : String(error));
  }

  if (values.version) {
    console.log(getVersion());
    return;
  }

  if (values.help || positionals.length === 0) {
    console.log(HELP_TEXT);
    return;
  }

  if (positionals.length > 1) {
    exitWithError(`Unexpected extra arguments: ${positionals.slice(1).join(' ')}`);
  }

  const format = (values.format as string) ?? 'markdown';
  if (!isValidFormat(format)) {
    exitWithError(`Invalid --format "${format}". Expected one of: ${VALID_FORMATS.join(', ')}`);
  }

  const renderOutput = values['render-output'] as string | undefined;
  const render = (values.render as boolean | undefined) ?? false;
  if (renderOutput && !render) {
    // --render-output only does something if pages are actually rendered.
    // Failing fast is friendlier than silently writing nothing to the dir.
    exitWithError('--render-output requires --render');
  }

  const filePath = resolve(positionals[0]);

  try {
    accessSync(filePath);
  } catch {
    exitWithError(`File not found: ${filePath}`);
  }

  try {
    // Lazy-load the processor (and the heavy pdfjs-dist + optional
    // @napi-rs/canvas it pulls in) only after argument validation passes,
    // so --help / --version / bad-input paths stay snappy.
    const { processFile } = await import('../core/processor.js');
    const result = await processFile(filePath, {
      pages: values.pages as string | undefined,
      format,
      render,
      renderOutput,
      noCache: (values['no-cache'] as boolean | undefined) ?? false,
      // NFKC normalization is on by default — agents almost always want
      // canonical Unicode. --no-normalize lets callers opt out for cases
      // where the raw pdf.js code points matter (forensics, glyph-level
      // diffing, ...).
      normalize: !((values['no-normalize'] as boolean | undefined) ?? false),
      geometry: (values.geometry as boolean | undefined) ?? false,
    });
    console.log(result);
  } catch (error) {
    exitWithError(error instanceof Error ? error.message : String(error));
  }
}
