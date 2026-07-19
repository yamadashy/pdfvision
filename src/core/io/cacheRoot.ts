import { randomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  type Stats,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, normalize, parse, resolve, win32 } from 'node:path';

export const CACHE_ROOT_MARKER_NAME = '.pdfvision-cache-root';
export const CACHE_ROOT_MARKER_CONTENT = 'pdfvision-cache-root:v1\n';

const ROOT_MODE = 0o700;
const MARKER_MODE = 0o600;
const LEGACY_FINGERPRINT = /^[a-f0-9]{16}$/;
const LEGACY_DIRECTORIES = new Set(['remote', 'ocr-data']);
const LEGACY_FILES = new Set(['tesseract-quiet-worker.cjs', 'pdfvision-ocr-session-worker.cjs']);
const isPosix = process.platform !== 'win32';

type CacheRootKind = 'default' | 'environment';

interface ResolvedCacheRoot {
  path: string;
  kind: CacheRootKind;
}

export interface ClearCacheResult {
  /** Canonical cache-root path that was inspected or removed. */
  path: string;
  /** True only after the quarantined cache root was fully removed. */
  removed: boolean;
}

/** @internal Test-only race hook; package consumers do not import this module. */
export interface ClearCacheTestHooks {
  afterLegacyScan?: (root: string) => void;
  afterRename?: (quarantinePath: string, originalPath: string) => void;
  beforeRemove?: (quarantinePath: string, originalPath: string) => void;
  entryDevice?: (path: string, stat: Stats) => number;
}

/** @internal Test-only adoption race hook; package consumers do not import this module. */
export interface EnsureCacheRootTestHooks {
  afterLegacyScan?: (root: string) => void;
}

function currentUid(): number | undefined {
  return typeof process.getuid === 'function' ? process.getuid() : undefined;
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

function tryLstat(path: string): Stats | undefined {
  try {
    return lstatSync(path);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined;
    throw error;
  }
}

function canonicalExistingPath(path: string): string {
  return realpathSync.native(path);
}

/**
 * Resolve symlinks in existing ancestors without following the configured
 * leaf. The leaf must remain observable through lstat so a symlink or Windows
 * junction cannot be mistaken for an owned cache directory.
 */
function canonicalizeCachePath(input: string): string {
  const absolute = normalize(input);
  const leaf = tryLstat(absolute);
  if (leaf?.isSymbolicLink()) {
    throw new Error(`Refusing to use cache root at ${absolute}: path is a symlink or junction`);
  }

  const missing: string[] = [];
  let ancestor = leaf ? dirname(absolute) : absolute;
  if (!leaf) {
    while (!tryLstat(ancestor)) {
      const parent = dirname(ancestor);
      if (parent === ancestor) break;
      missing.unshift(basename(ancestor));
      ancestor = parent;
    }
  }

  const canonicalAncestor = canonicalExistingPath(ancestor);
  const suffix = leaf ? [basename(absolute)] : missing;
  return normalize(join(canonicalAncestor, ...suffix));
}

function canonicalizeProtectedPath(path: string): string {
  try {
    return normalize(canonicalExistingPath(path));
  } catch {
    return normalize(resolve(path));
  }
}

function comparablePath(path: string): string {
  const normalized = normalize(path);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

/** @internal Exported for platform-shape regression tests. */
export function isFilesystemRootPath(path: string): boolean {
  const normalized = normalize(path);
  if (parse(normalized).root === normalized) return true;

  const windowsNormalized = win32.normalize(path);
  if (win32.parse(windowsNormalized).root === windowsNormalized) return true;
  // node:path treats the extended UNC namespace root as `\\?\UNC\`, so
  // identify a complete share root explicitly as well.
  return /^\\\\\?\\UNC\\[^\\]+\\[^\\]+\\?$/i.test(windowsNormalized);
}

function protectedCacheRoots(): Set<string> {
  return new Set(
    [homedir(), process.cwd(), tmpdir(), '/tmp', '/var/tmp'].map((path) =>
      comparablePath(canonicalizeProtectedPath(path)),
    ),
  );
}

function assertAllowedCacheRoot(path: string): void {
  if (isFilesystemRootPath(path)) {
    throw new Error(`Refusing to use cache root at ${path}: filesystem, drive, and UNC roots are not allowed`);
  }
  if (protectedCacheRoots().has(comparablePath(path))) {
    throw new Error(
      `Refusing to use cache root at ${path}: home, working, and shared temporary directories are not dedicated cache roots`,
    );
  }
}

function resolveCacheRoot(): ResolvedCacheRoot {
  const environmentValue = process.env.PDFVISION_CACHE_DIR;
  const historicalDefault = join(tmpdir(), 'pdfvision');
  const raw = environmentValue ?? historicalDefault;

  if (raw.trim().length === 0) {
    const source = environmentValue !== undefined ? 'PDFVISION_CACHE_DIR' : 'cache root';
    throw new Error(`Invalid ${source}: expected a nonblank absolute path`);
  }
  if (!isAbsolute(raw)) {
    const source = environmentValue !== undefined ? 'PDFVISION_CACHE_DIR' : 'cache root';
    throw new Error(`Invalid ${source} ${JSON.stringify(raw)}: expected an absolute path ("~" is not expanded)`);
  }

  const path = canonicalizeCachePath(raw);
  assertAllowedCacheRoot(path);
  // Only the active no-override location receives narrow legacy-clear
  // compatibility. An explicit override remains custom even when it happens
  // to equal the path derived from tmpdir().
  const kind: CacheRootKind = environmentValue === undefined ? 'default' : 'environment';
  return { path, kind };
}

export function getCacheRoot(): string {
  return resolveCacheRoot().path;
}

export interface CacheRootSession {
  readonly path: string;
  /** Revalidate or recreate this operation's already-resolved root. */
  ensure(): string;
}

function assertOwned(stat: Stats, path: string): void {
  const uid = currentUid();
  if (uid !== undefined && stat.uid !== uid) {
    throw new Error(`Refusing to use cache path at ${path}: owned by uid ${stat.uid}, not ${uid}`);
  }
}

function assertRootDirectory(path: string, stat: Stats, requirePrivateMode: boolean): void {
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to use cache root at ${path}: path is a symlink or junction`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Refusing to use cache root at ${path}: path exists but is not a directory`);
  }
  assertOwned(stat, path);
  if (isPosix && requirePrivateMode && (stat.mode & 0o777) !== ROOT_MODE) {
    throw new Error(`Refusing to use cache root at ${path}: expected POSIX mode 0700`);
  }
}

function assertChildDirectory(path: string, stat: Stats): void {
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to use cache directory at ${path}: path is a symlink or junction`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Refusing to use cache directory at ${path}: path exists but is not a directory`);
  }
  assertOwned(stat, path);
}

function assertMarkerStat(path: string, stat: Stats): void {
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`Refusing to use cache root: ownership marker at ${path} is not a regular file`);
  }
  assertOwned(stat, path);
  if (stat.nlink !== 1) {
    throw new Error(`Refusing to use cache root: ownership marker at ${path} has ${stat.nlink} links, expected 1`);
  }
  if (isPosix && (stat.mode & 0o777) !== MARKER_MODE) {
    throw new Error(`Refusing to use cache root: ownership marker at ${path} must have POSIX mode 0600`);
  }
  if (stat.size !== Buffer.byteLength(CACHE_ROOT_MARKER_CONTENT)) {
    throw new Error(`Refusing to use cache root: ownership marker at ${path} has invalid contents`);
  }
}

/** @internal Compare filesystem identities when the platform exposes usable device/inode values. */
export function sameIdentity(a: Stats, b: Stats): boolean {
  const usable = Number.isFinite(a.dev) && Number.isFinite(a.ino) && Number.isFinite(b.dev) && Number.isFinite(b.ino);
  if (!usable || (a.dev === 0 && a.ino === 0) || (b.dev === 0 && b.ino === 0)) return true;
  return a.dev === b.dev && a.ino === b.ino;
}

function assertSameIdentity(expected: Stats, actual: Stats, path: string): void {
  if (!sameIdentity(expected, actual)) {
    throw new Error(`Cache path identity changed while validating ${path}`);
  }
}

function noFollowFlags(base: number, directory = false): number {
  let flags = base;
  if (typeof constants.O_NOFOLLOW === 'number') flags |= constants.O_NOFOLLOW;
  if (directory && typeof constants.O_DIRECTORY === 'number') flags |= constants.O_DIRECTORY;
  return flags;
}

function validateMarker(root: string): Stats {
  const markerPath = join(root, CACHE_ROOT_MARKER_NAME);
  const before = tryLstat(markerPath);
  if (!before) {
    throw new Error(`Refusing to use cache root at ${root}: ownership marker ${CACHE_ROOT_MARKER_NAME} is missing`);
  }
  assertMarkerStat(markerPath, before);

  const fd = openSync(markerPath, noFollowFlags(constants.O_RDONLY));
  try {
    const opened = fstatSync(fd);
    assertMarkerStat(markerPath, opened);
    assertSameIdentity(before, opened, markerPath);
    const content = readFileSync(fd, 'utf8');
    if (content !== CACHE_ROOT_MARKER_CONTENT) {
      throw new Error(`Refusing to use cache root: ownership marker at ${markerPath} has invalid contents`);
    }
    const after = lstatSync(markerPath);
    assertMarkerStat(markerPath, after);
    assertSameIdentity(opened, after, markerPath);
    return opened;
  } finally {
    closeSync(fd);
  }
}

function createMarker(root: string): void {
  const markerPath = join(root, CACHE_ROOT_MARKER_NAME);
  let fd: number;
  try {
    fd = openSync(markerPath, noFollowFlags(constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL), MARKER_MODE);
  } catch (error) {
    if (errorCode(error) === 'EEXIST') {
      validateMarker(root);
      return;
    }
    throw error;
  }

  try {
    if (isPosix) fchmodSync(fd, MARKER_MODE);
    writeFileSync(fd, CACHE_ROOT_MARKER_CONTENT, 'utf8');
  } finally {
    closeSync(fd);
  }
  validateMarker(root);
}

function validateLegacyRoot(root: string): void {
  for (const name of readdirSync(root)) {
    if (name === CACHE_ROOT_MARKER_NAME) continue;
    const entryPath = join(root, name);
    const stat = lstatSync(entryPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to adopt unverified cache root at ${root}: ${name} is a symlink or junction`);
    }
    assertOwned(stat, entryPath);

    if (LEGACY_FINGERPRINT.test(name) || LEGACY_DIRECTORIES.has(name)) {
      if (!stat.isDirectory()) {
        throw new Error(`Refusing to adopt unverified cache root at ${root}: ${name} is not a legacy directory`);
      }
      continue;
    }
    if (LEGACY_FILES.has(name)) {
      if (!stat.isFile() || stat.nlink !== 1) {
        throw new Error(
          `Refusing to adopt unverified cache root at ${root}: ${name} is not an owned single-link legacy worker file`,
        );
      }
      continue;
    }
    throw new Error(`Refusing to adopt unverified cache root at ${root}: unknown top-level entry ${name}`);
  }
}

function assertUnmarkedRootNotWritableByOthers(root: string, stat: Stats): void {
  if (isPosix && (stat.mode & 0o022) !== 0) {
    throw new Error(
      `Refusing to adopt unverified cache root at ${root}: group/other write permissions must be removed first`,
    );
  }
}

function applyPrivateRootMode(root: string): void {
  const before = lstatSync(root);
  assertRootDirectory(root, before, false);
  if (!isPosix) return;

  const fd = openSync(root, noFollowFlags(constants.O_RDONLY, true));
  try {
    const opened = fstatSync(fd);
    assertRootDirectory(root, opened, false);
    assertSameIdentity(before, opened, root);
    fchmodSync(fd, ROOT_MODE);
    const after = lstatSync(root);
    assertRootDirectory(root, after, true);
    assertSameIdentity(opened, after, root);
  } finally {
    closeSync(fd);
  }
}

function createCacheRootDirectory(root: string): void {
  const missing: string[] = [];
  let current = root;
  while (!tryLstat(current)) {
    missing.unshift(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // Resolution already canonicalized the nearest existing ancestor. Repeat
  // that check while creating one component at a time so a dangling or
  // replaced ancestor fails closed instead of being followed by recursive
  // mkdir.
  if (comparablePath(canonicalExistingPath(current)) !== comparablePath(current)) {
    throw new Error(`Refusing to create cache root at ${root}: ancestor identity changed`);
  }
  for (const directory of missing) {
    try {
      mkdirSync(directory, { mode: ROOT_MODE });
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error;
    }
    const stat = lstatSync(directory);
    assertRootDirectory(directory, stat, false);
    if (comparablePath(canonicalizeCachePath(directory)) !== comparablePath(directory)) {
      throw new Error(`Refusing to create cache root at ${root}: path changed during creation`);
    }
  }
}

function ensureResolvedCacheRoot(resolvedRoot: ResolvedCacheRoot, hooks: EnsureCacheRootTestHooks = {}): string {
  const { path } = resolvedRoot;
  let rootStat = tryLstat(path);
  if (!rootStat) {
    if (isPosix) {
      const uid = currentUid();
      if (uid === undefined) throw new Error(`Refusing to create cache root at ${path}: cannot verify POSIX ownership`);
      const prospectiveAncestors = openTrustedAncestors(path, uid);
      closeTrustedAncestors(prospectiveAncestors);
    }
    createCacheRootDirectory(path);
    const recanonicalized = canonicalizeCachePath(path);
    if (comparablePath(recanonicalized) !== comparablePath(path)) {
      throw new Error(`Refusing to use cache root at ${path}: path changed while it was being created`);
    }
    rootStat = lstatSync(path);
  }
  assertRootDirectory(path, rootStat, false);
  const trustedAncestors = openTrustedAncestors(path, rootStat.uid);
  try {
    validateTrustedAncestors(trustedAncestors, rootStat);
    const markerPath = join(path, CACHE_ROOT_MARKER_NAME);
    if (tryLstat(markerPath)) {
      const strictRoot = lstatSync(path);
      assertRootDirectory(path, strictRoot, true);
      assertSameIdentity(rootStat, strictRoot, path);
      validateMarker(path);
      validateTrustedAncestors(trustedAncestors, strictRoot);
      return path;
    }

    // Every pre-marker root needs an all-or-nothing legacy-shape check before
    // chmod or marker creation. tmpdir() is environment-sensitive, so the
    // active historical default is not sufficient evidence on its own.
    assertUnmarkedRootNotWritableByOthers(path, rootStat);
    validateLegacyRoot(path);
    hooks.afterLegacyScan?.(path);
    applyPrivateRootMode(path);
    const hardenedRoot = lstatSync(path);
    assertRootDirectory(path, hardenedRoot, true);
    assertSameIdentity(rootStat, hardenedRoot, path);
    validateTrustedAncestors(trustedAncestors, hardenedRoot);
    validateLegacyRoot(path);
    createMarker(path);
    const markedRoot = lstatSync(path);
    assertRootDirectory(path, markedRoot, true);
    assertSameIdentity(hardenedRoot, markedRoot, path);
    validateTrustedAncestors(trustedAncestors, markedRoot);
    return path;
  } finally {
    closeTrustedAncestors(trustedAncestors);
  }
}

export function ensureCacheRoot(): string {
  return createCacheRootSession().ensure();
}

/** @internal Exercise custom-root adoption races without a path override. */
export function ensureCacheRootForTesting(hooks: EnsureCacheRootTestHooks): string {
  return ensureResolvedCacheRoot(resolveCacheRoot(), hooks);
}

/**
 * Capture the configured root once for an operation that may need to retry
 * after a concurrent clear. Environment changes cannot redirect later work
 * in the same operation to a different root.
 */
export function createCacheRootSession(): CacheRootSession {
  const resolvedRoot = resolveCacheRoot();
  return {
    path: resolvedRoot.path,
    ensure: () => ensureResolvedCacheRoot(resolvedRoot),
  };
}

export function ensurePrivateDir(path: string): void {
  const existing = tryLstat(path);
  if (existing) {
    assertChildDirectory(path, existing);
  } else {
    try {
      mkdirSync(path, { mode: ROOT_MODE });
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error;
    }
    assertChildDirectory(path, lstatSync(path));
  }
  if (!isPosix) return;

  const before = lstatSync(path);
  assertChildDirectory(path, before);
  const fd = openSync(path, noFollowFlags(constants.O_RDONLY, true));
  try {
    const opened = fstatSync(fd);
    assertChildDirectory(path, opened);
    assertSameIdentity(before, opened, path);
    fchmodSync(fd, ROOT_MODE);
    const after = lstatSync(path);
    assertChildDirectory(path, after);
    assertSameIdentity(opened, after, path);
  } finally {
    closeSync(fd);
  }
}

function assertCachePathSegment(segment: string): void {
  if (segment.length === 0 || segment === '.' || segment === '..' || basename(segment) !== segment) {
    throw new Error(`Invalid cache path segment: ${segment}`);
  }
}

/** Create a cache subdirectory chain under one captured, validated root. */
export function ensureCacheSubdirectory(session: CacheRootSession, ...segments: string[]): string {
  for (const segment of segments) assertCachePathSegment(segment);
  const target = join(session.path, ...segments);

  for (let attempt = 0; attempt < 2; attempt++) {
    session.ensure();
    let current = session.path;
    try {
      for (const segment of segments) {
        current = join(current, segment);
        ensurePrivateDir(current);
      }
      return target;
    } catch (error) {
      if (errorCode(error) !== 'ENOENT' || attempt > 0) throw error;
    }
  }
  throw new Error(`Unable to create cache directory at ${target}`);
}

function prepareRootForClear(resolvedRoot: ResolvedCacheRoot, hooks: ClearCacheTestHooks): Stats | undefined {
  const { path, kind } = resolvedRoot;
  const rootStat = tryLstat(path);
  if (!rootStat) return undefined;
  assertRootDirectory(path, rootStat, false);

  const markerPath = join(path, CACHE_ROOT_MARKER_NAME);
  if (!tryLstat(markerPath)) {
    assertUnmarkedRootNotWritableByOthers(path, rootStat);
    if (kind !== 'default') {
      throw new Error(
        `Refusing to clear unverified cache root at ${path}: ownership marker ${CACHE_ROOT_MARKER_NAME} is missing`,
      );
    }
    // Only the active no-override historical default may be adopted by a
    // destructive clear. Its entire layout still has to match recognized
    // legacy cache shapes before and after hardening because tmpdir() is
    // environment-sensitive.
    validateLegacyRoot(path);
    hooks.afterLegacyScan?.(path);
    applyPrivateRootMode(path);
    const hardenedRoot = lstatSync(path);
    assertRootDirectory(path, hardenedRoot, true);
    assertSameIdentity(rootStat, hardenedRoot, path);
    validateLegacyRoot(path);
    createMarker(path);
  }

  const strictRoot = lstatSync(path);
  assertRootDirectory(path, strictRoot, true);
  validateMarker(path);
  return strictRoot;
}

function quarantinePathFor(root: string): string {
  const parent = dirname(root);
  const stem = basename(root);
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = join(parent, `.${stem}.pdfvision-quarantine-${randomBytes(12).toString('hex')}`);
    if (!tryLstat(candidate)) return candidate;
  }
  throw new Error(`Unable to allocate a quarantine path beside cache root ${root}`);
}

function openValidatedRoot(root: string): { fd: number; stat: Stats; markerStat: Stats } {
  const before = lstatSync(root);
  assertRootDirectory(root, before, true);
  const fd = openSync(root, noFollowFlags(constants.O_RDONLY, true));
  try {
    const opened = fstatSync(fd);
    assertRootDirectory(root, opened, true);
    assertSameIdentity(before, opened, root);
    const markerStat = validateMarker(root);
    const after = lstatSync(root);
    assertRootDirectory(root, after, true);
    assertSameIdentity(opened, after, root);
    return { fd, stat: opened, markerStat };
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

interface OpenedTrustedAncestor {
  path: string;
  fd: number;
  stat: Stats;
}

function assertTrustedAncestor(path: string, stat: Stats, childUid: number): void {
  if (!stat.isDirectory()) {
    throw new Error(`Refusing to use cache root: ancestor ${path} is not a directory`);
  }
  const uid = currentUid();
  if (uid === undefined) {
    throw new Error(`Refusing to use cache root: cannot verify POSIX ownership for ancestor ${path}`);
  }
  if (stat.uid !== uid && stat.uid !== 0) {
    throw new Error(`Refusing to use cache root: ancestor ${path} is owned by untrusted uid ${stat.uid}`);
  }

  if ((stat.mode & 0o022) === 0) return;
  if ((stat.mode & 0o1000) === 0) {
    throw new Error(`Refusing to use cache root: ancestor ${path} is group/other writable without the sticky bit`);
  }
  if (childUid !== uid && childUid !== 0) {
    throw new Error(`Refusing to use cache root: sticky ancestor ${path} does not protect an owned child entry`);
  }
}

function openTrustedAncestors(root: string, initialChildUid: number): OpenedTrustedAncestor[] {
  if (!isPosix) return [];
  const openedAncestors: OpenedTrustedAncestor[] = [];
  let path = dirname(root);
  while (!tryLstat(path)) {
    const parent = dirname(path);
    if (parent === path) break;
    path = parent;
  }
  let childUid = initialChildUid;
  try {
    while (true) {
      const before = lstatSync(path);
      if (before.isSymbolicLink() || !before.isDirectory()) {
        throw new Error(`Refusing to use cache root: ancestor ${path} is a symlink or not a directory`);
      }
      let fd: number;
      try {
        fd = openSync(path, noFollowFlags(constants.O_RDONLY, true));
      } catch (error) {
        if (errorCode(error) === 'EACCES' || errorCode(error) === 'EPERM') {
          throw new Error(
            `Refusing to use cache root: ancestor ${path} cannot be opened for identity validation; POSIX read access is required`,
          );
        }
        throw error;
      }
      let opened: Stats;
      try {
        opened = fstatSync(fd);
        assertSameIdentity(before, opened, path);
        assertTrustedAncestor(path, opened, childUid);
      } catch (error) {
        closeSync(fd);
        throw error;
      }
      openedAncestors.push({ path, fd, stat: opened });
      childUid = opened.uid;

      const parent = dirname(path);
      if (parent === path) break;
      path = parent;
    }
    return openedAncestors;
  } catch (error) {
    for (const ancestor of openedAncestors) closeSync(ancestor.fd);
    throw error;
  }
}

function validateTrustedAncestors(ancestors: readonly OpenedTrustedAncestor[], childStat: Stats): void {
  let childUid = childStat.uid;
  for (const ancestor of ancestors) {
    const opened = fstatSync(ancestor.fd);
    assertSameIdentity(ancestor.stat, opened, ancestor.path);
    const current = lstatSync(ancestor.path);
    if (current.isSymbolicLink() || !current.isDirectory()) {
      throw new Error(`Refusing to use cache root: ancestor ${ancestor.path} is a symlink or not a directory`);
    }
    assertSameIdentity(opened, current, ancestor.path);
    assertTrustedAncestor(ancestor.path, current, childUid);
    childUid = current.uid;
  }
}

function closeTrustedAncestors(ancestors: readonly OpenedTrustedAncestor[]): void {
  for (const ancestor of ancestors) closeSync(ancestor.fd);
}

function assertSingleDeviceQuarantine(root: string, rootStat: Stats, hooks: ClearCacheTestHooks): void {
  if (!isPosix) return;
  const pending = [root];
  while (pending.length > 0) {
    const path = pending.pop() as string;
    const stat = lstatSync(path);
    const device = hooks.entryDevice?.(path, stat) ?? stat.dev;
    if (device !== rootStat.dev) {
      throw new Error(`Refusing to clear cache: ${path} is on a different filesystem device`);
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) continue;
    for (const name of readdirSync(path)) pending.push(join(path, name));
  }
}

function quarantineError(path: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  try {
    if (tryLstat(path)) {
      return new Error(
        `Refusing to remove cache quarantine at ${path}: ${message}. An entry remains at ${path} for manual inspection`,
      );
    }
    return new Error(
      `Refusing to remove cache quarantine at ${path}: ${message}. No entry remains at ${path}; inspect its parent for moved or partially removed data`,
    );
  } catch {
    return new Error(
      `Refusing to remove cache quarantine at ${path}: ${message}. Its presence could not be verified; inspect the parent directory manually`,
    );
  }
}

function clearCacheRoot(hooks: ClearCacheTestHooks): ClearCacheResult {
  const resolvedRoot = resolveCacheRoot();
  const initialRoot = tryLstat(resolvedRoot.path);
  if (initialRoot && isPosix) {
    assertRootDirectory(resolvedRoot.path, initialRoot, false);
    const initialAncestors = openTrustedAncestors(resolvedRoot.path, initialRoot.uid);
    closeTrustedAncestors(initialAncestors);
  }
  const rootStat = prepareRootForClear(resolvedRoot, hooks);
  if (!rootStat) return { path: resolvedRoot.path, removed: false };

  const opened = openValidatedRoot(resolvedRoot.path);
  let trustedAncestors: OpenedTrustedAncestor[];
  try {
    trustedAncestors = openTrustedAncestors(resolvedRoot.path, opened.stat.uid);
  } catch (error) {
    closeSync(opened.fd);
    throw error;
  }
  let rootFdOpen = true;
  let quarantinePath: string | undefined;
  let renamed = false;
  try {
    const current = tryLstat(resolvedRoot.path);
    if (!current) return { path: resolvedRoot.path, removed: false };
    assertRootDirectory(resolvedRoot.path, current, true);
    assertSameIdentity(opened.stat, current, resolvedRoot.path);
    validateTrustedAncestors(trustedAncestors, current);
    const currentMarker = validateMarker(resolvedRoot.path);
    assertSameIdentity(opened.markerStat, currentMarker, join(resolvedRoot.path, CACHE_ROOT_MARKER_NAME));

    // Windows commonly prevents renaming an open directory. Closing after
    // the identity checks keeps the stronger POSIX directory-handle posture
    // while retaining a conservative lstat/post-rename fallback on Windows.
    if (!isPosix) {
      closeSync(opened.fd);
      rootFdOpen = false;
    }

    quarantinePath = quarantinePathFor(resolvedRoot.path);
    try {
      renameSync(resolvedRoot.path, quarantinePath);
      renamed = true;
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return { path: resolvedRoot.path, removed: false };
      throw error;
    }

    hooks.afterRename?.(quarantinePath, resolvedRoot.path);

    const quarantined = lstatSync(quarantinePath);
    assertRootDirectory(quarantinePath, quarantined, true);
    assertSameIdentity(opened.stat, quarantined, quarantinePath);
    const quarantinedMarker = validateMarker(quarantinePath);
    assertSameIdentity(opened.markerStat, quarantinedMarker, join(quarantinePath, CACHE_ROOT_MARKER_NAME));
    validateTrustedAncestors(trustedAncestors, quarantined);
    assertSingleDeviceQuarantine(quarantinePath, quarantined, hooks);

    hooks.beforeRemove?.(quarantinePath, resolvedRoot.path);

    // The recursive remove API is path-based. Recheck the full authorization
    // boundary immediately before calling it, and proceed only when every
    // POSIX ancestor is still trusted and the quarantine is still the opened
    // root with the same marker and a single-device tree.
    const finalQuarantined = lstatSync(quarantinePath);
    assertRootDirectory(quarantinePath, finalQuarantined, true);
    assertSameIdentity(opened.stat, finalQuarantined, quarantinePath);
    const finalMarker = validateMarker(quarantinePath);
    assertSameIdentity(opened.markerStat, finalMarker, join(quarantinePath, CACHE_ROOT_MARKER_NAME));
    validateTrustedAncestors(trustedAncestors, finalQuarantined);
    assertSingleDeviceQuarantine(quarantinePath, finalQuarantined, hooks);

    if (rootFdOpen) {
      closeSync(opened.fd);
      rootFdOpen = false;
    }
    rmSync(quarantinePath, { recursive: true, force: false });
    return { path: resolvedRoot.path, removed: true };
  } catch (error) {
    if (renamed && quarantinePath) throw quarantineError(quarantinePath, error);
    throw error;
  } finally {
    if (rootFdOpen) closeSync(opened.fd);
    closeTrustedAncestors(trustedAncestors);
  }
}

export function clearAllCache(): ClearCacheResult {
  return clearCacheRoot({});
}

/** @internal Exercise post-rename races without exposing a cache-path override. */
export function clearAllCacheForTesting(hooks: ClearCacheTestHooks): ClearCacheResult {
  return clearCacheRoot(hooks);
}
