import { accessSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { OutputFormat } from '../types/index.js';
import { HELP_TEXT } from './help.js';
import { getVersion } from './version.js';

const VALID_FORMATS: readonly OutputFormat[] = ['markdown', 'json', 'xml'];

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
        layout: { type: 'boolean' },
        'image-boxes': { type: 'boolean' },
        remote: { type: 'string' },
        'clear-cache': { type: 'boolean' },
        ocr: { type: 'boolean' },
        'ocr-lang': { type: 'string', default: 'eng' },
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

  if (values['clear-cache']) {
    // --clear-cache is a side-effect operation that ignores everything
    // else: no extraction runs, no positional needed, just nuke the
    // shared pdfvision cache and exit. Lazy-import to keep the heavy
    // node:fs surface out of --help / --version paths.
    try {
      const { clearAllCache } = await import('../core/cache.js');
      const { path, removed } = clearAllCache();
      console.log(removed ? `Cleared pdfvision cache: ${path}` : `Nothing to clear: ${path} does not exist`);
      return;
    } catch (error) {
      exitWithError(error instanceof Error ? error.message : String(error));
    }
  }

  const remoteUrl = values.remote as string | undefined;
  // --help is requested explicitly OR there's no input source at all
  // (no positional and no --remote URL). Print help and bail.
  if (values.help || (positionals.length === 0 && !remoteUrl)) {
    console.log(HELP_TEXT);
    return;
  }

  if (positionals.length > 1) {
    exitWithError(`Unexpected extra arguments: ${positionals.slice(1).join(' ')}`);
  }
  if (remoteUrl && positionals.length > 0) {
    // Two input sources at once is almost certainly a mistake — bail
    // rather than silently picking one over the other.
    exitWithError('--remote and a file path are mutually exclusive');
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

  const noCache = (values['no-cache'] as boolean | undefined) ?? false;

  let filePath: string;
  if (remoteUrl) {
    try {
      const { downloadRemote } = await import('../core/remote.js');
      filePath = await downloadRemote(remoteUrl, { noCache });
    } catch (error) {
      exitWithError(error instanceof Error ? error.message : String(error));
    }
  } else {
    filePath = resolve(positionals[0]);
    try {
      accessSync(filePath);
    } catch {
      exitWithError(`File not found: ${filePath}`);
    }
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
      noCache,
      // NFKC normalization is on by default — agents almost always want
      // canonical Unicode. --no-normalize lets callers opt out for cases
      // where the raw pdf.js code points matter (forensics, glyph-level
      // diffing, ...).
      normalize: !((values['no-normalize'] as boolean | undefined) ?? false),
      geometry: (values.geometry as boolean | undefined) ?? false,
      layout: (values.layout as boolean | undefined) ?? false,
      imageBoxes: (values['image-boxes'] as boolean | undefined) ?? false,
      ocr: (values.ocr as boolean | undefined) ?? false,
      ocrLang: (values['ocr-lang'] as string | undefined) ?? 'eng',
      // Library callers stay silent by default; the CLI wires warnings
      // to stderr so users see them alongside the formatted output on
      // stdout. Single-line "pdfvision: warning: ..." prefix matches
      // the existing CLI error format from `exitWithError`.
      onWarning: (msg) => {
        process.stderr.write(`pdfvision: warning: ${msg}\n`);
      },
    });
    console.log(result);
  } catch (error) {
    exitWithError(error instanceof Error ? error.message : String(error));
  }
}
