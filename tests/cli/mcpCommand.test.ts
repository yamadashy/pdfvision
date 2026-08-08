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
