import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readSync, type Stats } from 'node:fs';
import { join } from 'node:path';
import { atomicWrite } from './atomicWrite.js';
import { createCacheRootSession, ensureCacheSubdirectory } from './cache.js';
import { sameIdentity } from './cacheRoot.js';

/** Default 100 MB. PDFs at this size are almost always intentionally pathological. */
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;
/** Default 60 s — enough for slow links, short enough that a hung server doesn't lock the CLI. */
const DEFAULT_TIMEOUT_MS = 60_000;
/** The PDF header must appear near the start of the file, per ISO 32000. */
const PDF_HEADER_SCAN_BYTES = 1024;

export interface DownloadRemoteOptions {
  /**
   * If true, force a fresh download even when a previous cache hit exists.
   * Mirrors the result-cache `--no-cache` flag so users have one knob.
   */
  noCache?: boolean;
  /** Max bytes to accept. Defaults to 100 MB. */
  maxBytes?: number;
  /** Download deadline covering response headers and body transfer. Defaults to 60_000 ms. */
  timeoutMs?: number;
  /**
   * Override the global `fetch` for tests. Production callers leave this
   * unset and pdfvision uses the platform fetch.
   */
  fetchImpl?: typeof globalThis.fetch;
}

interface DownloadRemoteResult {
  path: string;
  data: Buffer;
}

interface DownloadRemotePathResult {
  path: string;
}

/** @internal Test-only race hook; package consumers do not import this module. */
export interface DownloadRemoteTestHooks {
  afterSourceDataReady?: (cachePath: string) => void;
}

/**
 * Pull a basename out of a URL pathname that's safe to use as a filename.
 * Falls back to a generic name when the URL has no path or only contains
 * characters we'd refuse anyway. Keeps the ".pdf" extension whenever the
 * server provides one because it makes the cache directory navigable.
 */
function safeBasenameFromUrl(url: URL): string {
  const last = url.pathname.split('/').filter(Boolean).pop() ?? '';
  // Strip path traversal / hidden file markers and anything beyond a
  // narrow ASCII set. The decoded form is what we'd actually write to
  // disk, so percent-encoded segments get expanded first.
  let decoded: string;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    decoded = last;
  }
  const cleaned = decoded.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '');
  if (cleaned.length === 0 || cleaned === '..') return 'document.pdf';
  // Always end in .pdf so the cached file looks like a PDF when
  // inspected manually — pdf.js doesn't actually check the extension.
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
}

function hasPdfHeader(data: Buffer): boolean {
  return data.subarray(0, PDF_HEADER_SCAN_BYTES).includes(Buffer.from('%PDF-', 'ascii'));
}

function currentUid(): number | undefined {
  return typeof process.getuid === 'function' ? process.getuid() : undefined;
}

function withVerifiedCachedPdf<T>(
  path: string,
  recheckPath: boolean,
  readOpenedFile: (fd: number, opened: Stats) => T,
): T | null {
  let before: Stats;
  try {
    before = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  if (before.isSymbolicLink()) {
    throw new Error(`Refusing to read remote PDF cache file at ${path}: path is a symlink`);
  }
  if (!before.isFile()) {
    throw new Error(`Refusing to read remote PDF cache file at ${path}: path is not a regular file`);
  }
  const uid = currentUid();
  if (uid !== undefined && before.uid !== uid) {
    throw new Error(`Refusing to read remote PDF cache file at ${path}: owned by uid ${before.uid}, not ${uid}`);
  }
  if (before.size === 0) return null;

  const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0;
  const fd = openSync(path, constants.O_RDONLY | noFollow);
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || !sameIdentity(before, opened)) {
      throw new Error(`Refusing to read remote PDF cache file at ${path}: file identity changed`);
    }
    const result = readOpenedFile(fd, opened);
    if (recheckPath) {
      let after: Stats;
      try {
        after = lstatSync(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(`Refusing to return remote PDF cache path at ${path}: file identity changed`);
        }
        throw error;
      }
      if (after.isSymbolicLink() || !after.isFile() || !sameIdentity(opened, after)) {
        throw new Error(`Refusing to return remote PDF cache path at ${path}: file identity changed`);
      }
    }
    return result;
  } finally {
    closeSync(fd);
  }
}

function readVerifiedCachedPdf(path: string): Buffer | null {
  const data = withVerifiedCachedPdf(path, false, (fd) => readFileSync(fd));
  return data !== null && hasPdfHeader(data) ? data : null;
}

function cachedFileHasPdfHeader(path: string): boolean {
  return (
    withVerifiedCachedPdf(path, true, (fd, opened) => {
      const header = Buffer.allocUnsafe(Math.min(PDF_HEADER_SCAN_BYTES, opened.size));
      const bytesRead = readSync(fd, header, 0, header.length, 0);
      return hasPdfHeader(header.subarray(0, bytesRead));
    }) ?? false
  );
}

function parseRemoteUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Refusing to download non-http(s) URL: ${rawUrl}`);
  }
  return url;
}

async function fetchRemotePdfBytes(rawUrl: string, options: DownloadRemoteOptions): Promise<Buffer> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(rawUrl, { signal: controller.signal, redirect: 'follow' });
  } catch (error) {
    clearTimeout(timeoutHandle);
    if ((error as Error).name === 'AbortError') {
      throw new Error(`Timed out after ${timeoutMs}ms downloading ${rawUrl}`);
    }
    throw new Error(`Network error downloading ${rawUrl}: ${(error as Error).message}`);
  }

  try {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} for ${rawUrl}`);
    }

    // Some servers send Content-Length up front; a 200 with a too-large
    // declared length is rejected before we read a single byte. Servers
    // that omit Content-Length still get capped during the streaming read
    // below, so this is a fast-path optimisation rather than the only check.
    const declaredLength = Number(response.headers.get('content-length') ?? '');
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new Error(`Remote PDF declares ${declaredLength} bytes, exceeds limit of ${maxBytes}`);
    }

    if (response.body === null) {
      throw new Error(`Remote response has no body: ${rawUrl}`);
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        let result: ReadableStreamReadResult<Uint8Array>;
        try {
          result = await reader.read();
        } catch (error) {
          if (controller.signal.aborted) {
            throw new Error(`Timed out after ${timeoutMs}ms downloading ${rawUrl}`);
          }
          throw error;
        }

        if (result.done) break;
        total += result.value.length;
        if (total > maxBytes) {
          try {
            await reader.cancel();
          } catch {
            // Cancellation is cleanup. Its failure must not replace the
            // deterministic size-limit error that triggered it.
          }
          throw new Error(`Remote PDF exceeds ${maxBytes} bytes`);
        }
        chunks.push(result.value);
      }
    } finally {
      reader.releaseLock();
    }

    const data = Buffer.concat(chunks);
    if (!hasPdfHeader(data)) {
      const contentType = response.headers.get('content-type')?.trim() || 'unknown';
      throw new Error(
        `Remote URL did not return a PDF (content-type: ${contentType}, bytes: ${data.length}): ${rawUrl}`,
      );
    }
    return data;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function downloadRemoteData(rawUrl: string, options: DownloadRemoteOptions = {}): Promise<Uint8Array> {
  parseRemoteUrl(rawUrl);
  return fetchRemotePdfBytes(rawUrl, options);
}

/**
 * Download a remote PDF and return the local path it was cached at.
 *
 * The cache directory is keyed by `sha256(url)` so the same URL always
 * resolves to the same on-disk file; subsequent calls without
 * `noCache: true` short-circuit and return the cached path. To pick up
 * an updated remote PDF, pass `noCache: true` or run
 * `pdfvision clear-cache` to clear the verified pdfvision cache root.
 *
 * Only `http:` and `https:` URLs are accepted — `file:`, `data:`,
 * `ftp:`, etc. are rejected up front so a stray scheme can't escape
 * the network-fetch path.
 */
async function downloadRemoteImpl(
  rawUrl: string,
  options: DownloadRemoteOptions,
  hooks: DownloadRemoteTestHooks,
  includeData: true,
): Promise<DownloadRemoteResult>;
async function downloadRemoteImpl(
  rawUrl: string,
  options: DownloadRemoteOptions,
  hooks: DownloadRemoteTestHooks,
  includeData: false,
): Promise<DownloadRemotePathResult>;
async function downloadRemoteImpl(
  rawUrl: string,
  options: DownloadRemoteOptions,
  hooks: DownloadRemoteTestHooks,
  includeData: boolean,
): Promise<DownloadRemoteResult | DownloadRemotePathResult> {
  const url = parseRemoteUrl(rawUrl);

  const noCache = !!options.noCache;
  const rootSession = createCacheRootSession();
  const cacheRoot = rootSession.path;
  const remoteCacheRoot = join(cacheRoot, 'remote');

  // sha256(url) keeps two URLs that differ only by query string in
  // separate cache slots, since they often point at different PDFs
  // (signed-URL CDNs, version pins). 16 hex chars = 64 bits of
  // collision resistance; plenty for a per-user cache.
  const urlHash = createHash('sha256').update(rawUrl).digest('hex').slice(0, 16);
  const cacheDir = join(remoteCacheRoot, urlHash);
  const cachePath = join(cacheDir, safeBasenameFromUrl(url));

  // Validate every parent before looking at a possible cache hit. A planted
  // symlink at remote/<url-hash> must not turn the read path into an escape
  // from the owned root.
  ensureCacheSubdirectory(rootSession, 'remote', urlHash);

  if (!noCache) {
    if (includeData) {
      const cachedData = readVerifiedCachedPdf(cachePath);
      if (cachedData) {
        hooks.afterSourceDataReady?.(cachePath);
        return { path: cachePath, data: cachedData };
      }
    } else if (cachedFileHasPdfHeader(cachePath)) {
      return { path: cachePath };
    }
  }

  const data = await fetchRemotePdfBytes(rawUrl, options);
  // Defensive retry: another process running `clear-cache` (or a
  // concurrent test worker rmSync-ing the cache root) can race the
  // directory setup above and remove the parent dir before we
  // write. Recreate the dirs and try once more on ENOENT before
  // surfacing the error.
  try {
    atomicWrite(cachePath, data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    ensureCacheSubdirectory(rootSession, 'remote', urlHash);
    atomicWrite(cachePath, data);
  }
  if (includeData) {
    hooks.afterSourceDataReady?.(cachePath);
    return { path: cachePath, data };
  }
  return { path: cachePath };
}

export async function downloadRemoteWithData(
  rawUrl: string,
  options: DownloadRemoteOptions = {},
): Promise<DownloadRemoteResult> {
  return downloadRemoteImpl(rawUrl, options, {}, true);
}

/** @internal Exercise post-read pathname races without changing production semantics. */
export async function downloadRemoteWithDataForTesting(
  rawUrl: string,
  hooks: DownloadRemoteTestHooks,
  options: DownloadRemoteOptions = {},
): Promise<DownloadRemoteResult> {
  return downloadRemoteImpl(rawUrl, options, hooks, true);
}

export async function downloadRemote(rawUrl: string, options: DownloadRemoteOptions = {}): Promise<string> {
  return (await downloadRemoteImpl(rawUrl, options, {}, false)).path;
}
