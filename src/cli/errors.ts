const PDFJS_NEED_PASSWORD = 1;
const PDFJS_INCORRECT_PASSWORD = 2;

function isObject(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === 'object' && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatCliErrorMessage(error: unknown): string {
  const message = errorMessage(error);
  const code = isObject(error) ? error.code : undefined;
  const name = isObject(error) ? error.name : undefined;

  if (name === 'PasswordException' || /password/i.test(message)) {
    if (code === PDFJS_NEED_PASSWORD || /^No password given$/i.test(message)) {
      return 'PDF is encrypted; pass --password <value> or --password-stdin to decrypt it.';
    }
    if (code === PDFJS_INCORRECT_PASSWORD || /^Incorrect Password$/i.test(message)) {
      return 'Incorrect PDF password; check the value passed via --password or --password-stdin.';
    }
  }

  return message;
}

export function exitWithError(message: string): never {
  console.error(`Error: ${message}`);
  console.error('Run "pdfvision --help" for usage.');
  process.exit(1);
}
