import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { downloadRemote, downloadRemoteData } from '../../src/core/remote.js';

/**
 * One process-wide HTTP server with per-test routing. Tests register a
 * route handler with `setHandler`; the server responds via that handler
 * and we close the server in `afterAll`. Avoids spinning up a fresh
 * server per test (slower and racier on CI).
 */
let server: Server;
let port: number;
type Handler = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void;
let handler: Handler = (_req, res) => {
  res.statusCode = 500;
  res.end('no handler installed');
};
function setHandler(h: Handler): void {
  handler = h;
}

beforeAll(async () => {
  server = createServer((req, res) => handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

// Each test cleans the remote cache root so no two tests see the
// previous test's payload by accident.
afterEach(() => {
  rmSync(join(tmpdir(), 'pdfvision', 'remote'), { recursive: true, force: true });
});

const TINY_PDF = Buffer.from('%PDF-1.4\n%fake-but-non-empty\n', 'utf-8');

describe('downloadRemote', () => {
  it('downloads a URL and returns the local cached path', async () => {
    setHandler((_req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/pdf');
      res.end(TINY_PDF);
    });

    const path = await downloadRemote(`http://127.0.0.1:${port}/doc.pdf`);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path)).toEqual(TINY_PDF);
  });

  it('downloads bytes without creating a remote cache entry', async () => {
    setHandler((_req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/pdf');
      res.end(TINY_PDF);
    });

    const prevCacheDir = process.env.PDFVISION_CACHE_DIR;
    const cacheRoot = mkdtempSync(join(tmpdir(), 'pdfvision-remote-data-'));
    process.env.PDFVISION_CACHE_DIR = cacheRoot;
    try {
      const data = await downloadRemoteData(`http://127.0.0.1:${port}/doc.pdf`);
      expect(Buffer.from(data)).toEqual(TINY_PDF);
      expect(existsSync(join(cacheRoot, 'remote'))).toBe(false);
    } finally {
      if (prevCacheDir === undefined) {
        delete process.env.PDFVISION_CACHE_DIR;
      } else {
        process.env.PDFVISION_CACHE_DIR = prevCacheDir;
      }
      rmSync(cacheRoot, { recursive: true, force: true });
    }
  });

  it('hits the cache on the second call (no network) for the same URL', async () => {
    let hits = 0;
    setHandler((_req, res) => {
      hits++;
      res.statusCode = 200;
      res.end(TINY_PDF);
    });

    const url = `http://127.0.0.1:${port}/cached.pdf`;
    const first = await downloadRemote(url);
    const second = await downloadRemote(url);
    expect(second).toBe(first);
    expect(hits).toBe(1);
  });

  it('re-downloads instead of returning a cached non-PDF body', async () => {
    let hits = 0;
    setHandler((_req, res) => {
      hits++;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/pdf');
      res.end(TINY_PDF);
    });

    const url = `http://127.0.0.1:${port}/stale-html-cache.pdf`;
    const path = await downloadRemote(url);
    writeFileSync(path, '<!doctype html><title>stale cache</title>');

    const second = await downloadRemote(url);
    expect(second).toBe(path);
    expect(readFileSync(path)).toEqual(TINY_PDF);
    expect(hits).toBe(2);
  });

  it('re-downloads when noCache is true even if the cache is populated', async () => {
    let hits = 0;
    setHandler((_req, res) => {
      hits++;
      res.statusCode = 200;
      res.end(TINY_PDF);
    });

    const url = `http://127.0.0.1:${port}/forceful.pdf`;
    await downloadRemote(url);
    await downloadRemote(url, { noCache: true });
    expect(hits).toBe(2);
  });

  it('keys cache entries on the URL string so two different URLs land in different slots', async () => {
    setHandler((req, res) => {
      res.statusCode = 200;
      res.end(Buffer.from(`%PDF-1.4\n${req.url}\n`, 'utf-8'));
    });

    const a = await downloadRemote(`http://127.0.0.1:${port}/a.pdf`);
    const b = await downloadRemote(`http://127.0.0.1:${port}/b.pdf`);
    expect(a).not.toBe(b);
    expect(readFileSync(a, 'utf-8')).toContain('/a.pdf');
    expect(readFileSync(b, 'utf-8')).toContain('/b.pdf');
  });

  it('rejects non-http(s) schemes before hitting the network', async () => {
    await expect(downloadRemote('file:///etc/passwd')).rejects.toThrow(/Refusing to download non-http/);
    await expect(downloadRemote('ftp://example.com/file.pdf')).rejects.toThrow(/Refusing to download non-http/);
    await expect(downloadRemote('data:application/pdf;base64,JVBERi0=')).rejects.toThrow(/non-http/);
  });

  it('rejects an unparseable URL string', async () => {
    await expect(downloadRemote('not a url at all')).rejects.toThrow(/Invalid URL/);
  });

  it('surfaces non-2xx HTTP responses as a clean error', async () => {
    setHandler((_req, res) => {
      res.statusCode = 404;
      res.statusMessage = 'Not Found';
      res.end('nope');
    });
    await expect(downloadRemote(`http://127.0.0.1:${port}/missing.pdf`)).rejects.toThrow(/HTTP 404/);
  });

  it('rejects a successful response that is not actually a PDF', async () => {
    setHandler((_req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<!doctype html><title>not a pdf</title>');
    });

    await expect(downloadRemote(`http://127.0.0.1:${port}/looks-like.pdf`)).rejects.toThrow(
      /Remote URL did not return a PDF .*text\/html/,
    );
  });

  it('refuses to download when Content-Length declares more than the size limit', async () => {
    // Set a tiny limit and a large declared length so the check fires
    // before any byte is read.
    setHandler((_req, res) => {
      res.setHeader('Content-Length', '999999');
      res.statusCode = 200;
      res.end(TINY_PDF);
    });
    await expect(downloadRemote(`http://127.0.0.1:${port}/big.pdf`, { maxBytes: 1024 })).rejects.toThrow(
      /declares 999999 bytes/,
    );
  });

  it('refuses to download when the body grows past the limit during streaming', async () => {
    // Server omits Content-Length but streams more bytes than the cap;
    // the cap must still fire from the streaming path.
    setHandler((_req, res) => {
      res.statusCode = 200;
      res.write(Buffer.alloc(2048, 0xab));
      res.write(Buffer.alloc(2048, 0xab));
      res.end();
    });
    await expect(downloadRemote(`http://127.0.0.1:${port}/streamed.pdf`, { maxBytes: 1024 })).rejects.toThrow(
      /exceeds 1024 bytes/,
    );
  });

  it('honours the timeout when the server hangs', async () => {
    setHandler((_req, _res) => {
      // Never respond — the test expects a timeout error.
    });
    await expect(downloadRemote(`http://127.0.0.1:${port}/hang.pdf`, { timeoutMs: 100 })).rejects.toThrow(/Timed out/);
  });

  it('falls back to a generic basename when the URL has no path segment', async () => {
    setHandler((_req, res) => {
      res.statusCode = 200;
      res.end(TINY_PDF);
    });
    const path = await downloadRemote(`http://127.0.0.1:${port}/`);
    expect(path).toMatch(/document\.pdf$/);
  });

  it('appends .pdf to the cached filename when the URL path lacks an extension', async () => {
    setHandler((_req, res) => {
      res.statusCode = 200;
      res.end(TINY_PDF);
    });
    const path = await downloadRemote(`http://127.0.0.1:${port}/no-extension`);
    expect(path).toMatch(/no-extension\.pdf$/);
  });

  it('sanitises path-traversal-style basenames', async () => {
    setHandler((_req, res) => {
      res.statusCode = 200;
      res.end(TINY_PDF);
    });
    const path = await downloadRemote(`http://127.0.0.1:${port}/%2E%2E%2F..%2F..%2Fetc%2Fpasswd`);
    // The generated path must stay inside the per-URL cache dir; check
    // that '..' / '/' didn't leak into the cached basename.
    expect(path).not.toMatch(/\.\.[/\\]/);
    expect(existsSync(path)).toBe(true);
  });
});
