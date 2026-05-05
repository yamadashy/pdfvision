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
    const r = await captureRun([SAMPLE_PDF, '--format', 'xml']);
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

  it('runs a successful extraction and prints the result', async () => {
    const r = await captureRun([SAMPLE_PDF, '--no-cache']);
    expect(r.exitCode).toBeNull();
    const out = r.stdout.join('\n');
    expect(out).toContain('Hello pdfvision');
    expect(out).toMatch(/\[Page 1\] \(chars: \d+, images: \d+, coverage: \d+%\)/);
  });

  it('surfaces processor errors as a clean CLI error', async () => {
    // Invalid pages selector — processor throws, CLI should turn that into
    // exit(1) + stderr message instead of an unhandled rejection.
    const r = await captureRun([SAMPLE_PDF, '--pages', 'abc', '--no-cache']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/positive integer|invalid|Error/i);
  });
});
