import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveClearCacheCommand } from '../../src/cli/clearCacheCommand.js';

const noFiles = () => false;

describe('resolveClearCacheCommand', () => {
  it('clears on a bare `clear-cache`', () => {
    expect(resolveClearCacheCommand(['clear-cache'], noFiles)).toEqual({ kind: 'clear' });
  });

  it.each([['-h'], ['--help']])('shows help for `clear-cache %s`', (flag) => {
    expect(resolveClearCacheCommand(['clear-cache', flag], noFiles)).toEqual({ kind: 'help' });
  });

  it.each([['-v'], ['--version']])('honors the calling convention for `clear-cache %s`', (flag) => {
    expect(resolveClearCacheCommand(['clear-cache', flag], noFiles)).toEqual({ kind: 'version' });
  });

  it('gives --version precedence over --help, as the main CLI does', () => {
    expect(resolveClearCacheCommand(['clear-cache', '--help', '--version'], noFiles)).toEqual({ kind: 'version' });
  });

  it('still errors when a terminal flag is mixed with a real argument', () => {
    const command = resolveClearCacheCommand(['clear-cache', '--version', '--json'], noFiles);
    expect(command).toMatchObject({ kind: 'error', message: expect.stringContaining('"--json"') });
  });

  it('answers --help without consulting the filesystem', () => {
    expect(resolveClearCacheCommand(['clear-cache', '--help'], () => true)).toEqual({ kind: 'help' });
  });

  it('rejects arguments rather than silently ignoring them', () => {
    const command = resolveClearCacheCommand(['clear-cache', '--json'], noFiles);
    expect(command?.kind).toBe('error');
    expect(command).toMatchObject({ message: expect.stringContaining('"--json"') });
  });

  it('names every rejected argument', () => {
    const command = resolveClearCacheCommand(['clear-cache', 'a.pdf', '--layout'], noFiles);
    expect(command).toMatchObject({ message: expect.stringContaining('"a.pdf" "--layout"') });
  });

  it('refuses instead of deleting when a file of the same name exists', () => {
    const command = resolveClearCacheCommand(['clear-cache'], (path) => path === 'clear-cache');
    expect(command?.kind).toBe('error');
    expect(command).toMatchObject({ message: expect.stringContaining('./clear-cache') });
  });

  it('still reports argument errors when an ambiguous file exists', () => {
    const command = resolveClearCacheCommand(['clear-cache', '--json'], () => true);
    expect(command).toMatchObject({ message: expect.stringContaining('"--json"') });
  });

  it.each([[[]], [['doc.pdf']], [['--help']], [['--clear-cache']], [['./clear-cache']], [['doc.pdf', 'clear-cache']]])(
    'leaves %j to the extraction CLI',
    (argv) => {
      expect(resolveClearCacheCommand(argv, noFiles)).toBeUndefined();
    },
  );
});

/**
 * The default probe runs against the real working directory, where the
 * difference between "no entry" and "an entry whose target is missing"
 * decides whether cached data is deleted.
 */
describe('resolveClearCacheCommand ambiguity probe', () => {
  let sandbox: string;
  let previousCwd: string;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'pdfvision-clear-cache-probe-'));
    previousCwd = process.cwd();
    process.chdir(sandbox);
  });

  afterEach(() => {
    process.chdir(previousCwd);
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('clears when the working directory holds no such entry', () => {
    expect(resolveClearCacheCommand(['clear-cache'])).toEqual({ kind: 'clear' });
  });

  it('refuses on a regular file of that name', () => {
    writeFileSync(join(sandbox, 'clear-cache'), '%PDF-1.4');
    expect(resolveClearCacheCommand(['clear-cache'])?.kind).toBe('error');
  });

  it('refuses on a directory of that name', () => {
    mkdirSync(join(sandbox, 'clear-cache'));
    expect(resolveClearCacheCommand(['clear-cache'])?.kind).toBe('error');
  });

  it('refuses on a symlink whose target is missing', () => {
    symlinkSync(join(sandbox, 'absent.pdf'), join(sandbox, 'clear-cache'));
    expect(resolveClearCacheCommand(['clear-cache'])?.kind).toBe('error');
  });
});
