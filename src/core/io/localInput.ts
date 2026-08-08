import { statSync } from 'node:fs';
import { resolve } from 'node:path';

export interface ResolveLocalPdfOptions {
  /**
   * Reject files larger than this. Left unset by the CLI — a user who
   * types a path has already chosen to open that file, and pdfvision has
   * always accepted whatever they pointed at. Callers acting on a model's
   * behalf set it, because nothing else bounds the request.
   */
  maxBytes?: number;
}

/**
 * Resolve a user-supplied path to an absolute one and confirm it is a
 * regular readable file.
 *
 * Throws rather than exiting, so the CLI can turn the message into its
 * own `Error: ... / Run "pdfvision --help"` shape while the MCP server
 * returns it in-band for the model to act on.
 */
export function resolveLocalPdfPath(input: string, options: ResolveLocalPdfOptions = {}): string {
  const filePath = resolve(input);
  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(filePath);
  } catch (error) {
    // "File not found" points at the wrong fix for a permission error or
    // a symlink loop — the caller would go looking for a typo in a path
    // that is right. Only ENOENT is a missing file.
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== undefined && code !== 'ENOENT' && code !== 'ENOTDIR') {
      throw new Error(`Cannot read ${filePath}: ${code}`);
    }
    throw new Error(`File not found: ${filePath}`);
  }
  // A directory passes an access check but fails much later inside pdf.js
  // with an unrecognisable message, so it is rejected here instead.
  if (!stats.isFile()) throw new Error(`Not a file: ${filePath}`);
  if (options.maxBytes !== undefined && stats.size > options.maxBytes) {
    throw new Error(`PDF is ${stats.size} bytes, over the ${options.maxBytes}-byte limit`);
  }
  return filePath;
}
