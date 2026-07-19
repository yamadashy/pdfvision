import { createHash } from 'node:crypto';
import { closeSync, lstatSync, openSync, readFileSync, readSync, rmSync, type Stats } from 'node:fs';
import { join } from 'node:path';
import { atomicWrite } from './atomicWrite.js';
import { createCacheRootSession, ensureCacheSubdirectory } from './cacheRoot.js';

export type { ClearCacheResult } from './cacheRoot.js';
export {
  CACHE_ROOT_MARKER_CONTENT,
  CACHE_ROOT_MARKER_NAME,
  clearAllCache,
  createCacheRootSession,
  ensureCacheRoot,
  ensureCacheSubdirectory,
  ensurePrivateDir,
  getCacheRoot,
} from './cacheRoot.js';

// Reject any cache key that isn't a single safe path segment.
// Cache callers always supply a hash-derived key, so the safe set is narrow.
const SAFE_KEY = /^[A-Za-z0-9._-]+$/;
// Strict shape of a per-PDF fingerprint — 16 lowercase hex chars as
// produced by `hashFileContent`. Used to validate the optional
// fingerprint argument to `getCacheDir`, since that path joins the
// value into the cache root before the private child is created.
const SAFE_FINGERPRINT = /^[a-f0-9]{16}$/;

function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key) || key === '.' || key === '..') {
    throw new Error(`Invalid cache key: ${key}`);
  }
}

function hashFileContent(filePath: string): string {
  const hash = createHash('sha256');
  // Stream the file so very large PDFs don't get fully loaded just to
  // compute a content-hash for the cache key.
  const fd = openSync(filePath, 'r');
  try {
    const chunk = Buffer.allocUnsafe(64 * 1024);
    while (true) {
      const n = readSync(fd, chunk, 0, chunk.length, null);
      if (n === 0) break;
      hash.update(chunk.subarray(0, n));
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest('hex').slice(0, 16);
}

/**
 * Stable per-PDF content fingerprint — the same 16-char sha256 prefix
 * that powers the cache directory name. Exposed so other modules can
 * derive per-PDF subdirectories (e.g. the render output layout) from
 * the same identity the cache uses, without re-hashing or having to
 * parse it back out of the cache dir path.
 */
export function pdfFingerprint(filePath: string): string {
  return hashFileContent(filePath);
}

export function getCacheDir(filePath: string, fingerprint?: string): string {
  // Optional precomputed fingerprint lets a caller hash the file once
  // and feed the same identity into both `getCacheDir` and any other
  // per-PDF path (e.g. the render-output subdir layout in processor).
  // Validate the shape strictly — the value is joined into the cache
  // root and then the child setup will create it with mode 0700, so an
  // unchecked `../foo` from an external caller would escape the cache
  // hierarchy.
  if (fingerprint !== undefined && !SAFE_FINGERPRINT.test(fingerprint)) {
    throw new Error(`Invalid pdf fingerprint: ${fingerprint}`);
  }
  const key = fingerprint ?? hashFileContent(filePath);
  const rootSession = createCacheRootSession();
  return ensureCacheSubdirectory(rootSession, key);
}

export function getCached(cacheDir: string, key: string): string | null {
  assertSafeKey(key);
  const cachePath = join(cacheDir, key);
  // lstat first so we don't read through an attacker-planted symlink.
  // ENOENT can happen if another process drops the cache file between
  // calls, so treat that as a cache miss rather than an error.
  let stat: Stats;
  try {
    stat = lstatSync(cachePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to read cache file at ${cachePath}: path is a symlink`);
  }
  try {
    return readFileSync(cachePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export function setCache(cacheDir: string, key: string, data: string): void {
  assertSafeKey(key);
  const cachePath = join(cacheDir, key);
  // Refuse to silently replace a symlink at the destination; the caller
  // probably wants to know that something fishy is going on rather than
  // have us atomically swap the symlink out. ENOENT is fine — we'll just
  // create a new file via atomicWrite below.
  try {
    if (lstatSync(cachePath).isSymbolicLink()) {
      throw new Error(`Refusing to write cache file at ${cachePath}: path is a symlink`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  atomicWrite(cachePath, Buffer.from(data, 'utf-8'));
}

// Write to a sibling temp path then rename into place. Concurrent readers
// see either the previous version or the fully-written new version, never
// a partially-written file. O_NOFOLLOW + O_EXCL on the temp path prevents
// the same symlink-redirect attack as the previous direct-write path.
export function dropCached(cacheDir: string, key: string): void {
  assertSafeKey(key);
  rmSync(join(cacheDir, key), { force: true });
}
