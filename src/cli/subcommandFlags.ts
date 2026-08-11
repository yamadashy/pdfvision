/**
 * `--help` and `--version` are calling convention rather than pdfvision's
 * own grammar, so the help text promises they work anywhere — including
 * after a subcommand that otherwise takes no options. Shared so every
 * subcommand resolver honors that promise identically, with the same
 * version-before-help precedence the main CLI uses.
 */
export type TerminalFlag = 'version' | 'help';

export function resolveTerminalFlags(args: readonly string[]): TerminalFlag | undefined {
  if (args.length === 0) return undefined;

  // Every argument has to be a terminal flag: `mcp --version --json` is
  // still an argument error, so a stray option cannot be masked by pairing
  // it with a flag the subcommand happens to accept.
  let sawVersion = false;
  let sawHelp = false;
  for (const arg of args) {
    if (arg === '-v' || arg === '--version') sawVersion = true;
    else if (arg === '-h' || arg === '--help') sawHelp = true;
    else return undefined;
  }
  if (sawVersion) return 'version';
  return sawHelp ? 'help' : undefined;
}
