/**
 * pdf.js reports font / CMap problems by writing to `console.warn`, with
 * no per-document channel, so the only way to collect them is to wrap the
 * global. That makes the wrapper shared state: two `processDocument()`
 * calls in flight at once — a library consumer, or two concurrent MCP
 * tool calls — each used to capture `console.warn` on entry and restore
 * *that* value on exit, so whichever finished first removed the other's
 * wrapper, and the other then reinstated the finished one. The leftover
 * wrapper kept pushing into an already-returned array for the rest of the
 * process.
 *
 * One wrapper now lives for as long as at least one sink is registered
 * and is removed when the last is released. pdf.js gives no document
 * identity, so a warning raised while two extractions overlap is recorded
 * for both; over-reporting is the safe direction for a signal whose
 * absence is explicitly not a guarantee of correctness.
 */
const sinks = new Set<string[]>();
let uninstall: (() => void) | undefined;

export function capturePdfJsWarnings(out: string[]): () => void {
  sinks.add(out);
  if (!uninstall) {
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      const msg = args.map(String).join(' ');
      if (msg.startsWith('Warning:')) {
        for (const sink of sinks) sink.push(msg);
      }
      originalWarn(...args);
    };
    uninstall = () => {
      console.warn = originalWarn;
      uninstall = undefined;
    };
  }

  let released = false;
  return () => {
    // Releasing twice must not drop a sink a later caller registered.
    if (released) return;
    released = true;
    sinks.delete(out);
    if (sinks.size === 0) uninstall?.();
  };
}
