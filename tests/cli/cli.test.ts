import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run } from '../../src/cli/cli.js';

const SAMPLE_PDF = resolve(__dirname, '../fixtures/sample.pdf');
const SAMPLE_JA_PDF = resolve(__dirname, '../fixtures/sample-ja.pdf');

interface CliCapture {
  stdout: string[];
  stderr: string[];
  exitCode: number | null;
}

/**
 * Drive the CLI with a fixed argv and capture every console / process.exit
 * call so we can assert on user-visible output without actually killing the
 * test process.
 */
async function captureRun(argv: string[]): Promise<CliCapture> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode: number | null = null;

  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdout.push(args.map((a) => String(a)).join(' '));
  });
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    stderr.push(args.map((a) => String(a)).join(' '));
  });
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCode = code ?? 0;
    // Halt the rest of the run() like real process.exit would, so callers
    // don't continue to read undefined state after exitWithError.
    throw new Error(`__cli_exit__${code ?? 0}`);
  }) as never);

  try {
    await run(argv);
  } catch (e) {
    if (!(e instanceof Error) || !e.message.startsWith('__cli_exit__')) throw e;
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
    exitSpy.mockRestore();
  }

  return { stdout, stderr, exitCode };
}

describe('cli', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints help when no args are given', async () => {
    const r = await captureRun([]);
    expect(r.stdout.join('\n')).toContain('Usage:');
    expect(r.exitCode).toBeNull();
  });

  it('prints help with --help', async () => {
    const r = await captureRun(['--help']);
    expect(r.stdout.join('\n')).toContain('Usage:');
  });

  it('prints version with --version', async () => {
    const r = await captureRun(['--version']);
    expect(r.stdout.join('\n')).toMatch(/\d+\.\d+\.\d+/);
  });

  it('exits with error on invalid --format', async () => {
    const r = await captureRun([SAMPLE_PDF, '--format', 'yaml']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/Invalid --format/);
  });

  it('exits with error on missing file', async () => {
    const r = await captureRun(['/nonexistent/file.pdf']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/File not found/);
  });

  it('exits with error on unknown option', async () => {
    const r = await captureRun(['--bogus']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/unknown/i);
  });

  it('exits with error on extra positional args', async () => {
    const r = await captureRun([SAMPLE_PDF, 'extra-arg']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/extra arguments/i);
  });

  it('runs a successful extraction and prints markdown by default', async () => {
    const r = await captureRun([SAMPLE_PDF, '--no-cache']);
    expect(r.exitCode).toBeNull();
    const out = r.stdout.join('\n');
    expect(out).toMatch(/^# .*sample\.pdf/);
    expect(out).toMatch(/## Page 1/);
    expect(out).toContain('Hello pdfvision');
  });

  it('emits JSON when --format json is requested', async () => {
    // Programmatic consumers opt out of markdown by passing --format json.
    const r = await captureRun([SAMPLE_PDF, '--format', 'json', '--no-cache']);
    expect(r.exitCode).toBeNull();
    const parsed = JSON.parse(r.stdout.join('\n'));
    expect(parsed.totalPages).toBe(1);
    expect(parsed.pages[0].text).toContain('Hello pdfvision');
  });

  it('accepts the --json shortcut as an alias for --format json', async () => {
    // Canonical `-f json` is kept for forward-compat (future formats like
    // html / jsonl can ride on it), but the alias is what most callers
    // reach for. Same output, fewer keystrokes.
    const r = await captureRun([SAMPLE_PDF, '--json', '--no-cache']);
    expect(r.exitCode).toBeNull();
    const parsed = JSON.parse(r.stdout.join('\n'));
    expect(parsed.totalPages).toBe(1);
  });

  it('passes --form-fields through to JSON output', async () => {
    const r = await captureRun([SAMPLE_PDF, '--json', '--form-fields', '--no-cache']);
    expect(r.exitCode).toBeNull();
    const parsed = JSON.parse(r.stdout.join('\n'));
    expect(parsed.pages[0].formFields).toEqual([]);
  });

  it('passes --links through to JSON output', async () => {
    const r = await captureRun([SAMPLE_PDF, '--json', '--links', '--no-cache']);
    expect(r.exitCode).toBeNull();
    const parsed = JSON.parse(r.stdout.join('\n'));
    expect(parsed.pages[0].links).toEqual([]);
  });

  it('passes --annotations through to JSON output', async () => {
    const r = await captureRun([SAMPLE_PDF, '--json', '--annotations', '--no-cache']);
    expect(r.exitCode).toBeNull();
    const parsed = JSON.parse(r.stdout.join('\n'));
    expect(parsed.pages[0].annotations).toEqual([]);
  });

  it('passes --outline through to JSON output', async () => {
    const r = await captureRun([SAMPLE_PDF, '--json', '--outline', '--no-cache']);
    expect(r.exitCode).toBeNull();
    const parsed = JSON.parse(r.stdout.join('\n'));
    expect(parsed.outline).toEqual([]);
  });

  it('passes --page-labels through to JSON output', async () => {
    const r = await captureRun([SAMPLE_PDF, '--json', '--page-labels', '--no-cache']);
    expect(r.exitCode).toBeNull();
    const parsed = JSON.parse(r.stdout.join('\n'));
    expect(parsed.pageLabels).toEqual([]);
  });

  it('passes --attachments through to JSON output', async () => {
    const r = await captureRun([SAMPLE_PDF, '--json', '--attachments', '--no-cache']);
    expect(r.exitCode).toBeNull();
    const parsed = JSON.parse(r.stdout.join('\n'));
    expect(parsed.attachments).toEqual([]);
  });

  it('passes --viewer through to JSON output', async () => {
    const r = await captureRun([SAMPLE_PDF, '--json', '--viewer', '--no-cache']);
    expect(r.exitCode).toBeNull();
    const parsed = JSON.parse(r.stdout.join('\n'));
    expect(parsed.viewer).toBeDefined();
  });

  it('rejects --attachment-output without --attachments', async () => {
    const r = await captureRun([SAMPLE_PDF, '--attachment-output', '/tmp/whatever']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/--attachment-output requires --attachments/);
  });

  it('passes --vector-boxes through to JSON output', async () => {
    const r = await captureRun([SAMPLE_PDF, '--json', '--vector-boxes', '--no-cache']);
    expect(r.exitCode).toBeNull();
    const parsed = JSON.parse(r.stdout.join('\n'));
    expect(parsed.pages[0].vectorBoxes).toEqual([]);
  });

  it('accepts the --xml shortcut as an alias for --format xml', async () => {
    const r = await captureRun([SAMPLE_PDF, '--xml', '--no-cache']);
    expect(r.exitCode).toBeNull();
    expect(r.stdout.join('\n')).toMatch(/^<document /);
  });

  it('accepts the --markdown shortcut explicitly (matches the default)', async () => {
    const r = await captureRun([SAMPLE_PDF, '--markdown', '--no-cache']);
    expect(r.exitCode).toBeNull();
    expect(r.stdout.join('\n')).toMatch(/^# /);
  });

  it('rejects two different format aliases at once', async () => {
    // `--json --xml` is a clear intent conflict — silently picking
    // last-wins would mask whichever the user actually meant.
    const r = await captureRun([SAMPLE_PDF, '--json', '--xml', '--no-cache']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/Output format specified multiple times/);
  });

  it('rejects a format alias that disagrees with --format', async () => {
    // `--json -f xml` is also a conflict — same reason as above.
    const r = await captureRun([SAMPLE_PDF, '--json', '-f', 'xml', '--no-cache']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/Output format conflict/);
  });

  it('allows a format alias to match --format with the same value (idempotent)', async () => {
    // A script that composes flags from multiple sources may end up
    // with redundant but non-conflicting format specs (`--json -f json`).
    // That should not be an error.
    const r = await captureRun([SAMPLE_PDF, '--json', '-f', 'json', '--no-cache']);
    expect(r.exitCode).toBeNull();
    const parsed = JSON.parse(r.stdout.join('\n'));
    expect(parsed.totalPages).toBe(1);
  });

  it('rejects --strip-repeated without --layout', async () => {
    // `repeated: true` is only set during the cross-page layout pass,
    // so without --layout there is nothing to filter on. Fail fast
    // rather than silently emit unfiltered Markdown.
    const r = await captureRun([SAMPLE_PDF, '--strip-repeated', '--no-cache']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/--strip-repeated requires --layout/);
  });

  it('rejects --strip-repeated on non-markdown output', async () => {
    // JSON / XML already expose `repeated: true` on each layout block;
    // forcing the CLI to strip would be either no-op or destructive.
    const r = await captureRun([SAMPLE_PDF, '--layout', '--strip-repeated', '--json', '--no-cache']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/--strip-repeated only applies to markdown/);
  });

  it('rejects --render-output without --render', async () => {
    // --render-output only meaningfully writes when --render is requested.
    // Silent no-op would leave the user's empty directory looking like a
    // tooling bug.
    const r = await captureRun([SAMPLE_PDF, '--render-output', '/tmp/whatever']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/--render-output requires --render/);
  });

  it('rejects --render-scale without --render or --ocr', async () => {
    // Same posture as --render-output: silently ignoring a flag the user
    // explicitly passed would hide misconfiguration.
    const r = await captureRun([SAMPLE_PDF, '--render-scale', '1.5']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/--render-scale requires --render or --ocr/);
  });

  it('rejects --render-scale outside (0, 4]', async () => {
    // Upper bound: 4× a letter page is already ~7.7Mpx; higher invites OOM.
    const r = await captureRun([SAMPLE_PDF, '--render', '--render-scale', '10']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/Invalid --render-scale.*\(0, 4\]/);
  });

  it('rejects non-numeric --render-scale', async () => {
    const r = await captureRun([SAMPLE_PDF, '--render', '--render-scale', 'huge']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/Invalid --render-scale/);
  });

  it('rejects --render-region without --render or --ocr', async () => {
    // Mirrors --render-scale / --render-output posture: a flag the user
    // typed must take effect or be loud about why it didn't.
    const r = await captureRun([SAMPLE_PDF, '--render-region', '0,0,100,100']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/--render-region requires --render or --ocr/);
  });

  it('rejects --render-region with the wrong number of comma-separated values', async () => {
    const r = await captureRun([SAMPLE_PDF, '--render', '--render-region', '10,20,30']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/4 comma-separated numbers/);
  });

  it('rejects --render-region with a non-numeric component', async () => {
    const r = await captureRun([SAMPLE_PDF, '--render', '--render-region', '10,abc,30,40']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/finite numbers/);
  });

  it('--search hits get echoed in markdown overview (Matches column)', async () => {
    // CLI smoke test: an unspecified-format (markdown default) run with
    // --search on a multi-page doc must surface the matches column so
    // an LLM consumer reading the markdown sees per-page hit counts.
    // captureRun leaves exitCode === null on success (process.exit is
    // never called on the happy path) — the existing success-path tests
    // assert `toBeNull` rather than `toBe(0)`.
    const r = await captureRun([SAMPLE_JA_PDF, '--search', 'これは', '--no-cache']);
    expect(r.exitCode).toBeNull();
    const stdout = r.stdout.join('\n');
    expect(stdout).toMatch(/Matches/);
  });

  it('rejects an empty --search query at the CLI before the processor runs', async () => {
    const r = await captureRun([SAMPLE_PDF, '--search', '', '--no-cache']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/--search: query must be a non-empty string/);
  });

  it('rejects --search-regex without any --search query', async () => {
    const r = await captureRun([SAMPLE_PDF, '--search-regex', '--no-cache']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/--search-regex .* require at least one --search query/);
  });

  it('rejects --search-case-sensitive without any --search query', async () => {
    const r = await captureRun([SAMPLE_PDF, '--search-case-sensitive', '--no-cache']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/require at least one --search query/);
  });

  it('accepts repeated --search flags as multi-query', async () => {
    const r = await captureRun([SAMPLE_PDF, '--search', 'Hello', '--search', 'pdfvision', '--json', '--no-cache']);
    expect(r.exitCode).toBeNull();
    const result = JSON.parse(r.stdout.join('\n'));
    const matches = result.pages[0].matches ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(matches.every((m: { queryIndex?: number }) => m.queryIndex !== undefined)).toBe(true);
  });

  it('rejects --render-region with an empty value between commas', async () => {
    // `"10,,30,40"` would otherwise coerce to y=0 via Number('') and
    // execute as valid input — surface the typo instead of running
    // against a region the user didn't intend.
    const r = await captureRun([SAMPLE_PDF, '--render', '--render-region', '10,,30,40']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/empty value between commas/);
  });

  it('surfaces processor errors as a clean CLI error', async () => {
    // Invalid pages selector — processor throws, CLI should turn that into
    // exit(1) + stderr message instead of an unhandled rejection.
    const r = await captureRun([SAMPLE_PDF, '--pages', 'abc', '--no-cache']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/positive integer|invalid|Error/i);
  });

  it('rejects --remote and a positional file at the same time', async () => {
    // Two input sources is almost always a typo; refuse rather than
    // silently picking one.
    const r = await captureRun(['--remote', 'http://127.0.0.1:0/x.pdf', SAMPLE_PDF]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/--remote and a file path are mutually exclusive/);
  });

  it('rejects malformed --ocr-lang before booting tesseract', async () => {
    // Argument validation runs ahead of the heavy worker boot, so a typo
    // surfaces in milliseconds with a clear pointer at the bad token
    // instead of an opaque tesseract error.
    const r = await captureRun([SAMPLE_PDF, '--ocr', '--ocr-lang', 'eng2', '--no-cache']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/expected letters\/underscore only/);
  });

  it('downloads a remote PDF and runs extraction against it', async () => {
    // Spin up a one-off http server that serves the existing sample
    // fixture, point --remote at it, and assert the markdown body
    // matches what we'd get from running locally on the same bytes.
    const { existsSync, mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const fixtureBytes = await import('node:fs').then(({ readFileSync }) => readFileSync(SAMPLE_PDF));
    const server = createServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/pdf');
      res.end(fixtureBytes);
    });
    await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    const port = (server.address() as AddressInfo).port;
    const prevCacheDir = process.env.PDFVISION_CACHE_DIR;
    const cacheRoot = mkdtempSync(join(tmpdir(), 'pdfvision-cli-remote-'));
    process.env.PDFVISION_CACHE_DIR = cacheRoot;
    try {
      const r = await captureRun(['--remote', `http://127.0.0.1:${port}/doc.pdf`, '--no-cache']);
      expect(r.exitCode).toBeNull();
      expect(r.stdout.join('\n')).toContain('Hello pdfvision');
      expect(r.stdout.join('\n')).toMatch(/^# http:\/\/127\.0\.0\.1:/);
      expect(existsSync(join(cacheRoot, 'remote'))).toBe(false);
    } finally {
      if (prevCacheDir === undefined) {
        delete process.env.PDFVISION_CACHE_DIR;
      } else {
        process.env.PDFVISION_CACHE_DIR = prevCacheDir;
      }
      rmSync(cacheRoot, { recursive: true, force: true });
      await new Promise<void>((resolveClose, reject) => server.close((err) => (err ? reject(err) : resolveClose())));
    }
  });
});

// --clear-cache is intentionally NOT exercised from the CLI surface
// here: the side effect (nuking /tmp/pdfvision/) cannot be safely
// invoked from a parallel vitest worker because other workers are
// concurrently writing to the same root. The CLI wiring is a 4-line
// shim around `clearAllCache()`; the meaningful assertions — actually
// removing a directory tree, handling an already-absent path, and
// refusing symlinks at the root — live in tests/core/cache.test.ts
// against an isolated temp directory.
