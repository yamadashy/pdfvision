import { accessSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { OutputFormat, RenderRegion } from '../types/index.js';
import { HELP_TEXT } from './help.js';
import { getVersion } from './version.js';

const VALID_FORMATS: readonly OutputFormat[] = ['markdown', 'json', 'xml', 'toon'];

function isValidFormat(value: string): value is OutputFormat {
  return (VALID_FORMATS as readonly string[]).includes(value);
}

function exitWithError(message: string): never {
  console.error(`Error: ${message}`);
  console.error('Run "pdfvision --help" for usage.');
  process.exit(1);
}

export async function run(argv: string[] = process.argv.slice(2)): Promise<void> {
  let values: Record<string, string | string[] | boolean | undefined>;
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
        geometry: { type: 'boolean' },
        layout: { type: 'boolean' },
        'image-boxes': { type: 'boolean' },
        'vector-boxes': { type: 'boolean' },
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
    values = parsed.values as Record<string, string | string[] | boolean | undefined>;
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

  const renderOutput = values['render-output'] as string | undefined;
  const render = (values.render as boolean | undefined) ?? false;
  if (renderOutput && !render) {
    // --render-output only does something if pages are actually rendered.
    // Failing fast is friendlier than silently writing nothing to the dir.
    exitWithError('--render-output requires --render');
  }

  // --render-scale parses as a number with explicit error messaging so
  // the user sees the actual bounds (0, 4] instead of a generic NaN
  // failure inside the processor. Allows --ocr-only scale changes too
  // (OCR's internal rasterise respects the scale), so we don't gate
  // on --render here.
  const renderScaleRaw = values['render-scale'] as string | undefined;
  let renderScale: number | undefined;
  if (renderScaleRaw !== undefined) {
    if (!render && !(values.ocr as boolean | undefined)) {
      // No rasterisation will actually happen; the flag silently does
      // nothing. Failing loudly mirrors the --render-output relationship.
      exitWithError('--render-scale requires --render or --ocr');
    }
    const parsed = Number(renderScaleRaw);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 4) {
      exitWithError(`Invalid --render-scale "${renderScaleRaw}": expected a number in (0, 4]`);
    }
    renderScale = parsed;
  }

  // --render-region parses "x,y,width,height" as PDF points (top-left
  // origin, y grows downward — same coord system as imageBoxes /
  // layout.blocks). CLI surfaces shape errors (wrong field count,
  // non-numeric); positive-width/height and single-page constraints
  // get enforced in the processor against the resolved page list, so
  // we don't need to know totalPages here.
  const renderRegionRaw = values['render-region'] as string | undefined;
  let renderRegion: RenderRegion | undefined;
  if (renderRegionRaw !== undefined) {
    if (!render && !(values.ocr as boolean | undefined)) {
      exitWithError('--render-region requires --render or --ocr');
    }
    const parts = renderRegionRaw.split(',').map((p) => p.trim());
    if (parts.length !== 4) {
      exitWithError(
        `Invalid --render-region "${renderRegionRaw}": expected "x,y,width,height" (4 comma-separated numbers)`,
      );
    }
    // Reject empty parts BEFORE Number() — `Number('')` is 0, so
    // `"10,,30,40"` would silently coerce to `y=0` and execute as
    // valid input instead of surfacing the typo.
    if (parts.some((p) => p === '')) {
      exitWithError(`Invalid --render-region "${renderRegionRaw}": empty value between commas`);
    }
    const [x, y, w, h] = parts.map(Number);
    if (![x, y, w, h].every((n) => Number.isFinite(n))) {
      exitWithError(`Invalid --render-region "${renderRegionRaw}": all four values must be finite numbers`);
    }
    renderRegion = { x, y, width: w, height: h };
  }

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

  let filePath: string;
  let sourceData: Uint8Array | undefined;
  if (remoteUrl) {
    try {
      const { downloadRemote, downloadRemoteData } = await import('../core/remote.js');
      if (noCache) {
        sourceData = await downloadRemoteData(remoteUrl);
        filePath = remoteUrl;
      } else {
        filePath = await downloadRemote(remoteUrl);
      }
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
      sourceData,
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
    exitWithError(error instanceof Error ? error.message : String(error));
  }
}
