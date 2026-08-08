import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertRoutableUrl, resolveSource, SourceError } from '../../src/mcp/source.js';

const SAMPLE = join(import.meta.dirname, '..', 'fixtures', 'sample.pdf');

afterEach(() => {
  process.env.PDFVISION_MCP_ALLOW_PRIVATE_NETWORK = undefined;
  delete process.env.PDFVISION_MCP_ALLOW_PRIVATE_NETWORK;
});

describe('resolveSource', () => {
  it('resolves a local path to an absolute path', async () => {
    const resolved = await resolveSource(SAMPLE);
    expect(resolved.isRemote).toBe(false);
    expect(resolved.filePath).toBe(SAMPLE);
    expect(resolved.sourceData).toBeUndefined();
  });

  it('rejects an empty source', async () => {
    await expect(resolveSource('   ')).rejects.toThrow(SourceError);
  });

  it('reports a missing file by path', async () => {
    await expect(resolveSource('/nope/missing.pdf')).rejects.toThrow(/File not found/);
  });

  it('rejects a directory', async () => {
    await expect(resolveSource(join(import.meta.dirname, '..', 'fixtures'))).rejects.toThrow(/Not a file/);
  });

  // chmod does not deny reads on Windows, and root ignores the bits.
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'reports a permission failure as such, not as a missing file',
    async () => {
      // "File not found" sends the caller looking for a typo in a path
      // that is correct. The owner can still `stat` their own mode-000
      // file, so the barrier has to be the directory.
      const dir = mkdtempSync(join(tmpdir(), 'pdfvision-denied-'));
      const denied = join(dir, 'a.pdf');
      writeFileSync(denied, 'x');
      chmodSync(dir, 0o000);
      try {
        await expect(resolveSource(denied)).rejects.toThrow(/Cannot read .*EACCES/);
      } finally {
        chmodSync(dir, 0o700);
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});

describe('assertRoutableUrl', () => {
  it('rejects a non-http scheme', async () => {
    await expect(assertRoutableUrl('ftp://example.com/a.pdf')).rejects.toThrow(/Only http\(s\) URLs/);
  });

  it('rejects a malformed URL', async () => {
    await expect(assertRoutableUrl('https://')).rejects.toThrow(/Not a valid URL/);
  });

  it.each([
    ['loopback', 'http://127.0.0.1/a.pdf'],
    ['private class A', 'http://10.1.2.3/a.pdf'],
    ['private class B', 'http://172.16.0.1/a.pdf'],
    ['private class C', 'http://192.168.1.1/a.pdf'],
    ['link-local cloud metadata', 'http://169.254.169.254/latest/meta-data'],
    ['CGNAT', 'http://100.64.0.1/a.pdf'],
    ['IPv6 loopback', 'http://[::1]/a.pdf'],
    ['IPv6 unique local', 'http://[fd00::1]/a.pdf'],
    ['IPv6 link-local', 'http://[fe80::1]/a.pdf'],
    ['IPv6 site-local', 'http://[fec0::1]/a.pdf'],
    ['IPv4-mapped IPv6', 'http://[::ffff:10.0.0.1]/a.pdf'],
    ['IPv4-compatible IPv6', 'http://[::169.254.169.254]/latest/meta-data'],
    ['NAT64 well-known prefix', 'http://[64:ff9b::a9fe:a9fe]/latest/meta-data'],
  ])('refuses %s', async (_label, url) => {
    await expect(assertRoutableUrl(url)).rejects.toThrow(/private, loopback, or link-local/);
  });

  it('resolves a hostname and refuses it when it points at loopback', async () => {
    await expect(assertRoutableUrl('http://localhost:8080/a.pdf')).rejects.toThrow(/private, loopback, or link-local/);
  });

  it('allows a private address when the escape hatch is set', async () => {
    process.env.PDFVISION_MCP_ALLOW_PRIVATE_NETWORK = '1';
    await expect(assertRoutableUrl('http://192.168.1.1/a.pdf')).resolves.toBeInstanceOf(URL);
  });

  it('reports an unresolvable host', async () => {
    await expect(assertRoutableUrl('https://this-host-does-not-exist.pdfvision.invalid/a.pdf')).rejects.toThrow(
      /Could not resolve host/,
    );
  });
});
