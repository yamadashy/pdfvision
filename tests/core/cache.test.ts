import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CACHE_ROOT_MARKER_CONTENT,
  CACHE_ROOT_MARKER_NAME,
  clearAllCache,
  createCacheRootSession,
  ensureCacheRoot,
  ensureCacheSubdirectory,
  getCacheDir,
  getCached,
  getCacheRoot,
  setCache,
} from '../../src/core/io/cache.js';
import {
  clearAllCacheForTesting,
  ensureCacheRootForTesting,
  isFilesystemRootPath,
} from '../../src/core/io/cacheRoot.js';
import { readCachedResult } from '../../src/core/processor/resultCache.js';

describe('cache', () => {
  let tmpFile: string;
  let workDir: string;
  let previousCacheDir: string | undefined;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'pdfvision-test-'));
    tmpFile = join(workDir, 'sample.txt');
    writeFileSync(tmpFile, 'hello world');
    previousCacheDir = process.env.PDFVISION_CACHE_DIR;
    process.env.PDFVISION_CACHE_DIR = join(workDir, 'cache');
  });

  afterEach(() => {
    if (previousCacheDir === undefined) delete process.env.PDFVISION_CACHE_DIR;
    else process.env.PDFVISION_CACHE_DIR = previousCacheDir;
    rmSync(workDir, { recursive: true, force: true });
  });

  it('produces a stable directory for the same content', () => {
    const a = getCacheDir(tmpFile);
    const b = getCacheDir(tmpFile);
    expect(a).toBe(b);
  });

  it('produces different directories for different content', () => {
    const otherFile = join(workDir, 'other.txt');
    writeFileSync(otherFile, 'different content');
    expect(getCacheDir(tmpFile)).not.toBe(getCacheDir(otherFile));
  });

  it('returns null for missing keys', () => {
    const dir = getCacheDir(tmpFile);
    expect(getCached(dir, 'nonexistent')).toBeNull();
  });

  it('round-trips set/get', () => {
    const dir = getCacheDir(tmpFile);
    setCache(dir, 'k', 'value');
    expect(getCached(dir, 'k')).toBe('value');
  });

  it('rejects keys that try to traverse out of the cache dir', () => {
    const dir = getCacheDir(tmpFile);
    expect(() => setCache(dir, '../escape.txt', 'pwn')).toThrow(/Invalid cache key/);
    expect(() => getCached(dir, '../escape.txt')).toThrow(/Invalid cache key/);
    expect(existsSync(join(dir, '..', 'escape.txt'))).toBe(false);
  });

  it('rejects keys with slashes or unusual characters', () => {
    const dir = getCacheDir(tmpFile);
    for (const bad of ['a/b', 'a\\b', 'a b', '']) {
      expect(() => setCache(dir, bad, 'x')).toThrow(/Invalid cache key/);
    }
  });

  it('rejects "." and ".." as keys', () => {
    const dir = getCacheDir(tmpFile);
    for (const bad of ['.', '..']) {
      expect(() => setCache(dir, bad, 'x')).toThrow(/Invalid cache key/);
      expect(() => getCached(dir, bad)).toThrow(/Invalid cache key/);
    }
  });

  it('refuses to write through a symlinked cache file', () => {
    if (process.platform === 'win32') return; // symlink semantics differ
    const dir = getCacheDir(tmpFile);
    const decoyTarget = join(workDir, 'decoy-target');
    writeFileSync(decoyTarget, 'original');
    const sym = join(dir, 'result_attack.json');
    rmSync(sym, { force: true });
    symlinkSync(decoyTarget, sym);
    try {
      expect(() => setCache(dir, 'result_attack.json', 'overwritten')).toThrow(/symlink/);
      expect(() => getCached(dir, 'result_attack.json')).toThrow(/symlink/);
      // ensure the decoy was NOT overwritten
      expect(statSync(decoyTarget).size).toBe('original'.length);
    } finally {
      rmSync(sym, { force: true });
    }
  });

  it('refuses to use the cache root if it has been replaced by a symlink', () => {
    if (process.platform === 'win32') return; // symlink semantics differ
    // Override the cache root to an isolated path so we don't rmSync
    // the shared `/tmp/pdfvision/` while parallel vitest workers are
    // mid-write. PDFVISION_CACHE_DIR is read on every cache call, so
    // setting it before getCacheDir() takes effect immediately.
    const isolatedRoot = join(
      tmpdir(),
      `pdfvision-symlink-test-${process.pid}-${Math.random().toString(36).slice(2, 10)}`,
    );
    rmSync(isolatedRoot, { recursive: true, force: true });
    const sneaky = mkdtempSync(join(tmpdir(), 'pdfvision-sneaky-'));
    symlinkSync(sneaky, isolatedRoot);
    const previousEnv = process.env.PDFVISION_CACHE_DIR;
    process.env.PDFVISION_CACHE_DIR = isolatedRoot;
    try {
      expect(() => getCacheDir(tmpFile)).toThrow(/symlink/);
    } finally {
      if (previousEnv === undefined) {
        delete process.env.PDFVISION_CACHE_DIR;
      } else {
        process.env.PDFVISION_CACHE_DIR = previousEnv;
      }
      rmSync(isolatedRoot, { force: true });
      rmSync(sneaky, { recursive: true, force: true });
    }
  });

  it('rejects an externally-supplied fingerprint that is not a 16-char hex string', () => {
    // `getCacheDir` is internal to `src/core/io/cache.ts` but still gets
    // a precomputed fingerprint from `processor.ts`. Its second arg
    // lands inside `join(cacheRoot, fingerprint)` and then
    // `ensurePrivateDir` will mkdir+chmod 0700 it. Even though the
    // function is no longer re-exported from `src/index.ts`, any
    // caller inside core (or a future plugin) that forwards user
    // input must not be able to escape the cache root via `..` or
    // any other path-traversal payload. Reject anything that isn't
    // the same shape `pdfFingerprint` produces.
    expect(() => getCacheDir(tmpFile, '../escape')).toThrow(/Invalid pdf fingerprint/);
    expect(() => getCacheDir(tmpFile, '/abs/path')).toThrow(/Invalid pdf fingerprint/);
    expect(() => getCacheDir(tmpFile, 'CAPSHEX0123456789')).toThrow(/Invalid pdf fingerprint/);
    expect(() => getCacheDir(tmpFile, 'short')).toThrow(/Invalid pdf fingerprint/);
    // Accepts a well-formed precomputed fingerprint.
    expect(() => getCacheDir(tmpFile, '0123456789abcdef')).not.toThrow();
  });

  it('writes cache files private to the current user', () => {
    if (process.platform === 'win32') return; // POSIX mode bits only
    const dir = getCacheDir(tmpFile);
    setCache(dir, 'private', 'secret');
    const dirMode = statSync(dir).mode & 0o777;
    const fileMode = statSync(join(dir, 'private')).mode & 0o777;
    expect(dirMode).toBe(0o700);
    expect(fileMode).toBe(0o600);
    // sanity: nothing else accidentally permissive
    for (const entry of readdirSync(dir)) {
      const mode = statSync(join(dir, entry)).mode & 0o777;
      expect(mode & 0o077).toBe(0); // no group/other access
    }
  });
});

describe('clearAllCache', () => {
  let sandbox: string;
  let isolatedRoot: string;
  let sampleFile: string;
  let previousCacheDir: string | undefined;

  function withIsolatedActiveDefault<T>(name: string, run: (defaultRoot: string) => T): T {
    const fakeTmpDir = join(sandbox, name);
    mkdirSync(fakeTmpDir, { mode: 0o700 });
    const previous = {
      TMPDIR: process.env.TMPDIR,
      TMP: process.env.TMP,
      TEMP: process.env.TEMP,
      PDFVISION_CACHE_DIR: process.env.PDFVISION_CACHE_DIR,
    };
    process.env.TMPDIR = fakeTmpDir;
    process.env.TMP = fakeTmpDir;
    process.env.TEMP = fakeTmpDir;
    delete process.env.PDFVISION_CACHE_DIR;
    try {
      const activeTmpDir = realpathSync(tmpdir());
      if (activeTmpDir !== realpathSync(fakeTmpDir)) {
        throw new Error(`Unable to isolate the active OS temp directory for this test: ${activeTmpDir}`);
      }
      return run(join(activeTmpDir, 'pdfvision'));
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'pdfvision-clear-test-'));
    isolatedRoot = join(sandbox, 'cache');
    sampleFile = join(sandbox, 'sample.pdf');
    writeFileSync(sampleFile, 'cache identity');
    previousCacheDir = process.env.PDFVISION_CACHE_DIR;
    process.env.PDFVISION_CACHE_DIR = isolatedRoot;
  });

  afterEach(() => {
    if (previousCacheDir === undefined) delete process.env.PDFVISION_CACHE_DIR;
    else process.env.PDFVISION_CACHE_DIR = previousCacheDir;
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('does not create a missing root during a no-op clear', () => {
    const canonicalRoot = getCacheRoot();
    const result = clearAllCache();
    expect(result.path).toBe(canonicalRoot);
    expect(result.removed).toBe(false);
    expect(existsSync(isolatedRoot)).toBe(false);
  });

  it('does not grandfather an explicit override equal to the active historical default', () => {
    withIsolatedActiveDefault('os-tmp', (defaultRoot) => {
      process.env.PDFVISION_CACHE_DIR = defaultRoot;
      mkdirSync(defaultRoot, { mode: 0o700 });
      mkdirSync(join(defaultRoot, 'remote'));
      expect(() => clearAllCache()).toThrow(/ownership marker.*missing/);
      expect(existsSync(join(defaultRoot, 'remote'))).toBe(true);
      expect(existsSync(join(defaultRoot, CACHE_ROOT_MARKER_NAME))).toBe(false);
    });
  });

  it('adopts and clears a recognized legacy shape at the active historical default', () => {
    withIsolatedActiveDefault('legacy-default-tmp', (defaultRoot) => {
      mkdirSync(defaultRoot, { mode: 0o755 });
      mkdirSync(join(defaultRoot, 'remote'));
      expect(clearAllCache().removed).toBe(true);
      expect(existsSync(defaultRoot)).toBe(false);
    });
  });

  it('refuses an unknown entry at the active historical default without mutation', () => {
    withIsolatedActiveDefault('unknown-default-tmp', (defaultRoot) => {
      mkdirSync(defaultRoot, { mode: 0o755 });
      const sentinel = join(defaultRoot, 'notes.txt');
      writeFileSync(sentinel, 'keep');
      const modeBefore = statSync(defaultRoot).mode & 0o777;
      expect(() => clearAllCache()).toThrow(/unknown top-level entry notes\.txt/);
      expect(readFileSync(sentinel, 'utf8')).toBe('keep');
      expect(statSync(defaultRoot).mode & 0o777).toBe(modeBefore);
      expect(existsSync(join(defaultRoot, CACHE_ROOT_MARKER_NAME))).toBe(false);
    });
  });

  it('refuses a writable unmarked active historical default before adoption', () => {
    if (process.platform === 'win32') return;
    withIsolatedActiveDefault('writable-default-tmp', (defaultRoot) => {
      mkdirSync(defaultRoot, { mode: 0o777 });
      chmodSync(defaultRoot, 0o777);
      mkdirSync(join(defaultRoot, 'remote'));
      expect(() => clearAllCache()).toThrow(/group\/other write permissions/);
      expect(existsSync(join(defaultRoot, 'remote'))).toBe(true);
      expect(statSync(defaultRoot).mode & 0o777).toBe(0o777);
      expect(existsSync(join(defaultRoot, CACHE_ROOT_MARKER_NAME))).toBe(false);
    });
  });

  it('removes an initialized marked cache root and reports removed=true', () => {
    const cacheDir = getCacheDir(sampleFile);
    const canonicalRoot = getCacheRoot();
    writeFileSync(join(cacheDir, 'stale'), 'stale');
    const result = clearAllCache();
    expect(result.path).toBe(canonicalRoot);
    expect(result.removed).toBe(true);
    expect(existsSync(isolatedRoot)).toBe(false);
  });

  it('creates a private exact ownership marker during normal cache use', () => {
    getCacheDir(sampleFile);
    const marker = join(isolatedRoot, CACHE_ROOT_MARKER_NAME);
    expect(readFileSync(marker, 'utf8')).toBe(CACHE_ROOT_MARKER_CONTENT);
    if (process.platform !== 'win32') {
      expect(statSync(isolatedRoot).mode & 0o777).toBe(0o700);
      expect(statSync(marker).mode & 0o777).toBe(0o600);
    }
  });

  it('refuses to clear an unmarked custom root without mutating its sentinel', () => {
    mkdirSync(isolatedRoot, { mode: 0o755 });
    const sentinel = join(isolatedRoot, 'sentinel');
    writeFileSync(sentinel, 'keep');
    const modeBefore = statSync(isolatedRoot).mode & 0o777;
    expect(() => clearAllCache()).toThrow(/unverified cache root.*marker.*missing/i);
    expect(readFileSync(sentinel, 'utf8')).toBe('keep');
    expect(statSync(isolatedRoot).mode & 0o777).toBe(modeBefore);
    expect(existsSync(join(isolatedRoot, CACHE_ROOT_MARKER_NAME))).toBe(false);
  });

  it('does not adopt a cache-shaped unmarked custom root during clear', () => {
    mkdirSync(isolatedRoot, { mode: 0o755 });
    mkdirSync(join(isolatedRoot, 'remote'));
    const modeBefore = statSync(isolatedRoot).mode & 0o777;

    expect(() => clearAllCache()).toThrow(/unverified cache root.*marker.*missing/i);
    expect(existsSync(join(isolatedRoot, 'remote'))).toBe(true);
    expect(existsSync(join(isolatedRoot, CACHE_ROOT_MARKER_NAME))).toBe(false);
    expect(statSync(isolatedRoot).mode & 0o777).toBe(modeBefore);
  });

  it('adopts an empty custom root during normal cache use, then permits clearing it', () => {
    mkdirSync(isolatedRoot, { mode: 0o755 });
    getCacheDir(sampleFile);
    expect(existsSync(join(isolatedRoot, CACHE_ROOT_MARKER_NAME))).toBe(true);
    expect(clearAllCache().removed).toBe(true);
  });

  it('refuses a group/other-writable custom root before mutation', () => {
    if (process.platform === 'win32') return;
    mkdirSync(isolatedRoot, { mode: 0o777 });
    chmodSync(isolatedRoot, 0o777);
    mkdirSync(join(isolatedRoot, 'remote'));
    const modeBefore = statSync(isolatedRoot).mode & 0o777;

    expect(() => getCacheDir(sampleFile)).toThrow(/group\/other write permissions/);
    expect(statSync(isolatedRoot).mode & 0o777).toBe(modeBefore);
    expect(existsSync(join(isolatedRoot, 'remote'))).toBe(true);
    expect(existsSync(join(isolatedRoot, CACHE_ROOT_MARKER_NAME))).toBe(false);
  });

  it('rescans a hardened custom root before creating its marker', () => {
    if (process.platform === 'win32') return;
    mkdirSync(isolatedRoot, { mode: 0o755 });
    mkdirSync(join(isolatedRoot, 'remote'));
    const inserted = join(isolatedRoot, 'inserted-after-scan.txt');

    expect(() =>
      ensureCacheRootForTesting({
        afterLegacyScan: () => writeFileSync(inserted, 'keep'),
      }),
    ).toThrow(/unknown top-level entry inserted-after-scan\.txt/);
    expect(readFileSync(inserted, 'utf8')).toBe('keep');
    expect(statSync(isolatedRoot).mode & 0o777).toBe(0o700);
    expect(existsSync(join(isolatedRoot, CACHE_ROOT_MARKER_NAME))).toBe(false);
    expect(() => clearAllCache()).toThrow(/ownership marker.*missing/);
  });

  it('rescans a hardened historical default before adopting it during clear', () => {
    if (process.platform === 'win32') return;
    withIsolatedActiveDefault('raced-default-tmp', (defaultRoot) => {
      mkdirSync(defaultRoot, { mode: 0o755 });
      mkdirSync(join(defaultRoot, 'remote'));
      const inserted = join(defaultRoot, 'inserted-after-scan.txt');
      expect(() =>
        clearAllCacheForTesting({
          afterLegacyScan: () => writeFileSync(inserted, 'keep'),
        }),
      ).toThrow(/unknown top-level entry inserted-after-scan\.txt/);
      expect(readFileSync(inserted, 'utf8')).toBe('keep');
      expect(statSync(defaultRoot).mode & 0o777).toBe(0o700);
      expect(existsSync(join(defaultRoot, CACHE_ROOT_MARKER_NAME))).toBe(false);
    });
  });

  it('refuses normal use under a non-sticky writable parent without mutating the root', () => {
    if (process.platform === 'win32') return;
    const unsafeParent = join(sandbox, 'unsafe-parent');
    mkdirSync(unsafeParent, { mode: 0o777 });
    chmodSync(unsafeParent, 0o777);
    process.env.PDFVISION_CACHE_DIR = join(unsafeParent, 'cache');
    mkdirSync(process.env.PDFVISION_CACHE_DIR, { mode: 0o755 });
    mkdirSync(join(process.env.PDFVISION_CACHE_DIR, 'remote'));
    const modeBefore = statSync(process.env.PDFVISION_CACHE_DIR).mode & 0o777;

    try {
      expect(() => getCacheDir(sampleFile)).toThrow(/ancestor.*writable without the sticky bit/);
      expect(statSync(process.env.PDFVISION_CACHE_DIR).mode & 0o777).toBe(modeBefore);
      expect(existsSync(join(process.env.PDFVISION_CACHE_DIR, 'remote'))).toBe(true);
      expect(existsSync(join(process.env.PDFVISION_CACHE_DIR, CACHE_ROOT_MARKER_NAME))).toBe(false);
    } finally {
      chmodSync(unsafeParent, 0o700);
    }
  });

  it('reports when a POSIX ancestor cannot be opened for identity validation', () => {
    if (process.platform === 'win32' || typeof process.getuid !== 'function' || process.getuid() === 0) return;
    const unreadableParent = join(sandbox, 'unreadable-parent');
    mkdirSync(unreadableParent, { mode: 0o700 });
    process.env.PDFVISION_CACHE_DIR = join(unreadableParent, 'cache');
    mkdirSync(process.env.PDFVISION_CACHE_DIR, { mode: 0o755 });
    mkdirSync(join(process.env.PDFVISION_CACHE_DIR, 'remote'));
    chmodSync(unreadableParent, 0o111);

    try {
      expect(() => getCacheDir(sampleFile)).toThrow(/ancestor.*cannot be opened for identity validation/);
      expect(existsSync(join(process.env.PDFVISION_CACHE_DIR, CACHE_ROOT_MARKER_NAME))).toBe(false);
    } finally {
      chmodSync(unreadableParent, 0o700);
    }
  });

  it('adopts only recognized legacy top-level entries during normal cache use', () => {
    mkdirSync(isolatedRoot, { mode: 0o755 });
    mkdirSync(join(isolatedRoot, '0123456789abcdef'));
    mkdirSync(join(isolatedRoot, 'remote'));
    mkdirSync(join(isolatedRoot, 'ocr-data'));
    writeFileSync(join(isolatedRoot, 'tesseract-quiet-worker.cjs'), 'worker');
    writeFileSync(join(isolatedRoot, 'pdfvision-ocr-session-worker.cjs'), 'worker');

    expect(() => getCacheDir(sampleFile)).not.toThrow();
    expect(readFileSync(join(isolatedRoot, CACHE_ROOT_MARKER_NAME), 'utf8')).toBe(CACHE_ROOT_MARKER_CONTENT);
  });

  it('rejects an unknown custom legacy entry without changing bytes or mode', () => {
    mkdirSync(isolatedRoot, { mode: 0o755 });
    const sentinel = join(isolatedRoot, 'notes.txt');
    writeFileSync(sentinel, 'not cache data');
    const modeBefore = statSync(isolatedRoot).mode & 0o777;

    expect(() => getCacheDir(sampleFile)).toThrow(/unknown top-level entry notes\.txt/);
    expect(readFileSync(sentinel, 'utf8')).toBe('not cache data');
    expect(statSync(isolatedRoot).mode & 0o777).toBe(modeBefore);
    expect(existsSync(join(isolatedRoot, CACHE_ROOT_MARKER_NAME))).toBe(false);
  });

  it('rejects a symlink in an otherwise recognized custom legacy root without mutation', () => {
    if (process.platform === 'win32') return;
    mkdirSync(isolatedRoot, { mode: 0o755 });
    const target = join(sandbox, 'target');
    mkdirSync(target);
    symlinkSync(target, join(isolatedRoot, 'remote'));
    const modeBefore = statSync(isolatedRoot).mode & 0o777;

    expect(() => getCacheDir(sampleFile)).toThrow(/symlink/);
    expect(statSync(isolatedRoot).mode & 0o777).toBe(modeBefore);
    expect(existsSync(join(isolatedRoot, CACHE_ROOT_MARKER_NAME))).toBe(false);
  });

  it('rejects a hard-linked legacy worker without mutating its external inode', () => {
    mkdirSync(isolatedRoot, { mode: 0o755 });
    const target = join(sandbox, 'worker-hardlink-target');
    writeFileSync(target, 'keep');
    linkSync(target, join(isolatedRoot, 'tesseract-quiet-worker.cjs'));
    const modeBefore = statSync(isolatedRoot).mode & 0o777;

    expect(() => getCacheDir(sampleFile)).toThrow(/single-link legacy worker/);
    expect(readFileSync(target, 'utf8')).toBe('keep');
    expect(statSync(isolatedRoot).mode & 0o777).toBe(modeBefore);
    expect(existsSync(join(isolatedRoot, CACHE_ROOT_MARKER_NAME))).toBe(false);
  });

  it('refuses a symlink or junction at the configured cache root', () => {
    if (process.platform === 'win32') return; // symlink semantics differ
    const target = join(sandbox, 'target');
    mkdirSync(target);
    writeFileSync(join(target, 'should-not-be-deleted'), 'keep');
    symlinkSync(target, isolatedRoot);
    expect(() => clearAllCache()).toThrow(/symlink|junction/);
    expect(readFileSync(join(target, 'should-not-be-deleted'), 'utf8')).toBe('keep');
  });

  it('canonicalizes a symlinked ancestor but operates on the dedicated real descendant', () => {
    if (process.platform === 'win32') return;
    const realParent = join(sandbox, 'real-parent');
    const aliasParent = join(sandbox, 'alias-parent');
    mkdirSync(realParent);
    symlinkSync(realParent, aliasParent);
    process.env.PDFVISION_CACHE_DIR = join(aliasParent, 'dedicated-cache');

    const cacheDir = getCacheDir(sampleFile);
    const canonicalParent = realpathSync(realParent);
    expect(cacheDir.startsWith(join(canonicalParent, 'dedicated-cache'))).toBe(true);
    expect(getCacheRoot()).toBe(join(canonicalParent, 'dedicated-cache'));
  });

  it('fails closed on a dangling symlink ancestor without creating its target', () => {
    if (process.platform === 'win32') return;
    const missingTarget = join(sandbox, 'missing-target');
    const aliasParent = join(sandbox, 'dangling-parent');
    symlinkSync(missingTarget, aliasParent);
    process.env.PDFVISION_CACHE_DIR = join(aliasParent, 'dedicated-cache');

    expect(() => ensureCacheRoot()).toThrow();
    expect(existsSync(missingTarget)).toBe(false);
    expect(existsSync(join(missingTarget, 'dedicated-cache'))).toBe(false);
  });

  it('rejects blank and relative environment roots without creating paths', () => {
    for (const invalid of ['', '   ', 'relative-cache', '~/cache']) {
      process.env.PDFVISION_CACHE_DIR = invalid;
      expect(() => getCacheRoot()).toThrow(/nonblank absolute|expected an absolute/);
    }
  });

  it('rejects filesystem, drive, extended-drive, and UNC roots', () => {
    for (const root of ['/', 'C:\\', '\\\\server\\share\\', '\\\\?\\C:\\', '\\\\?\\UNC\\server\\share\\']) {
      expect(isFilesystemRootPath(root)).toBe(true);
    }
  });

  it('rejects exact broad roots while allowing a dedicated descendant', () => {
    for (const broad of [homedir(), process.cwd(), tmpdir(), '/tmp', '/var/tmp']) {
      process.env.PDFVISION_CACHE_DIR = broad;
      expect(() => getCacheRoot()).toThrow(/not dedicated|not allowed|symlink|junction/);
    }
    process.env.PDFVISION_CACHE_DIR = join(tmpdir(), `pdfvision-dedicated-${process.pid}`, 'cache');
    expect(() => getCacheRoot()).not.toThrow();
  });

  it('rejects a regular file as the root', () => {
    writeFileSync(isolatedRoot, 'not a directory');
    expect(() => ensureCacheRoot()).toThrow(/not a directory/);
  });

  it('refuses invalid marker contents, types, symlinks, and hard links', () => {
    const cases: Array<(marker: string) => void> = [
      (marker) => writeFileSync(marker, 'wrong\n'),
      (marker) => mkdirSync(marker),
      (marker) => {
        const target = join(sandbox, 'marker-target');
        writeFileSync(target, CACHE_ROOT_MARKER_CONTENT, { mode: 0o600 });
        symlinkSync(target, marker);
      },
      (marker) => {
        const target = join(sandbox, 'marker-hardlink-target');
        writeFileSync(target, CACHE_ROOT_MARKER_CONTENT, { mode: 0o600 });
        linkSync(target, marker);
      },
    ];

    for (const [index, createInvalidMarker] of cases.entries()) {
      rmSync(isolatedRoot, { recursive: true, force: true });
      mkdirSync(isolatedRoot, { mode: 0o700 });
      const sentinel = join(isolatedRoot, `sentinel-${index}`);
      writeFileSync(sentinel, 'keep');
      const marker = join(isolatedRoot, CACHE_ROOT_MARKER_NAME);
      if (process.platform === 'win32' && index >= 2) continue;
      createInvalidMarker(marker);

      expect(() => clearAllCache()).toThrow(/marker|symlink|links/i);
      expect(readFileSync(sentinel, 'utf8')).toBe('keep');
    }
  });

  it('refuses marked roots with non-private POSIX root or marker modes', () => {
    if (process.platform === 'win32') return;
    getCacheDir(sampleFile);
    const marker = join(isolatedRoot, CACHE_ROOT_MARKER_NAME);
    const sentinel = join(isolatedRoot, 'sentinel');
    writeFileSync(sentinel, 'keep');

    chmodSync(marker, 0o644);
    expect(() => clearAllCache()).toThrow(/marker.*0600/i);
    expect(readFileSync(sentinel, 'utf8')).toBe('keep');

    chmodSync(marker, 0o600);
    chmodSync(isolatedRoot, 0o755);
    expect(() => clearAllCache()).toThrow(/mode 0700/i);
    expect(readFileSync(sentinel, 'utf8')).toBe('keep');
  });

  it('unlinks nested symlinks without touching their external target', () => {
    if (process.platform === 'win32') return;
    getCacheDir(sampleFile);
    const external = join(sandbox, 'external');
    mkdirSync(external);
    const sentinel = join(external, 'sentinel');
    writeFileSync(sentinel, 'keep');
    symlinkSync(external, join(isolatedRoot, 'nested-link'));

    expect(clearAllCache().removed).toBe(true);
    expect(readFileSync(sentinel, 'utf8')).toBe('keep');
  });

  it('refuses to clear through a non-sticky group/other-writable parent', () => {
    if (process.platform === 'win32') return;
    const unsafeParent = join(sandbox, 'unsafe-clear-parent');
    mkdirSync(unsafeParent, { mode: 0o700 });
    process.env.PDFVISION_CACHE_DIR = join(unsafeParent, 'cache');
    const cacheDir = getCacheDir(sampleFile);
    const sentinel = join(cacheDir, 'sentinel');
    writeFileSync(sentinel, 'keep');
    chmodSync(unsafeParent, 0o777);

    try {
      expect(() => clearAllCache()).toThrow(/ancestor.*writable without the sticky bit/);
      expect(readFileSync(sentinel, 'utf8')).toBe('keep');
      expect(existsSync(join(process.env.PDFVISION_CACHE_DIR, CACHE_ROOT_MARKER_NAME))).toBe(true);
    } finally {
      chmodSync(unsafeParent, 0o700);
    }
  });

  it('rechecks quarantine identity and parent trust immediately before recursive removal', () => {
    if (process.platform === 'win32') return;
    getCacheDir(sampleFile);
    let quarantine = '';
    let movedOriginal = '';

    try {
      expect(() =>
        clearAllCacheForTesting({
          beforeRemove: (path) => {
            quarantine = path;
            movedOriginal = `${path}.original`;
            chmodSync(sandbox, 0o777);
            renameSync(path, movedOriginal);
            mkdirSync(path, { mode: 0o700 });
            writeFileSync(join(path, CACHE_ROOT_MARKER_NAME), CACHE_ROOT_MARKER_CONTENT, { mode: 0o600 });
          },
        }),
      ).toThrow(/identity changed|writable without the sticky bit/);
      expect(existsSync(quarantine)).toBe(true);
      expect(existsSync(movedOriginal)).toBe(true);
    } finally {
      chmodSync(sandbox, 0o700);
    }
  });

  it('refuses a different-device descendant before recursive quarantine removal', () => {
    if (process.platform === 'win32') return;
    const cacheDir = getCacheDir(sampleFile);
    const simulatedMount = join(cacheDir, 'mounted-device');
    mkdirSync(simulatedMount);
    writeFileSync(join(simulatedMount, 'sentinel'), 'keep');
    const canonicalRoot = getCacheRoot();
    let quarantine = '';

    expect(() =>
      clearAllCacheForTesting({
        afterRename: (path) => {
          quarantine = path;
        },
        entryDevice: (path, stat) => (path.endsWith('mounted-device') ? stat.dev + 1 : stat.dev),
      }),
    ).toThrow(/different filesystem device/);
    expect(existsSync(quarantine)).toBe(true);
    const quarantinedMount = join(quarantine, simulatedMount.slice(canonicalRoot.length + 1));
    expect(readFileSync(join(quarantinedMount, 'sentinel'), 'utf8')).toBe('keep');
  });

  it('does not claim a quarantine remains when a pre-remove seam removes it', () => {
    getCacheDir(sampleFile);
    let quarantine = '';
    let thrown: Error | undefined;
    try {
      clearAllCacheForTesting({
        beforeRemove: (path) => {
          quarantine = path;
          rmSync(path, { recursive: true, force: false });
        },
      });
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown?.message).toContain(`No entry remains at ${quarantine}`);
    expect(thrown?.message).not.toContain('was left');
    expect(existsSync(quarantine)).toBe(false);
  });

  it('deletes only the quarantined identity when another root is recreated', () => {
    getCacheDir(sampleFile);
    const canonicalRoot = getCacheRoot();
    const result = clearAllCacheForTesting({
      afterRename: (_quarantine, original) => {
        expect(original).toBe(canonicalRoot);
        getCacheDir(sampleFile);
      },
    });

    expect(result.removed).toBe(true);
    expect(existsSync(isolatedRoot)).toBe(true);
    expect(existsSync(join(isolatedRoot, CACHE_ROOT_MARKER_NAME))).toBe(true);
  });

  it('recreates the marker before a cache child after a concurrent clear', () => {
    const rootSession = createCacheRootSession();
    rootSession.ensure();
    expect(clearAllCache().removed).toBe(true);

    const child = ensureCacheSubdirectory(rootSession, '0123456789abcdef');

    expect(child).toBe(join(getCacheRoot(), '0123456789abcdef'));
    expect(existsSync(child)).toBe(true);
    expect(readFileSync(join(isolatedRoot, CACHE_ROOT_MARKER_NAME), 'utf8')).toBe(CACHE_ROOT_MARKER_CONTENT);
  });

  it('leaves and reports the exact quarantine path when identity changes after rename', () => {
    getCacheDir(sampleFile);
    let replacementPath = '';
    let originalMovedAside = '';
    let thrown: Error | undefined;
    try {
      clearAllCacheForTesting({
        afterRename: (quarantine) => {
          replacementPath = quarantine;
          originalMovedAside = `${quarantine}.original`;
          renameSync(quarantine, originalMovedAside);
          mkdirSync(quarantine, { mode: 0o700 });
          writeFileSync(join(quarantine, CACHE_ROOT_MARKER_NAME), CACHE_ROOT_MARKER_CONTENT, { mode: 0o600 });
        },
      });
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown?.message).toContain(replacementPath);
    expect(thrown?.message).toContain('entry remains');
    expect(existsSync(replacementPath)).toBe(true);
    expect(existsSync(originalMovedAside)).toBe(true);
  });
});

describe('readCachedResult warnings', () => {
  const base = {
    file: '/tmp/x.pdf',
    totalPages: 1,
    metadata: { title: null, author: null, subject: null, creator: null },
    pages: [],
  };

  function cacheWith(payload: unknown): { dir: string; key: string } {
    const dir = mkdtempSync(join(tmpdir(), 'pdfvision-cached-warnings-'));
    const key = 'k';
    setCache(dir, key, JSON.stringify(payload));
    return { dir, key };
  }

  const read = (dir: string, key: string) =>
    readCachedResult({
      cacheDir: dir,
      cacheKey: key,
      filePath: '/tmp/x.pdf',
      render: false,
      renderVisualRegions: false,
    });

  it('returns the recorded warnings', () => {
    const { dir, key } = cacheWith({ result: base, warnings: ['a', 'b'] });
    try {
      expect(read(dir, key)?.warnings).toEqual(['a', 'b']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats a non-array warnings value as a corrupt entry', () => {
    // A string is iterable, so replaying it would emit one warning per
    // character instead of failing loudly.
    const { dir, key } = cacheWith({ result: base, warnings: 'oops' });
    try {
      expect(read(dir, key)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats a non-string warning entry as a corrupt entry', () => {
    const { dir, key } = cacheWith({ result: base, warnings: ['fine', 42] });
    try {
      expect(read(dir, key)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts an entry written before warnings were stored', () => {
    const { dir, key } = cacheWith({ result: base });
    try {
      expect(read(dir, key)?.warnings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
