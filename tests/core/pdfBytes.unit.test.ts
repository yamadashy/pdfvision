import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTruncationHint } from '../../src/core/processor/pdfBytes.js';

const HTML_ERROR_PAGE = Buffer.from(
  '<!DOCTYPE html>\n<html><head><title>Sign in to continue</title></head>\n<body>Access denied</body></html>\n',
  'utf8',
);
const COMPLETE_PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'latin1');
const TRUNCATED_PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n', 'latin1');

let sandbox: string;
beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'pdfvision-pdfbytes-'));
});
afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function onDisk(name: string, bytes: Buffer): string {
  const path = join(sandbox, name);
  writeFileSync(path, bytes);
  return path;
}

function hint(bytes: Buffer | undefined, filePath: string): string {
  const error = withTruncationHint(new Error('Invalid PDF structure.'), bytes, filePath);
  return (error as Error).message;
}

describe('withTruncationHint', () => {
  it('names the file as a non-PDF and quotes its leading bytes (in-memory)', () => {
    const message = hint(HTML_ERROR_PAGE, '/nonexistent.pdf');

    expect(message).toContain('this file is not a PDF');
    expect(message).toContain('<!DOCTYPE html>');
    expect(message).toContain('Sign in to continue');
    // The truncation advice is exactly the loop this case must not send
    // a caller into.
    expect(message).not.toContain('likely truncated');
    expect(message).toContain('Re-downloading the same URL will not help');
  });

  it('names the file as a non-PDF from the file-descriptor path too', () => {
    const message = hint(undefined, onDisk('login.pdf', HTML_ERROR_PAGE));

    expect(message).toContain('this file is not a PDF');
    expect(message).toContain('<!DOCTYPE html>');
    expect(message).not.toContain('likely truncated');
  });

  it('sanitises binary leading bytes instead of echoing control characters', () => {
    const binary = Buffer.from([0x00, 0x01, 0x02, 0x7f, 0x1b, 0x5b, 0x33, 0x31, 0x6d, 0x00]);

    const message = hint(binary, '/nonexistent.pdf');

    expect(message).toContain('this file is not a PDF');
    // Scanned by code point rather than by regex: the assertion is about
    // control bytes, and writing them into a pattern trips the linters.
    const controlChars = [...message].filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x20 || code === 0x7f;
    });
    expect(controlChars).toEqual([]);
    expect(message).toContain('.[31m');
  });

  it('calls an empty file empty rather than not-a-PDF-shaped guesswork', () => {
    const message = hint(undefined, onDisk('empty.pdf', Buffer.alloc(0)));

    expect(message).toContain('the file is empty');
  });

  it('keeps the truncation hint when the header is present but %%EOF is not', () => {
    expect(hint(TRUNCATED_PDF, '/nonexistent.pdf')).toContain('likely truncated');
    expect(hint(undefined, onDisk('partial.pdf', TRUNCATED_PDF))).toContain('likely truncated');
  });

  it('returns the raw parse error when both markers are present', () => {
    expect(hint(COMPLETE_PDF, '/nonexistent.pdf')).toBe('Invalid PDF structure.');
    expect(hint(undefined, onDisk('whole.pdf', COMPLETE_PDF))).toBe('Invalid PDF structure.');
  });

  it('returns the original error when the probe itself fails', () => {
    // No bytes in hand and no readable file: inspection is best-effort,
    // so the parse error must survive untouched.
    expect(hint(undefined, join(sandbox, 'does-not-exist.pdf'))).toBe('Invalid PDF structure.');
  });

  it('passes through non-Error rejections untouched', () => {
    expect(withTruncationHint('not an error', HTML_ERROR_PAGE, '/nonexistent.pdf')).toBe('not an error');
  });
});
