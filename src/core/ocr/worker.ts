import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const QUIET_TESSERACT_WORKER_FILENAME = 'tesseract-quiet-worker.cjs';

export function buildQuietTesseractWorkerScript(tesseractWorkerPath: string): string {
  return `"use strict";
const originalWrite = process.stderr.write.bind(process.stderr);
const quiet = /^(?:Image too small to scale!! \\(\\d+x\\d+ vs min width of \\d+\\)|Line cannot be recognized!!)\\s*$/;
const controlTraineddataNoise = /^(?:Error opening data file \\.\\/[\\x00-\\x1f]\\.traineddata|Failed loading language '[\\x00-\\x1f]')\\s*$/;
let suppressTessdataPrefixHint = false;
process.stderr.write = (chunk, ...args) => {
  const text = typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
  if (quiet.test(text)) return true;
  if (controlTraineddataNoise.test(text)) {
    suppressTessdataPrefixHint = true;
    return true;
  }
  if (suppressTessdataPrefixHint && /^Please make sure the TESSDATA_PREFIX environment variable is set/.test(text)) {
    suppressTessdataPrefixHint = false;
    return true;
  }
  return originalWrite(chunk, ...args);
};
require(${JSON.stringify(tesseractWorkerPath)});
`;
}

export async function ensureQuietTesseractWorker(cacheRoot: string): Promise<string> {
  const requireFromHere = createRequire(import.meta.url);
  const tesseractWorkerPath = requireFromHere.resolve('tesseract.js/src/worker-script/node/index.js');
  const quietWorkerPath = join(cacheRoot, QUIET_TESSERACT_WORKER_FILENAME);
  await writeFile(quietWorkerPath, buildQuietTesseractWorkerScript(tesseractWorkerPath), { mode: 0o600 });
  return quietWorkerPath;
}
