import { createRequire } from 'node:module';
import { join } from 'node:path';
import { atomicWrite } from '../io/atomicWrite.js';

const QUIET_TESSERACT_WORKER_FILENAME = 'tesseract-quiet-worker.cjs';

/**
 * Kill the worker thread after it reports a boot-phase failure.
 *
 * tesseract's boot chain is `load → loadLanguage → initialize` ending in
 * `.catch(() => {})`, and only a `load` rejection is forwarded to the
 * promise `createWorker` returned. A failed traineddata fetch rejects
 * `loadLanguage`, so that promise never settles and nothing ever calls
 * `terminateWorker` — the thread and its WASM heap stay resident for the
 * life of the process. `createOcrSession` turns the failure into a clean
 * error via `errorHandler`, but only the worker itself can free the
 * thread, so it does that here.
 *
 * `parentPort` is the same object every `require('worker_threads')`
 * returns in a thread, and tesseract's worker script looks `postMessage`
 * up on it per message, so patching the method before requiring it
 * intercepts every outbound message. Order is load-bearing: postMessage
 * transfers ownership to the receiving port synchronously, so the parent
 * still gets the rejection, while any deferral would let tesseract's
 * stray post-reject `resolve()` escape first (which the parent turns
 * into a TypeError on an already-deleted promise entry).
 *
 * Restricted to boot actions: `recognize` / `detect` rejections are
 * per-page and the session keeps using the worker afterwards.
 * `reinitialize` would re-enter these actions on a live worker —
 * pdfvision never calls it, and this hook is why it cannot start.
 *
 * If `cacheMethod` is ever changed to let tesseract write traineddata
 * back to the cache, revisit this: a multi-language boot where one
 * language rejects could exit mid-write and leave a truncated file.
 */
const BOOT_FAILURE_SELF_TERMINATION = `const { parentPort } = require("worker_threads");
const bootActions = new Set(["load", "loadLanguage", "initialize"]);
const originalPostMessage = parentPort.postMessage.bind(parentPort);
parentPort.postMessage = (message, ...args) => {
  originalPostMessage(message, ...args);
  if (message && message.status === "reject" && bootActions.has(message.action)) {
    process.exit(0);
  }
};`;

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
${BOOT_FAILURE_SELF_TERMINATION}
require(${JSON.stringify(tesseractWorkerPath)});
`;
}

export async function ensureQuietTesseractWorker(cacheRoot: string): Promise<string> {
  const requireFromHere = createRequire(import.meta.url);
  const tesseractWorkerPath = requireFromHere.resolve('tesseract.js/src/worker-script/node/index.js');
  const quietWorkerPath = join(cacheRoot, QUIET_TESSERACT_WORKER_FILENAME);
  atomicWrite(quietWorkerPath, Buffer.from(buildQuietTesseractWorkerScript(tesseractWorkerPath), 'utf8'));
  return quietWorkerPath;
}
