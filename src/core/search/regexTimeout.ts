import { type Context, createContext, runInContext } from 'node:vm';

/**
 * Why `vm` and not a timer, an `AbortSignal`, or a match cap: V8's
 * irregexp engine never yields during catastrophic backtracking, so
 * nothing running on the same thread gets a chance to intervene once
 * `regex.exec(...)` has started. `vm.runInContext`'s `timeout` is
 * enforced by V8 itself and does terminate execution mid-exec, which
 * buys the interruption without a new runtime dependency, a worker
 * thread, or static analysis of the user's pattern.
 *
 * The guarded callback is a *host* closure assigned onto the context,
 * so it closes over ordinary module state and the objects it creates
 * cross back out unchanged (same realm, no serialization boundary).
 *
 * Callers guard a whole page's search rather than each `exec`: one
 * guarded call costs roughly 44µs of setup, negligible once per page
 * but seconds when multiplied by lines × queries × pages.
 */

let guardContext: Context | undefined;

/** The contextified global of the guard realm, as a plain bag. */
function guardScope(): { fn?: () => unknown } {
  guardContext ??= createContext(Object.create(null));
  return guardContext as { fn?: () => unknown };
}

/**
 * Run `fn` synchronously, terminating it if it runs longer than
 * `timeoutMs`. On termination this throws an Error with
 * `code === 'ERR_SCRIPT_EXECUTION_TIMEOUT'` (see {@link isRegexTimeout});
 * the termination is not catchable inside `fn`.
 *
 * Synchronous use only — `fn` must not be async, and there is no
 * reentrancy concern because the single shared context is occupied only
 * for the duration of one synchronous call.
 */
export function runWithRegexTimeout<T>(fn: () => T, timeoutMs: number): T {
  const scope = guardScope();
  scope.fn = fn;
  try {
    return runInContext('fn()', guardScope(), { timeout: timeoutMs }) as T;
  } finally {
    scope.fn = undefined;
  }
}

/** True for the error `runWithRegexTimeout` throws on termination. */
export function isRegexTimeout(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ERR_SCRIPT_EXECUTION_TIMEOUT'
  );
}
