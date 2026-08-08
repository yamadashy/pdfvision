import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { resolveLocalPdfPath } from '../core/io/localInput.js';
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
  // NAT64 embeds an IPv4 destination the checks below would never see.
  if (normalized.startsWith('64:ff9b:')) return true; // 64:ff9b::/96 and 64:ff9b:1::/48
  // IPv4-mapped (`::ffff:*`) and the deprecated IPv4-compatible (`::a.b.c.d`)
  // forms both reach the same hosts as the bare v4 address. WHATWG URL
  // parsing rewrites `::ffff:10.0.0.1` into the hex form `::ffff:a00:1`,
  // so every spelling has to be decoded back to the v4 address.
  const mapped = /^::(?:ffff:)?([\da-f.:]+)$/.exec(normalized);
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
  if (/^fe[c-f]/.test(normalized)) return true; // site-local fec0::/10 — deprecated, still routed on some intranets
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
 * platform fetch follows redirects internally, which would let an allowed
 * public host bounce the request to 169.254.169.254.
 *
 * Known limit: the address checked in {@link assertRoutableUrl} is not the
 * address `fetch` then connects to — it re-resolves the hostname — so a
 * name server that answers with a public address and then a private one
 * can still get through. Closing that window needs the connection pinned
 * to the validated IP, which either breaks TLS hostname verification or
 * requires a custom HTTP dispatcher (a new runtime dependency). What is
 * here blocks the cases that do not need attacker-controlled DNS:
 * private literals, hostnames that simply resolve inward, and redirects
 * into the metadata endpoint.
 */
async function guardedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let current = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    await assertRoutableUrl(current);
    const response = await fetch(current, { ...init, redirect: 'manual' });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get('location');
    if (!location) return response;
    // Nothing reads a redirect body, and an unconsumed one holds its
    // socket open for the life of this long-running server.
    await response.body?.cancel().catch(() => undefined);
    current = new URL(location, current).href;
  }
  throw new SourceError(`Too many redirects (>${MAX_REDIRECT_HOPS}) fetching the PDF`);
}

/**
 * One `source` parameter accepts both a local path and an http(s) URL.
 * The CLI splits these (positional vs `--remote`) for CLI reasons; making
 * a model track the distinction only creates invalid-argument states.
 */
export async function resolveSource(source: string): Promise<ResolvedSource> {
  const trimmed = source.trim();
  if (trimmed.length === 0) throw new SourceError('`source` is empty');
  if (!REMOTE_SCHEME.test(trimmed)) {
    try {
      return { filePath: resolveLocalPdfPath(trimmed, { maxBytes: MAX_LOCAL_FILE_BYTES }), isRemote: false };
    } catch (error) {
      throw new SourceError(error instanceof Error ? error.message : String(error));
    }
  }

  await assertRoutableUrl(trimmed);
  try {
    const { data } = await downloadRemoteWithData(trimmed, { fetchImpl: guardedFetch });
    return { filePath: trimmed, sourceData: data, isRemote: true };
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError(error instanceof Error ? error.message : String(error));
  }
}
