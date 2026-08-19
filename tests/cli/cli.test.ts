import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import PDFDocument from 'pdfkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run } from '../../src/cli/cli.js';

const SAMPLE_PDF = resolve(__dirname, '../fixtures/sample.pdf');
const SAMPLE_JA_PDF = resolve(__dirname, '../fixtures/sample-ja.pdf');
/** Title is fullwidth `Ｃｏｍｐａｔ ２０２６`, which NFKC folds to `Compat 2026`. */
const SAMPLE_COMPAT_PDF = resolve(__dirname, '../fixtures/sample-compat.pdf');

interface CliCapture {
  stdout: string[];
  stderr: string[];
  exitCode: number | null;
}

async function* stdinChunks(...chunks: string[]): AsyncIterable<string> {
  for (const chunk of chunks) yield chunk;
}

async function buildEncryptedPdf(): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({
    size: [612, 792],
    margin: 0,
    userPassword: 'test',
    ownerPassword: 'owner',
  } as PDFKit.PDFDocumentOptions & { userPassword: string; ownerPassword: string });
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolveDone) => doc.on('end', resolveDone));

  doc.text('Encrypted hello', 100, 72);
  doc.end();

  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

async function buildLargeTextPdf(): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: [612, 792], margin: 0 });
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolveDone) => doc.on('end', resolveDone));

  for (let page = 0; page < 400; page++) {
    if (page > 0) doc.addPage({ size: [612, 792], margin: 0 });
    doc.text('output '.repeat(400), 20, 72, { lineBreak: false });
  }
  doc.end();

  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * Drive the CLI with a fixed argv and capture every console / process.exit
 * call so we can assert on user-visible output without actually killing the
 * test process.
 */
async function captureRun(argv: string[], options?: Parameters<typeof run>[1]): Promise<CliCapture> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode: number | null = null;

  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdout.push(args.map((a) => String(a)).join(' '));
  });
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    stderr.push(args.map((a) => String(a)).join(' '));
  });
  const stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    stderr.push((typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)).replace(/\n$/, ''));
    return true;
  }) as typeof process.stderr.write);
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCode = code ?? 0;
    // Halt the rest of the run() like real process.exit would, so callers
    // don't continue to read undefined state after exitWithError.
    throw new Error(`__cli_exit__${code ?? 0}`);
  }) as never);

  try {
    await run(argv, options);
  } catch (e) {
    if (!(e instanceof Error) || !e.message.startsWith('__cli_exit__')) throw e;
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
    stderrWriteSpy.mockRestore();
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

  it('prints usage to stderr and exits 2 when no args are given', async () => {
    // No input source is a usage error, not a help request: usage goes to
    // stderr with exit 2 so callers can tell it apart from an explicit
    // --help (stdout, exit 0).
    const r = await captureRun([]);
    expect(r.stderr.join('\n')).toContain('Usage:');
    expect(r.stderr.join('\n')).not.toContain('Error:');
    expect(r.stdout).toEqual([]);
    expect(r.exitCode).toBe(2);
  });

  it('exits 2 for an extraction option without a usable source', async () => {
    const r = await captureRun(['--json']);
    expect(r.exitCode).toBe(2);
    expect(r.stdout).toEqual([]);
    expect(r.stderr.join('\n')).toContain('Usage:');
    expect(r.stderr.join('\n')).not.toContain('Error:');
  });

  it('exits 2 for an empty --remote= value', async () => {
    const r = await captureRun(['--remote=']);
    expect(r.exitCode).toBe(2);
    expect(r.stdout).toEqual([]);
    expect(r.stderr.join('\n')).toContain('Usage:');
    expect(r.stderr.join('\n')).not.toContain('Error:');
  });

  it('treats an empty positional after -- as no input', async () => {
    const r = await captureRun(['--', '']);
    expect(r.exitCode).toBe(2);
    expect(r.stdout).toEqual([]);
    expect(r.stderr.join('\n')).toContain('Usage:');
    expect(r.stderr.join('\n')).not.toContain('Error:');
  });

  it('treats a blank --remote value plus an empty positional as no input', async () => {
    const r = await captureRun(['--remote=', '']);
    expect(r.exitCode).toBe(2);
    expect(r.stdout).toEqual([]);
    expect(r.stderr.join('\n')).toContain('Usage:');
    expect(r.stderr.join('\n')).not.toContain('Error:');
  });

  it('exits 1 when --remote is missing its required value', async () => {
    const r = await captureRun(['--remote']);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toEqual([]);
    expect(r.stderr.join('\n')).toMatch(/remote.*argument|argument.*remote|value/i);
    expect(r.stderr.join('\n')).not.toContain('pdfvision <file.pdf>');
  });

  it('checks for a usable source before validating extraction-option semantics', async () => {
    const r = await captureRun(['--format', 'yaml']);
    expect(r.exitCode).toBe(2);
    expect(r.stdout).toEqual([]);
    expect(r.stderr.join('\n')).toContain('Usage:');
    expect(r.stderr.join('\n')).not.toContain('Error:');
    expect(r.stderr.join('\n')).not.toContain('Invalid --format');
  });

  it('parses option syntax before honoring --help', async () => {
    const r = await captureRun(['--help', '--bogus']);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toEqual([]);
    expect(r.stderr.join('\n')).toMatch(/unknown/i);
  });

  it('honors --help before extraction-option semantic validation', async () => {
    const r = await captureRun(['--help', '--format', 'yaml']);
    expect(r.exitCode).toBeNull();
    expect(r.stdout.join('\n')).toContain('Usage:');
    expect(r.stderr).toEqual([]);
  });

  it('gives --version precedence over --help after successful parsing', async () => {
    const r = await captureRun(['--version', '--help']);
    expect(r.exitCode).toBeNull();
    expect(r.stdout).toHaveLength(1);
    expect(r.stdout[0]).toMatch(/^\d+\.\d+\.\d+/);
    expect(r.stdout[0]).not.toContain('Usage:');
    expect(r.stderr.join('\n')).toContain('pdfvision docs');
  });

  it('treats a whitespace-only --remote value as missing input before cache setup', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'pdfvision-cli-empty-remote-'));
    const cacheRoot = join(sandbox, 'cache');
    const previousCacheRoot = process.env.PDFVISION_CACHE_DIR;
    process.env.PDFVISION_CACHE_DIR = cacheRoot;
    try {
      const r = await captureRun(['--remote', ' \t\n ', '--ocr']);
      expect(r.stderr.join('\n')).toContain('Usage:');
      expect(r.stderr.join('\n')).not.toContain('Error:');
      expect(r.stdout).toEqual([]);
      expect(r.exitCode).toBe(2);
      expect(existsSync(cacheRoot)).toBe(false);
    } finally {
      if (previousCacheRoot === undefined) delete process.env.PDFVISION_CACHE_DIR;
      else process.env.PDFVISION_CACHE_DIR = previousCacheRoot;
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('does not consume password stdin when no source is present', async () => {
    let reads = 0;
    const stdin = {
      isTTY: false,
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<string>> {
            reads++;
            throw new Error('stdin must not be consumed');
          },
        };
      },
    };

    const r = await captureRun(['--password-stdin'], { stdin });
    expect(r.exitCode).toBe(2);
    expect(r.stdout).toEqual([]);
    expect(r.stderr.join('\n')).toContain('Usage:');
    expect(r.stderr.join('\n')).not.toContain('Error:');
    expect(reads).toBe(0);
  });

  it('treats an explicit empty positional as no input without side effects', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'pdfvision-cli-empty-positional-'));
    const cacheRoot = join(sandbox, 'cache');
    const previousCacheRoot = process.env.PDFVISION_CACHE_DIR;
    let stdinReads = 0;
    const stdin = {
      isTTY: false,
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<string>> {
            stdinReads++;
            throw new Error('stdin must not be consumed');
          },
        };
      },
    };
    process.env.PDFVISION_CACHE_DIR = cacheRoot;

    try {
      const r = await captureRun(['', '--password-stdin', '--ocr'], { stdin });
      expect(r.exitCode).toBe(2);
      expect(r.stdout).toEqual([]);
      expect(r.stderr.join('\n')).toContain('Usage:');
      expect(r.stderr.join('\n')).not.toContain('Error:');
      expect(stdinReads).toBe(0);
      expect(existsSync(cacheRoot)).toBe(false);
    } finally {
      if (previousCacheRoot === undefined) delete process.env.PDFVISION_CACHE_DIR;
      else process.env.PDFVISION_CACHE_DIR = previousCacheRoot;
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('preserves a whitespace-only positional as a filename', async () => {
    const r = await captureRun([' \t ']);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toEqual([]);
    expect(r.stderr.join('\n')).toMatch(/Error: File not found/);
    expect(r.stderr.join('\n')).not.toContain('pdfvision <file.pdf>');
  });

  it('does not treat a blank --remote value as conflicting with a positional file', async () => {
    const r = await captureRun(['--remote=', SAMPLE_PDF, '--no-cache']);
    expect(r.exitCode).toBeNull();
    expect(r.stdout.join('\n')).toContain('Hello pdfvision');
    expect(r.stderr.join('\n')).not.toContain('mutually exclusive');
  });

  it('allows a nonblank --remote URL with a sole empty positional', async () => {
    const r = await captureRun(['--remote', 'http://127.0.0.1:0/x.pdf', '', '--format', 'yaml']);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toEqual([]);
    expect(r.stderr.join('\n')).toMatch(/Invalid --format/);
    expect(r.stderr.join('\n')).not.toContain('mutually exclusive');
  });

  it('prints help to stdout with exit 0 for explicit --help', async () => {
    const r = await captureRun(['--help']);
    expect(r.stdout.join('\n')).toContain('Usage:');
    expect(r.stderr).toEqual([]);
    expect(r.exitCode).toBeNull();
  });

  it('documents the mcp subcommand in the main help', async () => {
    const r = await captureRun(['--help']);
    expect(r.stdout.join('\n')).toContain('pdfvision mcp');
  });

  it('prints MCP-specific help for `mcp --help` without starting a server', async () => {
    const r = await captureRun(['mcp', '--help']);
    const out = r.stdout.join('\n');
    expect(out).toContain('Model Context Protocol');
    expect(out).toContain('read_pdf');
    expect(r.exitCode).toBeNull();
  });

  it('exits 1 when the mcp subcommand is given arguments', async () => {
    const r = await captureRun(['mcp', '--json']);
    expect(r.stderr.join('\n')).toContain('takes no arguments');
    expect(r.exitCode).toBe(1);
  });

  it('still treats a positional named mcp.pdf as a file', async () => {
    const r = await captureRun(['mcp.pdf']);
    // Resolved as a path, so it fails as a missing file rather than
    // being swallowed by the subcommand.
    expect(r.stderr.join('\n')).toContain('File not found');
    expect(r.exitCode).toBe(1);
  });

  it('prints version with --version', async () => {
    const r = await captureRun(['--version']);
    expect(r.stdout.join('\n')).toMatch(/\d+\.\d+\.\d+/);
    expect(r.exitCode).toBeNull();
  });

  /**
   * `$(pdfvision --version)` is a shape callers parse, so the documentation
   * pointer has to stay on the other stream — the whole reason it is safe to
   * add one at all.
   */
  it('keeps stdout a bare version and puts the documentation pointer on stderr', async () => {
    const r = await captureRun(['--version']);
    expect(r.stdout).toHaveLength(1);
    expect(r.stdout[0]).toMatch(/^\d+\.\d+\.\d+/);
    expect(r.stdout[0]).not.toContain('pdfvision docs');
    expect(r.stderr.join('\n')).toContain('If you are a coding agent, run "pdfvision docs"');
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

  it.each([
    { label: 'two empty positionals', argv: ['', ''] },
    { label: 'an empty positional followed by a file', argv: ['', SAMPLE_PDF] },
  ])('keeps $label as a multi-positional error', async ({ argv }) => {
    const r = await captureRun(argv);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toEqual([]);
    expect(r.stderr.join('\n')).toMatch(/extra arguments/i);
  });

  it('runs a successful extraction and prints markdown by default', async () => {
    const r = await captureRun([SAMPLE_PDF, '--no-cache']);
    expect(r.exitCode).toBeNull();
    const out = r.stdout.join('\n');
    expect(out).toMatch(/^# .*sample\.pdf/);
    expect(out).toMatch(/## Page 1/);
    expect(out).toContain('Hello pdfvision');
    expect(r.stderr.join('\n')).not.toContain('pdfvision: note: output is');
  });

  it('notes oversized output on stderr without contaminating stdout', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pdfvision-cli-large-output-'));
    const largePdfPath = join(tempDir, 'large.pdf');
    writeFileSync(largePdfPath, await buildLargeTextPdf());

    try {
      const r = await captureRun([largePdfPath, '--json', '--no-cache']);
      const stdout = r.stdout.join('\n');

      expect(r.exitCode).toBeNull();
      expect(Buffer.byteLength(stdout, 'utf8')).toBeGreaterThan(262_144);
      expect(r.stderr.join('\n')).toMatch(
        /pdfvision: note: output is \d+ KB \(~\d+k tokens\); consider --map .*, -p <range> to page through/,
      );
      expect(stdout).not.toContain('pdfvision: note:');
      const parsed = JSON.parse(stdout);
      expect(stdout).toBe(JSON.stringify(parsed, null, 2));
      expect(parsed.pages).toHaveLength(400);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
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

  it('passes --password through without emitting it', async () => {
    const r = await captureRun([SAMPLE_PDF, '--json', '--password', 'secret', '--no-cache']);
    expect(r.exitCode).toBeNull();
    const out = r.stdout.join('\n');
    const parsed = JSON.parse(out);
    expect(parsed.pages[0].text).toContain('Hello pdfvision');
    expect(out).not.toContain('secret');
  });

  it('passes --password-stdin through without emitting it', async () => {
    const r = await captureRun([SAMPLE_PDF, '--json', '--password-stdin', '--no-cache'], {
      stdin: stdinChunks('secret\n'),
    });
    expect(r.exitCode).toBeNull();
    const out = r.stdout.join('\n');
    const parsed = JSON.parse(out);
    expect(parsed.pages[0].text).toContain('Hello pdfvision');
    expect(out).not.toContain('secret');
  });

  it('uses --password as an explicit fallback when --password-stdin is empty', async () => {
    const r = await captureRun([SAMPLE_PDF, '--json', '--password', 'secret', '--password-stdin'], {
      stdin: stdinChunks('\n'),
    });
    expect(r.exitCode).toBeNull();
    const out = r.stdout.join('\n');
    const parsed = JSON.parse(out);
    expect(parsed.pages[0].text).toContain('Hello pdfvision');
    expect(out).not.toContain('secret');
  });

  it('rejects --password-stdin when neither stdin nor fallback password is provided', async () => {
    const r = await captureRun([SAMPLE_PDF, '--json', '--password-stdin'], {
      stdin: stdinChunks('\n'),
    });
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/requires piped stdin or --password fallback/);
  });

  it('explains missing and incorrect passwords for encrypted PDFs', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pdfvision-cli-encrypted-'));
    const encryptedPath = join(tempDir, 'encrypted.pdf');
    writeFileSync(encryptedPath, await buildEncryptedPdf());

    try {
      const missing = await captureRun([encryptedPath, '--json', '--no-cache']);
      expect(missing.exitCode).toBe(1);
      expect(missing.stderr.join('\n')).toContain(
        'PDF is encrypted; pass --password <value> or --password-stdin to decrypt it.',
      );

      const wrong = await captureRun([encryptedPath, '--json', '--password', 'wrong-secret', '--no-cache']);
      const wrongStderr = wrong.stderr.join('\n');
      expect(wrong.exitCode).toBe(1);
      expect(wrongStderr).toContain(
        'Incorrect PDF password; check the value passed via --password or --password-stdin.',
      );
      expect(wrongStderr).not.toContain('wrong-secret');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
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

  it('passes --structure through to JSON output', async () => {
    const r = await captureRun([SAMPLE_PDF, '--json', '--structure', '--no-cache']);
    expect(r.exitCode).toBeNull();
    const parsed = JSON.parse(r.stdout.join('\n'));
    expect(parsed.pages[0].structure).toBeNull();
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

  it('passes --layers through to JSON output', async () => {
    const r = await captureRun([SAMPLE_PDF, '--json', '--layers', '--no-cache']);
    expect(r.exitCode).toBeNull();
    const parsed = JSON.parse(r.stdout.join('\n'));
    expect(parsed.layers).toEqual({ groups: [] });
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

  it('passes --visual-regions through to JSON output', async () => {
    const r = await captureRun([SAMPLE_PDF, '--json', '--visual-regions', '--no-cache']);
    expect(r.exitCode).toBeNull();
    const parsed = JSON.parse(r.stdout.join('\n'));
    expect(parsed.pages[0].visualRegions).toEqual([]);
  });

  it('accepts --render-visual-regions and implies --visual-regions', async () => {
    const r = await captureRun([SAMPLE_PDF, '--json', '--render-visual-regions', '--no-cache']);
    expect(r.exitCode).toBeNull();
    const parsed = JSON.parse(r.stdout.join('\n'));
    expect(parsed.pages[0].visualRegions).toEqual([]);
    expect(parsed.pages[0].image).toBeUndefined();
  });

  it('accepts the --xml shortcut as an alias for --format xml', async () => {
    const r = await captureRun([SAMPLE_PDF, '--xml', '--no-cache']);
    expect(r.exitCode).toBeNull();
    expect(r.stdout.join('\n')).toMatch(/^<document /);
  });

  it('accepts the --toon shortcut as an alias for --format toon', async () => {
    const r = await captureRun([SAMPLE_PDF, '--toon', '--no-cache']);
    expect(r.exitCode).toBeNull();
    const { decode } = await import('@toon-format/toon');
    const decoded = decode(r.stdout.join('\n')) as { totalPages: number; pages: { text: string }[] };
    expect(decoded.totalPages).toBe(1);
    expect(decoded.pages[0].text).toContain('Hello pdfvision');
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
    // Structured output already exposes `repeated: true` on each layout block;
    // forcing the CLI to strip would be either no-op or destructive.
    const r = await captureRun([SAMPLE_PDF, '--layout', '--strip-repeated', '--json', '--no-cache']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/--strip-repeated only applies to markdown/);
  });

  it('rejects --render-output without --render or --render-visual-regions', async () => {
    // --render-output only meaningfully writes when page or region crops
    // are requested. Silent no-op would leave the user's empty directory
    // looking like a tooling bug.
    const r = await captureRun([SAMPLE_PDF, '--render-output', '/tmp/whatever']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/--render-output requires --render or --render-visual-regions/);
  });

  it('rejects --render-scale without --render, --render-visual-regions, or --ocr', async () => {
    // Same posture as --render-output: silently ignoring a flag the user
    // explicitly passed would hide misconfiguration.
    const r = await captureRun([SAMPLE_PDF, '--render-scale', '1.5']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/--render-scale requires --render, --render-visual-regions, or --ocr/);
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

  it('rejects --ocr-lang without --ocr', async () => {
    // A language choice with no OCR pass to apply it to used to be
    // silently ignored. Mirrors the --render-scale / --render-region
    // posture above.
    const r = await captureRun([SAMPLE_PDF, '--ocr-lang', 'eng', '--no-cache']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/--ocr-lang requires --ocr/);
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

  it('rejects --matches-only without --search', async () => {
    const r = await captureRun([SAMPLE_PDF, '--matches-only', '--no-cache']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toMatch(/--matches-only requires --search/);
  });

  it('emits a focused search report with --matches-only (markdown)', async () => {
    const r = await captureRun([SAMPLE_PDF, '--search', 'pdfvision', '--matches-only', '--no-cache']);
    expect(r.exitCode).toBeNull();
    const out = r.stdout.join('\n');
    expect(out).toContain('- **Matches:**');
    expect(out).toContain('| Page | Query | Source | Text | Context | BBox |');
    // Report metadata and matches remain, without full-page scaffolding.
    expect(out).not.toContain('## Page');
  });

  it('--matches-only json is flat (no pages[])', async () => {
    const r = await captureRun([SAMPLE_PDF, '--search', 'pdfvision', '--matches-only', '--json', '--no-cache']);
    expect(r.exitCode).toBeNull();
    const parsed = JSON.parse(r.stdout.join('\n'));
    expect(parsed.pages).toBeUndefined();
    expect(parsed.queries).toEqual(['pdfvision']);
    expect(Array.isArray(parsed.matches)).toBe(true);
  });

  it('--matches-only with zero hits still exits 0 (a zero count is a valid observation)', async () => {
    const r = await captureRun([
      SAMPLE_PDF,
      '--search',
      'definitely-absent-xyzzy-9999',
      '--matches-only',
      '--no-cache',
    ]);
    expect(r.exitCode).toBeNull();
    expect(r.stdout.join('\n')).toContain('- **Matches:** 0');
  });

  it('notes that --geometry has no effect with markdown output (but still succeeds)', async () => {
    const r = await captureRun([SAMPLE_PDF, '--geometry', '--no-cache']);
    expect(r.exitCode).toBeNull();
    expect(r.stderr.join('\n')).toContain('note: --geometry has no effect with markdown output; use -f json/xml/toon');
    // Markdown still produced on stdout.
    expect(r.stdout.join('\n')).toMatch(/## Page 1/);
  });

  it('does not print the geometry note when --geometry is paired with a structured format', async () => {
    const r = await captureRun([SAMPLE_PDF, '--geometry', '--json', '--no-cache']);
    expect(r.exitCode).toBeNull();
    expect(r.stderr.join('\n')).not.toContain('--geometry has no effect');
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

  it('treats a whitespace-only positional as a real filename when --remote is present', async () => {
    const r = await captureRun(['--remote', 'http://127.0.0.1:0/x.pdf', ' \t ']);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toEqual([]);
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
      const url = `http://127.0.0.1:${port}/doc.pdf`;
      const r = await captureRun(['--remote', ` \t${url}\n`, '--no-cache']);
      expect(r.exitCode).toBeNull();
      expect(r.stdout.join('\n')).toContain('Hello pdfvision');
      expect(r.stdout.join('\n')).toMatch(/^# http:\/\/127\.0\.0\.1:/);
      expect(r.stdout.join('\n')).toContain(url);
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

  it('reads cached remote PDFs as bytes and keeps the remote URL as the output file label', async () => {
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
    const cacheRoot = mkdtempSync(join(tmpdir(), 'pdfvision-cli-remote-cached-'));
    process.env.PDFVISION_CACHE_DIR = cacheRoot;
    try {
      const url = `http://127.0.0.1:${port}/doc.pdf`;
      const r = await captureRun(['--remote', url]);
      expect(r.exitCode).toBeNull();
      expect(r.stdout.join('\n')).toContain('Hello pdfvision');
      expect(r.stdout.join('\n').startsWith(`# ${url}`)).toBe(true);
      expect(existsSync(join(cacheRoot, 'remote'))).toBe(true);
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

describe('cli cache root safety', () => {
  let sandbox: string;
  let cacheRoot: string;
  let previousCacheRoot: string | undefined;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'pdfvision-cli-cache-root-'));
    cacheRoot = join(sandbox, 'cache');
    previousCacheRoot = process.env.PDFVISION_CACHE_DIR;
    process.env.PDFVISION_CACHE_DIR = cacheRoot;
  });

  afterEach(() => {
    if (previousCacheRoot === undefined) delete process.env.PDFVISION_CACHE_DIR;
    else process.env.PDFVISION_CACHE_DIR = previousCacheRoot;
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('reports a missing configured cache root as a successful no-op', async () => {
    const result = await captureRun(['clear-cache']);
    expect(result.exitCode).toBeNull();
    expect(result.stderr).toEqual([]);
    expect(result.stdout.join('\n')).toContain('Nothing to clear:');
    expect(existsSync(cacheRoot)).toBe(false);
  });

  it('warns but still clears through the deprecated --clear-cache flag', async () => {
    const result = await captureRun(['--clear-cache']);
    expect(result.exitCode).toBeNull();
    expect(result.stderr.join('\n')).toMatch(/--clear-cache is deprecated; use "pdfvision clear-cache"/);
    expect(result.stdout.join('\n')).toContain('Nothing to clear:');
    expect(existsSync(cacheRoot)).toBe(false);
  });

  it('keeps the clear-cache subcommand free of the deprecation warning', async () => {
    const result = await captureRun(['clear-cache']);
    expect(result.stderr.join('\n')).not.toContain('deprecated');
  });

  it('rejects arguments passed to the clear-cache subcommand', async () => {
    mkdirSync(cacheRoot);
    const sentinel = join(cacheRoot, 'sentinel');
    writeFileSync(sentinel, 'keep');

    const result = await captureRun(['clear-cache', '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toEqual([]);
    expect(result.stderr.join('\n')).toMatch(/takes no arguments/);
    expect(readFileSync(sentinel, 'utf8')).toBe('keep');
  });

  it('shows subcommand help without touching the cache', async () => {
    mkdirSync(cacheRoot);
    const sentinel = join(cacheRoot, 'sentinel');
    writeFileSync(sentinel, 'keep');

    const result = await captureRun(['clear-cache', '--help']);

    expect(result.exitCode).toBeNull();
    expect(result.stdout.join('\n')).toContain('pdfvision clear-cache - Remove the verified pdfvision cache');
    expect(result.stderr).toEqual([]);
    expect(readFileSync(sentinel, 'utf8')).toBe('keep');
  });

  it('honors --clear-cache before extraction-option semantic validation', async () => {
    const result = await captureRun(['--clear-cache', '--format', 'yaml']);
    expect(result.exitCode).toBeNull();
    expect(result.stdout.join('\n')).toContain('Nothing to clear:');
    expect(existsSync(cacheRoot)).toBe(false);
  });

  it('resolves the clear-cache subcommand before option-syntax errors', async () => {
    const result = await captureRun(['clear-cache', '--not-an-option']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.join('\n')).toMatch(/takes no arguments/);
  });

  it('keeps explicit --help side-effect free when --clear-cache is also present', async () => {
    mkdirSync(cacheRoot);
    const sentinel = join(cacheRoot, 'sentinel');
    writeFileSync(sentinel, 'keep');

    const result = await captureRun(['--help', '--clear-cache']);

    expect(result.exitCode).toBeNull();
    expect(result.stdout.join('\n')).toContain('Usage:');
    expect(result.stderr).toEqual([]);
    expect(readFileSync(sentinel, 'utf8')).toBe('keep');
  });

  it('clears a cache root initialized by a normal extraction', async () => {
    const extracted = await captureRun([SAMPLE_PDF, '--json']);
    expect(extracted.exitCode).toBeNull();
    expect(existsSync(join(cacheRoot, '.pdfvision-cache-root'))).toBe(true);

    const cleared = await captureRun(['clear-cache']);
    expect(cleared.exitCode).toBeNull();
    expect(cleared.stderr).toEqual([]);
    expect(cleared.stdout.join('\n')).toContain('Cleared pdfvision cache:');
    expect(existsSync(cacheRoot)).toBe(false);
  });

  it('exits 1 when clear-cache verification fails and preserves the sentinel', async () => {
    mkdirSync(cacheRoot);
    const sentinel = join(cacheRoot, 'sentinel');
    writeFileSync(sentinel, 'keep');

    const result = await captureRun(['clear-cache']);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toEqual([]);
    expect(result.stderr.join('\n')).toMatch(/Error: Refusing to clear unverified cache root/);
    expect(readFileSync(sentinel, 'utf8')).toBe('keep');
  });

  it('ignores an invalid cache environment for a cache-independent local --no-cache run', async () => {
    process.env.PDFVISION_CACHE_DIR = 'relative-cache-root';
    const result = await captureRun([SAMPLE_PDF, '--json', '--no-cache']);
    expect(result.exitCode).toBeNull();
    expect(JSON.parse(result.stdout.join('\n')).totalPages).toBe(1);
  });

  it('does not initialize a valid missing cache root for local --no-cache extraction', async () => {
    expect(existsSync(cacheRoot)).toBe(false);
    const result = await captureRun([SAMPLE_PDF, '--json', '--no-cache']);
    expect(result.exitCode).toBeNull();
    expect(existsSync(cacheRoot)).toBe(false);
  });

  it('still rejects an invalid cache environment when --no-cache uses OCR support files', async () => {
    process.env.PDFVISION_CACHE_DIR = 'relative-cache-root';
    const result = await captureRun([SAMPLE_PDF, '--json', '--no-cache', '--ocr']);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toEqual([]);
    expect(result.stderr.join('\n')).toMatch(/Invalid PDFVISION_CACHE_DIR.*absolute path/);
  });

  it('does not reject --ocr --ocr-lang eng as missing --ocr (fails later, on the invalid cache dir)', async () => {
    // Confirms the pairing is accepted by CLI validation without paying for
    // a real OCR/tesseract run: an invalid cache dir surfaces first, from
    // deeper in the pipeline than the --ocr-lang requires --ocr check.
    process.env.PDFVISION_CACHE_DIR = 'relative-cache-root';
    const result = await captureRun([SAMPLE_PDF, '--json', '--no-cache', '--ocr', '--ocr-lang', 'eng']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.join('\n')).not.toContain('--ocr-lang requires --ocr');
    expect(result.stderr.join('\n')).toMatch(/Invalid PDFVISION_CACHE_DIR.*absolute path/);
  });

  it('rejects the same invalid cache environment for clear-cache', async () => {
    process.env.PDFVISION_CACHE_DIR = 'relative-cache-root';
    const result = await captureRun(['clear-cache']);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toEqual([]);
    expect(result.stderr.join('\n')).toMatch(/Invalid PDFVISION_CACHE_DIR.*absolute path/);
  });
});

describe('cli --map', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('emits the document map instead of the page bodies', async () => {
    const result = await captureRun([SAMPLE_JA_PDF, '--map', '--no-cache']);
    expect(result.exitCode).toBeNull();
    const out = result.stdout.join('\n');
    expect(out).toContain('- **Pages:** 3');
    expect(out).toContain('_Document map: page bodies are omitted._');
    expect(out).toContain('## Native text quality');
    // The body text of the fixture must not appear — that is the point.
    expect(out).not.toContain('これは pdfvision のテスト用 PDF です');
  });

  it('costs a fraction of the full body', async () => {
    const map = (await captureRun([SAMPLE_JA_PDF, '--map', '--no-cache'])).stdout.join('\n');
    const full = (await captureRun([SAMPLE_JA_PDF, '--no-cache'])).stdout.join('\n');
    // Assert the map is real before comparing: a rejected --map produces
    // empty stdout, which would satisfy a bare `less than` for the wrong
    // reason.
    expect(map).toContain('_Document map: page bodies are omitted._');
    expect(map.length).toBeLessThan(full.length);
  });

  it('keeps --no-normalize meaningful, since metadata and outline titles pass through it', async () => {
    // A map has no page bodies, so the only way to see normalization is
    // the metadata it does carry. Asserting the raw fullwidth title
    // survives is what makes this fail if the flag stops being passed
    // through to processDocument.
    const normalized = (await captureRun([SAMPLE_COMPAT_PDF, '--map', '--no-cache'])).stdout.join('\n');
    expect(normalized).toContain('- **Title:** Compat 2026');

    const raw = await captureRun([SAMPLE_COMPAT_PDF, '--map', '--no-normalize', '--no-cache']);
    expect(raw.exitCode).toBeNull();
    expect(raw.stdout.join('\n')).toContain('- **Title:** Ｃｏｍｐａｔ ２０２６');
    expect(raw.stderr.join('\n')).not.toMatch(/ignoring.*no-normalize/);
  });

  it('names --render-visual-regions among the flags it cannot show', async () => {
    const result = await captureRun([SAMPLE_JA_PDF, '--map', '--render-visual-regions', '--no-cache']);
    expect(result.stderr.join('\n')).toMatch(/ignoring --render-visual-regions/);
  });

  it('scopes the quality table to --pages while still reporting the document total', async () => {
    const out = (await captureRun([SAMPLE_JA_PDF, '--map', '-p', '1-2', '--no-cache'])).stdout.join('\n');
    expect(out).toContain('- **Pages:** 3');
    expect(out).toMatch(/\| `ok` \| 2 \| 1-2 \|/);
  });

  it('refuses a structured format rather than emitting the ordinary payload', async () => {
    const result = await captureRun([SAMPLE_JA_PDF, '--map', '-f', 'json', '--no-cache']);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toEqual([]);
    expect(result.stderr.join('\n')).toMatch(/--map only applies to markdown output/);
  });

  it('notes the flags it cannot show, and still emits the map', async () => {
    const result = await captureRun([SAMPLE_JA_PDF, '--map', '--layout', '--links', '--no-cache']);
    expect(result.exitCode).toBeNull();
    expect(result.stderr.join('\n')).toMatch(/--map shows no page bodies; ignoring --layout, --links/);
    expect(result.stdout.join('\n')).toContain('_Document map: page bodies are omitted._');
  });

  it('reports a missing file through the normal CLI error path', async () => {
    const result = await captureRun(['/nope/missing.pdf', '--map']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.join('\n')).toMatch(/File not found/);
  });

  it('does not tell a caller who already ran --map to consider --map', async () => {
    // A map is small by design, but nothing guarantees it — the size
    // note still fires on a pathological one, and its usual first
    // suggestion would then read as though the flag had not taken effect.
    const dir = mkdtempSync(join(tmpdir(), 'pdfvision-bigmap-'));
    const file = join(dir, 'big-title.pdf');
    try {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ info: { Title: 'T'.repeat(300_000) } });
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      const done = new Promise<void>((resolve) => doc.on('end', () => resolve()));
      doc.text('x');
      doc.end();
      await done;
      writeFileSync(file, Buffer.concat(chunks));

      const result = await captureRun([file, '--map', '--no-cache']);
      const stderr = result.stderr.join('\n');
      expect(stderr).toMatch(/pdfvision: note: output is/);
      expect(stderr).not.toContain('consider --map');
      expect(stderr).toContain('consider -p <range> to page through');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('subcommand error hints', () => {
  it('points a rejected clear-cache invocation at the subcommand help', async () => {
    const result = await captureRun(['clear-cache', '--json']);
    expect(result.stderr.join('\n')).toContain('Run "pdfvision clear-cache --help" for usage.');
  });

  it('points a rejected mcp invocation at the subcommand help', async () => {
    const result = await captureRun(['mcp', '--json']);
    expect(result.stderr.join('\n')).toContain('Run "pdfvision mcp --help" for usage.');
  });

  it('names both the help and the documentation index for ordinary option errors', async () => {
    const result = await captureRun(['--not-an-option']);
    expect(result.stderr.join('\n')).toContain('Run "pdfvision --help" for usage, or "pdfvision docs"');
  });
});

describe('subcommand calling convention', () => {
  it.each([
    ['clear-cache', '--version'],
    ['clear-cache', '-v'],
    ['mcp', '--version'],
    ['mcp', '-v'],
  ])('prints the version for `%s %s`', async (subcommand, flag) => {
    const result = await captureRun([subcommand, flag]);
    expect(result.exitCode).toBeNull();
    expect(result.stdout).toHaveLength(1);
    expect(result.stdout[0]).toMatch(/^\d+\.\d+\.\d+/);
    expect(result.stderr.join('\n')).toContain('pdfvision docs');
  });
});
