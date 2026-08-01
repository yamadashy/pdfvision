import { lookup } from 'node:dns/promises';
import { statSync } from 'node:fs';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { downloadRemoteWithData } from '../core/io/remote.js';
import { MAX_LOCAL_FILE_BYTES, MAX_REDIRECT_HOPS } from './limits.js';

export interface ResolvedSource {
  /** Passed to `processDocument` as the file path or, for remote input, as the label. */
  filePath: string;
  /** Present for remote input so the extractor reads bytes rather than the cache path. */
  sourceData?: Uint8Array;
  isRemote: boolean;
}

/** Thrown for user-recoverable input problems; the tool layer turns these into `isError` results. */
export class SourceError extends Error {}

const REMOTE_SCHEME = /^https?:\/\//i;

/**
 * The CLI's `--remote` deliberately accepts private addresses — the user
 * types the URL, so it is their own network. Under MCP the *model* picks
 * the URL, which turns the server into an SSRF pivot into whatever
 * network it runs on. Default-deny, with an env escape hatch for people
 * pointing it at an intranet document store on purpose.
 */
function privateNetworkAllowed(): boolean {
  return process.env.PDFVISION_MCP_ALLOW_PRIVATE_NETWORK === '1';
}

function isPrivateIPv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = octets as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0] ?? '';
  // IPv4-mapped reaches the same hosts as the bare v4 form. WHATWG URL
  // parsing rewrites `::ffff:10.0.0.1` into the hex form `::ffff:a00:1`,
  // so both spellings have to be decoded back to the v4 address.
  const mapped = /^::ffff:(.+)$/.exec(normalized);
  if (mapped?.[1]) {
    const tail = mapped[1];
    if (/^\d+\.\d+\.\d+\.\d+$/.test(tail)) return isPrivateIPv4(tail);
    const groups = tail.split(':');
    const high = Number.parseInt(groups[0] ?? '', 16);
    const low = Number.parseInt(groups[1] ?? '', 16);
    if (groups.length === 2 && Number.isFinite(high) && Number.isFinite(low)) {
      return isPrivateIPv4(`${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`);
    }
    return true; // Unrecognised mapped form — fail closed.
  }
  if (normalized === '::1' || normalized === '::') return true;
  if (/^f[cd]/.test(normalized)) return true; // unique local fc00::/7
  if (/^fe[89ab]/.test(normalized)) return true; // link-local fe80::/10
  if (normalized.startsWith('ff')) return true; // multicast
  return false;
}

function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIPv4(address);
  if (family === 6) return isPrivateIPv6(address);
  return true;
}

/** @internal Exported for tests; callers use {@link resolveSource}. */
export async function assertRoutableUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SourceError(`Not a valid URL: ${rawUrl}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SourceError(`Only http(s) URLs are supported, got ${url.protocol}`);
  }
  if (privateNetworkAllowed()) return url;

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: { address: string }[];
  try {
    addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true });
  } catch {
    throw new SourceError(`Could not resolve host: ${url.hostname}`);
  }
  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new SourceError(
      `Refusing to fetch ${url.hostname}: it resolves to a private, loopback, or link-local address. ` +
        'Set PDFVISION_MCP_ALLOW_PRIVATE_NETWORK=1 to allow internal hosts.',
    );
  }
  return url;
}

/**
 * Follows redirects one hop at a time so every hop is re-validated. The
 * platform fetch follows redirects internally, which would let an
 * allowed public host bounce the request to 169.254.169.254.
 */
async function guardedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let current = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    await assertRoutableUrl(current);
    const response = await fetch(current, { ...init, redirect: 'manual' });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get('location');
    if (!location) return response;
    current = new URL(location, current).href;
  }
  throw new SourceError(`Too many redirects (>${MAX_REDIRECT_HOPS}) fetching the PDF`);
}

function resolveLocal(source: string): ResolvedSource {
  const filePath = resolve(source);
  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(filePath);
  } catch {
    throw new SourceError(`File not found: ${filePath}`);
  }
  if (!stats.isFile()) throw new SourceError(`Not a file: ${filePath}`);
  if (stats.size > MAX_LOCAL_FILE_BYTES) {
    throw new SourceError(`PDF is ${stats.size} bytes, over the ${MAX_LOCAL_FILE_BYTES}-byte limit`);
  }
  return { filePath, isRemote: false };
}

/**
 * One `source` parameter accepts both a local path and an http(s) URL.
 * The CLI splits these (positional vs `--remote`) for CLI reasons; making
 * a model track the distinction only creates invalid-argument states.
 */
export async function resolveSource(source: string): Promise<ResolvedSource> {
  const trimmed = source.trim();
  if (trimmed.length === 0) throw new SourceError('`source` is empty');
  if (!REMOTE_SCHEME.test(trimmed)) return resolveLocal(trimmed);

  await assertRoutableUrl(trimmed);
  try {
    const { data } = await downloadRemoteWithData(trimmed, { fetchImpl: guardedFetch });
    return { filePath: trimmed, sourceData: data, isRemote: true };
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError(error instanceof Error ? error.message : String(error));
  }
}
