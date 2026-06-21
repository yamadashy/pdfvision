import { chmodSync, closeSync, constants as fsConstants, openSync, renameSync, rmSync, writeSync } from 'node:fs';

const FILE_MODE = 0o600;
const isPosix = process.platform !== 'win32';

// Write to a sibling temp path then rename into place. Concurrent readers
// see either the previous version or the fully-written new version, never
// a partially-written file. O_NOFOLLOW + O_EXCL on the temp path prevents
// symlink redirects through the temporary path.
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
