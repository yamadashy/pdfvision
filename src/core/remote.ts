import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWrite, ensurePrivateDir } from './cache.js';

/**
 * Root directory for downloaded remote PDFs. Sibling of the result-cache
 * directory so a single `--clear-cache` clears both — `<tmpdir>/pdfvision/`
 * is the one place we keep PDF-derived state on disk. Honours the same
 * `PDFVISION_CACHE_DIR` override the rest of cache.ts uses, so tests can
 * isolate the entire cache hierarchy in a temp directory.
 */
function cacheRoot(): string {
  return process.env.PDFVISION_CACHE_DIR ?? join(tmpdir(), 'pdfvision');
}
function remoteCacheRoot(): string {
  return join(cacheRoot(), 'remote');
}

/** Default 100 MB. PDFs at this size are almost always intentionally pathological. */
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;
/** Default 60 s — enough for slow links, short enough that a hung server doesn't lock the CLI. */
const DEFAULT_TIMEOUT_MS = 60_000;

export interface DownloadRemoteOptions {
  /**
   * If true, force a fresh download even when a previous cache hit exists.
   * Mirrors the result-cache `--no-cache` flag so users have one knob.
   */
  noCache?: boolean;
  /** Max bytes to accept. Defaults to 100 MB. */
  maxBytes?: number;
  /** Network timeout in milliseconds. Defaults to 60_000. */
  timeoutMs?: number;
  /**
   * Override the global `fetch` for tests. Production callers leave this
   * unset and pdfvision uses the platform fetch.
   */
  fetchImpl?: typeof globalThis.fetch;
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

/**
 * Download a remote PDF and return the local path it was cached at.
 *
 * The cache directory is keyed by `sha256(url)` so the same URL always
 * resolves to the same on-disk file; subsequent calls without
 * `noCache: true` short-circuit and return the cached path. To pick up
 * an updated remote PDF, pass `noCache: true` or run
 * `pdfvision --clear-cache` to nuke the whole cache.
 *
 * Only `http:` and `https:` URLs are accepted — `file:`, `data:`,
 * `ftp:`, etc. are rejected up front so a stray scheme can't escape
 * the network-fetch path.
 */
export async function downloadRemote(rawUrl: string, options: DownloadRemoteOptions = {}): Promise<string> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Refusing to download non-http(s) URL: ${rawUrl}`);
  }

  const noCache = !!options.noCache;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  // sha256(url) keeps two URLs that differ only by query string in
  // separate cache slots, since they often point at different PDFs
  // (signed-URL CDNs, version pins). 16 hex chars = 64 bits of
  // collision resistance; plenty for a per-user cache.
  const urlHash = createHash('sha256').update(rawUrl).digest('hex').slice(0, 16);
  const cacheDir = join(remoteCacheRoot(), urlHash);
  const cachePath = join(cacheDir, safeBasenameFromUrl(url));

  if (!noCache && existsSync(cachePath)) {
    try {
      if (statSync(cachePath).size > 0) return cachePath;
    } catch {
      // fall through and re-download
    }
  }

  // Lay down the directory structure with the same hardening the result
  // cache uses (0o700, owner-checked, no symlink-redirect).
  ensurePrivateDir(cacheRoot());
  ensurePrivateDir(remoteCacheRoot());
  ensurePrivateDir(cacheDir);

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(rawUrl, { signal: controller.signal, redirect: 'follow' });
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error(`Timed out after ${timeoutMs}ms downloading ${rawUrl}`);
    }
    throw new Error(`Network error downloading ${rawUrl}: ${(error as Error).message}`);
  } finally {
    clearTimeout(timeoutHandle);
  }

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
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`Remote PDF exceeds ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const data = Buffer.concat(chunks);
  // Defensive retry: another process running `--clear-cache` (or a
  // concurrent test worker rmSync-ing the cache root) can race the
  // ensurePrivateDir calls above and nuke the parent dir before we
  // write. Recreate the dirs and try once more on ENOENT before
  // surfacing the error.
  try {
    atomicWrite(cachePath, data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    ensurePrivateDir(cacheRoot());
    ensurePrivateDir(remoteCacheRoot());
    ensurePrivateDir(cacheDir);
    atomicWrite(cachePath, data);
  }
  return cachePath;
}
