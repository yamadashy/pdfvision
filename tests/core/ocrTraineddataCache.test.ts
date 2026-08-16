import {
  linkSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildQuietTesseractWorkerScript, createOcrSession } from '../../src/core/ocr/index.js';

/**
 * Traineddata is downloaded once per language (~10-16MB) and then read
 * back from `<cache-root>/ocr-data/`. These tests pin the two things
 * that make that true: the `cacheMethod` tesseract.js honors for
 * write-back, and a cache write that cannot leave a truncated file
 * behind when the worker thread exits mid-write (issue #194).
 */

const createWorker = vi.fn();

vi.mock('tesseract.js', () => ({ createWorker: (...args: unknown[]) => createWorker(...args) }));

let sandbox: string;
let previousCacheRoot: string | undefined;

beforeEach(() => {
  createWorker.mockReset();
  sandbox = mkdtempSync(join(tmpdir(), 'pdfvision-ocr-cache-'));
  previousCacheRoot = process.env.PDFVISION_CACHE_DIR;
  process.env.PDFVISION_CACHE_DIR = join(sandbox, 'cache');
});

afterEach(() => {
  if (previousCacheRoot === undefined) delete process.env.PDFVISION_CACHE_DIR;
  else process.env.PDFVISION_CACHE_DIR = previousCacheRoot;
  rmSync(sandbox, { recursive: true, force: true });
});

describe('createOcrSession traineddata cache options', () => {
  async function bootedWorkerOptions(): Promise<{ cachePath?: string; cacheMethod?: string }> {
    createWorker.mockImplementation(async () => ({ recognize: () => Promise.resolve({}), terminate: async () => {} }));
    await createOcrSession('eng');
    return createWorker.mock.calls[0][2] as { cachePath?: string; cacheMethod?: string };
  }

  it('asks for a cacheMethod tesseract.js writes traineddata back for', async () => {
    // node_modules/tesseract.js/src/worker-script/index.js gates the
    // write on `['write', 'refresh', undefined].includes(cacheMethod)`.
    // Anything outside that set — 'readWrite' was the bug — downloads the
    // language on every session and never populates `ocr-data/`.
    expect(['write', 'refresh', undefined]).toContain((await bootedWorkerOptions()).cacheMethod);
  });

  it('asks for a cacheMethod that still reads the cache back', async () => {
    // The same worker script skips the read for 'refresh' / 'none', so
    // the write-back set alone is not enough: 'refresh' would re-download
    // every session too, just with a fresh file to show for it.
    expect(['refresh', 'none']).not.toContain((await bootedWorkerOptions()).cacheMethod);
  });

  it('points the cache at ocr-data under the validated cache root', async () => {
    expect((await bootedWorkerOptions()).cachePath).toBe(join(realpathSync.native(sandbox), 'cache', 'ocr-data'));
  });
});

describe('quiet worker traineddata writes', () => {
  /**
   * Drive the injected `fs.writeFile` patch the way tesseract's node
   * cache adapter does: `util.promisify(fs.writeFile)` captured when the
   * worker script is required, then called with the cache path.
   */
  async function writeThroughQuietWorker(target: string, payload: string): Promise<void> {
    const fakeTesseract = join(sandbox, 'fake-tesseract-worker.cjs');
    writeFileSync(
      fakeTesseract,
      `"use strict";
const util = require("util");
const fs = require("fs");
const { parentPort } = require("worker_threads");
const writeCache = util.promisify(fs.writeFile);
parentPort.on("message", async ({ target, payload }) => {
  try {
    await writeCache(target, Buffer.from(payload, "utf8"));
    parentPort.postMessage({ ok: true });
  } catch (error) {
    parentPort.postMessage({ ok: false, error: String(error) });
  }
});`,
    );
    const quietWorker = join(sandbox, 'quiet-worker.cjs');
    writeFileSync(quietWorker, buildQuietTesseractWorkerScript(fakeTesseract));

    const { Worker } = await import('node:worker_threads');
    const worker = new Worker(quietWorker);
    try {
      const outcome = await new Promise<{ ok: boolean; error?: string }>((resolve, reject) => {
        worker.on('message', resolve);
        worker.on('error', reject);
        worker.postMessage({ target, payload });
      });
      if (!outcome.ok) throw new Error(outcome.error);
    } finally {
      worker.removeAllListeners();
      await worker.terminate();
    }
  }

  it('replaces a traineddata file by rename instead of truncating it in place', async () => {
    // A hard link stands in for the observation we cannot make directly:
    // an in-place write would mutate this inode, and the window in which
    // it holds a short file is the window the boot-failure exit lands in.
    const target = join(sandbox, 'eng.traineddata');
    const witness = join(sandbox, 'previous-inode');
    writeFileSync(witness, 'previous traineddata');
    linkSync(witness, target);

    await writeThroughQuietWorker(target, 'fresh traineddata');

    expect(readFileSync(target, 'utf8')).toBe('fresh traineddata');
    expect(readFileSync(witness, 'utf8')).toBe('previous traineddata');
    expect(lstatSync(target).nlink).toBe(1);
    // The temp sibling is renamed, not left for the next `clear-cache`.
    expect(readdirSync(sandbox).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('leaves writes that are not traineddata on stock fs semantics', async () => {
    // The patch is scoped by filename; everything else in the worker
    // thread — including tesseract's own non-cache file writes — must
    // keep behaving as it did.
    const target = join(sandbox, 'not-language-data.txt');
    const witness = join(sandbox, 'shared-inode');
    writeFileSync(witness, 'original');
    linkSync(witness, target);

    await writeThroughQuietWorker(target, 'rewritten');

    expect(readFileSync(witness, 'utf8')).toBe('rewritten');
    expect(lstatSync(target).nlink).toBe(2);
  });
});
