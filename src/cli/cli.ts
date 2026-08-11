import { parseArgs } from 'node:util';
import { resolveClearCacheCommand } from './clearCacheCommand.js';
import { exitWithError, formatCliErrorMessage } from './errors.js';
import { resolveOutputFormat } from './format.js';
import { CLEAR_CACHE_HELP_TEXT, HELP_TEXT, MCP_HELP_TEXT } from './help.js';
import { readPasswordFromStdin, resolveInputSource } from './input.js';
import { resolveMcpCommand } from './mcpCommand.js';
import { resolveRenderOptions } from './renderOptions.js';
import type { ParsedCliValues, RunOptions } from './types.js';
import { getVersion } from './version.js';

// A full LLM context class starts around 256 KiB; the audit's worst
// offender emitted 2.27 MB from one flagless extraction.
const OUTPUT_SIZE_NOTE_THRESHOLD_BYTES = 262_144;

function formatOutputSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.round(bytes / 1_000)} KB`;
}

function formatEstimatedTokens(bytes: number): string {
  const tokens = bytes / 4;
  const roundingUnit = 10 ** Math.max(0, Math.floor(Math.log10(tokens)) - 1);
  const rounded = Math.round(tokens / roundingUnit) * roundingUnit;
  return rounded >= 1_000 ? `${Math.round(rounded / 1_000)}k` : String(rounded);
}

function emitOutputSizeNote(result: string, options: { mapped?: boolean } = {}): void {
  const bytes = Buffer.byteLength(result, 'utf8');
  if (bytes <= OUTPUT_SIZE_NOTE_THRESHOLD_BYTES) return;

  // Telling a caller who just ran --map to consider --map is worse than
  // saying nothing: it reads as though the flag did not take effect.
  const mapAdvice = options.mapped ? '' : '--map for page counts, outline, and per-page quality without any bodies, ';
  process.stderr.write(
    `pdfvision: note: output is ${formatOutputSize(bytes)} (~${formatEstimatedTokens(bytes)} tokens); consider ${mapAdvice}-p <range> to page through, --search <query> --matches-only to locate content, or --outline -p 1 for navigation (--outline alone still emits every page)\n`,
  );
}

// Root ownership is verified before removal. Lazy-import so the heavy
// node:fs surface stays out of the --help / --version paths.
async function clearCache(): Promise<void> {
  try {
    const { clearAllCache } = await import('../core/io/cache.js');
    const { path, removed } = clearAllCache();
    console.log(removed ? `Cleared pdfvision cache: ${path}` : `Nothing to clear: ${path} does not exist`);
  } catch (error) {
    exitWithError(formatCliErrorMessage(error));
  }
}

export async function run(argv: string[] = process.argv.slice(2), options: RunOptions = {}): Promise<void> {
  // Resolved before parseArgs: `pdfvision mcp` starts a long-lived stdio
  // server with no CLI options of its own, and the MCP SDK is imported
  // lazily so a normal extraction run never pays for loading it.
  const mcpCommand = resolveMcpCommand(argv);
  if (mcpCommand) {
    if (mcpCommand.kind === 'error') exitWithError(mcpCommand.message, 'pdfvision mcp --help');
    if (mcpCommand.kind === 'version') {
      console.log(getVersion());
      return;
    }
    if (mcpCommand.kind === 'help') {
      console.log(MCP_HELP_TEXT);
      return;
    }
    const { serveMcpStdio } = await import('../mcp/serve.js');
    serveMcpStdio();
    return;
  }

  // Same pre-parse treatment as `mcp`: the subcommand takes no options,
  // and resolving it here keeps the deprecated `--clear-cache` flag on the
  // ordinary option path below without the two competing.
  const clearCacheCommand = resolveClearCacheCommand(argv);
  if (clearCacheCommand) {
    if (clearCacheCommand.kind === 'error') {
      exitWithError(clearCacheCommand.message, 'pdfvision clear-cache --help');
    }
    if (clearCacheCommand.kind === 'version') {
      console.log(getVersion());
      return;
    }
    if (clearCacheCommand.kind === 'help') {
      console.log(CLEAR_CACHE_HELP_TEXT);
      return;
    }
    await clearCache();
    return;
  }

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
        map: { type: 'boolean' },
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
        'matches-only': { type: 'boolean' },
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

  // Explicit --help is a successful, side-effect-free terminal action.
  // Resolve it before --clear-cache so a composed invocation cannot mutate
  // cache state merely because the user also asked for help.
  if (values.help) {
    console.log(HELP_TEXT);
    return;
  }

  if (values['clear-cache']) {
    // --clear-cache is a side-effect operation that ignores everything
    // else: no extraction runs and no positional is needed. Reached only
    // after --version / --help so a composed invocation cannot mutate
    // cache state merely because the user also asked for help.
    console.error(
      'note: --clear-cache is deprecated; use "pdfvision clear-cache" instead (the flag is removed in v1.0)',
    );
    await clearCache();
    return;
  }

  // Normalize before deciding which input source is present. A whitespace-
  // only --remote value is no source at all. Trimming surrounding argument
  // whitespace avoids a different URL or a false conflict with a positional file.
  const remoteUrl = (values.remote as string | undefined)?.trim();
  // Preserve the existing multi-positional error before interpreting the one
  // allowed positional as an input source.
  if (positionals.length > 1) {
    exitWithError(`Unexpected extra arguments: ${positionals.slice(1).join(' ')}`);
  }
  // A sole explicitly empty argv element is no positional input. Do not trim:
  // whitespace-only filenames are valid on supported filesystems and must
  // continue down the normal file-resolution path.
  const positionalInput = positionals[0];
  const hasPositionalInput = positionalInput !== undefined && positionalInput !== '';
  // No input source at all (no non-empty positional and no --remote URL) is a
  // usage error, not a help request: print to stderr and exit 2 so a
  // caller can tell "showed help on request" (stdout / 0) apart from
  // "invoked with nothing to do" (stderr / 2), matching common CLI
  // conventions (git, curl, ...).
  if (!hasPositionalInput && !remoteUrl) {
    console.error(HELP_TEXT);
    process.exit(2);
  }

  if (remoteUrl && hasPositionalInput) {
    // Two input sources at once is almost certainly a mistake — bail
    // rather than silently picking one over the other.
    exitWithError('--remote and a file path are mutually exclusive');
  }

  const format = resolveOutputFormat(values);
  if ((values.geometry as boolean | undefined) && format === 'markdown') {
    // --geometry only populates pages[].spans in json / xml / toon;
    // markdown has no place to surface per-item geometry. Note rather
    // than error so a composed flag set (geometry + default markdown)
    // still produces its markdown output (exit 0).
    console.error('note: --geometry has no effect with markdown output; use -f json/xml/toon');
  }
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
    // Structured outputs already carry `repeated: true` on each layout
    // block, so consumers there can filter themselves. Strip
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
  // --matches-only formats search results as report metadata plus a flat
  // match list, without the full pages/body payload. It only makes sense
  // alongside a query; fail rather than emit an empty report for a run
  // that never searched anything.
  const matchesOnly = (values['matches-only'] as boolean | undefined) ?? false;
  if (matchesOnly && !searchQueries) {
    exitWithError('--matches-only requires --search');
  }

  // --map answers "what is this document" before anything is read: page
  // count, outline, and per-page quality / warning codes folded into page
  // ranges, with no page bodies. It is the cheap first move on a long PDF,
  // where the alternative is either dumping hundreds of pages or guessing
  // at `-p`.
  const map = (values.map as boolean | undefined) ?? false;
  if (map && format !== 'markdown') {
    // The map is an aggregation built for reading, not a projection of
    // DocumentResult — there is no JSON/XML/TOON form of it to emit.
    // Fail rather than quietly hand back the ordinary structured payload
    // the user did not ask for.
    exitWithError(`--map only applies to markdown output (got --format ${format})`);
  }
  if (map) {
    // A map has no page bodies, images, or match lists, so nothing these
    // flags produce can appear in it. Note rather than error, matching
    // --geometry above: a composed flag set still gets its map.
    const ignored = [
      'render',
      'geometry',
      'layout',
      'image-boxes',
      'vector-boxes',
      'visual-regions',
      'render-visual-regions',
      'form-fields',
      'links',
      'annotations',
      'structure',
      'page-labels',
      'viewer',
      'layers',
      'attachments',
      'strip-repeated',
      'ocr',
      'search',
    ].filter((flag) => values[flag as keyof typeof values] !== undefined);
    if (ignored.length > 0) {
      console.error(`note: --map shows no page bodies; ignoring ${ignored.map((f) => `--${f}`).join(', ')}`);
    }
  }

  const noCache = (values['no-cache'] as boolean | undefined) ?? false;
  const passwordFromArg = values.password as string | undefined;
  const passwordStdin = (values['password-stdin'] as boolean | undefined) ?? false;
  const passwordFromStdin = passwordStdin ? await readPasswordFromStdin(options.stdin) : undefined;
  const password = passwordFromStdin && passwordFromStdin.length > 0 ? passwordFromStdin : passwordFromArg;
  if (passwordStdin && password === undefined) {
    exitWithError('--password-stdin requires piped stdin or --password fallback');
  }

  const { filePath, sourceData } = await resolveInputSource(
    remoteUrl,
    hasPositionalInput ? [positionalInput] : [],
    noCache,
  );

  if (map) {
    try {
      const { processDocument } = await import('../core/processor.js');
      const { formatDocumentMap } = await import('../output/documentMap.js');
      const result = await processDocument(filePath, {
        pages: values.pages as string | undefined,
        sourceData,
        password,
        noCache,
        // A map carries no page bodies, but it does carry metadata and
        // outline titles — both of which normalization rewrites, so the
        // flag is not a no-op here.
        normalize: !((values['no-normalize'] as boolean | undefined) ?? false),
        // The outline is the one detail pass that survives aggregation,
        // and it is a single cheap pdf.js call whether or not the
        // document has one.
        outline: true,
        onWarning: (msg) => {
          process.stderr.write(`pdfvision: warning: ${msg}\n`);
        },
      });
      const rendered = formatDocumentMap(result);
      emitOutputSizeNote(rendered, { mapped: true });
      console.log(rendered);
      return;
    } catch (error) {
      exitWithError(formatCliErrorMessage(error));
    }
  }

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
      matchesOnly,
      noCache,
      // NFKC normalization and C0-control cleanup are on by default —
      // agents almost always want canonical, human-visible Unicode.
      // --no-normalize lets callers opt out for cases where the raw
      // pdf.js code points matter (forensics, code-point-level diffing, ...).
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
    emitOutputSizeNote(result);
    console.log(result);
  } catch (error) {
    exitWithError(formatCliErrorMessage(error));
  }
}
