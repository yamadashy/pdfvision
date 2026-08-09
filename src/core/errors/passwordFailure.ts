/**
 * pdf.js reports an encryption failure as a `PasswordException` carrying a
 * numeric code, and older/rewrapped errors only carry the message. What is
 * surface-independent is the *classification*: whether a password is
 * missing or wrong. The remedy is not — the CLI has `--password`, an MCP
 * caller has a `password` parameter, and a library caller has an option
 * object — so each surface maps this to its own wording rather than
 * inheriting the CLI's flags.
 */
export type PasswordFailure = 'missing' | 'incorrect';

const PDFJS_NEED_PASSWORD = 1;
const PDFJS_INCORRECT_PASSWORD = 2;

function isObject(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === 'object' && value !== null;
}

export function classifyPasswordFailure(error: unknown): PasswordFailure | undefined {
  const message = error instanceof Error ? error.message : String(error);
  const code = isObject(error) ? error.code : undefined;
  const name = isObject(error) ? error.name : undefined;

  if (name !== 'PasswordException' && !/password/i.test(message)) return undefined;
  if (code === PDFJS_NEED_PASSWORD || /^No password given$/i.test(message)) return 'missing';
  if (code === PDFJS_INCORRECT_PASSWORD || /^Incorrect Password$/i.test(message)) return 'incorrect';
  return undefined;
}
