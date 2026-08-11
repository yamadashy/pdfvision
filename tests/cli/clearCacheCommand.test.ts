import { describe, expect, it } from 'vitest';
import { resolveClearCacheCommand } from '../../src/cli/clearCacheCommand.js';

const noFiles = () => false;

describe('resolveClearCacheCommand', () => {
  it('clears on a bare `clear-cache`', () => {
    expect(resolveClearCacheCommand(['clear-cache'], noFiles)).toEqual({ kind: 'clear' });
  });

  it.each([['-h'], ['--help']])('shows help for `clear-cache %s`', (flag) => {
    expect(resolveClearCacheCommand(['clear-cache', flag], noFiles)).toEqual({ kind: 'help' });
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
