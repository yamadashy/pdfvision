import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  type Stats,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWrite } from './atomicWrite.js';

/**
 * Resolve the cache root afresh on every call so a test that sets
 * `PDFVISION_CACHE_DIR` can isolate its writes from concurrent vitest
 * workers without statically-baked-in module state. Production callers
 * leave the env var unset and get the same `<tmpdir>/pdfvision/` they
 * always have.
 */
export function getCacheRoot(): string {
  return process.env.PDFVISION_CACHE_DIR ?? join(tmpdir(), 'pdfvision');
}

// Cache files may contain extracted PDF text and rendered page images.
// Restrict to the current user so other accounts on the same machine
// (especially relevant on shared Linux hosts with /tmp/pdfvision/...) cannot
// read them.
const DIR_MODE = 0o700;

// Reject any cache key that isn't a single safe path segment.
// Cache callers always supply a hash-derived key, so the safe set is narrow.
const SAFE_KEY = /^[A-Za-z0-9._-]+$/;
// Strict shape of a per-PDF fingerprint — 16 lowercase hex chars as
// produced by `hashFileContent`. Used to validate the optional
// fingerprint argument to `getCacheDir`, since that path joins the
// value into the cache root before `ensurePrivateDir` would chmod it.
const SAFE_FINGERPRINT = /^[a-f0-9]{16}$/;

const isPosix = process.platform !== 'win32';

function currentUid(): number | undefined {
  return typeof process.getuid === 'function' ? process.getuid() : undefined;
}

function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key) || key === '.' || key === '..') {
    throw new Error(`Invalid cache key: ${key}`);
  }
}

function assertOwnedDirectory(dir: string): void {
  const stat = lstatSync(dir);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to use cache directory at ${dir}: path is a symlink`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Refusing to use cache directory at ${dir}: path exists but is not a directory`);
  }
  const uid = currentUid();
  if (uid !== undefined && stat.uid !== uid) {
    throw new Error(`Refusing to use cache directory at ${dir}: owned by uid ${stat.uid}, not ${uid}`);
  }
}

function ensurePrivateDir(dir: string): void {
  // The pre-existing path goes through validation up front. The mkdir
  // branch then re-validates after creation: between the existsSync()
  // check and mkdirSync(), an attacker could plant a symlink-to-dir at
  // `dir`, and mkdirSync({ recursive: true }) treats that as "already
  // exists" and succeeds silently. Re-checking with lstat closes that
  // window before chmod follows the link.
  if (existsSync(dir)) {
    assertOwnedDirectory(dir);
  } else {
    mkdirSync(dir, { recursive: true, mode: DIR_MODE });
    assertOwnedDirectory(dir);
  }

  if (isPosix) {
    // chmod failures used to be swallowed best-effort. Bubble them now —
    // if we can't enforce private mode on the cache dir, the cache is not
    // a safe place to store PDF extractions.
    chmodSync(dir, DIR_MODE);
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
  // root and then `ensurePrivateDir` will mkdir+chmod 0700 it, so an
  // unchecked `../foo` from an external caller would escape the cache
  // hierarchy.
  if (fingerprint !== undefined && !SAFE_FINGERPRINT.test(fingerprint)) {
    throw new Error(`Invalid pdf fingerprint: ${fingerprint}`);
  }
  const key = fingerprint ?? hashFileContent(filePath);
  const root = getCacheRoot();
  ensurePrivateDir(root);
  const dir = join(root, key);
  ensurePrivateDir(dir);
  return dir;
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

// Exposed for renderer + processor so they apply the same hardened
// directory creation policy as the cache helpers.
export { ensurePrivateDir };

/**
 * Result of a `--clear-cache` pass. Both fields are present even when
 * the cache directory was already absent, so the CLI can print a
 * uniform "Cleared <path>" message regardless of whether the run did
 * any actual work.
 */
export interface ClearCacheResult {
  /** Absolute path that was (or would have been) cleared. */
  path: string;
  /** True when the directory existed and was removed; false on a no-op clear. */
  removed: boolean;
}

/**
 * Wipe the entire pdfvision cache root. Removes every result-cache
 * subdirectory, every `--render` PNG, and every remote-download cache.
 * Refuses to follow symlinks at the root path; if the path is a symlink
 * the call throws so the user can investigate manually rather than
 * having pdfvision delete arbitrary files.
 *
 * The optional `path` argument overrides the default cache root. The
 * CLI never passes one (it always operates on the shared root); tests
 * use it to clean an isolated temp directory without racing other
 * vitest workers that are concurrently writing to the shared root.
 */
export function clearAllCache(path: string = getCacheRoot()): ClearCacheResult {
  if (!existsSync(path)) return { path, removed: false };
  // Refuse to traverse a symlink at the cache root — would let an
  // attacker who plants /tmp/pdfvision -> /home/user redirect the
  // cleanup outside the cache hierarchy.
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to clear cache at ${path}: path is a symlink`);
  }
  rmSync(path, { recursive: true, force: true });
  return { path, removed: true };
}
