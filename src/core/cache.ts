import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  constants as fsConstants,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  type Stats,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CACHE_DIR = join(tmpdir(), 'pdfvision');

// Cache files may contain extracted PDF text and rendered page images.
// Restrict to the current user so other accounts on the same machine
// (especially relevant on shared Linux hosts with /tmp/pdfvision/...) cannot
// read them.
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

// Reject any cache key that isn't a single safe path segment.
// Cache callers always supply a hash-derived key, so the safe set is narrow.
const SAFE_KEY = /^[A-Za-z0-9._-]+$/;

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

export function getCacheDir(filePath: string): string {
  const key = hashFileContent(filePath);
  ensurePrivateDir(CACHE_DIR);
  const dir = join(CACHE_DIR, key);
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
export function atomicWrite(finalPath: string, data: Buffer): void {
  const tmpPath = `${finalPath}.${process.pid}.${Math.random().toString(36).slice(2, 10)}.tmp`;
  const flags =
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (isPosix ? fsConstants.O_NOFOLLOW : 0);

  let fd: number;
  try {
    fd = openSync(tmpPath, flags, FILE_MODE);
  } catch (error) {
    if (isPosix && error instanceof Error && (error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new Error(`Refusing to write at ${tmpPath}: path is a symlink`);
    }
    throw error;
  }

  try {
    // writeSync may return short on partial writes (large buffers, signals).
    // Loop until the full buffer has been flushed before renaming.
    let offset = 0;
    while (offset < data.length) {
      offset += writeSync(fd, data, offset, data.length - offset);
    }
    if (isPosix) chmodSync(tmpPath, FILE_MODE);
  } catch (error) {
    closeSync(fd);
    rmSync(tmpPath, { force: true });
    throw error;
  }
  closeSync(fd);

  try {
    renameSync(tmpPath, finalPath);
  } catch (error) {
    rmSync(tmpPath, { force: true });
    throw error;
  }
}

export function dropCached(cacheDir: string, key: string): void {
  assertSafeKey(key);
  rmSync(join(cacheDir, key), { force: true });
}

// Exposed for renderer + processor so they apply the same hardened
// directory creation policy as the cache helpers.
export { ensurePrivateDir };
