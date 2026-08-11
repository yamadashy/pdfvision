import { classifyPasswordFailure } from '../core/errors/passwordFailure.js';

const CLI_PASSWORD_REMEDY = {
  missing: 'PDF is encrypted; pass --password <value> or --password-stdin to decrypt it.',
  incorrect: 'Incorrect PDF password; check the value passed via --password or --password-stdin.',
} as const;

export function formatCliErrorMessage(error: unknown): string {
  const failure = classifyPasswordFailure(error);
  if (failure) return CLI_PASSWORD_REMEDY[failure];
  return error instanceof Error ? error.message : String(error);
}

/**
 * `usageCommand` lets a subcommand point at its own help instead of the
 * whole CLI's: after `pdfvision clear-cache --json`, the useful next read
 * is that subcommand's usage, not the full option list.
 *
 * Without one, the hint also names the documentation index. Being stuck is
 * exactly when knowing the topics exist is worth the line, and it is the
 * only moment an agent that skipped `--help` reliably reads our output.
 */
export function exitWithError(message: string, usageCommand?: string): never {
  console.error(`Error: ${message}`);
  console.error(
    usageCommand
      ? `Run "${usageCommand}" for usage.`
      : 'Run "pdfvision --help" for usage, or "pdfvision docs" for the documentation index.',
  );
  process.exit(1);
}
