import { createHash } from 'node:crypto';
import { closeSync, fstatSync, openSync, readSync } from 'node:fs';

export function fingerprintData(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex').slice(0, 16);
}

/** Bytes scanned at the end of the file for the `%%EOF` marker. The PDF
 *  spec requires the trailer within the last 1024 bytes; doubled for
 *  slack (trailing whitespace, sloppy producers). */
const EOF_SCAN_WINDOW_BYTES = 2048;

/** Bytes scanned at the start of the file for the `%PDF-` header. The
 *  header must appear near the start per ISO 32000; same window
 *  `io/remote.ts` uses when validating a download. */
const PDF_HEADER_SCAN_BYTES = 1024;

/** How much of the head is quoted back when the file is not a PDF —
 *  enough for `<!doctype html>` plus a title, short enough to stay
 *  readable inside an error message. */
const HEAD_EXCERPT_MAX_CHARS = 60;

/**
 * Render the first bytes of a non-PDF file as a single short, printable
 * ASCII fragment so an HTML error page or a text file is self-diagnosing.
 * Non-printable bytes collapse to `.`, whitespace runs to one space —
 * a binary head therefore reads as dots rather than smuggling control
 * characters into the caller's terminal or log.
 */
function sanitizedHeadExcerpt(head: Uint8Array): string {
  let out = '';
  let elided = false;
  for (const byte of head) {
    if (byte >= 0x20 && byte <= 0x7e) {
      out += String.fromCharCode(byte);
      elided = false;
    } else {
      if (!elided) out += byte === 0x09 || byte === 0x0a || byte === 0x0d ? ' ' : '.';
      elided = true;
    }
    if (out.length >= HEAD_EXCERPT_MAX_CHARS) break;
  }
  return out.trim();
}

function notPdfHint(head: Uint8Array, size: number): string {
  if (size === 0) return ' (the file is empty — 0 bytes; check what was actually downloaded or saved under this name)';
  const excerpt = sanitizedHeadExcerpt(head);
  const starts =
    excerpt.length > 0 ? `it starts with ${JSON.stringify(excerpt)}` : 'it starts with non-printable bytes';
  return (
    ` (no %PDF- header in the first ${PDF_HEADER_SCAN_BYTES} bytes — this file is not a PDF; ${starts}.` +
    ' Check what was actually downloaded or saved under this name: an HTML error/login page, a redirect stub,' +
    ' or a text file kept under a .pdf name all produce this. Re-downloading the same URL will not help.)'
  );
}

/**
 * When pdf.js fails to parse a document, look at the underlying bytes to
 * tell three cases apart:
 *
 *  - no `%PDF-` header near the start — the file is not a PDF at all
 *    (an HTML login page saved as `.pdf` is the common case). Advising a
 *    re-download here is a loop that can never help, so the hint says so
 *    and quotes the leading bytes instead.
 *  - header present, no `%%EOF` trailer — almost always a truncated
 *    file (an interrupted download), where re-downloading is the fix.
 *  - both present — pdf.js's own parse error stands unchanged.
 *
 * The probe is best-effort: any inspection failure returns the original
 * error.
 */
export function withTruncationHint(error: unknown, pdfData: Uint8Array | undefined, filePath: string): unknown {
  if (!(error instanceof Error)) return error;
  let head: Uint8Array;
  let tail: Uint8Array;
  let size: number;
  try {
    if (pdfData) {
      size = pdfData.length;
      head = pdfData.subarray(0, PDF_HEADER_SCAN_BYTES);
      tail = pdfData.subarray(Math.max(0, size - EOF_SCAN_WINDOW_BYTES));
    } else {
      const fd = openSync(filePath, 'r');
      try {
        size = fstatSync(fd).size;
        head = readChunk(fd, 0, Math.min(PDF_HEADER_SCAN_BYTES, size));
        const tailLength = Math.min(EOF_SCAN_WINDOW_BYTES, size);
        tail = readChunk(fd, size - tailLength, tailLength);
      } finally {
        closeSync(fd);
      }
    }
  } catch {
    return error;
  }
  if (!Buffer.from(head.buffer, head.byteOffset, head.byteLength).includes('%PDF-')) {
    error.message += notPdfHint(head, size);
    return error;
  }
  if (Buffer.from(tail.buffer, tail.byteOffset, tail.byteLength).includes('%%EOF')) return error;
  error.message +=
    ' (no %%EOF trailer in the final bytes — the file is likely truncated, e.g. an incomplete download; re-download it and compare byte sizes before retrying)';
  return error;
}

function readChunk(fd: number, position: number, length: number): Buffer {
  const buffer = Buffer.alloc(length);
  if (length === 0) return buffer;
  const bytesRead = readSync(fd, buffer, 0, length, position);
  return buffer.subarray(0, bytesRead);
}
