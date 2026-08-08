import { describe, expect, it } from 'vitest';
import { isRegexTimeout, runWithRegexTimeout } from '../../src/core/search/regexTimeout.js';

// Classic catastrophic-backtracking pattern: exponential in the length
// of the run of `a` when the trailing `b` forces every partition to be
// tried. 40 `a`s takes far longer than any timeout used here.
const EVIL = /(a+)+$/;
const EVIL_INPUT = `${'a'.repeat(40)}b`;

describe('runWithRegexTimeout', () => {
  it('interrupts catastrophic backtracking inside a single exec', () => {
    const started = Date.now();
    let error: unknown;
    try {
      runWithRegexTimeout(() => EVIL.test(EVIL_INPUT), 100);
    } catch (err) {
      error = err;
    }
    const elapsed = Date.now() - started;

    expect(isRegexTimeout(error)).toBe(true);
    // Unbounded, this exec runs for minutes; anything near the timeout
    // proves V8 terminated it rather than letting it finish.
    expect(elapsed).toBeLessThan(5000);
  });

  it('returns the callback value on the happy path', () => {
    const value = runWithRegexTimeout(() => ({ matches: [1, 2, 3] }), 1000);

    expect(value).toEqual({ matches: [1, 2, 3] });
  });

  it('propagates a non-timeout error without misclassifying it', () => {
    const thrown = new Error('boom');

    expect(() =>
      runWithRegexTimeout(() => {
        throw thrown;
      }, 1000),
    ).toThrow(thrown);
    expect(isRegexTimeout(thrown)).toBe(false);
  });

  it('stays usable after a timeout terminated the previous call', () => {
    expect(() => runWithRegexTimeout(() => EVIL.test(EVIL_INPUT), 50)).toThrow();

    expect(runWithRegexTimeout(() => 'ok', 1000)).toBe('ok');
  });

  it('does not treat arbitrary values as a timeout', () => {
    expect(isRegexTimeout(undefined)).toBe(false);
    expect(isRegexTimeout('ERR_SCRIPT_EXECUTION_TIMEOUT')).toBe(false);
    expect(isRegexTimeout({ code: 'ERR_SCRIPT_EXECUTION_TIMEOUT' })).toBe(true);
  });
});
