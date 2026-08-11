import { resolveTerminalFlags } from './subcommandFlags.js';

/**
 * Dispatch for the `pdfvision mcp` subcommand.
 *
 * The MCP server takes no CLI options, so this is resolved before
 * `parseArgs` runs — otherwise every flag would have to be declared just
 * to be rejected. Kept as a pure function so the dispatch is testable
 * without starting a server on stdio.
 */
export type McpCommand =
  | { kind: 'serve' }
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'error'; message: string };

export const MCP_SUBCOMMAND = 'mcp';

/**
 * Returns `undefined` when this is not an `mcp` invocation, leaving the
 * arguments to the normal extraction CLI. A file literally named `mcp`
 * therefore has to be passed as `./mcp`.
 */
export function resolveMcpCommand(argv: readonly string[]): McpCommand | undefined {
  if (argv[0] !== MCP_SUBCOMMAND) return undefined;

  const rest = argv.slice(1);
  if (rest.length === 0) return { kind: 'serve' };
  const terminal = resolveTerminalFlags(rest);
  if (terminal) return { kind: terminal };
  return {
    kind: 'error',
    // Fail loudly rather than ignoring the argument: silently starting a
    // server that ignored `--json` would look like the flag took effect.
    message: `"pdfvision mcp" takes no arguments, got ${rest.map((arg) => `"${arg}"`).join(' ')}`,
  };
}
