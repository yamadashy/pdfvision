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
 * The exit can land mid-traineddata-write: `loadLanguage` fetches every
 * language concurrently, so `eng+jpn` where `jpn` 404s rejects while
 * `eng`'s ~10MB cache write is still in flight. That is what
 * {@link ATOMIC_TRAINEDDATA_CACHE_WRITE} exists for — it is what makes
 * exiting here safe, rather than this hook waiting for writes that a
 * SIGINT or a crash would not wait for either.
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

/**
 * Write cached traineddata through a temp file and a rename.
 *
 * tesseract's node cache adapter is `util.promisify(fs.writeFile)`,
 * which truncates the destination and then streams ~10-16MB into it. Any
 * interruption in that window leaves a short file exactly where the next
 * session looks for it: the cache read succeeds, so the download is
 * skipped and that session fails at `Init` instead. It does not poison
 * the cache permanently — on an `Init` failure tesseract deletes the
 * cached data before rejecting, so the run after that re-downloads — but
 * it deletes it for *every* requested language, so one truncated `eng`
 * costs a failed OCR run and a fresh download of the `jpn` that was
 * fine. The interruptions are real — the boot-failure exit above, a
 * Ctrl-C on the CLI, an OOM kill — and none of them can be waited out
 * from here, so the write is made atomic instead: readers see the
 * previous file or the complete new one, and an interrupted write leaves
 * only an unread `.tmp` sibling that `clear-cache` removes. It also
 * keeps two concurrent pdfvision processes caching the same language
 * from interleaving into one file.
 *
 * The adapter builds its promisified reference when the worker script is
 * required, so patching `fs` before that require is what makes this take
 * effect. Scoped to `.traineddata` names: the rest of `fs` in this
 * thread keeps stock semantics.
 */
const ATOMIC_TRAINEDDATA_CACHE_WRITE = `const fs = require("fs");
const originalWriteFile = fs.writeFile;
fs.writeFile = function (file, data, options, callback) {
  const done = typeof options === "function" ? options : callback;
  if (typeof file !== "string" || !file.endsWith(".traineddata") || typeof done !== "function") {
    return originalWriteFile.apply(fs, arguments);
  }
  const tmp = file + "." + process.pid + "." + Math.random().toString(36).slice(2, 10) + ".tmp";
  const failed = (error) => fs.unlink(tmp, () => done(error));
  // "wx" is O_CREAT|O_EXCL: it also refuses a pre-existing symlink at the temp path.
  originalWriteFile(tmp, data, { mode: 0o600, flag: "wx" }, (writeError) => {
    if (writeError) return failed(writeError);
    fs.rename(tmp, file, (renameError) => (renameError ? failed(renameError) : done(null)));
  });
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
${ATOMIC_TRAINEDDATA_CACHE_WRITE}
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
