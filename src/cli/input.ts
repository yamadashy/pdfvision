import { resolveLocalPdfPath } from '../core/io/localInput.js';
import { exitWithError } from './errors.js';
import type { InputSource, RunOptions } from './types.js';

export async function readPasswordFromStdin(stdin: RunOptions['stdin'] = process.stdin): Promise<string | undefined> {
  if (stdin?.isTTY) {
    return undefined;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of stdin ?? []) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk));
  }
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '');
}

export async function resolveInputSource(
  remoteUrl: string | undefined,
  positionals: readonly string[],
  noCache: boolean,
): Promise<InputSource> {
  if (remoteUrl) {
    try {
      const { downloadRemoteData, downloadRemoteWithData } = await import('../core/io/remote.js');
      if (noCache) {
        return { filePath: remoteUrl, sourceData: await downloadRemoteData(remoteUrl) };
      }
      const { data } = await downloadRemoteWithData(remoteUrl);
      return { filePath: remoteUrl, sourceData: data };
    } catch (error) {
      exitWithError(error instanceof Error ? error.message : String(error));
    }
  }

  const inputPath = positionals[0];
  if (!inputPath) {
    exitWithError('Missing input file path');
  }
  try {
    return { filePath: resolveLocalPdfPath(inputPath) };
  } catch (error) {
    exitWithError(error instanceof Error ? error.message : String(error));
  }
}
