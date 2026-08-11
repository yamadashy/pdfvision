import { describe, expect, it } from 'vitest';
import { resolveMcpCommand } from '../../src/cli/mcpCommand.js';

describe('resolveMcpCommand', () => {
  it('serves on a bare `mcp`', () => {
    expect(resolveMcpCommand(['mcp'])).toEqual({ kind: 'serve' });
  });

  it.each([['-h'], ['--help']])('shows help for `mcp %s`', (flag) => {
    expect(resolveMcpCommand(['mcp', flag])).toEqual({ kind: 'help' });
  });

  it('rejects arguments rather than silently ignoring them', () => {
    const command = resolveMcpCommand(['mcp', '--json']);
    expect(command?.kind).toBe('error');
    expect(command).toMatchObject({ message: expect.stringContaining('"--json"') });
  });

  it('names every rejected argument', () => {
    const command = resolveMcpCommand(['mcp', 'a.pdf', '--layout']);
    expect(command).toMatchObject({ message: expect.stringContaining('"a.pdf" "--layout"') });
  });

  it.each([[[]], [['doc.pdf']], [['--help']], [['./mcp']], [['mcp.pdf']], [['doc.pdf', 'mcp']]])(
    'leaves %j to the extraction CLI',
    (argv) => {
      expect(resolveMcpCommand(argv)).toBeUndefined();
    },
  );
});

describe('resolveMcpCommand terminal flags', () => {
  it.each([['-v'], ['--version']])('honors the calling convention for `mcp %s`', (flag) => {
    expect(resolveMcpCommand(['mcp', flag])).toEqual({ kind: 'version' });
  });

  it('gives --version precedence over --help, as the main CLI does', () => {
    expect(resolveMcpCommand(['mcp', '--help', '--version'])).toEqual({ kind: 'version' });
  });

  it('still errors when a terminal flag is mixed with a real argument', () => {
    expect(resolveMcpCommand(['mcp', '--version', '--json'])).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('"--json"'),
    });
  });

  it.each([
    ['-vh', 'version'],
    ['-hv', 'version'],
    ['-hh', 'help'],
  ])('reads the clustered short flags in `mcp %s` as %s', (flag, kind) => {
    expect(resolveMcpCommand(['mcp', flag])).toEqual({ kind });
  });

  it.each([['-vj'], ['-x'], ['-']])('rejects `mcp %s`', (flag) => {
    expect(resolveMcpCommand(['mcp', flag])?.kind).toBe('error');
  });
});
