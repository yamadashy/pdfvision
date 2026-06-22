import { parseArgs } from 'node:util';
import { exitWithError, formatCliErrorMessage } from './errors.js';
import { resolveOutputFormat } from './format.js';
import { HELP_TEXT } from './help.js';
import { readPasswordFromStdin, resolveInputSource } from './input.js';
import { resolveRenderOptions } from './renderOptions.js';
import type { ParsedCliValues, RunOptions } from './types.js';
import { getVersion } from './version.js';

export async function run(argv: string[] = process.argv.slice(2), options: RunOptions = {}): Promise<void> {
  let values: ParsedCliValues;
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
        remote: { type: 'string' },
        'clear-cache': { type: 'boolean' },
        ocr: { type: 'boolean' },
        'ocr-lang': { type: 'string', default: 'eng' },
        // --search is repeatable so `--search A --search B` works
        // (multi-query AND-merge into pages[].matches[]). The bool
        // companions modify ALL queries — case sensitivity / regex
        // semantics per-query would invite confusion.
        search: { type: 'string', multiple: true },
        'search-regex': { type: 'boolean' },
        'search-case-sensitive': { type: 'boolean' },
      },
    });
    values = parsed.values as ParsedCliValues;
    positionals = parsed.positionals;
  } catch (error) {
    exitWithError(formatCliErrorMessage(error));
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
      const { clearAllCache } = await import('../core/io/cache.js');
      const { path, removed } = clearAllCache();
      console.log(removed ? `Cleared pdfvision cache: ${path}` : `Nothing to clear: ${path} does not exist`);
      return;
    } catch (error) {
      exitWithError(formatCliErrorMessage(error));
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

  const format = resolveOutputFormat(values);
  const { render, renderOutput, renderScale, renderRegion, renderVisualRegions } = resolveRenderOptions(values);

  const layout = (values.layout as boolean | undefined) ?? false;
  const attachments = (values.attachments as boolean | undefined) ?? false;
  const attachmentOutput = values['attachment-output'] as string | undefined;
  if (attachmentOutput && !attachments) {
    exitWithError('--attachment-output requires --attachments');
  }

  const stripRepeated = (values['strip-repeated'] as boolean | undefined) ?? false;
  if (stripRepeated && !layout) {
    // `repeated: true` is only emitted by the cross-page layout pass,
    // so without --layout there is no signal to filter on. Mirrors the
    // --render-output / --render relationship above.
    exitWithError('--strip-repeated requires --layout');
  }
  if (stripRepeated && format !== 'markdown') {
    // The JSON / XML outputs already carry `repeated: true` on each
    // layout block, so consumers there can filter themselves. Strip
    // is only a Markdown-output concern — fail rather than silently
    // ignore so the user notices the flag had no effect.
    exitWithError(`--strip-repeated only applies to markdown output (got --format ${format})`);
  }

  // --search collects 0..N queries (multiple: true gives string[] |
  // undefined). The bool companions only make sense when at least one
  // query was passed — fail loud rather than silently no-op.
  const searchQueries = values.search as string[] | undefined;
  const searchRegex = (values['search-regex'] as boolean | undefined) ?? false;
  const searchCaseSensitive = (values['search-case-sensitive'] as boolean | undefined) ?? false;
  if (!searchQueries && (searchRegex || values['search-case-sensitive'])) {
    exitWithError('--search-regex / --search-case-sensitive require at least one --search query');
  }
  if (searchQueries?.some((q) => q === '')) {
    exitWithError('--search: query must be a non-empty string');
  }

  const noCache = (values['no-cache'] as boolean | undefined) ?? false;
  const passwordFromArg = values.password as string | undefined;
  const passwordStdin = (values['password-stdin'] as boolean | undefined) ?? false;
  const passwordFromStdin = passwordStdin ? await readPasswordFromStdin(options.stdin) : undefined;
  const password = passwordFromStdin && passwordFromStdin.length > 0 ? passwordFromStdin : passwordFromArg;
  if (passwordStdin && password === undefined) {
    exitWithError('--password-stdin requires piped stdin or --password fallback');
  }

  const { filePath, sourceData } = await resolveInputSource(remoteUrl, positionals, noCache);

  try {
    // Lazy-load the processor (and the heavy pdfjs-dist + optional
    // @napi-rs/canvas it pulls in) only after argument validation passes,
    // so --help / --version / bad-input paths stay snappy.
    const { processFile } = await import('../core/processor.js');
    const result = await processFile(filePath, {
      pages: values.pages as string | undefined,
      sourceData,
      password,
      format,
      render,
      renderOutput,
      renderScale,
      renderRegion,
      // search may be undefined (no --search), a 1-length array (single
      // --search), or a longer array (repeated --search). Pass through
      // as-is — the processor's compileSearch handles both shapes.
      search: searchQueries,
      searchRegex,
      searchCaseSensitive,
      noCache,
      // NFKC normalization is on by default — agents almost always want
      // canonical Unicode. --no-normalize lets callers opt out for cases
      // where the raw pdf.js code points matter (forensics, glyph-level
      // diffing, ...).
      normalize: !((values['no-normalize'] as boolean | undefined) ?? false),
      geometry: (values.geometry as boolean | undefined) ?? false,
      layout,
      imageBoxes: (values['image-boxes'] as boolean | undefined) ?? false,
      vectorBoxes: (values['vector-boxes'] as boolean | undefined) ?? false,
      visualRegions: ((values['visual-regions'] as boolean | undefined) ?? false) || renderVisualRegions,
      renderVisualRegions,
      formFields: (values['form-fields'] as boolean | undefined) ?? false,
      links: (values.links as boolean | undefined) ?? false,
      annotations: (values.annotations as boolean | undefined) ?? false,
      structure: (values.structure as boolean | undefined) ?? false,
      pageLabels: (values['page-labels'] as boolean | undefined) ?? false,
      attachments,
      attachmentOutput,
      outline: (values.outline as boolean | undefined) ?? false,
      viewer: (values.viewer as boolean | undefined) ?? false,
      layers: (values.layers as boolean | undefined) ?? false,
      stripRepeated,
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
    exitWithError(formatCliErrorMessage(error));
  }
}
