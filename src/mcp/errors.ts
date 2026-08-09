import { classifyPasswordFailure } from '../core/errors/passwordFailure.js';

/**
 * Every other MCP failure names the call that fixes it — an unknown ref
 * says to re-run the search, a missing attachment lists the ones that
 * exist. Encryption used to be the exception, handing back pdf.js's raw
 * "No password given": true, but it names neither the `password`
 * parameter nor the fact that all three tools take one, and tool schemas
 * are fetched lazily, so the model may not have that in context when the
 * error arrives.
 */
const MCP_PASSWORD_REMEDY = {
  missing: 'PDF is encrypted and no password was given — retry the same call with `password: "…"`.',
  incorrect: 'Incorrect PDF password — retry the same call with a different `password` value.',
} as const;

export function formatMcpErrorMessage(error: unknown): string {
  const failure = classifyPasswordFailure(error);
  if (failure) return MCP_PASSWORD_REMEDY[failure];
  return error instanceof Error ? error.message : String(error);
}
