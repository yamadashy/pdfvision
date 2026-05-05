import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCacheDir, getCached, setCache } from '../../src/core/cache.js';

describe('cache', () => {
  let tmpFile: string;
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'pdfvision-test-'));
    tmpFile = join(workDir, 'sample.txt');
    writeFileSync(tmpFile, 'hello world');
  });

  afterEach(() => {
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
    const cacheRoot = join(tmpdir(), 'pdfvision');
    rmSync(cacheRoot, { recursive: true, force: true });
    const sneaky = mkdtempSync(join(tmpdir(), 'pdfvision-sneaky-'));
    symlinkSync(sneaky, cacheRoot);
    try {
      expect(() => getCacheDir(tmpFile)).toThrow(/symlink/);
    } finally {
      rmSync(cacheRoot, { force: true });
      rmSync(sneaky, { recursive: true, force: true });
    }
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
