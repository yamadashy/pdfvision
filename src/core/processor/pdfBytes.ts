import { createHash } from 'node:crypto';
import { closeSync, fstatSync, openSync, readSync } from 'node:fs';

export function fingerprintData(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex').slice(0, 16);
}

/** Bytes scanned at the end of the file for the `%%EOF` marker. The PDF
 *  spec requires the trailer within the last 1024 bytes; doubled for
 *  slack (trailing whitespace, sloppy producers). */
const EOF_SCAN_WINDOW_BYTES = 2048;

/**
 * When pdf.js fails to parse a document, check whether the underlying
 * bytes even end in a `%%EOF` trailer. A missing trailer almost always
 * means the file is truncated (an interrupted download is the common
 * case), and pdf.js's own parse error gives a caller no way to tell a
 * broken PDF from a broken download. The probe is best-effort: any
 * inspection failure returns the original error.
 */
export function withTruncationHint(error: unknown, pdfData: Uint8Array | undefined, filePath: string): unknown {
  if (!(error instanceof Error)) return error;
  let tail: Uint8Array;
  try {
    if (pdfData) {
      tail = pdfData.subarray(Math.max(0, pdfData.length - EOF_SCAN_WINDOW_BYTES));
    } else {
      const fd = openSync(filePath, 'r');
      try {
        const size = fstatSync(fd).size;
        const length = Math.min(EOF_SCAN_WINDOW_BYTES, size);
        const buffer = Buffer.alloc(length);
        readSync(fd, buffer, 0, length, size - length);
        tail = buffer;
      } finally {
        closeSync(fd);
      }
    }
  } catch {
    return error;
  }
  if (Buffer.from(tail).includes('%%EOF')) return error;
  error.message +=
    ' (no %%EOF trailer in the final bytes — the file is likely truncated, e.g. an incomplete download; re-download it and compare byte sizes before retrying)';
  return error;
}
