import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run } from '../../src/cli/cli.js';

const SAMPLE_PDF = resolve(__dirname, '../fixtures/sample.pdf');

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

  it('rejects --render-output without --render', async () => {
    // --render-output only meaningfully writes when --render is requested.
    // Silent no-op would leave the user's empty directory looking like a
    // tooling bug.
    const r = await captureRun([SAMPLE_PDF, '--render-output', '/tmp/whatever']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/--render-output requires --render/);
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

  it('downloads a remote PDF and runs extraction against it', async () => {
    // Spin up a one-off http server that serves the existing sample
    // fixture, point --remote at it, and assert the markdown body
    // matches what we'd get from running locally on the same bytes.
    const fixtureBytes = await import('node:fs').then(({ readFileSync }) => readFileSync(SAMPLE_PDF));
    const server = createServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/pdf');
      res.end(fixtureBytes);
    });
    await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    const port = (server.address() as AddressInfo).port;
    try {
      const r = await captureRun(['--remote', `http://127.0.0.1:${port}/doc.pdf`, '--no-cache']);
      expect(r.exitCode).toBeNull();
      expect(r.stdout.join('\n')).toContain('Hello pdfvision');
    } finally {
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
