import { existsSync } from 'node:fs';

/**
 * Dispatch for the `pdfvision clear-cache` subcommand.
 *
 * Resolved before `parseArgs` for the same reason as `mcp`: the operation
 * takes no CLI options, so declaring every extraction flag only to reject
 * it would be noise. The deprecated `--clear-cache` flag keeps working
 * through the normal option path until it is removed.
 */
export type ClearCacheCommand = { kind: 'clear' } | { kind: 'help' } | { kind: 'error'; message: string };

export const CLEAR_CACHE_SUBCOMMAND = 'clear-cache';

/**
 * Returns `undefined` when this is not a `clear-cache` invocation, leaving
 * the arguments to the normal extraction CLI.
 *
 * `fileExists` is injected so the dispatch stays testable without touching
 * the filesystem. Unlike `mcp`, a mistaken match here would delete cached
 * data, so a real file of the same name refuses rather than resolving the
 * ambiguity silently in either direction.
 */
export function resolveClearCacheCommand(
  argv: readonly string[],
  fileExists: (path: string) => boolean = existsSync,
): ClearCacheCommand | undefined {
  if (argv[0] !== CLEAR_CACHE_SUBCOMMAND) return undefined;

  const rest = argv.slice(1);
  if (rest.length > 0) {
    if (rest.every((arg) => arg === '-h' || arg === '--help')) return { kind: 'help' };
    return {
      kind: 'error',
      message: `"pdfvision clear-cache" takes no arguments, got ${rest.map((arg) => `"${arg}"`).join(' ')}`,
    };
  }

  if (fileExists(CLEAR_CACHE_SUBCOMMAND)) {
    return {
      kind: 'error',
      message:
        `"clear-cache" is a subcommand, but a file named "clear-cache" exists in this directory. ` +
        `Pass "./clear-cache" to read that file, or clear the cache from another directory.`,
    };
  }

  return { kind: 'clear' };
}
