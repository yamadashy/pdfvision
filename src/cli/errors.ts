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
 */
export function exitWithError(message: string, usageCommand = 'pdfvision --help'): never {
  console.error(`Error: ${message}`);
  console.error(`Run "${usageCommand}" for usage.`);
  process.exit(1);
}
